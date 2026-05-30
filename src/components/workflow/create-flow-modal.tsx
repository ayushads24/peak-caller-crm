import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAndroidBack } from "@/hooks/use-android-back";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flame, CalendarRange, FileText, RotateCw, ChevronUp, ChevronDown, Loader2, Plus, X, Tag } from "lucide-react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";

export type FlowCategory = "fresh" | "interested_meeting" | "quotation_sent" | "followup";

type StatusRow = { id: string; name: string; color: string; is_sales: boolean; is_lost: boolean };
type LabelRow = { id: string; name: string; color: string };

const FOLLOWUP_KEY = "__followup__";

interface CategoryConfig {
  rowId: string;
  statusId: string; // status uuid, or FOLLOWUP_KEY for "any open status"
  labelIds: string[]; // empty = no label filter
  enabled: boolean;
  fromDate: string;
  toDate: string;
  attempts: number;
}

const today = () => format(new Date(), "yyyy-MM-dd");
const daysAgo = (n: number) => format(subDays(new Date(), n), "yyyy-MM-dd");
const newRowId = () => Math.random().toString(36).slice(2, 10);

function categoryFor(name: string | null): FlowCategory {
  if (!name) return "followup";
  const n = name.toLowerCase();
  if (n.includes("fresh") || n.includes("new")) return "fresh";
  if (n.includes("meeting")) return "interested_meeting";
  if (n.includes("quotation") || n.includes("quote")) return "quotation_sent";
  return "followup";
}

function iconFor(cat: FlowCategory) {
  if (cat === "fresh") return Flame;
  if (cat === "interested_meeting") return CalendarRange;
  if (cat === "quotation_sent") return FileText;
  return RotateCw;
}

