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
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Download, Upload, Phone, Mail, ChevronLeft, ChevronRight, Tag, CircleDot, X } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import { formatDistanceToNow } from "date-fns";
import { LeadDetailSheet, type LeadRow, type StatusRow, type LabelRow } from "@/components/leads/lead-detail-sheet";
import { LeadsFilterBar, EMPTY_FILTERS, type LeadFilters, type ProfileLite } from "@/components/leads/leads-filter-bar";
import type { MovementEvent } from "@/components/leads/leads-analytics-strip";

export const Route = createFileRoute("/_authenticated/leads")({ component: Page });

function Page() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [leadLabels, setLeadLabels] = useState<Map<string, Set<string>>>(new Map());
  const [followups, setFollowups] = useState<Map<string, Date>>(new Map());
  const [movements, setMovements] = useState<MovementEvent[]>([]);
  const [filters, setFilters] = useState<LeadFilters>(EMPTY_FILTERS);
  const [active, setActive] = useState<LeadRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 40;
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
    const [l, s, lb, p, t, ll, tk, ac] = await Promise.all([
      supabase.from("leads").select("id, client_name, email, phone, sales_value, lead_source, status_id, created_at, assigned_to, created_by").order("created_at", { ascending: false }),
      supabase.from("statuses").select("id, name, color, is_sales, is_lost").order("sort_order"),
      supabase.from("labels").select("id, name, color").order("name"),
      supabase.from("profiles").select("id, full_name, email, team_id").order("full_name"),
      supabase.from("teams").select("id, name").order("name"),
      supabase.from("lead_labels").select("lead_id, label_id"),
      supabase.from("tasks").select("lead_id, due_date, status").eq("status", "pending").not("due_date", "is", null),
      supabase.from("activities").select("lead_id, created_by, created_at, metadata").eq("type", "status_changed").order("created_at", { ascending: false }).limit(2000),
    ]);
    setLeads((l.data ?? []) as LeadRow[]);
    setStatuses((s.data ?? []) as StatusRow[]);
    setLabels((lb.data ?? []) as LabelRow[]);
    setProfiles((p.data ?? []) as ProfileLite[]);
    setTeams((t.data ?? []) as { id: string; name: string }[]);

    const llMap = new Map<string, Set<string>>();
    ((ll.data ?? []) as { lead_id: string; label_id: string }[]).forEach((r) => {
      if (!llMap.has(r.lead_id)) llMap.set(r.lead_id, new Set());
      llMap.get(r.lead_id)!.add(r.label_id);
    });
    setLeadLabels(llMap);

    const fuMap = new Map<string, Date>();
    ((tk.data ?? []) as { lead_id: string; due_date: string | null }[]).forEach((r) => {
      if (!r.due_date) return;
      const d = new Date(r.due_date);
      const existing = fuMap.get(r.lead_id);
      if (!existing || d < existing) fuMap.set(r.lead_id, d);
    });
    setFollowups(fuMap);

    const mv: MovementEvent[] = ((ac.data ?? []) as { lead_id: string; created_by: string | null; created_at: string; metadata: { from?: string; to?: string } | null }[])
      .map((a) => ({
        lead_id: a.lead_id,
        created_by: a.created_by,
        created_at: a.created_at,
        from: a.metadata?.from ?? null,
        to: a.metadata?.to ?? null,
      }));
    setMovements(mv);
  }

  // Filter leads by movement criteria first → set of allowed lead ids (or null = no movement filter)
  const movementLeadIds = useMemo<Set<string> | null>(() => {
    const { moveFrom, moveTo, moveBy, moveDateFrom, moveDateTo } = filters;
    const fromName = statuses.find((s) => s.id === moveFrom)?.name;
    const toName = statuses.find((s) => s.id === moveTo)?.name;
    const hasFilter = moveFrom !== "any" || moveTo !== "any" || moveBy !== "any" || moveDateFrom || moveDateTo;
    if (!hasFilter) return null;
    const set = new Set<string>();
    for (const m of movements) {
      if (fromName && m.from !== fromName) continue;
      if (toName && m.to !== toName) continue;
      if (moveBy !== "any" && m.created_by !== moveBy) continue;
      const t = new Date(m.created_at).getTime();
      if (moveDateFrom && t < moveDateFrom.getTime()) continue;
      if (moveDateTo && t > moveDateTo.getTime() + 86400000) continue;
      set.add(m.lead_id);
    }
    return set;
  }, [movements, filters, statuses]);

  const filteredMovements = useMemo(() => {
    const { moveFrom, moveTo, moveBy, moveDateFrom, moveDateTo } = filters;
    const fromName = statuses.find((s) => s.id === moveFrom)?.name;
    const toName = statuses.find((s) => s.id === moveTo)?.name;
    return movements.filter((m) => {
      if (fromName && m.from !== fromName) return false;
      if (toName && m.to !== toName) return false;
      if (moveBy !== "any" && m.created_by !== moveBy) return false;
      const t = new Date(m.created_at).getTime();
      if (moveDateFrom && t < moveDateFrom.getTime()) return false;
      if (moveDateTo && t > moveDateTo.getTime() + 86400000) return false;
      return true;
    });
  }, [movements, filters, statuses]);

  const filtered = useMemo(() => {
    if (!leads) return [];
    const q = filters.q.trim().toLowerCase();
    const nameQ = filters.name.trim().toLowerCase();
    const phoneQ = filters.phone.trim();
    const min = filters.salesMin ? Number(filters.salesMin) : null;
    const max = filters.salesMax ? Number(filters.salesMax) : null;
    const teamMemberIds = filters.teamId !== "any"
      ? new Set(profiles.filter((p) => (p as { team_id?: string }).team_id === filters.teamId).map((p) => p.id))
      : null;
    return leads.filter((l) => {
      if (movementLeadIds && !movementLeadIds.has(l.id)) return false;
      if (filters.statusIds.length && (!l.status_id || !filters.statusIds.includes(l.status_id))) return false;
      if (filters.sources.length && (!l.lead_source || !filters.sources.includes(l.lead_source))) return false;
      if (filters.assignedTo !== "any" && l.assigned_to !== filters.assignedTo) return false;
      if (filters.createdBy !== "any" && l.created_by !== filters.createdBy) return false;
      if (teamMemberIds && !(l.assigned_to && teamMemberIds.has(l.assigned_to))) return false;
      if (filters.labelIds.length) {
        const set = leadLabels.get(l.id);
        if (!set || !filters.labelIds.some((id) => set.has(id))) return false;
      }
      if (min !== null && (l.sales_value ?? 0) < min) return false;
      if (max !== null && (l.sales_value ?? 0) > max) return false;
      if (filters.dateFrom && new Date(l.created_at) < filters.dateFrom) return false;
      if (filters.dateTo && new Date(l.created_at).getTime() > filters.dateTo.getTime() + 86400000) return false;
      if (filters.followFrom || filters.followTo) {
        const fu = followups.get(l.id);
        if (!fu) return false;
        if (filters.followFrom && fu < filters.followFrom) return false;
        if (filters.followTo && fu.getTime() > filters.followTo.getTime() + 86400000) return false;
      }
      if (nameQ && !l.client_name.toLowerCase().includes(nameQ)) return false;
      if (phoneQ && !(l.phone ?? "").includes(phoneQ)) return false;
      if (q && ![l.client_name, l.email, l.phone, l.lead_source].some((v) => v?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [leads, filters, leadLabels, profiles, followups, movementLeadIds]);

  // Reset page + clear selection of off-page leads when filters change
  useEffect(() => { setPage(1); }, [filters]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageLeads = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  const allPageSelected = pageLeads.length > 0 && pageLeads.every((l) => selected.has(l.id));
  const someSelected = pageLeads.some((l) => selected.has(l.id));
  function togglePageAll() {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allPageSelected) pageLeads.forEach((l) => n.delete(l.id));
      else pageLeads.forEach((l) => n.add(l.id));
      return n;
    });
  }
  function selectAllFiltered() { setSelected(new Set(filtered.map((l) => l.id))); }
  function clearSelection() { setSelected(new Set()); }

  async function bulkUpdateStatus(status_id: string) {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const { error } = await supabase.from("leads").update({ status_id }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Updated ${ids.length} leads`);
    clearSelection();
  }
  async function bulkAddLabel(label_id: string) {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const rows = ids.map((lead_id) => ({ lead_id, label_id }));
    const { error } = await supabase.from("lead_labels").upsert(rows, { onConflict: "lead_id,label_id", ignoreDuplicates: true });
    if (error) return toast.error(error.message);
    toast.success(`Labeled ${ids.length} leads`);
    clearSelection();
    load();
  }
  function exportSelected() {
    const set = selected;
    const rows = filtered.filter((l) => set.has(l.id)).map((l) => ({
      client_name: l.client_name, email: l.email ?? "", phone: l.phone ?? "",
      sales_value: l.sales_value ?? "", lead_source: l.lead_source ?? "",
      status: statuses.find((s) => s.id === l.status_id)?.name ?? "",
      created_at: l.created_at,
    }));
    if (!rows.length) return;
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `leads-selected-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

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

      <LeadsFilterBar
        filters={filters}
        onChange={setFilters}
        statuses={statuses}
        labels={labels}
        profiles={profiles}
        teams={teams}
      />

      {/* keep movements computed to satisfy memo deps; not displayed */}
      <span className="hidden">{filteredMovements.length}</span>

      {selected.size > 0 && (
        <Card className="mt-3 p-2.5 shadow-card flex flex-wrap items-center gap-2 bg-primary/5 border-primary/30">
          <Badge className="bg-primary text-primary-foreground">{selected.size} selected</Badge>
          {selected.size < filtered.length && (
            <Button variant="link" size="sm" className="h-7 px-1" onClick={selectAllFiltered}>
              Select all {filtered.length} filtered
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1"><CircleDot className="size-3.5" /> Change status</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-auto">
              <DropdownMenuLabel>Set status to…</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {statuses.map((s) => (
                <DropdownMenuItem key={s.id} onClick={() => bulkUpdateStatus(s.id)}>
                  <span className="size-2.5 rounded-full mr-2" style={{ background: s.color }} />
                  {s.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1"><Tag className="size-3.5" /> Add label</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-auto">
              <DropdownMenuLabel>Add label…</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {labels.length === 0 && <DropdownMenuItem disabled>No labels available</DropdownMenuItem>}
              {labels.map((l) => (
                <DropdownMenuItem key={l.id} onClick={() => bulkAddLabel(l.id)}>
                  <span className="size-2.5 rounded-full mr-2" style={{ background: l.color }} />
                  {l.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" variant="outline" className="gap-1" onClick={exportSelected}>
            <Download className="size-3.5" /> Export selected
          </Button>

          <Button size="sm" variant="ghost" className="ml-auto gap-1" onClick={clearSelection}>
            <X className="size-3.5" /> Clear
          </Button>
        </Card>
      )}

      {/* Desktop table */}
      <Card className="mt-4 shadow-card overflow-hidden hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3 w-10">
                <Checkbox
                  checked={allPageSelected ? true : (someSelected ? "indeterminate" : false)}
                  onCheckedChange={togglePageAll}
                  aria-label="Select all on page"
                />
              </th>
              <th className="text-left p-3 font-medium">Client</th>
              <th className="text-left p-3 font-medium">Contact</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Value</th>
              <th className="text-left p-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {leads === null && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-t"><td colSpan={6} className="p-3"><Skeleton className="h-6" /></td></tr>
            ))}
            {leads && pageLeads.map((l) => {
              const s = statuses.find((x) => x.id === l.status_id);
              const isSel = selected.has(l.id);
              return (
                <tr key={l.id} onClick={() => setActive(l)} className={"border-t hover:bg-accent/40 cursor-pointer transition-colors " + (isSel ? "bg-primary/5" : "") }>
                  <td className="p-3" onClick={(e) => { e.stopPropagation(); toggleSelect(l.id); }}>
                    <Checkbox checked={isSel} onCheckedChange={() => toggleSelect(l.id)} aria-label="Select lead" />
                  </td>
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
              <tr><td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">No leads match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Mobile cards */}
      <div className="mt-4 space-y-2 md:hidden">
        {leads === null && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        {leads && pageLeads.map((l) => {
          const s = statuses.find((x) => x.id === l.status_id);
          const isSel = selected.has(l.id);
          return (
            <Card key={l.id} onClick={() => setActive(l)} className={"p-3 shadow-card active:scale-[0.99] transition " + (isSel ? "ring-1 ring-primary bg-primary/5" : "")}>
              <div className="flex justify-between items-start gap-2">
                <div onClick={(e) => { e.stopPropagation(); toggleSelect(l.id); }} className="pt-0.5">
                  <Checkbox checked={isSel} onCheckedChange={() => toggleSelect(l.id)} aria-label="Select lead" />
                </div>
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

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="size-4" /> Prev
            </Button>
            <span className="text-xs px-2">Page {page} / {pageCount}</span>
            <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

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