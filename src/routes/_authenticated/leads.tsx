import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Download, Upload, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import { formatDistanceToNow } from "date-fns";
import { LeadDetailSheet, type LeadRow, type StatusRow, type LabelRow } from "@/components/leads/lead-detail-sheet";

export const Route = createFileRoute("/_authenticated/leads")({ component: Page });

function Page() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [active, setActive] = useState<LeadRow | null>(null);
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const ch = supabase
      .channel("leads-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, []);

  async function load() {
    const [l, s, lb] = await Promise.all([
      supabase.from("leads").select("id, client_name, email, phone, sales_value, lead_source, status_id, created_at").order("created_at", { ascending: false }),
      supabase.from("statuses").select("id, name, color, is_sales, is_lost").order("sort_order"),
      supabase.from("labels").select("id, name, color").order("name"),
    ]);
    setLeads((l.data ?? []) as LeadRow[]);
    setStatuses((s.data ?? []) as StatusRow[]);
    setLabels((lb.data ?? []) as LabelRow[]);
  }

  const filtered = useMemo(() => {
    if (!leads) return [];
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.status_id !== statusFilter) return false;
      if (!q) return true;
      return [l.client_name, l.email, l.phone, l.lead_source].some((v) => v?.toLowerCase().includes(q));
    });
  }, [leads, search, statusFilter]);

  async function quickStatus(id: string, status_id: string) {
    const { error } = await supabase.from("leads").update({ status_id }).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Status updated");
  }

  function exportCsv() {
    const rows = filtered.map((l) => ({
      client_name: l.client_name, email: l.email ?? "", phone: l.phone ?? "",
      sales_value: l.sales_value ?? "", lead_source: l.lead_source ?? "",
      status: statuses.find((s) => s.id === l.status_id)?.name ?? "",
      created_at: l.created_at,
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function importCsv(file: File) {
    if (!user) return;
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        const existing = new Set((leads ?? []).flatMap((l) => [l.email?.toLowerCase(), l.phone].filter(Boolean) as string[]));
        const rows = res.data
          .map((r) => ({
            client_name: r.client_name || r.name || r.Name || "",
            email: r.email || r.Email || null,
            phone: r.phone || r.Phone || null,
            sales_value: r.sales_value ? Number(r.sales_value) : null,
            lead_source: r.lead_source || r.source || null,
            created_by: user.id,
          }))
          .filter((r) => r.client_name)
          .filter((r) => !(r.email && existing.has(r.email.toLowerCase())) && !(r.phone && existing.has(r.phone)));
        if (rows.length === 0) { toast.info("No new leads to import"); return; }
        const { error } = await supabase.from("leads").insert(rows);
        if (error) toast.error(error.message); else toast.success(`Imported ${rows.length} leads`);
      },
    });
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground mt-1 text-sm">{leads?.length ?? 0} total · {filtered.length} shown</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="size-4 mr-1" />Import</Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="size-4 mr-1" />Export</Button>
          <CreateLeadDialog open={creating} onOpenChange={setCreating} statuses={statuses} onCreated={load} />
        </div>
      </div>

      <Card className="mt-5 p-3 sm:p-4 shadow-card">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Search name, email, phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-48"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Desktop table */}
      <Card className="mt-4 shadow-card overflow-hidden hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3 font-medium">Client</th>
              <th className="text-left p-3 font-medium">Contact</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Value</th>
              <th className="text-left p-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {leads === null && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-t"><td colSpan={5} className="p-3"><Skeleton className="h-6" /></td></tr>
            ))}
            {leads && filtered.map((l) => {
              const s = statuses.find((x) => x.id === l.status_id);
              return (
                <tr key={l.id} onClick={() => setActive(l)} className="border-t hover:bg-accent/40 cursor-pointer transition-colors">
                  <td className="p-3 font-medium">{l.client_name}{l.lead_source && <span className="ml-2 text-[10px] text-muted-foreground">· {l.lead_source}</span>}</td>
                  <td className="p-3 text-muted-foreground"><div className="flex flex-col">{l.phone && <span>{l.phone}</span>}{l.email && <span className="text-xs truncate max-w-[180px]">{l.email}</span>}</div></td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <Select value={l.status_id ?? ""} onValueChange={(v) => quickStatus(l.id, v)}>
                      <SelectTrigger className="h-7 w-32 border-0 px-2" style={s ? { background: `${s.color}22`, color: s.color } : undefined}>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>{statuses.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="p-3 font-medium">{l.sales_value ? `₹${Number(l.sales_value).toLocaleString("en-IN")}` : "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}</td>
                </tr>
              );
            })}
            {leads && filtered.length === 0 && (
              <tr><td colSpan={5} className="p-10 text-center text-sm text-muted-foreground">No leads match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Mobile cards */}
      <div className="mt-4 space-y-2 md:hidden">
        {leads === null && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        {leads && filtered.map((l) => {
          const s = statuses.find((x) => x.id === l.status_id);
          return (
            <Card key={l.id} onClick={() => setActive(l)} className="p-3 shadow-card active:scale-[0.99] transition">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{l.client_name}</p>
                  {l.phone && <p className="text-xs text-muted-foreground truncate">{l.phone}</p>}
                  {l.email && <p className="text-xs text-muted-foreground truncate">{l.email}</p>}
                </div>
                {s && <Badge className="border-0 shrink-0" style={{ background: s.color, color: "white" }}>{s.name}</Badge>}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}</span>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  {l.phone && <Button asChild size="icon" variant="outline" className="size-8"><a href={`tel:${l.phone}`}><Phone className="size-3.5" /></a></Button>}
                  {l.email && <Button asChild size="icon" variant="outline" className="size-8"><a href={`mailto:${l.email}`}><Mail className="size-3.5" /></a></Button>}
                </div>
              </div>
            </Card>
          );
        })}
        {leads && filtered.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">No leads match your filters.</Card>
        )}
      </div>

      <LeadDetailSheet lead={active} statuses={statuses} labels={labels} open={!!active} onOpenChange={(v) => !v && setActive(null)} onChanged={load} />
    </div>
  );
}

