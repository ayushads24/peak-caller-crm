import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, SkipForward, CheckCircle2, XCircle, Coffee, Play, Pause, Plus, MessageCircle, Loader2, Flame, CalendarRange, FileText, RotateCw, AlarmClock, StopCircle, Eye } from "lucide-react";
import { CreateFlowModal, type FlowCategory } from "@/components/workflow/create-flow-modal";
import { PostCallSheet } from "@/components/workflow/post-call-sheet";
import { LeadDetailSheet, type LeadRow, type StatusRow, type LabelRow, type ProfileLite } from "@/components/leads/lead-detail-sheet";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/workflow")({ component: Page });

interface Item {
  id: string; lead_id: string; category: FlowCategory; priority: number;
  attempts_planned: number; attempts_done: number; status: "pending" | "in_progress" | "done" | "skipped" | "rescheduled";
}
interface Lead { id: string; client_name: string; phone: string | null; email: string | null; status_id: string | null; sales_value: number | null; lead_source: string | null; created_at: string; assigned_to?: string | null; created_by?: string | null; }
interface Status { id: string; name: string; color: string; }
interface Brk { id: string; type: "lunch" | "tea" | "meeting" | "other"; started_at: string; ended_at: string | null; }

const CAT_META: Record<FlowCategory, { label: string; icon: typeof Flame; color: string }> = {
  fresh: { label: "Fresh", icon: Flame, color: "#f97316" },
  interested_meeting: { label: "Interested", icon: CalendarRange, color: "#8b5cf6" },
  quotation_sent: { label: "Quotation", icon: FileText, color: "#06b6d4" },
  followup: { label: "Follow-up", icon: RotateCw, color: "#6366f1" },
};

