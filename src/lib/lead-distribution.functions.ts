import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Method = z.enum(["round_robin", "manual", "percentage", "priority", "source", "availability"]);
const Priority = z.enum(["low", "normal", "high", "hot"]);

async function assertCanManage(userId: string, teamId: string | null) {
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const r = (roles ?? []).map((x: { role: string }) => x.role);
  if (r.includes("admin") || r.includes("manager")) return;
  if (teamId) {
    const { data: t } = await supabaseAdmin.from("teams").select("leader_id").eq("id", teamId).maybeSingle();
    if (t?.leader_id === userId) return;
  }
  // team_leader without specifying team — allow if leads they will touch belong to their team (checked downstream)
  if (r.includes("team_leader")) return;
  throw new Error("Not authorized");
}

async function getActorTeamScope(userId: string): Promise<{ isAdmin: boolean; teamIds: string[] }> {
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const r = (roles ?? []).map((x: { role: string }) => x.role);
  const isAdmin = r.includes("admin") || r.includes("manager");
  const { data: leaderTeams } = await supabaseAdmin.from("teams").select("id").eq("leader_id", userId);
  return { isAdmin, teamIds: (leaderTeams ?? []).map((t: { id: string }) => t.id) };
}

function distributeRoundRobin(leadIds: string[], userIds: string[], startIndex = 0): Array<{ lead_id: string; user_id: string }> {
  if (userIds.length === 0) return [];
  return leadIds.map((id, i) => ({ lead_id: id, user_id: userIds[(startIndex + i) % userIds.length] }));
}

function distributePercentage(leadIds: string[], dist: Record<string, number>): Array<{ lead_id: string; user_id: string }> {
  const entries = Object.entries(dist).filter(([, v]) => v > 0);
  if (entries.length === 0) return [];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const counts = entries.map(([uid, pct]) => ({ uid, n: Math.floor((leadIds.length * pct) / total) }));
  let assigned = counts.reduce((s, c) => s + c.n, 0);
  // distribute leftover by largest remainder
  let i = 0;
  while (assigned < leadIds.length) {
    counts[i % counts.length].n += 1;
    assigned += 1;
    i += 1;
  }
  const result: Array<{ lead_id: string; user_id: string }> = [];
  let idx = 0;
  for (const c of counts) {
    for (let k = 0; k < c.n && idx < leadIds.length; k++, idx++) {
      result.push({ lead_id: leadIds[idx], user_id: c.uid });
    }
  }
  return result;
}

async function applyAssignments(
  assignments: Array<{ lead_id: string; user_id: string }>,
  method: z.infer<typeof Method> | "system",
  reason: string | null,
  actorId: string,
) {
  if (assignments.length === 0) return { updated: 0 };
  // Group by user_id for fewer updates
  const byUser = new Map<string, string[]>();
  for (const a of assignments) {
    const arr = byUser.get(a.user_id) ?? [];
    arr.push(a.lead_id);
    byUser.set(a.user_id, arr);
  }
  let updated = 0;
  for (const [uid, leadIds] of byUser) {
    // Fetch current assignees for history
    const { data: current } = await supabaseAdmin.from("leads").select("id, assigned_to").in("id", leadIds);
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ assigned_to: uid, assigned_at: new Date().toISOString() })
      .in("id", leadIds);
    if (error) throw new Error(error.message);
    // Manually write history (trigger runs as service role so auth.uid() is null)
    const rows = (current ?? [])
      .filter((c: { id: string; assigned_to: string | null }) => c.assigned_to !== uid)
      .map((c: { id: string; assigned_to: string | null }) => ({
        lead_id: c.id,
        from_user_id: c.assigned_to,
        to_user_id: uid,
        assigned_by: actorId,
        method,
        reason,
      }));
    if (rows.length > 0) {
      await supabaseAdmin.from("lead_assignment_history").insert(rows);
    }
    updated += leadIds.length;
  }
  return { updated };
}

// ---------- Rules CRUD ----------