function CreateLeadDialog({ open, onOpenChange, statuses, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; statuses: StatusRow[]; onCreated: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({ client_name: "", email: "", phone: "", sales_value: "", lead_source: "", status_id: "" });
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!user || !form.client_name.trim()) return;
    setSaving(true);
    // duplicate check
    if (form.email || form.phone) {
      let q = supabase.from("leads").select("id").limit(1);
      if (form.email && form.phone) q = q.or(`email.eq.${form.email},phone.eq.${form.phone}`);
      else if (form.email) q = q.eq("email", form.email);
      else if (form.phone) q = q.eq("phone", form.phone);
      const { data } = await q;
      if (data && data.length > 0) {
        setSaving(false);
        toast.error("A lead with this email or phone already exists");
        return;
      }
    }
    const { error } = await supabase.from("leads").insert({
      client_name: form.client_name,
      email: form.email || null,
      phone: form.phone || null,
      sales_value: form.sales_value ? Number(form.sales_value) : null,
      lead_source: form.lead_source || null,
      status_id: form.status_id || statuses[0]?.id || null,
      created_by: user.id,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Lead created");
    setForm({ client_name: "", email: "", phone: "", sales_value: "", lead_source: "", status_id: "" });
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button size="sm" className="bg-gradient-primary shadow-elegant"><Plus className="size-4 mr-1" />New lead</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="font-display">Add new lead</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Client name *</Label><Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Sales value</Label><Input type="number" value={form.sales_value} onChange={(e) => setForm({ ...form, sales_value: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Source</Label><Input value={form.lead_source} onChange={(e) => setForm({ ...form, lead_source: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5"><Label>Status</Label>
            <Select value={form.status_id} onValueChange={(v) => setForm({ ...form, status_id: v })}>
              <SelectTrigger><SelectValue placeholder="Default" /></SelectTrigger>
              <SelectContent>{statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !form.client_name.trim()} className="bg-gradient-primary">{saving ? "Saving…" : "Create lead"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}