import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MultiUserSelect } from "@/components/multi-user-select";
import {
  Loader2, Activity, ChevronRight, X, CalendarIcon, Users,
  Phone, MessageSquare, ListTodo, CheckCircle2, ArrowRight,
  PhoneCall, PhoneOff, Search, TrendingUp,
} from "lucide-react";
import { format, startOfDay, endOfDay, isSameDay, isYesterday, isToday } from "date-fns";
import { LeadDetailSheet, type LeadRow, type StatusRow, type LabelRow, type ProfileLite } from "@/components/leads/lead-detail-sheet";

export const Route = createFileRoute("/_authenticated/activity")({ component: Page });

const PAGE_SIZE = 40;

interface MovedLead {
  id: string; client_name: string; phone: string | null; status_id: string;
  status_changed_at: string; assigned_to: string | null; email: string | null;
  sales_value: number | null; lead_source: string | null; created_at: string;
  created_by: string | null; doubletick_contact_id: string | null;
}
interface StatusGroup { status: StatusRow; leads: MovedLead[]; }

interface FeedItem {
  id: string; type: string; description: string; created_at: string;
  created_by: string | null; creator_name: string | null;
  lead_id: string; lead_name: string | null;
}

type ProfilesDirectoryQuery = {
  select: (columns: string) => { order: (column: string) => PromiseLike<{ data: ProfileLite[] | null }>; };
};

const TYPE_META: Record<string, { icon: React.ReactNode; color: string; cardColor: string; label: string }> = {
  call_logged:        { icon: <Phone className="size-3.5" />,         color: "bg-emerald-500/10 text-emerald-600", cardColor: "", label: "Call"   },
  status_changed:     { icon: <ArrowRight className="size-3.5" />,    color: "bg-blue-500/10 text-blue-600",       cardColor: "", label: "Status" },
  note_added:         { icon: <MessageSquare className="size-3.5" />, color: "bg-amber-500/10 text-amber-600",     cardColor: "", label: "Note"   },
  task_created:       { icon: <ListTodo className="size-3.5" />,      color: "bg-violet-500/10 text-violet-600",   cardColor: "", label: "Task"   },
  task_completed:     { icon: <CheckCircle2 className="size-3.5" />,  color: "bg-teal-500/10 text-teal-600",       cardColor: "", label: "Task"   },
  assignment_changed: { icon: <Users className="size-3.5" />,         color: "bg-sky-500/10 text-sky-600",         cardColor: "", label: "Assign" },
};

function dayLabel(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d))     return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM yyyy");
}

function groupByDay(items: FeedItem[]) {
  const map = new Map<string, FeedItem[]>();
  for (const item of items) {
    const key = format(new Date(item.created_at), "yyyy-MM-dd");
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

function Page() {
  const today = new Date();
  const [tab, setTab] = useState<"board" | "feed">("board");

  // Status Board state
  const [groups, setGroups]               = useState<StatusGroup[]>([]);
  const [boardLoading, setBoardLoading]   = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<StatusGroup | null>(null);

  // Feed state
  const [feedItems, setFeedItems]     = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [hasMore, setHasMore]   = useState(false);
  const [page, setPage]         = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [feedType, setFeedType]       = useState<string>("all");
  const [search, setSearch]           = useState<string>("");

  // Shared
  const [statuses,   setStatuses]   = useState<StatusRow[]>([]);
  const [labels,     setLabels]     = useState<LabelRow[]>([]);
  const [profiles,   setProfiles]   = useState<ProfileLite[]>([]);
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [openingLead, setOpeningLead] = useState<string | null>(null);

  // Filters
  const [dateFrom,       setDateFrom]       = useState<Date>(startOfDay(today));
  const [dateTo,         setDateTo]         = useState<Date>(endOfDay(today));
  const [selectedUsers,  setSelectedUsers]  = useState<string[]>([]);

  const filtersRef = useRef({ dateFrom, dateTo, selectedUsers });
  useEffect(() => { filtersRef.current = { dateFrom, dateTo, selectedUsers }; }, [dateFrom, dateTo, selectedUsers]);

  useEffect(() => {
    setPage(1);
    void loadBoard(dateFrom, dateTo, selectedUsers);
    void loadFeed(dateFrom, dateTo, selectedUsers, 1);
  }, [dateFrom, dateTo, selectedUsers]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel("activity-rt")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leads" }, () => {
        const { dateFrom: f, dateTo: t, selectedUsers: u } = filtersRef.current;
        void loadBoard(f, t, u);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activities" }, () => {
        const { dateFrom: f, dateTo: t, selectedUsers: u } = filtersRef.current;
        setPage(1);
        void loadFeed(f, t, u, 1);
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, []);

  async function loadBoard(from: Date, to: Date, users: string[]) {
    setBoardLoading(true);
    let leadsQuery = supabase
      .from("leads")
      .select("id, client_name, phone, email, status_id, sales_value, lead_source, created_at, assigned_to, created_by, doubletick_contact_id, status_changed_at")
      .gte("status_changed_at", from.toISOString())
      .lte("status_changed_at", to.toISOString())
      .order("status_changed_at", { ascending: false });
    if (users.length === 1) leadsQuery = leadsQuery.eq("assigned_to", users[0]);
    else if (users.length > 1) leadsQuery = leadsQuery.in("assigned_to", users);

    const [leadsRes, statusRes, labelRes, profRes] = await Promise.all([
      leadsQuery,
      supabase.from("statuses").select("id, name, color, is_sales, is_lost").order("sort_order"),
      supabase.from("labels").select("id, name, color"),
      (supabase.from as unknown as (table: "profiles_directory") => ProfilesDirectoryQuery)("profiles_directory")
        .select("id, full_name, email").order("full_name"),
    ]);

    const leads       = (leadsRes.data ?? []) as MovedLead[];
    const allStatuses = (statusRes.data ?? []) as StatusRow[];
    setStatuses(allStatuses);
    setLabels((labelRes.data ?? []) as LabelRow[]);
    setProfiles((profRes.data ?? []) as ProfileLite[]);

    const statusMap = new Map(allStatuses.map((s) => [s.id, s]));
    const grouped   = new Map<string, MovedLead[]>();
    for (const lead of leads) {
      if (!lead.status_id) continue;
      const arr = grouped.get(lead.status_id) ?? [];
      arr.push(lead); grouped.set(lead.status_id, arr);
    }
    const result: StatusGroup[] = [];
    for (const [sid, sLeads] of grouped.entries()) {
      const status = statusMap.get(sid);
      if (!status) continue;
      result.push({ status, leads: sLeads });
    }
    result.sort((a, b) => b.leads.length - a.leads.length);
    setGroups(result);
    setBoardLoading(false);
  }

  async function loadFeed(from: Date, to: Date, users: string[], pg: number) {
    setFeedLoading(true);
    const offset = (pg - 1) * PAGE_SIZE;
    const params = new URLSearchParams({
      from: from.toISOString(), to: to.toISOString(),
      limit: String(PAGE_SIZE), offset: String(offset),
    });
    if (users.length > 0) params.set("user_ids", users.join(","));
    const res = await fetch(`/api/all-activities?${params}`);
    if (res.ok) {
      const json = await res.json() as { items: FeedItem[]; hasMore: boolean };
      setFeedItems(json.items);
      setHasMore(json.hasMore);
      setTotalCount((prev) => json.hasMore ? Math.max(prev, pg * PAGE_SIZE + 1) : (pg - 1) * PAGE_SIZE + json.items.length);
    }
    setFeedLoading(false);
  }

  async function openLeadFromFeed(leadId: string) {
    if (!leadId) return;
    setOpeningLead(leadId);
    const { data } = await supabase
      .from("leads")
      .select("id, client_name, email, phone, sales_value, lead_source, status_id, created_at, assigned_to, created_by, doubletick_contact_id")
      .eq("id", leadId)
      .maybeSingle();
    setOpeningLead(null);
    if (!data) return;
    setDetailLead(data as LeadRow);
    setDetailOpen(true);
  }

  // Summary stats from feed items
  const summary = useMemo(() => {
    const calls     = feedItems.filter((i) => i.type === "call_logged");
    const connected = calls.filter((i) => i.description.includes("connected") && !i.description.includes("not connected"));
    return {
      totalCalls:     calls.length,
      connected:      connected.length,
      rate:           calls.length > 0 ? Math.round((connected.length / calls.length) * 100) : 0,
      statusChanges:  feedItems.filter((i) => i.type === "status_changed").length,
      notes:          feedItems.filter((i) => i.type === "note_added").length,
      tasks:          feedItems.filter((i) => i.type === "task_created" || i.type === "task_completed").length,
    };
  }, [feedItems]);

  const filteredFeed = useMemo(() => {
    let items = feedType === "all" ? feedItems : feedItems.filter((i) => i.type === feedType);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter((i) =>
        i.lead_name?.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.creator_name?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [feedItems, feedType, search]);

  const feedGroups  = groupByDay(filteredFeed);
  const totalMoved  = groups.reduce((s, g) => s + g.leads.length, 0);
  const isToday2    = isSameDay(dateFrom, today) && isSameDay(dateTo, today);
  const isFiltered  = !isToday2 || selectedUsers.length > 0;

  function clearFilters() { setDateFrom(startOfDay(today)); setDateTo(endOfDay(today)); setSelectedUsers([]); }
  function dateLabel() {
    if (isSameDay(dateFrom, dateTo)) return format(dateFrom, "d MMM yyyy");
    return `${format(dateFrom, "d MMM")} – ${format(dateTo, "d MMM yyyy")}`;
  }
  function openDetailFromBoard(lead: MovedLead) {
    setDetailLead({
      id: lead.id, client_name: lead.client_name, email: lead.email, phone: lead.phone,
      sales_value: lead.sales_value, lead_source: lead.lead_source, status_id: lead.status_id,
      created_at: lead.created_at, assigned_to: lead.assigned_to ?? null, created_by: lead.created_by ?? null,
    });
    setDetailOpen(true);
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-5xl mx-auto animate-in fade-in duration-500">
      {/* Header */}
      <div className="mb-5">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="size-7 text-primary" /> Activity
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{dateLabel()}</p>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "board" | "feed")} className="mb-5">
        <TabsList>
          <TabsTrigger value="board">Status Board</TabsTrigger>
          <TabsTrigger value="feed">Activity Feed</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 mb-6 p-4 rounded-xl border bg-muted/30">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><CalendarIcon className="size-3" /> From</label>
          <input type="date" value={format(dateFrom, "yyyy-MM-dd")}
            onChange={(e) => { if (!e.target.value) return; const d = new Date(e.target.value + "T00:00:00"); setDateFrom(startOfDay(d)); if (d > dateTo) setDateTo(endOfDay(d)); }}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><CalendarIcon className="size-3" /> To</label>
          <input type="date" value={format(dateTo, "yyyy-MM-dd")} min={format(dateFrom, "yyyy-MM-dd")}
            onChange={(e) => { if (!e.target.value) return; setDateTo(endOfDay(new Date(e.target.value + "T00:00:00"))); }}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Users className="size-3" /> Team Member</label>
          <MultiUserSelect profiles={profiles} selected={selectedUsers} onChange={setSelectedUsers} />
        </div>
        {isFiltered && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1.5 self-end">
            <X className="size-3.5" /> Clear
          </Button>
        )}
        {!isToday2 && (
          <Button variant="outline" size="sm" onClick={() => { setDateFrom(startOfDay(today)); setDateTo(endOfDay(today)); }} className="h-9 self-end text-xs">
            Today
          </Button>
        )}
      </div>

      {/* ─── STATUS BOARD ─── */}
      {tab === "board" && (
        <>
          <p className="text-sm text-muted-foreground mb-4">{totalMoved} leads moved to a new status</p>
          {boardLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin text-primary" /></div>
          ) : groups.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              <Activity className="size-8 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No status changes found</p>
              <p className="text-sm mt-1">Try changing the date range or team member filter.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {groups.map((g) => (
                <button key={g.status.id} onClick={() => setSelectedGroup(g)} className="text-left group">
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
                          <div key={l.id} className="size-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-background" style={{ background: g.status.color }}>
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
        </>
      )}

      {/* ─── ACTIVITY FEED ─── */}
      {tab === "feed" && (
        <>
          {/* Summary stats */}
          {feedItems.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <Card className="px-3 py-2.5 flex items-center gap-2.5">
                <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><Phone className="size-3.5" /></div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Calls</div>
                  <div className="font-bold text-base leading-none">{summary.totalCalls}</div>
                </div>
              </Card>
              <Card className="px-3 py-2.5 flex items-center gap-2.5">
                <div className="size-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0"><PhoneCall className="size-3.5" /></div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Connected</div>
                  <div className="font-bold text-base leading-none text-emerald-600">{summary.connected} <span className="text-xs font-normal text-muted-foreground">({summary.rate}%)</span></div>
                </div>
              </Card>
              <Card className="px-3 py-2.5 flex items-center gap-2.5">
                <div className="size-7 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0"><TrendingUp className="size-3.5" /></div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Status Changes</div>
                  <div className="font-bold text-base leading-none">{summary.statusChanges}</div>
                </div>
              </Card>
              <Card className="px-3 py-2.5 flex items-center gap-2.5">
                <div className="size-7 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0"><MessageSquare className="size-3.5" /></div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Notes</div>
                  <div className="font-bold text-base leading-none">{summary.notes}</div>
                </div>
              </Card>
            </div>
          )}

          {/* Search + type filter */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search lead, action, person…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {[
                { key: "all",                label: "All",    count: feedItems.length },
                { key: "call_logged",        label: "Calls",  count: summary.totalCalls },
                { key: "status_changed",     label: "Status", count: summary.statusChanges },
                { key: "note_added",         label: "Notes",  count: summary.notes },
                { key: "task_created",       label: "Tasks",  count: summary.tasks },
                { key: "assignment_changed", label: "Assign", count: feedItems.filter((i) => i.type === "assignment_changed").length },
              ].map((t) => (
                <button key={t.key} onClick={() => setFeedType(t.key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${feedType === t.key ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                  {t.label}{t.count > 0 ? ` (${t.count})` : ""}
                </button>
              ))}
            </div>
          </div>

          {feedLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin text-primary" /></div>
          ) : filteredFeed.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              <Activity className="size-8 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No activity found</p>
              <p className="text-sm mt-1">{search ? "Try a different search." : "Try changing the date range or filter."}</p>
            </Card>
          ) : (
            <>
              <div className="space-y-6">
                {[...feedGroups.entries()].map(([dayKey, items]) => (
                  <div key={dayKey}>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      {dayLabel(items[0].created_at)}
                      <span className="ml-2 font-normal normal-case">· {items.length} activities</span>
                    </div>
                    <div className="space-y-1.5">
                      {items.map((item) => {
                        const meta     = TYPE_META[item.type] ?? { icon: <Activity className="size-3.5" />, color: "bg-muted text-muted-foreground", cardColor: "", label: item.type };
                        const isCall   = item.type === "call_logged";
                        const connected = isCall && item.description.toLowerCase().includes("connected") && !item.description.toLowerCase().includes("not connected");
                        const callBg   = isCall ? (connected ? "border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20" : "border-red-200 bg-red-50/40 dark:bg-red-950/20") : "";
                        const isOpening = openingLead === item.lead_id;

                        return (
                          <button
                            key={item.id}
                            onClick={() => void openLeadFromFeed(item.lead_id)}
                            disabled={isOpening}
                            className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all hover:shadow-sm hover:scale-[1.005] ${callBg || "hover:bg-muted/30"}`}
                          >
                            {/* Type icon */}
                            <div className={`size-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isCall ? (connected ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/10 text-red-500") : meta.color}`}>
                              {isOpening
                                ? <Loader2 className="size-3.5 animate-spin" />
                                : isCall
                                  ? (connected ? <PhoneCall className="size-3.5" /> : <PhoneOff className="size-3.5" />)
                                  : meta.icon}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm leading-snug text-left">{item.description}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {item.lead_name && (
                                  <span className="text-[11px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                    {item.lead_name}
                                  </span>
                                )}
                                {item.creator_name && (
                                  <span className="text-[11px] text-muted-foreground">by {item.creator_name}</span>
                                )}
                              </div>
                            </div>

                            {/* Time */}
                            <div className="text-[11px] text-muted-foreground shrink-0 mt-0.5">
                              {format(new Date(item.created_at), "h:mm a")}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {(page > 1 || hasMore) && (
                <div className="flex items-center justify-center gap-3 mt-6">
                  <Button
                    variant="outline" size="sm"
                    disabled={page === 1}
                    onClick={() => { const p = page - 1; setPage(p); void loadFeed(dateFrom, dateTo, selectedUsers, p); }}
                  >
                    ← Prev
                  </Button>
                  <span className="text-sm text-muted-foreground">Page {page}</span>
                  <Button
                    variant="outline" size="sm"
                    disabled={!hasMore}
                    onClick={() => { const p = page + 1; setPage(p); void loadFeed(dateFrom, dateTo, selectedUsers, p); }}
                  >
                    Next →
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Status Board side panel */}
      {selectedGroup && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setSelectedGroup(null)}>
          <div className="relative w-full max-w-md h-full bg-background shadow-2xl border-l animate-in slide-in-from-right duration-300 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-background border-b px-5 py-4 flex items-center gap-3 z-10">
              <span className="size-3 rounded-full shrink-0" style={{ background: selectedGroup.status.color }} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{selectedGroup.status.name}</div>
                <div className="text-xs text-muted-foreground">{selectedGroup.leads.length} leads moved</div>
              </div>
              <button onClick={() => setSelectedGroup(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="size-4" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {selectedGroup.leads.map((lead) => {
                const assignedProfile = profiles.find((p) => p.id === lead.assigned_to);
                return (
                  <button key={lead.id} onClick={() => openDetailFromBoard(lead)} className="w-full text-left rounded-xl border p-3.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ background: selectedGroup.status.color }}>
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
                        <div className="text-[10px] text-muted-foreground">{format(new Date(lead.status_changed_at), "d MMM, h:mm a")}</div>
                        {lead.sales_value && <div className="text-xs font-semibold text-emerald-600">₹{lead.sales_value.toLocaleString("en-IN")}</div>}
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
        lead={detailLead} statuses={statuses} labels={labels} profiles={profiles}
        open={detailOpen} onOpenChange={setDetailOpen}
        onChanged={() => void loadBoard(filtersRef.current.dateFrom, filtersRef.current.dateTo, filtersRef.current.selectedUsers)}
      />
    </div>
  );
}
