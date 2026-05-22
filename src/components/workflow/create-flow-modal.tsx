import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Flame, CalendarRange, FileText, RotateCw, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";

export type FlowCategory = "fresh" | "interested_meeting" | "quotation_sent" | "followup";

interface CategoryConfig {
  key: FlowCategory;
  label: string;
  statusName: string | null; // null = any non-terminal
  icon: typeof Flame;
  enabled: boolean;
  fromDate: string;
  toDate: string;
  attempts: number;
}

const today = () => format(new Date(), "yyyy-MM-dd");
const daysAgo = (n: number) => format(subDays(new Date(), n), "yyyy-MM-dd");

const DEFAULTS: CategoryConfig[] = [
  { key: "interested_meeting", label: "Interested in Meeting", statusName: "Interested In Meeting", icon: CalendarRange, enabled: true, fromDate: daysAgo(7), toDate: today(), attempts: 3 },
  { key: "quotation_sent", label: "Quotation Sent", statusName: "Quotation Sent", icon: FileText, enabled: true, fromDate: daysAgo(15), toDate: today(), attempts: 2 },
  { key: "fresh", label: "Fresh Leads", statusName: "Fresh", icon: Flame, enabled: true, fromDate: today(), toDate: today(), attempts: 2 },
  { key: "followup", label: "Follow-up Calls", statusName: null, icon: RotateCw, enabled: false, fromDate: daysAgo(3), toDate: today(), attempts: 1 },
];

export function CreateFlowModal({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (flowId: string) => void }) {
  const { user } = useAuth();
  const [cats, setCats] = useState<CategoryConfig[]>(DEFAULTS);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setCats(DEFAULTS); }, [open]);

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

  async function start() {
    if (!user) return;
    const enabled = cats.filter((c) => c.enabled);
    if (enabled.length === 0) return toast.error("Select at least one category");
    setBusy(true);

    // Resolve status_ids
    const { data: statuses } = await supabase.from("statuses").select("id, name, is_sales, is_lost");
    const byName = new Map((statuses ?? []).map((s) => [s.name.toLowerCase(), s]));
    const terminalIds = new Set((statuses ?? []).filter((s) => s.is_sales || s.is_lost).map((s) => s.id));

    // Build queue
    const queue: { lead_id: string; category: FlowCategory; priority: number; attempts_planned: number }[] = [];
    const seen = new Set<string>();
    let priority = 0;
    for (const cat of enabled) {
      let q = supabase.from("leads").select("id, status_id, created_at, updated_at")
        .gte("created_at", new Date(cat.fromDate).toISOString())
        .lte("created_at", new Date(cat.toDate + "T23:59:59").toISOString());
      if (cat.statusName) {
        const st = byName.get(cat.statusName.toLowerCase());
        if (st) q = q.eq("status_id", st.id);
      }
      const { data: leads } = await q;
      const filtered = (leads ?? []).filter((l) => {
        if (cat.key === "followup") return !l.status_id || !terminalIds.has(l.status_id);
        return true;
      });
      for (const l of filtered) {
        if (seen.has(l.id)) continue;
        seen.add(l.id);
        queue.push({ lead_id: l.id, category: cat.key, priority: priority++, attempts_planned: cat.attempts });
      }
    }

    if (queue.length === 0) {
      setBusy(false);
      return toast.error("No leads match these filters");
    }

    // Replace existing flow for today
    const workDate = format(new Date(), "yyyy-MM-dd");
    const flowName = `Workflow — ${format(new Date(), "MMM d, yyyy")}`;
    await supabase.from("calling_flows").delete().eq("user_id", user.id).eq("work_date", workDate);
    const { data: flow, error } = await supabase.from("calling_flows").insert({ user_id: user.id, work_date: workDate, status: "active", name: flowName }).select("id").single();
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
          <DialogTitle className="font-display text-xl">Create Today's Workflow</DialogTitle>
          <p className="text-sm text-muted-foreground">Pick categories, date range, and daily attempts. Order = call priority.</p>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {cats.map((c, i) => (
            <Card key={c.key} className={`p-4 transition-all ${c.enabled ? "border-primary/40" : "opacity-60"}`}>
              <div className="flex items-start gap-3">
                <Checkbox checked={c.enabled} onCheckedChange={(v) => update(i, { enabled: !!v })} className="mt-1" />
                <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <c.icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{c.label}</div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground mr-1">Priority {i + 1}</span>
                      <Button size="icon" variant="ghost" className="size-7" onClick={() => move(i, -1)} disabled={i === 0}><ChevronUp className="size-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="size-7" onClick={() => move(i, 1)} disabled={i === cats.length - 1}><ChevronDown className="size-3.5" /></Button>
                    </div>
                  </div>
                  {c.enabled && (
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">From</Label>
                        <Input type="date" value={c.fromDate} onChange={(e) => update(i, { fromDate: e.target.value })} className="h-8" />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">To</Label>
                        <Input type="date" value={c.toDate} onChange={(e) => update(i, { toDate: e.target.value })} className="h-8" />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Attempts/day</Label>
                        <Input type="number" min={1} max={5} value={c.attempts} onChange={(e) => update(i, { attempts: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })} className="h-8" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
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