export const listDistributionRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await getActorTeamScope(context.userId);
    let q = supabaseAdmin.from("distribution_rules").select("*").order("created_at", { ascending: false });
    if (!scope.isAdmin) {
      if (scope.teamIds.length === 0) return [];
      q = q.in("team_id", scope.teamIds);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveDistributionRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(120),
      team_id: z.string().uuid().nullable(),
      method: Method,
      is_active: z.boolean().default(true),
      config: z.record(z.string(), z.unknown()).default({}),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.userId, data.team_id);
    const cfgJson = data.config as unknown as Record<string, never>;
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("distribution_rules")
        .update({ name: data.name, team_id: data.team_id, method: data.method, is_active: data.is_active, config: cfgJson })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("distribution_rules")
      .insert({ name: data.name, team_id: data.team_id, method: data.method, is_active: data.is_active, config: cfgJson, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteDistributionRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rule } = await supabaseAdmin.from("distribution_rules").select("team_id").eq("id", data.id).maybeSingle();
    await assertCanManage(context.userId, rule?.team_id ?? null);
    const { error } = await supabaseAdmin.from("distribution_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Distribution actions ----------

export const distributeLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      leadIds: z.array(z.string().uuid()).min(1).max(5000),
      ruleId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rule, error: rErr } = await supabaseAdmin
      .from("distribution_rules")
      .select("*")
      .eq("id", data.ruleId)
      .single();
    if (rErr || !rule) throw new Error("Rule not found");
    await assertCanManage(context.userId, rule.team_id);

    const cfg = (rule.config ?? {}) as Record<string, unknown>;
    let assignments: Array<{ lead_id: string; user_id: string }> = [];

    if (rule.method === "round_robin") {
      const members = (cfg.members as string[]) ?? [];
      const start = (cfg.last_assigned_index as number) ?? 0;
      assignments = distributeRoundRobin(data.leadIds, members, start);
      if (members.length > 0) {
        await supabaseAdmin
          .from("distribution_rules")
          .update({ config: { ...cfg, last_assigned_index: (start + data.leadIds.length) % members.length } })
          .eq("id", rule.id);
      }
    } else if (rule.method === "percentage") {
      assignments = distributePercentage(data.leadIds, (cfg.distribution as Record<string, number>) ?? {});
    } else if (rule.method === "priority") {
      const map = (cfg.byPriority as Record<string, string[]>) ?? {};
      const { data: leads } = await supabaseAdmin.from("leads").select("id, priority").in("id", data.leadIds);
      const buckets = new Map<string, string[]>();
      (leads ?? []).forEach((l: { id: string; priority: string }) => {
        const arr = buckets.get(l.priority) ?? [];
        arr.push(l.id);
        buckets.set(l.priority, arr);
      });
      for (const [p, ids] of buckets) {
        const pool = map[p] ?? map["normal"] ?? [];
        assignments.push(...distributeRoundRobin(ids, pool));
      }
    } else if (rule.method === "source") {
      const map = (cfg.bySource as Record<string, string[]>) ?? {};
      const { data: leads } = await supabaseAdmin.from("leads").select("id, lead_source").in("id", data.leadIds);
      const buckets = new Map<string, string[]>();
      (leads ?? []).forEach((l: { id: string; lead_source: string | null }) => {
        const arr = buckets.get(l.lead_source ?? "") ?? [];
        arr.push(l.id);
        buckets.set(l.lead_source ?? "", arr);
      });
      for (const [src, ids] of buckets) {
        const pool = map[src] ?? map["*"] ?? [];
        assignments.push(...distributeRoundRobin(ids, pool));
      }
    } else if (rule.method === "availability") {
      const members = (cfg.members as string[]) ?? [];
      const today = new Date().toISOString().slice(0, 10);
      const { data: att } = await supabaseAdmin
        .from("attendance")
        .select("user_id, punch_out_at")
        .eq("work_date", today)
        .in("user_id", members);
      const punchedIn = new Set((att ?? []).filter((a: { user_id: string; punch_out_at: string | null }) => !a.punch_out_at).map((a: { user_id: string }) => a.user_id));
      const { data: openBreaks } = await supabaseAdmin
        .from("breaks")
        .select("user_id")
        .is("ended_at", null)
        .in("user_id", members);
      const onBreak = new Set((openBreaks ?? []).map((b: { user_id: string }) => b.user_id));
      const available = members.filter((m) => punchedIn.has(m) && !onBreak.has(m));
      assignments = distributeRoundRobin(data.leadIds, available.length > 0 ? available : members);
    } else {
      throw new Error("Use bulkReassign for manual method");
    }

    return applyAssignments(assignments, rule.method as z.infer<typeof Method>, `Rule: ${rule.name}`, context.userId);
  });

