import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, hasPermission } from "@/hooks/use-auth";
import {
  listDistributionRules,
  saveDistributionRule,
  deleteDistributionRule,
  distributeLeads,
  bulkReassign,
  bulkSplitEqual,
  bulkSplitPercentage,
  setLeadPriority,
  getDistributionDashboard,
  getDistributionContext,
  listLeadsForDistribution,
} from "@/lib/lead-distribution.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ShieldAlert, Loader2, Plus, Trash2, Users, Zap, Hand, Percent, Star, Tag, Radio, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/lead-distribution")({ component: Page });

type Method = "round_robin" | "manual" | "percentage" | "priority" | "source" | "availability";
type Priority = "low" | "normal" | "high" | "hot";

interface Rule { id: string; name: string; team_id: string | null; method: Method; is_active: boolean; config: Record<string, unknown>; created_at: string }
interface Member { id: string; full_name: string | null; email: string | null; team_id: string | null }
interface Team { id: string; name: string; leader_id: string | null }
interface Lead { id: string; client_name: string; phone: string | null; email: string | null; lead_source: string | null; priority: Priority; assigned_to: string | null; status_id: string | null; created_at: string }
interface Dashboard {
  unassigned: number;
  autoAssignedToday: number;
  manualAssignedToday: number;
  totalAssignedToday: number;
  callerWise: { user_id: string; count: number; profile: { full_name: string | null; email: string | null } | null }[];
  sourceWise: { source: string; count: number }[];
}

const METHOD_META: Record<Method, { label: string; icon: typeof Zap; desc: string }> = {
  round_robin: { label: "Auto Round Robin", icon: RefreshCw, desc: "Equally distribute among members" },
  manual: { label: "Manual", icon: Hand, desc: "Hand-pick assignments" },
  percentage: { label: "Percentage Split", icon: Percent, desc: "Split by % per member" },
  priority: { label: "Priority Based", icon: Star, desc: "Assign by lead priority" },
  source: { label: "Source Based", icon: Tag, desc: "Assign by lead source" },
  availability: { label: "Availability", icon: Radio, desc: "Only online callers get leads" },
};

const PRIORITY_COLOR: Record<Priority, string> = {
  low: "bg-slate-500/15 text-slate-600",
  normal: "bg-blue-500/15 text-blue-600",
  high: "bg-orange-500/15 text-orange-600",
  hot: "bg-red-500/15 text-red-600",
};

function Page() {
  const { roles, permissions, loading } = useAuth();
  const allowed = roles.includes("admin") || roles.includes("manager") || roles.includes("team_leader") || hasPermission(permissions, "leads.distribute");

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="size-6 animate-spin" /></div>;
  }
  if (!allowed) {
    return (
      <div className="min-h-screen p-8">
        <Card className="p-8 max-w-md mx-auto text-center">
          <ShieldAlert className="size-10 mx-auto mb-3 text-destructive" />
          <h2 className="font-display text-xl font-semibold mb-1">Access denied</h2>
          <p className="text-muted-foreground text-sm">You need Lead Distribution permission.</p>
        </Card>
      </div>
    );
  }
  return <Content />;
}

