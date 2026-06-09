import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdminOrManager } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, Loader2, ListChecks, ChevronRight, ShieldAlert, Trash2, PhoneCall, Clock, Coffee, Timer, PlayCircle, StopCircle } from "lucide-react";
import { format } from "date-fns";
import { CreateFlowModal } from "@/components/workflow/create-flow-modal";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/team-workflows")({ component: Page });

interface Member { id: string; full_name: string | null; email: string | null }
interface FilterMetaRow {
  statusName: string;
  statusColor: string;
  labelNames: string[];
  labelColors: string[];
  fromDate: string;
  toDate: string;
  attempts: number;
}
interface FlowRow {
  id: string;
  work_date: string;
  status: "active" | "completed" | "cancelled";
  name: string | null;
  created_at: string;
  filter_meta: { rows: FilterMetaRow[] } | null;
  total: number;
  done: number;
  skipped: number;
  pending: number;
  rescheduled: number;
}
interface FlowItem {
  id: string;
  lead_id: string;
  category: "fresh" | "interested_meeting" | "quotation_sent" | "followup";
  priority: number;
  attempts_planned: number;
  attempts_done: number;
  status: "pending" | "in_progress" | "done" | "skipped" | "rescheduled";
  completed_at: string | null;
}
interface LeadLite { id: string; client_name: string; phone: string | null; status_id: string | null }
interface StatusLite { id: string; name: string; color: string }
interface SessionStats {
  startedAt: Date;
  endedAt: Date;
  totalSessionSec: number;
  totalTalkSec: number;
  callCount: number;
}