export const bulkReassign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      leadIds: z.array(z.string().uuid()).min(1).max(5000),
      toUserId: z.string().uuid(),
      reason: z.string().trim().max(500).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.userId, null);
    return applyAssignments(
      data.leadIds.map((id) => ({ lead_id: id, user_id: data.toUserId })),
      "manual",
      data.reason ?? null,
      context.userId,
    );
  });

export const bulkSplitEqual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      leadIds: z.array(z.string().uuid()).min(1).max(5000),
      userIds: z.array(z.string().uuid()).min(1).max(100),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.userId, null);
    const assignments = distributeRoundRobin(data.leadIds, data.userIds);
    return applyAssignments(assignments, "round_robin", "Bulk split equal", context.userId);
  });

export const bulkSplitPercentage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      leadIds: z.array(z.string().uuid()).min(1).max(5000),
      distribution: z.record(z.string().uuid(), z.number().min(0).max(100)),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.userId, null);
    const assignments = distributePercentage(data.leadIds, data.distribution);
    return applyAssignments(assignments, "percentage", "Bulk split percentage", context.userId);
  });

export const setLeadPriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      leadIds: z.array(z.string().uuid()).min(1).max(5000),
      priority: Priority,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.userId, null);
    const { error } = await supabaseAdmin.from("leads").update({ priority: data.priority }).in("id", data.leadIds);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Dashboard & helpers ----------

export const getDistributionDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await getActorTeamScope(context.userId);
    // Determine member pool
    let memberIds: string[] | null = null;
    if (!scope.isAdmin) {
      if (scope.teamIds.length === 0) return null;
      const { data: profs } = await supabaseAdmin.from("profiles").select("id").in("team_id", scope.teamIds);
      memberIds = (profs ?? []).map((p: { id: string }) => p.id);
      if (memberIds.length === 0) return null;
    }

    const baseQuery = () => {
      const q = supabaseAdmin.from("leads").select("id, assigned_to, lead_source, priority, created_at", { count: "exact" });
      return q;
    };

    // Unassigned
    let unq = baseQuery().is("assigned_to", null);
    if (memberIds) unq = unq.is("assigned_to", null); // unassigned is global by definition; admin only
    const { count: unassignedCount } = scope.isAdmin
      ? await supabaseAdmin.from("leads").select("id", { count: "exact", head: true }).is("assigned_to", null)
      : { count: 0 };

    // Today's assignments
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let histQ = supabaseAdmin
      .from("lead_assignment_history")
      .select("id, to_user_id, method, created_at", { count: "exact" })
      .gte("created_at", today.toISOString());
    if (memberIds) histQ = histQ.in("to_user_id", memberIds);
    const { data: histToday } = await histQ;
    const todayList = histToday ?? [];
    const autoToday = todayList.filter((h) => ["round_robin", "percentage", "priority", "source", "availability"].includes(h.method)).length;
    const manualToday = todayList.filter((h) => h.method === "manual").length;

    // Caller-wise counts (total assigned leads)
    let callerQ = supabaseAdmin.from("leads").select("assigned_to").not("assigned_to", "is", null);
    if (memberIds) callerQ = callerQ.in("assigned_to", memberIds);
    const { data: callerRows } = await callerQ;
    const callerCounts = new Map<string, number>();
    (callerRows ?? []).forEach((r: { assigned_to: string }) => callerCounts.set(r.assigned_to, (callerCounts.get(r.assigned_to) ?? 0) + 1));
    const callerIds = Array.from(callerCounts.keys());
    const { data: callerProfiles } = callerIds.length > 0
      ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", callerIds)
      : { data: [] };
    const callerProfileMap = new Map((callerProfiles ?? []).map((p) => [p.id, p]));
    const callerWise = Array.from(callerCounts.entries())
      .map(([uid, count]) => ({ user_id: uid, count, profile: callerProfileMap.get(uid) ?? null }))
      .sort((a, b) => b.count - a.count);

    // Source-wise (today assigned)
    const todayLeadIds = todayList.map((h) => h.to_user_id).filter(Boolean);
    let srcQ = supabaseAdmin.from("leads").select("lead_source").gte("assigned_at", today.toISOString());
    if (memberIds) srcQ = srcQ.in("assigned_to", memberIds);
    const { data: srcRows } = await srcQ;
    const sourceCounts = new Map<string, number>();
    (srcRows ?? []).forEach((r: { lead_source: string | null }) => {
      const key = r.lead_source || "Unknown";
      sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
    });

    return {
      unassigned: unassignedCount ?? 0,
      autoAssignedToday: autoToday,
      manualAssignedToday: manualToday,
      totalAssignedToday: todayList.length,
      callerWise,
      sourceWise: Array.from(sourceCounts.entries()).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    };
  });