function Page() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [flowId, setFlowId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [leadsMap, setLeadsMap] = useState<Map<string, Lead>>(new Map());
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [activeBreak, setActiveBreak] = useState<Brk | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [postLead, setPostLead] = useState<Lead | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoMode, setAutoMode] = useState<"off" | "running" | "paused">("off");
  const [dueTaskLeadIds, setDueTaskLeadIds] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [fullStatuses, setFullStatuses] = useState<StatusRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const lastAutoCalledItemId = useRef<string | null>(null);
  const flowStartedAt = useRef<number>(Date.now());

  useEffect(() => { if (user) void load(); }, [user]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("workflow-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "calling_flow_items" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "breaks", filter: `user_id=eq.${user.id}` }, () => loadBreak())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads" }, (payload) => {
        const row = payload.new as { id: string; client_name: string; created_at: string };
        if (row?.created_at && new Date(row.created_at).getTime() >= flowStartedAt.current) {
          toast.success(`New fresh lead: ${row.client_name}`, { icon: "✨" });
        }
        void load();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user]);

  async function loadBreak() {
    if (!user) return;
    const { data } = await supabase.from("breaks").select("id, type, started_at, ended_at").eq("user_id", user.id).is("ended_at", null).maybeSingle();
    setActiveBreak((data as Brk) ?? null);
  }

  async function load() {
    if (!user) return;
    setLoading(true);
    const workDate = format(new Date(), "yyyy-MM-dd");
    const { data: flow } = await supabase.from("calling_flows").select("id, status").eq("user_id", user.id).eq("work_date", workDate).maybeSingle();
    if (!flow) { setFlowId(null); setItems([]); setLeadsMap(new Map()); setLoading(false); return; }
    setFlowId(flow.id);

    const [{ data: its }, { data: sts }, { data: lbls }, { data: profs }, _b] = await Promise.all([
      supabase.from("calling_flow_items").select("id, lead_id, category, priority, attempts_planned, attempts_done, status").eq("flow_id", flow.id).order("priority"),
      supabase.from("statuses").select("id, name, color, is_sales, is_lost").order("sort_order"),
      supabase.from("labels").select("id, name, color"),
      supabase.from("profiles").select("id, full_name, email"),
      loadBreak(),
    ]);
    setItems((its ?? []) as Item[]);
    setStatuses((sts ?? []) as Status[]);
    setFullStatuses((sts ?? []) as StatusRow[]);
    setLabels((lbls ?? []) as LabelRow[]);
    setProfiles((profs ?? []) as ProfileLite[]);

    const ids = (its ?? []).map((i) => i.lead_id);
    if (ids.length) {
      const { data: leads } = await supabase.from("leads").select("id, client_name, phone, email, status_id, sales_value, lead_source, created_at, assigned_to, created_by").in("id", ids);
      setLeadsMap(new Map((leads ?? []).map((l) => [l.id, l as Lead])));
      // Tasks due today or earlier, still open
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const { data: dueTasks } = await supabase
        .from("tasks")
        .select("lead_id")
        .in("lead_id", ids)
        .neq("status", "completed")
        .lte("due_date", todayEnd.toISOString());
      setDueTaskLeadIds(new Set((dueTasks ?? []).map((t) => t.lead_id as string)));
    } else { setLeadsMap(new Map()); setDueTaskLeadIds(new Set()); }
    setLoading(false);
  }

  const queue = useMemo(() => items.filter((i) => i.status === "pending" || i.status === "in_progress"), [items]);
  const current = queue[0];
  const currentLead = current ? leadsMap.get(current.lead_id) : null;
  const currentStatus = currentLead && statuses.find((s) => s.id === currentLead.status_id);
  const stats = useMemo(() => ({
    total: items.length,
    done: items.filter((i) => i.status === "done").length,
    skipped: items.filter((i) => i.status === "skipped").length,
    pending: queue.length,
  }), [items, queue.length]);

  function leadTag(l: Lead | undefined): "new" | "task" | null {
    if (!l) return null;
    if (dueTaskLeadIds.has(l.id)) return "task";
    const ageH = (Date.now() - new Date(l.created_at).getTime()) / 36e5;
    if (ageH <= 24) return "new";
    return null;
  }

  function openDetail(l: Lead) {
    setDetailLead({
      id: l.id, client_name: l.client_name, email: l.email, phone: l.phone,
      sales_value: l.sales_value, lead_source: l.lead_source, status_id: l.status_id,
      created_at: l.created_at, assigned_to: l.assigned_to ?? null, created_by: l.created_by ?? null,
    });
    setDetailOpen(true);
  }

  async function startCall() {
    if (!current || !currentLead) return;
    if (currentLead.phone) window.location.href = `tel:${currentLead.phone}`;
    setCallStartedAt(Date.now());
    if (current.status !== "in_progress") {
      await supabase.from("calling_flow_items").update({ status: "in_progress" }).eq("id", current.id);
    }
    setPostLead(currentLead);
    setTimeout(() => setPostOpen(true), 300);
  }

  async function advance() {
    if (!current) return;
    const nextAttempts = current.attempts_done + 1;
    const done = nextAttempts >= current.attempts_planned;
    await supabase.from("calling_flow_items").update({
      attempts_done: nextAttempts,
      status: done ? "done" : "pending",
      completed_at: done ? new Date().toISOString() : null,
    }).eq("id", current.id);
  }

  async function markAction(action: "done" | "skipped" | "complete_today") {
    if (!current) return;
    if (action === "complete_today") {
      await supabase.from("calling_flow_items").update({ attempts_done: current.attempts_planned, status: "pending", completed_at: null }).eq("id", current.id);
      await supabase.from("calling_flow_items").update({ status: "rescheduled" }).eq("id", current.id);
    } else {
      await supabase.from("calling_flow_items").update({ status: action, completed_at: new Date().toISOString() }).eq("id", current.id);
    }
    toast.success(action === "done" ? "Marked as done" : action === "skipped" ? "Skipped" : "Removed from today");
  }

  async function startBreak(type: Brk["type"]) {
    if (!user) return;
    await supabase.from("breaks").insert({ user_id: user.id, type });
  }
  async function endBreak() {
    if (!activeBreak) return;
    await supabase.from("breaks").update({ ended_at: new Date().toISOString() }).eq("id", activeBreak.id);
  }

  // Auto-mode: when current lead changes and auto is running, trigger call
  useEffect(() => {
    if (autoMode !== "running" || activeBreak || postOpen || !current || !currentLead) return;
    if (lastAutoCalledItemId.current === current.id) return;
    lastAutoCalledItemId.current = current.id;
    const t = setTimeout(() => { void startCall(); }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, activeBreak, postOpen, current?.id]);

  function toggleAuto() {
    if (autoMode === "off") { flowStartedAt.current = Date.now(); setAutoMode("running"); toast.success("Auto-calling started"); }
    else if (autoMode === "running") { setAutoMode("paused"); toast.message("Auto-calling paused"); }
    else if (autoMode === "paused") { setAutoMode("running"); toast.success("Auto-calling resumed"); }
  }
  function endAuto() { setAutoMode("off"); lastAutoCalledItemId.current = null; toast.message("Auto-calling stopped"); }

  if (loading) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></div>;
  }

  if (!flowId) {
    return (
      <div className="p-6 md:p-10 max-w-3xl mx-auto">
        <Card className="p-8 text-center shadow-card">
          <div className="size-14 rounded-2xl bg-gradient-primary mx-auto flex items-center justify-center mb-4 shadow-glow">
            <Phone className="size-6 text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold">Start today's workflow</h1>
          <p className="text-muted-foreground mt-2">Pick the categories you'll work through today and we'll queue every lead in priority order.</p>
          <Button onClick={() => setCreateOpen(true)} className="mt-6 bg-gradient-primary" size="lg"><Plus className="size-4 mr-2" />Create workflow</Button>
        </Card>
        <CreateFlowModal open={createOpen} onOpenChange={setCreateOpen} onCreated={() => load()} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Workflow</h1>
          <p className="text-muted-foreground text-sm mt-1">{stats.done}/{stats.total} done · {stats.pending} pending · {stats.skipped} skipped</p>
        </div>
        <div className="flex items-center gap-2">
          {activeBreak ? (
            <Button onClick={endBreak} variant="outline" className="border-amber-500/40 text-amber-600 hover:text-amber-700">
              <Play className="size-4 mr-2" />Resume from {activeBreak.type}
            </Button>
          ) : (
            <Select onValueChange={(v) => startBreak(v as Brk["type"])}>
              <SelectTrigger className="w-[140px]"><Coffee className="size-4 mr-1" /><SelectValue placeholder="Break" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lunch">Lunch break</SelectItem>
                <SelectItem value="tea">Tea break</SelectItem>
                <SelectItem value="meeting">Meeting break</SelectItem>
                <SelectItem value="other">Other break</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={() => setCreateOpen(true)}><Plus className="size-4 mr-1" />New workflow</Button>
          {autoMode === "off" ? (
            <Button onClick={toggleAuto} className="bg-gradient-primary shadow-glow" disabled={!current || !!activeBreak}><Play className="size-4 mr-1" />Start Workflow</Button>
          ) : autoMode === "running" ? (
            <>
              <Button onClick={toggleAuto} variant="outline" className="border-amber-500/40 text-amber-600 hover:text-amber-700"><Pause className="size-4 mr-1" />Pause</Button>
              <Button onClick={endAuto} variant="outline" className="text-destructive hover:text-destructive"><StopCircle className="size-4 mr-1" />End</Button>
            </>
          ) : (
            <>
              <Button onClick={toggleAuto} className="bg-gradient-primary"><Play className="size-4 mr-1" />Resume</Button>
              <Button onClick={endAuto} variant="outline" className="text-destructive hover:text-destructive"><StopCircle className="size-4 mr-1" />End</Button>
            </>
          )}
        </div>
      </div>

      {autoMode !== "off" && (
        <div className="mb-4 flex items-center gap-2">
          <Badge className={`border-0 gap-1 ${autoMode === "running" ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"}`}>
            <span className={`size-2 rounded-full bg-white ${autoMode === "running" ? "animate-pulse" : ""}`} />
            Auto-calling {autoMode === "running" ? "ON" : "PAUSED"}
          </Badge>
          <span className="text-xs text-muted-foreground">Next lead opens automatically after each call.</span>
        </div>
      )}

      {activeBreak && (
        <Card className="p-4 mb-4 border-amber-500/40 bg-amber-500/5">
          <div className="flex items-center gap-3"><Pause className="size-5 text-amber-600" />
            <div className="flex-1"><div className="font-medium capitalize">{activeBreak.type} break in progress</div>
              <div className="text-xs text-muted-foreground">Started {format(new Date(activeBreak.started_at), "h:mm a")} — workflow is paused</div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Current lead card */}
        <div className="lg:col-span-2">
          {current && currentLead ? (
            <Card className="p-6 shadow-elegant">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge style={{ background: CAT_META[current.category].color, color: "white" }} className="border-0 gap-1">
                      {(() => { const Icon = CAT_META[current.category].icon; return <Icon className="size-3" />; })()}
                      {CAT_META[current.category].label}
                    </Badge>
                    {currentStatus && <Badge style={{ background: currentStatus.color, color: "white" }} className="border-0">{currentStatus.name}</Badge>}
                  </div>
                  <h2 className="font-display text-2xl font-bold truncate">{currentLead.client_name}</h2>
                  <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                    {currentLead.phone && <div>📞 {currentLead.phone}</div>}
                    {currentLead.email && <div>✉️ {currentLead.email}</div>}
                    {currentLead.lead_source && <div>Source: {currentLead.lead_source}</div>}
                  </div>
                  <Button variant="link" size="sm" className="px-0 h-auto mt-1 text-primary" onClick={() => openDetail(currentLead)}>
                    <Eye className="size-3.5 mr-1" />View full details
                  </Button>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Attempt</div>
                  <div className="font-display text-3xl font-bold">{current.attempts_done + 1}<span className="text-base text-muted-foreground">/{current.attempts_planned}</span></div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-6">
                <Button onClick={startCall} disabled={!!activeBreak} size="lg" className="col-span-2 bg-gradient-primary shadow-glow"><Phone className="size-4 mr-2" />Call now</Button>
                {currentLead.phone && (
                  <Button variant="outline" size="lg" onClick={() => { const p = currentLead.phone!.replace(/\D/g, ""); window.open(`https://wa.me/${p}`, "_blank"); }}><MessageCircle className="size-4 mr-2" />WhatsApp</Button>
                )}
                <Button variant="outline" size="lg" onClick={advance}><SkipForward className="size-4 mr-2" />Next</Button>
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                <Button variant="ghost" size="sm" onClick={() => markAction("complete_today")} className="text-xs"><CheckCircle2 className="size-3.5 mr-1" />Complete today's attempt</Button>
                <Button variant="ghost" size="sm" onClick={() => markAction("done")} className="text-xs text-emerald-600 hover:text-emerald-700"><CheckCircle2 className="size-3.5 mr-1" />Mark as done</Button>
                <Button variant="ghost" size="sm" onClick={() => markAction("skipped")} className="text-xs text-destructive hover:text-destructive"><XCircle className="size-3.5 mr-1" />Skip further attempts</Button>
              </div>
            </Card>
          ) : (
            <Card className="p-10 text-center shadow-card">
              <div className="size-12 rounded-full bg-emerald-500/15 text-emerald-600 mx-auto flex items-center justify-center mb-3"><CheckCircle2 className="size-6" /></div>
              <h2 className="font-display text-xl font-bold">Workflow complete</h2>
              <p className="text-muted-foreground text-sm mt-1">All leads in today's queue have been handled.</p>
              <Button onClick={() => navigate({ to: "/dashboard" })} variant="outline" className="mt-4">Back to dashboard</Button>
            </Card>
          )}
        </div>

        {/* Queue */}
        <Card className="p-4 shadow-card">
          <h3 className="font-display font-semibold mb-3">Upcoming ({queue.length})</h3>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {queue.slice(1, 30).map((i) => {
              const l = leadsMap.get(i.lead_id);
              if (!l) return null;
              const meta = CAT_META[i.category];
              const tag = leadTag(l);
              const tagClasses = tag === "new"
                ? "border-orange-400/60 bg-orange-500/10"
                : tag === "task"
                ? "border-yellow-400/60 bg-yellow-500/10"
                : "";
              return (
                <button
                  key={i.id}
                  onClick={() => openDetail(l)}
                  className={`w-full text-left flex items-center gap-2 rounded-lg border p-2.5 text-sm hover:bg-muted/50 transition-colors ${tagClasses}`}
                >
                  <span className="size-2 rounded-full shrink-0" style={{ background: meta.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium flex items-center gap-1.5">
                      {l.client_name}
                      {tag === "new" && (
                        <Badge className="border-0 bg-orange-500 text-white text-[9px] px-1.5 py-0 gap-1 h-4">
                          <span className="size-1.5 rounded-full bg-white animate-pulse" />NEW
                        </Badge>
                      )}
                      {tag === "task" && (
                        <Badge className="border-0 bg-yellow-500 text-white text-[9px] px-1.5 py-0 gap-1 h-4">
                          <AlarmClock className="size-2.5" />Task Due
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{meta.label} · {l.phone ?? "no phone"}</div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{i.attempts_done}/{i.attempts_planned}</span>
                </button>
              );
            })}
            {queue.length <= 1 && <p className="text-xs text-muted-foreground text-center py-4">Queue empty.</p>}
          </div>
        </Card>
      </div>

      <CreateFlowModal open={createOpen} onOpenChange={setCreateOpen} onCreated={() => load()} />
      <PostCallSheet open={postOpen} onOpenChange={setPostOpen} lead={postLead} statuses={statuses} durationStartedAt={callStartedAt} onComplete={() => { setCallStartedAt(null); void advance(); }} />
      <LeadDetailSheet
        lead={detailLead}
        statuses={fullStatuses}
        labels={labels}
        profiles={profiles}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onChanged={() => load()}
      />
    </div>
  );
}