function fmtTime(d: Date) { return format(d, "h:mm a"); }
function fmtDur(sec: number) {
  if (sec <= 0) return "0m";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

const CAT_LABEL: Record<FlowItem["category"], string> = {
  fresh: "Fresh",
  interested_meeting: "Interested",
  quotation_sent: "Quotation",
  followup: "Follow-up",
};
const CAT_COLOR: Record<FlowItem["category"], string> = {
  fresh: "#f97316",
  interested_meeting: "#8b5cf6",
  quotation_sent: "#06b6d4",
  followup: "#6366f1",
};

function Page() {
  const { user, roles, loading: authLoading } = useAuth();
  const isTL = roles.includes("team_leader");
  const isMgr = isAdminOrManager(roles);
  const allowed = isTL || isMgr;

  const [members, setMembers] = useState<Member[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingFlows, setLoadingFlows] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [drillFlow, setDrillFlow] = useState<FlowRow | null>(null);
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillItems, setDrillItems] = useState<FlowItem[]>([]);
  const [drillLeads, setDrillLeads] = useState<Map<string, LeadLite>>(new Map());
  const [drillStatuses, setDrillStatuses] = useState<Map<string, StatusLite>>(new Map());
  const [drillLoading, setDrillLoading] = useState(false);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);

  const [deleteFlow, setDeleteFlow] = useState<FlowRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!deleteFlow) return;
    setDeleting(true);
    const { error } = await supabase.from("calling_flows").delete().eq("id", deleteFlow.id);
    setDeleting(false);
    if (error) {
      toast.error("Delete failed: " + error.message);
      return;
    }
    toast.success("Workflow deleted");
    setDeleteFlow(null);
    void loadFlows();
  }

  // Load members
  useEffect(() => {
    if (!user || !allowed) return;
    void (async () => {
      setLoadingMembers(true);
      let q = (supabase as any).from("profiles_directory").select("id, full_name, email, team_id, is_active").eq("is_active", true);
      if (!isMgr) {
        // team leader: only members of teams they lead
        const { data: teams } = await supabase.from("teams").select("id").eq("leader_id", user.id);
        const teamIds = (teams ?? []).map((t) => t.id);
        if (teamIds.length === 0) {
          setMembers([]);
          setSelectedId(null);
          setLoadingMembers(false);
          return;
        }
        q = q.in("team_id", teamIds).neq("id", user.id);
      }
      const { data } = await q.order("full_name");
      const list = (data ?? []) as Member[];
      setMembers(list);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
      setLoadingMembers(false);
    })();
  }, [user, allowed, isMgr]);

  // Load flow history for selected member
  async function loadFlows() {
    if (!selectedId) { setFlows([]); return; }
    setLoadingFlows(true);
    const { data: rows } = await supabase
      .from("calling_flows")
      .select("id, work_date, status, name, created_at, filter_meta")
      .eq("user_id", selectedId)
      .order("created_at", { ascending: false })
      .limit(60);
    const flowList = (rows ?? []) as Omit<FlowRow, "total" | "done" | "skipped" | "pending" | "rescheduled">[];
    if (flowList.length === 0) { setFlows([]); setLoadingFlows(false); return; }
    const ids = flowList.map((f) => f.id);
    const { data: items } = await supabase
      .from("calling_flow_items")
      .select("flow_id, status")
      .in("flow_id", ids);
    const byFlow = new Map<string, { total: number; done: number; skipped: number; pending: number; rescheduled: number }>();
    for (const f of flowList) byFlow.set(f.id, { total: 0, done: 0, skipped: 0, pending: 0, rescheduled: 0 });
    for (const it of (items ?? []) as { flow_id: string; status: FlowItem["status"] }[]) {
      const b = byFlow.get(it.flow_id);
      if (!b) continue;
      b.total++;
      if (it.status === "done") b.done++;
      else if (it.status === "skipped") b.skipped++;
      else if (it.status === "rescheduled") b.rescheduled++;
      else b.pending++;
    }
    setFlows(flowList.map((f) => ({ ...f, ...byFlow.get(f.id)! })));
    setLoadingFlows(false);
  }

  useEffect(() => { if (selectedId) void loadFlows(); }, [selectedId]);

  // Realtime: refresh when flows for this member change
  useEffect(() => {
    if (!selectedId) return;
    const ch = supabase.channel(`tw-${selectedId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calling_flows", filter: `user_id=eq.${selectedId}` }, () => loadFlows())
      .on("postgres_changes", { event: "*", schema: "public", table: "calling_flow_items" }, () => loadFlows())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [selectedId]);

  async function openDrill(f: FlowRow) {
    setDrillFlow(f);
    setDrillOpen(true);
    setDrillLoading(true);
    setSessionStats(null);
    const { data: items } = await supabase
      .from("calling_flow_items")
      .select("id, lead_id, category, priority, attempts_planned, attempts_done, status, completed_at")
      .eq("flow_id", f.id)
      .order("priority");
    const its = (items ?? []) as FlowItem[];
    setDrillItems(its);
    if (its.length) {
      const leadIds = Array.from(new Set(its.map((i) => i.lead_id)));
      const [{ data: leads }, { data: sts }, { data: callRows }] = await Promise.all([
        supabase.from("leads").select("id, client_name, phone, status_id").in("id", leadIds),
        supabase.from("statuses").select("id, name, color").order("sort_order"),
        supabase.from("calls")
          .select("called_at, created_at, duration_seconds")
          .in("lead_id", leadIds)
          .gte("created_at", f.work_date + "T00:00:00")
          .lte("created_at", f.work_date + "T23:59:59")
          .order("called_at", { ascending: true }),
      ]);

      // Calculate session stats from calls
      const calls = ((callRows ?? []) as { called_at: string | null; created_at: string; duration_seconds: number | null }[])
        .map((c) => ({
          at: new Date(c.called_at ?? c.created_at),
          dur: c.duration_seconds ?? 0,
        }))
        .sort((a, b) => a.at.getTime() - b.at.getTime());

      if (calls.length > 0) {
        const first = calls[0];
        const last = calls[calls.length - 1];
        const endedAt = new Date(last.at.getTime() + last.dur * 1000);
        const totalTalkSec = calls.reduce((s, c) => s + c.dur, 0);
        const totalSessionSec = Math.round((endedAt.getTime() - first.at.getTime()) / 1000);
        setSessionStats({
          startedAt: first.at,
          endedAt,
          totalSessionSec,
          totalTalkSec,
          callCount: calls.length,
        });
      }
      setDrillLeads(new Map((leads ?? []).map((l) => [l.id, l as LeadLite])));
      setDrillStatuses(new Map((sts ?? []).map((s) => [s.id, s as StatusLite])));
    } else {
      setDrillLeads(new Map());
      setDrillStatuses(new Map());
    }
    setDrillLoading(false);
  }

  const selectedMember = useMemo(() => members.find((m) => m.id === selectedId) ?? null, [members, selectedId]);
  const today = format(new Date(), "yyyy-MM-dd");
  const todayFlow = useMemo(() => flows.find((f) => f.work_date === today) ?? null, [flows, today]);

  const groupedDrillItems = useMemo(() => {
    const groups: Record<FlowItem["category"], FlowItem[]> = { fresh: [], interested_meeting: [], quotation_sent: [], followup: [] };
    for (const i of drillItems) groups[i.category].push(i);
    return groups;
  }, [drillItems]);

  if (authLoading) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></div>;
  }

  if (!allowed) {
    return (
      <div className="p-6 md:p-10 max-w-2xl mx-auto">
        <Card className="p-8 text-center">
          <ShieldAlert className="size-10 text-destructive mx-auto mb-3" />
          <h1 className="font-display text-xl font-bold">Access denied</h1>
          <p className="text-muted-foreground mt-2 text-sm">This page is only for Team Leaders and Managers.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-5xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <ListChecks className="size-7 text-primary" /> Team Workflows
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Apni team ke members ke liye workflow create karo aur unki history dekho.
          </p>
        </div>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Team member</div>
            <Select value={selectedId ?? undefined} onValueChange={(v) => setSelectedId(v)} disabled={loadingMembers || members.length === 0}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder={loadingMembers ? "Loading..." : members.length === 0 ? "No team members" : "Select a member"} />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name ?? m.email ?? "(no name)"}
                    {m.email && m.full_name && <span className="text-muted-foreground text-xs ml-2">{m.email}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            disabled={!selectedId}
            className="bg-gradient-primary shadow-glow"
          >
            <Plus className="size-4 mr-2" />
            Create workflow
          </Button>
        </div>
        {selectedMember && (
          <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Selected:</span>{" "}
              <span className="font-semibold">{selectedMember.full_name ?? selectedMember.email}</span>
            </div>
            {todayFlow ? (
              <div className="text-muted-foreground">
                Today: <span className="text-foreground font-medium">{todayFlow.done}/{todayFlow.total}</span> done · {todayFlow.pending} pending · {todayFlow.skipped} skipped
              </div>
            ) : (
              <div className="text-muted-foreground">No workflow for today yet.</div>
            )}
          </div>
        )}
      </Card>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">History</h2>
        <span className="text-xs text-muted-foreground">{flows.length} workflow{flows.length === 1 ? "" : "s"}</span>
      </div>

      {loadingFlows ? (
        <div className="grid place-items-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : !selectedId ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Select a team member to see their workflow history.</Card>
      ) : flows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No workflows yet for this member.</Card>
      ) : (
        <div className="space-y-2">
          {flows.map((f) => {
            const pct = f.total > 0 ? Math.round((f.done / f.total) * 100) : 0;
            const isToday = f.work_date === today;
            return (
              <Card
                key={f.id}
                className="p-4 hover:border-primary/40 hover:shadow-card transition-all cursor-pointer"
                onClick={() => openDrill(f)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold">{format(new Date(f.work_date), "EEE, MMM d, yyyy")}</div>
                      {isToday && <Badge className="bg-emerald-500 text-white border-0 text-[10px]">Today</Badge>}
                      <Badge variant="outline" className="text-[10px] capitalize">{f.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {f.total} leads · <span className="text-emerald-600">{f.done} done</span> · <span className="text-amber-600">{f.skipped} skipped</span> · {f.pending} pending
                    </div>
                    {f.filter_meta?.rows && f.filter_meta.rows.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1">
                        {f.filter_meta.rows.map((r, ri) => (
                          <div key={ri} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="size-2 rounded-full shrink-0" style={{ background: r.statusColor }} />
                            <span className="font-medium text-foreground/80">{r.statusName}</span>
                            <span className="text-muted-foreground">
                              {format(new Date(r.fromDate), "d MMM")} → {format(new Date(r.toDate), "d MMM")}
                            </span>
                            {r.labelNames.map((ln, li) => (
                              <span key={li} className="px-1.5 py-0.5 rounded-full text-white text-[10px]" style={{ background: r.labelColors[li] ?? "#888" }}>{ln}</span>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-2xl font-bold tabular-nums" style={{ color: pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#6366f1" }}>
                      {pct}%
                    </div>
                    <div className="text-[10px] uppercase text-muted-foreground tracking-wider">complete</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => { e.stopPropagation(); setDeleteFlow(f); }}
                    title="Delete workflow"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {selectedMember && (
        <CreateFlowModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={() => { setCreateOpen(false); void loadFlows(); }}
          targetUserId={selectedMember.id}
          targetUserName={selectedMember.full_name ?? selectedMember.email ?? "member"}
        />
      )}

      <Sheet open={drillOpen} onOpenChange={setDrillOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display">
              {drillFlow ? format(new Date(drillFlow.work_date), "EEE, MMM d, yyyy") : "Workflow"}
            </SheetTitle>
            {drillFlow && (
              <div className="text-xs text-muted-foreground">
                {drillFlow.name ?? "Workflow"} · {drillFlow.total} leads · {drillFlow.done} done · {drillFlow.skipped} skipped · {drillFlow.pending} pending
              </div>
            )}
          </SheetHeader>
          {drillLoading ? (
            <div className="grid place-items-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="mt-4 space-y-5">

              {/* Session Stats */}
              {sessionStats && (
                <div className="rounded-xl border bg-card overflow-hidden">
                  <div className="px-4 py-2.5 border-b bg-muted/40 flex items-center gap-2">
                    <Timer className="size-3.5 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Session Stats</span>
                  </div>
                  <div className="divide-y">
                    <div className="grid grid-cols-2 divide-x">
                      <div className="px-4 py-3 flex items-center gap-2.5">
                        <PlayCircle className="size-4 text-emerald-500 shrink-0" />
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Started</div>
                          <div className="text-sm font-semibold tabular-nums">{fmtTime(sessionStats.startedAt)}</div>
                        </div>
                      </div>
                      <div className="px-4 py-3 flex items-center gap-2.5">
                        <StopCircle className="size-4 text-rose-500 shrink-0" />
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Ended</div>
                          <div className="text-sm font-semibold tabular-nums">{fmtTime(sessionStats.endedAt)}</div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 divide-x">
                      <div className="px-3 py-3 text-center">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 flex items-center justify-center gap-1">
                          <PhoneCall className="size-3" /> Calls
                        </div>
                        <div className="text-lg font-bold tabular-nums text-primary">{sessionStats.callCount}</div>
                      </div>
                      <div className="px-3 py-3 text-center">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 flex items-center justify-center gap-1">
                          <Clock className="size-3" /> Talk Time
                        </div>
                        <div className="text-lg font-bold tabular-nums text-emerald-600">{fmtDur(sessionStats.totalTalkSec)}</div>
                      </div>
                      <div className="px-3 py-3 text-center">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 flex items-center justify-center gap-1">
                          <Coffee className="size-3" /> Break
                        </div>
                        <div className="text-lg font-bold tabular-nums text-amber-600">{fmtDur(Math.max(0, sessionStats.totalSessionSec - sessionStats.totalTalkSec))}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {(Object.keys(groupedDrillItems) as FlowItem["category"][]).map((cat) => {
                const list = groupedDrillItems[cat];
                if (list.length === 0) return null;
                return (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="size-2 rounded-full" style={{ background: CAT_COLOR[cat] }} />
                      <h3 className="font-semibold text-sm">{CAT_LABEL[cat]}</h3>
                      <span className="text-xs text-muted-foreground">({list.length})</span>
                    </div>
                    <div className="space-y-1.5">
                      {list.map((it) => {
                        const lead = drillLeads.get(it.lead_id);
                        const st = lead?.status_id ? drillStatuses.get(lead.status_id) : null;
                        return (
                          <div key={it.id} className="flex items-center gap-2 p-2 rounded-md border bg-card/50">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{lead?.client_name ?? "(deleted lead)"}</div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {lead?.phone ?? "no phone"}
                                {st && <> · <span style={{ color: st.color }}>{st.name}</span></>}
                              </div>
                            </div>
                            <div className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                              {it.attempts_done}/{it.attempts_planned}
                            </div>
                            <Badge
                              variant="outline"
                              className="text-[10px] capitalize shrink-0"
                              style={{
                                color: it.status === "done" ? "#10b981" : it.status === "skipped" ? "#f59e0b" : it.status === "rescheduled" ? "#6366f1" : undefined,
                                borderColor: it.status === "done" ? "#10b98140" : it.status === "skipped" ? "#f59e0b40" : it.status === "rescheduled" ? "#6366f140" : undefined,
                              }}
                            >
                              {it.status.replace("_", " ")}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {drillItems.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">No items in this workflow.</div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteFlow} onOpenChange={(o) => !o && setDeleteFlow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFlow && (
                <>
                  {format(new Date(deleteFlow.work_date), "EEE, MMM d, yyyy")} · {deleteFlow.total} leads.
                  Yeh action permanent hai aur isme saare items delete ho jayenge.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}