export function CreateFlowModal({ open, onOpenChange, onCreated, targetUserId, targetUserName }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (flowId: string) => void; targetUserId?: string; targetUserName?: string }) {
  const { user } = useAuth();
  useAndroidBack(open, () => onOpenChange(false));
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [cats, setCats] = useState<CategoryConfig[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [terminalIds, setTerminalIds] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, number | "loading">>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingStatuses(true);
      const [statusRes, labelRes] = await Promise.all([
        supabase.from("statuses").select("id, name, color, is_sales, is_lost").order("sort_order"),
        supabase.from("labels").select("id, name, color").order("name"),
      ]);
      if (cancelled) return;
      const rows = (statusRes.data ?? []) as StatusRow[];
      const open_ = rows.filter((s) => !s.is_sales && !s.is_lost);
      setStatuses(open_);
      setLabels((labelRes.data ?? []) as LabelRow[]);
      setTerminalIds(new Set(rows.filter((s) => s.is_sales || s.is_lost).map((s) => s.id)));

      // Seed defaults from real statuses by name (best-effort) + follow-up bucket
      const find = (needle: string) =>
        open_.find((s) => s.name.toLowerCase().includes(needle.toLowerCase()));
      const seed: CategoryConfig[] = [];
      const meeting = find("meeting");
      const quote = find("quotation") ?? find("quote");
      const fresh = find("fresh") ?? find("new");
      if (meeting) seed.push({ rowId: newRowId(), statusId: meeting.id, labelIds: [], enabled: true, fromDate: daysAgo(7), toDate: today(), attempts: 3 });
      if (quote) seed.push({ rowId: newRowId(), statusId: quote.id, labelIds: [], enabled: true, fromDate: daysAgo(15), toDate: today(), attempts: 2 });
      if (fresh) seed.push({ rowId: newRowId(), statusId: fresh.id, labelIds: [], enabled: true, fromDate: today(), toDate: today(), attempts: 2 });
      seed.push({ rowId: newRowId(), statusId: FOLLOWUP_KEY, labelIds: [], enabled: false, fromDate: daysAgo(3), toDate: today(), attempts: 1 });
      setCats(seed.length ? seed : [
        { rowId: newRowId(), statusId: open_[0]?.id ?? FOLLOWUP_KEY, labelIds: [], enabled: true, fromDate: daysAgo(7), toDate: today(), attempts: 2 },
      ]);
      setLoadingStatuses(false);
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Live total lead count per row (debounced by filter key)
  useEffect(() => {
    if (!open) return;
    const handles: number[] = [];
    const cancellers: (() => void)[] = [];
    for (const c of cats) {
      const key = `${c.statusId}|${c.fromDate}|${c.toDate}|${c.labelIds.join(",")}`;
      setCounts((prev) => ({ ...prev, [c.rowId]: "loading" }));
      const h = window.setTimeout(async () => {
        let cancelled = false;
        cancellers.push(() => { cancelled = true; });
        try {
          // If label filter active, resolve matching lead IDs first
          let labelLeadIds: string[] | null = null;
          if (c.labelIds.length > 0) {
            const { data: ll } = await supabase.from("lead_labels").select("lead_id").in("label_id", c.labelIds);
            labelLeadIds = [...new Set((ll ?? []).map((r: { lead_id: string }) => r.lead_id))];
            if (labelLeadIds.length === 0) {
              if (!cancelled) setCounts((prev) => ({ ...prev, [c.rowId]: 0 }));
              return;
            }
          }

          if (c.statusId === FOLLOWUP_KEY) {
            let q = supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .gte("created_at", new Date(c.fromDate).toISOString())
              .lte("created_at", new Date(c.toDate + "T23:59:59").toISOString());
            if (targetUserId) q = q.eq("assigned_to", targetUserId);
            if (terminalIds.size > 0) {
              const ids = Array.from(terminalIds);
              q = q.or(`status_id.is.null,status_id.not.in.(${ids.join(",")})`);
            }
            if (labelLeadIds) q = q.in("id", labelLeadIds);
            const { count } = await q;
            if (!cancelled) setCounts((prev) => ({ ...prev, [c.rowId]: count ?? 0 }));
          } else {
            let q = supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("status_id", c.statusId)
              .gte("created_at", new Date(c.fromDate).toISOString())
              .lte("created_at", new Date(c.toDate + "T23:59:59").toISOString());
            if (targetUserId) q = q.eq("assigned_to", targetUserId);
            if (labelLeadIds) q = q.in("id", labelLeadIds);
            const { count } = await q;
            if (!cancelled) setCounts((prev) => ({ ...prev, [c.rowId]: count ?? 0 }));
          }
        } catch {
          if (!cancelled) setCounts((prev) => ({ ...prev, [c.rowId]: 0 }));
        }
        void key;
      }, 300);
      handles.push(h);
    }
    return () => {
      handles.forEach((h) => clearTimeout(h));
      cancellers.forEach((c) => c());
    };
  }, [open, cats, terminalIds, targetUserId]);

  function update(idx: number, patch: Partial<CategoryConfig>) {
    setCats((arr) => arr.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function move(idx: number, dir: -1 | 1) {
    setCats((arr) => {
      const next = [...arr];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return next;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }
  function addRow() {
    const used = new Set(cats.map((c) => c.statusId));
    const firstUnused = statuses.find((s) => !used.has(s.id));
    const pick = firstUnused?.id ?? statuses[0]?.id ?? FOLLOWUP_KEY;
    setCats((arr) => [
      ...arr,
      { rowId: newRowId(), statusId: pick, labelIds: [], enabled: true, fromDate: daysAgo(7), toDate: today(), attempts: 2 },
    ]);
  }

  function toggleLabel(idx: number, labelId: string) {
    setCats((arr) => arr.map((c, i) => {
      if (i !== idx) return c;
      const has = c.labelIds.includes(labelId);
      return { ...c, labelIds: has ? c.labelIds.filter((id) => id !== labelId) : [...c.labelIds, labelId] };
    }));
  }
  function removeRow(idx: number) {
    setCats((arr) => arr.filter((_, i) => i !== idx));
  }

  function rowMeta(c: CategoryConfig): { label: string; category: FlowCategory; color: string } {
    if (c.statusId === FOLLOWUP_KEY) {
      return { label: "Follow-up Calls (any open status)", category: "followup", color: "#6366f1" };
    }
    const st = statuses.find((s) => s.id === c.statusId);
    if (!st) return { label: "Unknown status", category: "followup", color: "#6366f1" };
    return { label: st.name, category: categoryFor(st.name), color: st.color };
  }

  async function start() {
    if (!user) return;
    const ownerId = targetUserId ?? user.id;
    const enabled = cats.filter((c) => c.enabled);
    if (enabled.length === 0) return toast.error("Select at least one category");
    setBusy(true);

    // Resolve terminal status ids (for follow-up filter)
    const { data: allStatuses } = await supabase.from("statuses").select("id, is_sales, is_lost");
    const terminalIds = new Set((allStatuses ?? []).filter((s) => s.is_sales || s.is_lost).map((s) => s.id));

    // Build queue
    const queue: { lead_id: string; category: FlowCategory; priority: number; attempts_planned: number }[] = [];
    const seen = new Set<string>();
    let priority = 0;
    for (const cat of enabled) {
      const meta = rowMeta(cat);

      // Resolve label filter
      let labelLeadIds: Set<string> | null = null;
      if (cat.labelIds.length > 0) {
        const { data: ll } = await supabase.from("lead_labels").select("lead_id").in("label_id", cat.labelIds);
        labelLeadIds = new Set((ll ?? []).map((r: { lead_id: string }) => r.lead_id));
        if (labelLeadIds.size === 0) continue;
      }

      let q = supabase.from("leads").select("id, status_id, created_at, updated_at")
        .gte("created_at", new Date(cat.fromDate).toISOString())
        .lte("created_at", new Date(cat.toDate + "T23:59:59").toISOString())
        .order("created_at", { ascending: false });
      if (cat.statusId !== FOLLOWUP_KEY) {
        q = q.eq("status_id", cat.statusId);
      }
      if (targetUserId) {
        q = q.eq("assigned_to", targetUserId);
      }
      if (labelLeadIds) {
        q = q.in("id", Array.from(labelLeadIds));
      }
      const { data: leads } = await q;
      const filtered = (leads ?? []).filter((l) => {
        if (cat.statusId === FOLLOWUP_KEY) return !l.status_id || !terminalIds.has(l.status_id);
        return true;
      });

      // Exclude leads that have a pending task due in the future
      const batchIds = filtered.map((l) => l.id);
      let futureTaskLeadIds = new Set<string>();
      if (batchIds.length > 0) {
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        const { data: futureTasks } = await supabase
          .from("tasks")
          .select("lead_id")
          .in("lead_id", batchIds)
          .eq("status", "pending")
          .gt("due_date", todayEnd.toISOString());
        futureTaskLeadIds = new Set((futureTasks ?? []).map((t: { lead_id: string }) => t.lead_id));
      }

      for (const l of filtered) {
        if (seen.has(l.id)) continue;
        if (futureTaskLeadIds.has(l.id)) continue; // skip — follow-up scheduled for future
        seen.add(l.id);
        queue.push({ lead_id: l.id, category: meta.category, priority: priority++, attempts_planned: cat.attempts });
      }
    }

    if (queue.length === 0) {
      setBusy(false);
      return toast.error("No leads match these filters");
    }

    // Replace existing flow for today
    const workDate = format(new Date(), "yyyy-MM-dd");
    const flowName = `Workflow — ${format(new Date(), "MMM d, yyyy")}`;
    await supabase.from("calling_flows").delete().eq("user_id", ownerId).eq("work_date", workDate);
    const { data: flow, error } = await supabase.from("calling_flows").insert({ user_id: ownerId, work_date: workDate, status: "active", name: flowName }).select("id").single();
    if (error || !flow) { setBusy(false); return toast.error(error?.message ?? "Failed"); }

    const rows = queue.map((q) => ({ flow_id: flow.id, ...q }));
    const { error: e2 } = await supabase.from("calling_flow_items").insert(rows);
    setBusy(false);
    if (e2) return toast.error(e2.message);
    toast.success(`Workflow created with ${queue.length} leads`);
    onCreated(flow.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {targetUserName ? `Create Workflow for ${targetUserName}` : "Create Today's Workflow"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Pick statuses, date range, and daily attempts. Order = call priority. Use + to add more.
            {targetUserName && (
              <> Showing only leads assigned to <span className="font-medium text-foreground">{targetUserName}</span>.</>
            )}
          </p>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {loadingStatuses && cats.length === 0 && (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 mr-2 animate-spin" /> Loading statuses…
            </div>
          )}
          {cats.map((c, i) => {
            const meta = rowMeta(c);
            const Icon = iconFor(meta.category);
            return (
              <Card key={c.rowId} className={`p-4 transition-all ${c.enabled ? "border-primary/40" : "opacity-60"}`}>
                <div className="flex items-start gap-3">
                  <Checkbox checked={c.enabled} onCheckedChange={(v) => update(i, { enabled: !!v })} className="mt-1" />
                  <div
                    className="size-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <Select value={c.statusId} onValueChange={(v) => update(i, { statusId: v })}>
                          <SelectTrigger className="h-8 font-medium">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            {statuses.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                <span className="inline-flex items-center gap-2">
                                  <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                                  {s.name}
                                </span>
                              </SelectItem>
                            ))}
                            <SelectItem value={FOLLOWUP_KEY}>
                              <span className="inline-flex items-center gap-2">
                                <Tag className="size-3" /> Follow-up — any open status
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-muted-foreground mr-1">Priority {i + 1}</span>
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => move(i, -1)} disabled={i === 0}><ChevronUp className="size-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => move(i, 1)} disabled={i === cats.length - 1}><ChevronDown className="size-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="size-7 text-destructive hover:text-destructive" onClick={() => removeRow(i)} disabled={cats.length === 1}><X className="size-3.5" /></Button>
                      </div>
                    </div>
                    {c.enabled && labels.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {labels.map((l) => {
                          const selected = c.labelIds.includes(l.id);
                          return (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => toggleLabel(i, l.id)}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ${selected ? "text-white border-transparent" : "bg-transparent border-border text-muted-foreground hover:border-primary/50"}`}
                              style={selected ? { backgroundColor: l.color, borderColor: l.color } : {}}
                            >
                              <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: selected ? "rgba(255,255,255,0.7)" : l.color }} />
                              {l.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {c.enabled && (
                      <div className="grid grid-cols-4 gap-2 mt-3">
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground">From</Label>
                          <Input type="date" value={c.fromDate} onChange={(e) => update(i, { fromDate: e.target.value })} className="h-8" />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground">To</Label>
                          <Input type="date" value={c.toDate} onChange={(e) => update(i, { toDate: e.target.value })} className="h-8" />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground">Total Leads</Label>
                          <div className="h-8 px-2 rounded-md border bg-muted/40 flex items-center justify-center font-semibold tabular-nums">
                            {counts[c.rowId] === "loading" || counts[c.rowId] === undefined ? (
                              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                            ) : (
                              <span style={{ color: meta.color }}>{counts[c.rowId] as number}</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground">Attempts/day</Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={c.attempts}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, "").slice(0, 1);
                              const n = digits ? Math.max(1, Math.min(5, Number(digits))) : 1;
                              update(i, { attempts: n });
                            }}
                            className="h-8 text-center"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
          <Button
            type="button"
            variant="outline"
            onClick={addRow}
            disabled={statuses.length === 0}
            className="w-full border-dashed gap-2"
          >
            <Plus className="size-4" /> Add status row
          </Button>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={start} disabled={busy} className="bg-gradient-primary">
            {busy && <Loader2 className="size-4 mr-2 animate-spin" />}Start workflow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