export const getLeadAssignmentHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Authorize: admin/manager OR lead owner/assignee OR team-leader of assignee.
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("assigned_to, created_by")
      .eq("id", data.leadId)
      .maybeSingle();
    if (!lead) throw new Error("Lead not found");
    const scope = await getActorTeamScope(context.userId);
    let allowed = scope.isAdmin
      || lead.assigned_to === context.userId
      || lead.created_by === context.userId;
    if (!allowed && scope.teamIds.length > 0 && lead.assigned_to) {
      const { data: prof } = await supabaseAdmin
        .from("profiles").select("team_id").eq("id", lead.assigned_to).maybeSingle();
      if (prof?.team_id && scope.teamIds.includes(prof.team_id)) allowed = true;
    }
    if (!allowed) throw new Error("Forbidden");

    const { data: rows, error } = await supabaseAdmin
      .from("lead_assignment_history")
      .select("id, from_user_id, to_user_id, assigned_by, method, reason, created_at")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const userIds = new Set<string>();
    (rows ?? []).forEach((r: { from_user_id: string | null; to_user_id: string | null; assigned_by: string | null }) => {
      if (r.from_user_id) userIds.add(r.from_user_id);
      if (r.to_user_id) userIds.add(r.to_user_id);
      if (r.assigned_by) userIds.add(r.assigned_by);
    });
    const { data: profs } = userIds.size > 0
      ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", Array.from(userIds))
      : { data: [] };
    const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
    return (rows ?? []).map((r) => ({
      ...r,
      from: r.from_user_id ? profMap.get(r.from_user_id) ?? null : null,
      to: r.to_user_id ? profMap.get(r.to_user_id) ?? null : null,
      by: r.assigned_by ? profMap.get(r.assigned_by) ?? null : null,
    }));
  });

export const getDistributionContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await getActorTeamScope(context.userId);
    // Teams the actor can manage
    let teamsQ = supabaseAdmin.from("teams").select("id, name, leader_id");
    if (!scope.isAdmin) {
      if (scope.teamIds.length === 0) return { teams: [], members: [], sources: [] };
      teamsQ = teamsQ.in("id", scope.teamIds);
    }
    const { data: teams } = await teamsQ;
    // Members: profiles in those teams (or all if admin)
    let membersQ = supabaseAdmin.from("profiles").select("id, full_name, email, team_id").eq("is_active", true);
    if (!scope.isAdmin) membersQ = membersQ.in("team_id", scope.teamIds);
    const { data: members } = await membersQ;
    // Distinct sources
    let srcQ = supabaseAdmin.from("leads").select("lead_source").not("lead_source", "is", null);
    const { data: src } = await srcQ.limit(2000);
    const sources = Array.from(new Set((src ?? []).map((r: { lead_source: string }) => r.lead_source))).sort();
    return { teams: teams ?? [], members: members ?? [], sources };
  });

export const listLeadsForDistribution = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      filter: z.enum(["unassigned", "all", "team"]).default("unassigned"),
      limit: z.number().min(1).max(500).default(200),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const scope = await getActorTeamScope(context.userId);
    let q = supabaseAdmin
      .from("leads")
      .select("id, client_name, phone, email, lead_source, priority, assigned_to, status_id, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.filter === "unassigned") q = q.is("assigned_to", null);
    if (!scope.isAdmin) {
      if (scope.teamIds.length === 0) return [];
      const { data: profs } = await supabaseAdmin.from("profiles").select("id").in("team_id", scope.teamIds);
      const memberIds = (profs ?? []).map((p: { id: string }) => p.id);
      if (memberIds.length === 0 && data.filter !== "unassigned") return [];
      if (data.filter !== "unassigned") q = q.in("assigned_to", memberIds);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });