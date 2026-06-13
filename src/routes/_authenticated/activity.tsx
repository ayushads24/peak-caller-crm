import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Activity, ChevronRight, X, CalendarIcon, Users } from "lucide-react";
import { format, startOfDay, endOfDay, isSameDay } from "date-fns";
import { LeadDetailSheet, type LeadRow, type StatusRow, type LabelRow, type ProfileLite } from "@/components/leads/lead-detail-sheet";

export const Route = createFileRoute("/_authenticated/activity")({ component: Page });

interface MovedLead {
  id: string;
  client_name: string;
  phone: string | null;
  status_id: string;
  status_changed_at: string;
  assigned_to: string | null;
  email: string | null;
  sales_value: number | null;
  lead_source: string | null;
  created_at: string;
  created_by: string | null;
  doubletick_contact_id: string | null;
}

interface StatusGroup {
  status: StatusRow;
  leads: MovedLead[];
}

type ProfilesDirectoryQuery = {
  select: (columns: string) => {
    order: (column: string) => PromiseLike<{ data: ProfileLite[] | null }>;
  };
};

function Page() {
  const today = new Date();
  const [groups, setGroups] = useState<StatusGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<StatusGroup | null>(null);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState<Date>(startOfDay(today));
  const [dateTo, setDateTo] = useState<Date>(endOfDay(today));
  const [selectedUser, setSelectedUser] = useState<string>("any");

  // Ref so realtime handler always uses latest filter values
  const filtersRef = useRef({ dateFrom, dateTo, selectedUser });
  useEffect(() => {
    filtersRef.current = { dateFrom, dateTo, selectedUser };
  }, [dateFrom, dateTo, selectedUser]);

  useEffect(() => { void load(dateFrom, dateTo, selectedUser); }, [dateFrom, dateTo, selectedUser]);

  useEffect(() => {
    const ch = supabase
      .channel("activity-rt")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leads" }, () => {
        const { dateFrom: f, dateTo: t, selectedUser: u } = filtersRef.current;
        void load(f, t, u);
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, []);

  async function load(from: Date, to: Date, user: string) {
    setLoading(true);

    let leadsQuery = supabase
      .from("leads")
      .select("id, client_name, phone, email, status_id, sales_value, lead_source, created_at, assigned_to, created_by, doubletick_contact_id, status_changed_at")
      .gte("status_changed_at", from.toISOString())
      .lte("status_changed_at", to.toISOString())
      .order("status_changed_at", { ascending: false });

    if (user !== "any") {
      leadsQuery = leadsQuery.eq("assigned_to", user);
    }

    const [leadsRes, statusRes, labelRes, profRes] = await Promise.all([
      leadsQuery,
      supabase.from("statuses").select("id, name, color, is_sales, is_lost").order("sort_order"),
      supabase.from("labels").select("id, name, color"),
      (supabase.from as unknown as (table: "profiles_directory") => ProfilesDirectoryQuery)("profiles_directory")
        .select("id, full_name, email")
        .order("full_name"),
    ]);

    const leads = (leadsRes.data ?? []) as MovedLead[];
    const allStatuses = (statusRes.data ?? []) as StatusRow[];
    setStatuses(allStatuses);
    setLabels((labelRes.data ?? []) as LabelRow[]);
    setProfiles((profRes.data ?? []) as ProfileLite[]);

    const statusMap = new Map(allStatuses.map((s) => [s.id, s]));
    const grouped = new Map<string, MovedLead[]>();
    for (const lead of leads) {
      if (!lead.status_id) continue;
      const arr = grouped.get(lead.status_id) ?? [];
      arr.push(lead);
      grouped.set(lead.status_id, arr);
    }

    const result: StatusGroup[] = [];
    for (const [sid, sLeads] of grouped.entries()) {
      const status = statusMap.get(sid);
      if (!status) continue;
      result.push({ status, leads: sLeads });
    }
    result.sort((a, b) => b.leads.length - a.leads.length);
    setGroups(result);
    setLoading(false);
  }

  const totalMoved = groups.reduce((s, g) => s + g.leads.length, 0);
  const isToday = isSameDay(dateFrom, today) && isSameDay(dateTo, today);
  const isFiltered = !isToday || selectedUser !== "any";

  function clearFilters() {
    setDateFrom(startOfDay(today));
    setDateTo(endOfDay(today));
    setSelectedUser("any");
  }

  function dateLabel() {
    if (isSameDay(dateFrom, dateTo)) return format(dateFrom, "d MMM yyyy");
    return `${format(dateFrom, "d MMM")} – ${format(dateTo, "d MMM yyyy")}`;
  }

  function openDetail(lead: MovedLead) {
    setDetailLead({
      id: lead.id,
      client_name: lead.client_name,
      email: lead.email,
      phone: lead.phone,
      sales_value: lead.sales_value,
      lead_source: lead.lead_source,
      status_id: lead.status_id,
      created_at: lead.created_at,
      assigned_to: lead.assigned_to ?? null,
      created_by: lead.created_by ?? null,
    });
    setDetailOpen(true);
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-5xl mx-auto animate-in fade-in duration-500">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="size-7 text-primary" /> Activity
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {dateLabel()} · {totalMoved} leads moved to a new status
          {selectedUser !== "any" && profiles.find((p) => p.id === selectedUser)
            ? ` by ${profiles.find((p) => p.id === selectedUser)?.full_name ?? "selected user"}`
            : ""}
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 mb-6 p-4 rounded-xl border bg-muted/30">
        {/* Date From */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <CalendarIcon className="size-3" /> From
          </label>
          <input
            type="date"
            value={format(dateFrom, "yyyy-MM-dd")}
            onChange={(e) => {
              if (!e.target.value) return;
              const d = new Date(e.target.value + "T00:00:00");
              setDateFrom(startOfDay(d));
              if (d > dateTo) setDateTo(endOfDay(d));
            }}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Date To */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <CalendarIcon className="size-3" /> To
          </label>
          <input
            type="date"
            value={format(dateTo, "yyyy-MM-dd")}
            min={format(dateFrom, "yyyy-MM-dd")}
            onChange={(e) => {
              if (!e.target.value) return;
              const d = new Date(e.target.value + "T00:00:00");
              setDateTo(endOfDay(d));
            }}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Team Member */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Users className="size-3" /> Team Member
          </label>
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="h-9 w-48 bg-background">
              <SelectValue placeholder="All members" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All members</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name ?? p.email ?? p.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Clear */}
        {isFiltered && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1.5 self-end">
            <X className="size-3.5" /> Clear
          </Button>
        )}

        {/* Today shortcut */}
        {!isToday && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setDateFrom(startOfDay(today)); setDateTo(endOfDay(today)); }}
            className="h-9 self-end text-xs"
          >
            Today
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : groups.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Activity className="size-8 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No status changes found</p>
          <p className="text-sm mt-1">Try changing the date range or team member filter.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {groups.map((g) => (
            <button
              key={g.status.id}
              onClick={() => setSelectedGroup(g)}
              className="text-left group"
            >
              <Card className="p-4 hover:shadow-md transition-all hover:border-primary/30 cursor-pointer group-hover:scale-[1.01]">
                <div className="flex items-center gap-3 mb-3">
                  <span className="size-3 rounded-full shrink-0" style={{ background: g.status.color }} />
                  <span className="font-semibold text-sm truncate flex-1">{g.status.name}</span>
                  <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="font-display text-3xl font-bold">{g.leads.length}</div>
                    <div className="text-xs text-muted-foreground">leads moved here</div>
                  </div>
                  <div className="flex -space-x-1.5">
                    {g.leads.slice(0, 4).map((l) => (
                      <div
                        key={l.id}
                        className="size-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-background"
                        style={{ background: g.status.color }}
                      >
                        {l.client_name.charAt(0).toUpperCase()}
                      </div>
                    ))}
                    {g.leads.length > 4 && (
                      <div className="size-7 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground ring-2 ring-background">
                        +{g.leads.length - 4}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      {/* Lead list panel */}
      {selectedGroup && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setSelectedGroup(null)}>
          <div
            className="relative w-full max-w-md h-full bg-background shadow-2xl border-l animate-in slide-in-from-right duration-300 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-background border-b px-5 py-4 flex items-center gap-3 z-10">
              <span className="size-3 rounded-full shrink-0" style={{ background: selectedGroup.status.color }} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{selectedGroup.status.name}</div>
                <div className="text-xs text-muted-foreground">{selectedGroup.leads.length} leads moved</div>
              </div>
              <button
                onClick={() => setSelectedGroup(null)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="p-4 space-y-2">
              {selectedGroup.leads.map((lead) => {
                const assignedProfile = profiles.find((p) => p.id === lead.assigned_to);
                return (
                  <button
                    key={lead.id}
                    onClick={() => openDetail(lead)}
                    className="w-full text-left rounded-xl border p-3.5 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="size-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{ background: selectedGroup.status.color }}
                      >
                        {lead.client_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{lead.client_name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {lead.phone ?? "No phone"}
                          {assignedProfile ? ` · ${assignedProfile.full_name ?? assignedProfile.email}` : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-muted-foreground">
                          {format(new Date(lead.status_changed_at), "d MMM, h:mm a")}
                        </div>
                        {lead.sales_value && (
                          <div className="text-xs font-semibold text-emerald-600">₹{lead.sales_value.toLocaleString("en-IN")}</div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <LeadDetailSheet
        lead={detailLead}
        statuses={statuses}
        labels={labels}
        profiles={profiles}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onChanged={() => void load(filtersRef.current.dateFrom, filtersRef.current.dateTo, filtersRef.current.selectedUser)}
      />
    </div>
  );
}