function Content() {
  const [tab, setTab] = useState("dashboard");
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">Lead Distribution</h1>
          <p className="text-muted-foreground text-sm">Control how new leads flow to your callers.</p>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="assign">Bulk Assign</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="mt-4"><DashboardTab /></TabsContent>
        <TabsContent value="assign" className="mt-4"><AssignTab /></TabsContent>
        <TabsContent value="rules" className="mt-4"><RulesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function DashboardTab() {
  const fetchDash = useServerFn(getDistributionDashboard);
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setData((await fetchDash()) as Dashboard | null); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="size-5 animate-spin" /></div>;
  if (!data) return <Card className="p-6 text-muted-foreground text-sm">No team data available.</Card>;

  const counters = [
    { label: "Unassigned", value: data.unassigned, color: "text-orange-600" },
    { label: "Today Assigned", value: data.totalAssignedToday, color: "text-blue-600" },
    { label: "Auto Today", value: data.autoAssignedToday, color: "text-emerald-600" },
    { label: "Manual Today", value: data.manualAssignedToday, color: "text-violet-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="size-4 mr-2" /> Refresh</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {counters.map((c) => (
          <Card key={c.label} className="p-5">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className={`mt-1 text-3xl font-display font-semibold ${c.color}`}>{c.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-3 flex items-center gap-2"><Users className="size-4" /> Caller-wise Leads</h3>
          {data.callerWise.length === 0 ? <p className="text-sm text-muted-foreground">No assigned leads yet.</p> : (
            <ul className="space-y-2">
              {data.callerWise.slice(0, 10).map((c) => (
                <li key={c.user_id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{c.profile?.full_name ?? c.profile?.email ?? c.user_id.slice(0, 8)}</span>
                  <Badge variant="secondary">{c.count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-3 flex items-center gap-2"><Tag className="size-4" /> Today by Source</h3>
          {data.sourceWise.length === 0 ? <p className="text-sm text-muted-foreground">Nothing assigned today.</p> : (
            <ul className="space-y-2">
              {data.sourceWise.map((s) => (
                <li key={s.source} className="flex items-center justify-between text-sm">
                  <span className="truncate">{s.source}</span>
                  <Badge variant="secondary">{s.count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function AssignTab() {
  const fetchLeads = useServerFn(listLeadsForDistribution);
  const fetchCtx = useServerFn(getDistributionContext);
  const fetchRules = useServerFn(listDistributionRules);
  const callReassign = useServerFn(bulkReassign);
  const callSplitEqual = useServerFn(bulkSplitEqual);
  const callSplitPct = useServerFn(bulkSplitPercentage);
  const callDistribute = useServerFn(distributeLeads);
  const callSetPriority = useServerFn(setLeadPriority);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [filter, setFilter] = useState<"unassigned" | "all" | "team">("unassigned");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"transfer" | "splitEqual" | "splitPct" | "rule" | "priority" | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [l, c, r] = await Promise.all([
        fetchLeads({ data: { filter, limit: 200 } }),
        fetchCtx(),
        fetchRules(),
      ]);
      setLeads(l as Lead[]);
      setMembers(c.members as Member[]);
      setRules(r as Rule[]);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [filter]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    if (selected.size === leads.length) setSelected(new Set());
    else setSelected(new Set(leads.map((l) => l.id)));
  };

  const memberName = (id: string | null) => {
    if (!id) return "—";
    const m = members.find((x) => x.id === id);
    return m?.full_name ?? m?.email ?? id.slice(0, 8);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Show</Label>
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectItem value="team">My Team</SelectItem>
              <SelectItem value="all">All Recent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="size-4 mr-2" /> Refresh</Button>
        <div className="ml-auto text-sm text-muted-foreground">{selected.size} selected</div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" disabled={selected.size === 0} onClick={() => setAction("transfer")}><Hand className="size-4 mr-1" /> Transfer</Button>
          <Button size="sm" variant="secondary" disabled={selected.size === 0} onClick={() => setAction("splitEqual")}><Users className="size-4 mr-1" /> Split Equal</Button>
          <Button size="sm" variant="secondary" disabled={selected.size === 0} onClick={() => setAction("splitPct")}><Percent className="size-4 mr-1" /> Split %</Button>
          <Button size="sm" variant="secondary" disabled={selected.size === 0} onClick={() => setAction("rule")}><Settings2 className="size-4 mr-1" /> Apply Rule</Button>
          <Button size="sm" variant="outline" disabled={selected.size === 0} onClick={() => setAction("priority")}><Star className="size-4 mr-1" /> Priority</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? <div className="p-8 flex justify-center"><Loader2 className="size-5 animate-spin" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2"><Checkbox checked={selected.size > 0 && selected.size === leads.length} onCheckedChange={toggleAll} /></th>
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Priority</th>
                  <th className="px-3 py-2 font-medium">Assigned to</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2"><Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} /></td>
                    <td className="px-3 py-2 font-medium">{l.client_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.phone ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.lead_source ?? "—"}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLOR[l.priority]}`}>{l.priority}</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{memberName(l.assigned_to)}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{format(new Date(l.created_at), "dd MMM")}</td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No leads match this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {action === "transfer" && (
        <TransferDialog members={members} leadIds={Array.from(selected)} onClose={() => setAction(null)}
          onConfirm={async (toUserId, reason) => { await callReassign({ data: { leadIds: Array.from(selected), toUserId, reason } }); toast.success("Leads transferred"); setSelected(new Set()); setAction(null); void load(); }} />
      )}
      {action === "splitEqual" && (
        <SplitEqualDialog members={members} leadIds={Array.from(selected)} onClose={() => setAction(null)}
          onConfirm={async (userIds) => { await callSplitEqual({ data: { leadIds: Array.from(selected), userIds } }); toast.success("Split equally"); setSelected(new Set()); setAction(null); void load(); }} />
      )}
      {action === "splitPct" && (
        <SplitPctDialog members={members} leadIds={Array.from(selected)} onClose={() => setAction(null)}
          onConfirm={async (distribution) => { await callSplitPct({ data: { leadIds: Array.from(selected), distribution } }); toast.success("Split by %"); setSelected(new Set()); setAction(null); void load(); }} />
      )}
      {action === "rule" && (
        <ApplyRuleDialog rules={rules} onClose={() => setAction(null)}
          onConfirm={async (ruleId) => { const res = await callDistribute({ data: { leadIds: Array.from(selected), ruleId } }); toast.success(`Distributed ${res.updated} leads`); setSelected(new Set()); setAction(null); void load(); }} />
      )}
      {action === "priority" && (
        <PriorityDialog onClose={() => setAction(null)}
          onConfirm={async (priority) => { await callSetPriority({ data: { leadIds: Array.from(selected), priority } }); toast.success("Priority updated"); setSelected(new Set()); setAction(null); void load(); }} />
      )}
    </div>
  );
}

function TransferDialog({ members, leadIds, onClose, onConfirm }: { members: Member[]; leadIds: string[]; onClose: () => void; onConfirm: (uid: string, reason: string | null) => Promise<void> }) {
  const [uid, setUid] = useState<string>("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Transfer {leadIds.length} leads</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Label>Assign to</Label>
          <Select value={uid} onValueChange={setUid}>
            <SelectTrigger><SelectValue placeholder="Pick a caller" /></SelectTrigger>
            <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.email}</SelectItem>)}</SelectContent>
          </Select>
          <Label>Reason (optional)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. reassigning hot leads" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!uid || busy} onClick={async () => { setBusy(true); try { await onConfirm(uid, reason || null); } finally { setBusy(false); } }}>Transfer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SplitEqualDialog({ members, leadIds, onClose, onConfirm }: { members: Member[]; leadIds: string[]; onClose: () => void; onConfirm: (userIds: string[]) => Promise<void> }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const perUser = picked.size > 0 ? Math.ceil(leadIds.length / picked.size) : 0;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Split {leadIds.length} leads equally</DialogTitle><DialogDescription>~{perUser} leads per selected caller</DialogDescription></DialogHeader>
        <div className="max-h-72 overflow-y-auto space-y-1">
          {members.map((m) => (
            <label key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
              <Checkbox checked={picked.has(m.id)} onCheckedChange={() => setPicked((s) => { const n = new Set(s); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })} />
              <span className="text-sm">{m.full_name ?? m.email}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={picked.size === 0 || busy} onClick={async () => { setBusy(true); try { await onConfirm(Array.from(picked)); } finally { setBusy(false); } }}>Split</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SplitPctDialog({ members, leadIds, onClose, onConfirm }: { members: Member[]; leadIds: string[]; onClose: () => void; onConfirm: (dist: Record<string, number>) => Promise<void> }) {
  const [dist, setDist] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const total = Object.values(dist).reduce((a, b) => a + (b || 0), 0);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Split {leadIds.length} leads by %</DialogTitle><DialogDescription>Total: {total}% (any total is fine, ratios are normalized)</DialogDescription></DialogHeader>
        <div className="max-h-72 overflow-y-auto space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3">
              <span className="text-sm flex-1 truncate">{m.full_name ?? m.email}</span>
              <Input type="number" min={0} max={100} className="w-24" value={dist[m.id] ?? ""} onChange={(e) => setDist((d) => ({ ...d, [m.id]: Number(e.target.value) || 0 }))} placeholder="0" />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={total === 0 || busy} onClick={async () => { setBusy(true); try { await onConfirm(dist); } finally { setBusy(false); } }}>Split</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplyRuleDialog({ rules, onClose, onConfirm }: { rules: Rule[]; onClose: () => void; onConfirm: (ruleId: string) => Promise<void> }) {
  const [rid, setRid] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const active = rules.filter((r) => r.is_active && r.method !== "manual");
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Apply a distribution rule</DialogTitle></DialogHeader>
        {active.length === 0 ? <p className="text-sm text-muted-foreground">No active automatic rules. Create one in the Rules tab.</p> : (
          <Select value={rid} onValueChange={setRid}>
            <SelectTrigger><SelectValue placeholder="Pick a rule" /></SelectTrigger>
            <SelectContent>{active.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} · {METHOD_META[r.method].label}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!rid || busy} onClick={async () => { setBusy(true); try { await onConfirm(rid); } finally { setBusy(false); } }}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PriorityDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (p: Priority) => Promise<void> }) {
  const [p, setP] = useState<Priority>("normal");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Set priority</DialogTitle></DialogHeader>
        <div className="flex gap-2 flex-wrap">
          {(["low", "normal", "high", "hot"] as Priority[]).map((x) => (
            <button key={x} onClick={() => setP(x)} className={`px-3 py-1.5 rounded-full text-sm font-medium border ${p === x ? "border-primary bg-primary/10" : "border-border"} ${PRIORITY_COLOR[x]}`}>{x}</button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(p); } finally { setBusy(false); } }}>Update</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RulesTab() {
  const fetchRules = useServerFn(listDistributionRules);
  const fetchCtx = useServerFn(getDistributionContext);
  const saveRule = useServerFn(saveDistributionRule);
  const delRule = useServerFn(deleteDistributionRule);

  const [rules, setRules] = useState<Rule[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([fetchRules(), fetchCtx()]);
      setRules(r as Rule[]);
      setTeams(c.teams as Team[]);
      setMembers(c.members as Member[]);
      setSources(c.sources as string[]);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const openNew = () => { setEditing(null); setShowForm(true); };
  const openEdit = (r: Rule) => { setEditing(r); setShowForm(true); };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-display font-semibold">Distribution Rules</h2>
        <Button onClick={openNew}><Plus className="size-4 mr-1" /> New Rule</Button>
      </div>
      {loading ? <div className="p-8 flex justify-center"><Loader2 className="size-5 animate-spin" /></div> : (
        <div className="grid md:grid-cols-2 gap-3">
          {rules.map((r) => {
            const Icon = METHOD_META[r.method].icon;
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Icon className="size-5" /></div>
                    <div>
                      <div className="font-medium flex items-center gap-2">{r.name} {!r.is_active && <Badge variant="outline" className="text-xs">Off</Badge>}</div>
                      <div className="text-xs text-muted-foreground">{METHOD_META[r.method].label} · {teams.find((t) => t.id === r.team_id)?.name ?? "Global"}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={async () => { if (confirm("Delete this rule?")) { await delRule({ data: { id: r.id } }); toast.success("Deleted"); void load(); } }}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
              </Card>
            );
          })}
          {rules.length === 0 && <Card className="p-8 text-center text-muted-foreground text-sm md:col-span-2">No rules yet. Create one to auto-distribute leads.</Card>}
        </div>
      )}
      {showForm && (
        <RuleForm
          rule={editing}
          teams={teams}
          members={members}
          sources={sources}
          onClose={() => setShowForm(false)}
          onSave={async (payload) => {
            await saveRule({ data: payload });
            toast.success("Saved");
            setShowForm(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function RuleForm({ rule, teams, members, sources, onClose, onSave }: {
  rule: Rule | null;
  teams: Team[];
  members: Member[];
  sources: string[];
  onClose: () => void;
  onSave: (payload: { id?: string; name: string; team_id: string | null; method: Method; is_active: boolean; config: Record<string, unknown> }) => Promise<void>;
}) {
  const [name, setName] = useState(rule?.name ?? "");
  const [teamId, setTeamId] = useState<string>(rule?.team_id ?? "__global__");
  const [method, setMethod] = useState<Method>(rule?.method ?? "round_robin");
  const [active, setActive] = useState(rule?.is_active ?? true);
  const [config, setConfig] = useState<Record<string, unknown>>(rule?.config ?? {});
  const [busy, setBusy] = useState(false);

  const teamMembers = useMemo(() => {
    if (teamId === "__global__") return members;
    return members.filter((m) => m.team_id === teamId);
  }, [teamId, members]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{rule ? "Edit Rule" : "New Distribution Rule"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Instagram leads to Team A" />
            </div>
            <div>
              <Label>Team</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__global__">Global (no team)</SelectItem>
                  {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Method</Label>
            <div className="grid md:grid-cols-3 gap-2">
              {(Object.keys(METHOD_META) as Method[]).map((m) => {
                const Icon = METHOD_META[m].icon;
                return (
                  <button key={m} type="button" onClick={() => setMethod(m)} className={`p-3 rounded-lg border text-left transition-colors ${method === m ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
                    <Icon className="size-4 mb-1 text-primary" />
                    <div className="text-sm font-medium">{METHOD_META[m].label}</div>
                    <div className="text-xs text-muted-foreground">{METHOD_META[m].desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <MethodConfig method={method} config={config} setConfig={setConfig} members={teamMembers} sources={sources} />

          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <Label>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!name || busy} onClick={async () => {
            setBusy(true);
            try {
              await onSave({ id: rule?.id, name, team_id: teamId === "__global__" ? null : teamId, method, is_active: active, config });
            } finally { setBusy(false); }
          }}>{rule ? "Update" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MethodConfig({ method, config, setConfig, members, sources }: {
  method: Method;
  config: Record<string, unknown>;
  setConfig: (c: Record<string, unknown>) => void;
  members: Member[];
  sources: string[];
}) {
  if (method === "manual") return <p className="text-sm text-muted-foreground">Manual rules are used as labels — apply them from the Bulk Assign tab.</p>;

  if (method === "round_robin" || method === "availability") {
    const picked = new Set((config.members as string[]) ?? []);
    return (
      <div>
        <Label className="mb-2 block">Members in rotation</Label>
        <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
          {members.map((m) => (
            <label key={m.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer">
              <Checkbox checked={picked.has(m.id)} onCheckedChange={() => {
                const n = new Set(picked);
                n.has(m.id) ? n.delete(m.id) : n.add(m.id);
                setConfig({ ...config, members: Array.from(n) });
              }} />
              <span className="text-sm">{m.full_name ?? m.email}</span>
            </label>
          ))}
          {members.length === 0 && <p className="text-xs text-muted-foreground p-2">No members in this team.</p>}
        </div>
      </div>
    );
  }

  if (method === "percentage") {
    const dist = (config.distribution as Record<string, number>) ?? {};
    const total = Object.values(dist).reduce((a, b) => a + (b || 0), 0);
    return (
      <div>
        <Label className="mb-2 block">Percentage per member (total: {total}%)</Label>
        <div className="max-h-60 overflow-y-auto space-y-1.5">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="text-sm flex-1 truncate">{m.full_name ?? m.email}</span>
              <Input type="number" min={0} max={100} className="w-24" value={dist[m.id] ?? ""}
                onChange={(e) => setConfig({ ...config, distribution: { ...dist, [m.id]: Number(e.target.value) || 0 } })} placeholder="0" />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (method === "priority") {
    const map = (config.byPriority as Record<string, string[]>) ?? {};
    return (
      <div className="space-y-3">
        {(["hot", "high", "normal", "low"] as Priority[]).map((p) => {
          const picked = new Set(map[p] ?? []);
          return (
            <div key={p}>
              <Label className="capitalize mb-1 block">{p} priority leads → these members</Label>
              <div className="max-h-32 overflow-y-auto border rounded p-2 space-y-1">
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 px-2 py-0.5 rounded hover:bg-muted cursor-pointer">
                    <Checkbox checked={picked.has(m.id)} onCheckedChange={() => {
                      const n = new Set(picked);
                      n.has(m.id) ? n.delete(m.id) : n.add(m.id);
                      setConfig({ ...config, byPriority: { ...map, [p]: Array.from(n) } });
                    }} />
                    <span className="text-sm">{m.full_name ?? m.email}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (method === "source") {
    const map = (config.bySource as Record<string, string[]>) ?? {};
    const allSources = sources.length > 0 ? sources : ["Instagram", "Facebook", "Website", "Referral"];
    return (
      <div className="space-y-3">
        {allSources.map((src) => {
          const picked = new Set(map[src] ?? []);
          return (
            <div key={src}>
              <Label className="mb-1 block">{src} → these members</Label>
              <div className="max-h-32 overflow-y-auto border rounded p-2 space-y-1">
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 px-2 py-0.5 rounded hover:bg-muted cursor-pointer">
                    <Checkbox checked={picked.has(m.id)} onCheckedChange={() => {
                      const n = new Set(picked);
                      n.has(m.id) ? n.delete(m.id) : n.add(m.id);
                      setConfig({ ...config, bySource: { ...map, [src]: Array.from(n) } });
                    }} />
                    <span className="text-sm">{m.full_name ?? m.email}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
}