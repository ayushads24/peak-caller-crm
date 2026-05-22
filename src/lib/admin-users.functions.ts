import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Role = z.enum(["admin", "manager", "team_leader", "caller", "project_manager"]);

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (data ?? []).some((r: { role: string }) => r.role === "admin");
  if (!isAdmin) throw new Error("Admin access required");
}

async function ensureTeamForLeader(userId: string, fallbackName?: string | null) {
  const { data: existing, error: findError } = await supabaseAdmin
    .from("teams")
    .select("id")
    .eq("leader_id", userId)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (existing) return existing.id;

  const { data: prof, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);

  const label = fallbackName || prof?.full_name || prof?.email || "Team Leader";
  const { data: created, error: createError } = await supabaseAdmin
    .from("teams")
    .insert({ name: `${label}'s Team`, leader_id: userId })
    .select("id")
    .single();
  if (createError) throw new Error(createError.message);
  return created.id;
}

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, phone, is_active, team_id, designation, last_login_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const { data: teams } = await supabaseAdmin.from("teams").select("id, name");
    const rolesByUser = new Map<string, string[]>();
    (roles ?? []).forEach((r: { user_id: string; role: string }) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });
    const teamMap = new Map((teams ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));
    return (profiles ?? []).map((p) => ({
      ...p,
      roles: rolesByUser.get(p.id) ?? [],
      team_name: p.team_id ? (teamMap.get(p.team_id) ?? null) : null,
    }));
  });

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      email: z.string().trim().email().max(255),
      password: z.string().min(8).max(128),
      full_name: z.string().trim().min(1).max(120),
      phone: z.string().trim().max(40).optional().nullable(),
      role: Role,
      team_id: z.string().uuid().optional().nullable(),
      designation: z.string().trim().max(120).optional().nullable(),
      is_active: z.boolean().default(true),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (cErr || !created.user) throw new Error(cErr?.message ?? "Failed to create user");
    const uid = created.user.id;
    // Profile is auto-created by handle_new_user trigger; update extra fields
    await supabaseAdmin.from("profiles").update({
      full_name: data.full_name,
      phone: data.phone ?? null,
      team_id: data.team_id ?? null,
      designation: data.designation ?? null,
      is_active: data.is_active,
    }).eq("id", uid);
    // Role: trigger assigns 'caller' by default. Replace with the requested role.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    if (data.role === "team_leader") await ensureTeamForLeader(uid, data.full_name);
    return { id: uid };
  });

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      full_name: z.string().trim().min(1).max(120).optional(),
      phone: z.string().trim().max(40).nullable().optional(),
      role: Role.optional(),
      team_id: z.string().uuid().nullable().optional(),
      designation: z.string().trim().max(120).nullable().optional(),
      is_active: z.boolean().optional(),
      password: z.string().min(8).max(128).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const profilePatch = {
      ...(data.full_name !== undefined && { full_name: data.full_name }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.team_id !== undefined && { team_id: data.team_id }),
      ...(data.designation !== undefined && { designation: data.designation }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
    };
    if (Object.keys(profilePatch).length > 0) {
      const { error } = await supabaseAdmin.from("profiles").update(profilePatch).eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    if (data.role) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.id);
      await supabaseAdmin.from("user_roles").insert({ user_id: data.id, role: data.role });
      if (data.role === "team_leader") await ensureTeamForLeader(data.id);
    }
    if (data.password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, { password: data.password });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.id === context.userId) throw new Error("Cannot delete yourself");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: teamLeaders, error: leaderError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "team_leader");
    if (leaderError) throw new Error(leaderError.message);
    const leaderIds = (teamLeaders ?? []).map((row: { user_id: string }) => row.user_id);
    const { data: leaderProfiles } = leaderIds.length > 0
      ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", leaderIds)
      : { data: [] };
    const leaderProfileMap = new Map((leaderProfiles ?? []).map((p) => [p.id, p]));
    await Promise.all((teamLeaders ?? []).map((row: { user_id: string }) => {
      const profile = leaderProfileMap.get(row.user_id);
      return ensureTeamForLeader(row.user_id, profile?.full_name || profile?.email);
    }));

    const { data: teams } = await supabaseAdmin
      .from("teams")
      .select("id, name, leader_id, created_at")
      .order("created_at", { ascending: false });
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, full_name, email, team_id");
    const memberCount = new Map<string, number>();
    const leaderMap = new Map<string, { full_name: string | null; email: string | null }>();
    (profiles ?? []).forEach((p) => {
      if (p.team_id) memberCount.set(p.team_id, (memberCount.get(p.team_id) ?? 0) + 1);
      leaderMap.set(p.id, { full_name: p.full_name, email: p.email });
    });
    return (teams ?? []).map((t) => ({
      ...t,
      member_count: memberCount.get(t.id) ?? 0,
      leader: t.leader_id ? (leaderMap.get(t.leader_id) ?? null) : null,
    }));
  });

export const adminCreateTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      name: z.string().trim().min(1).max(120),
      leader_id: z.string().uuid().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("teams")
      .insert({ name: data.name, leader_id: data.leader_id ?? null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const adminUpdateTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(120).optional(),
      leader_id: z.string().uuid().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const patch = {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.leader_id !== undefined && { leader_id: data.leader_id }),
    };
    const { error } = await supabaseAdmin.from("teams").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("teams").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });