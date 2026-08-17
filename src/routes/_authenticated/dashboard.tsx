import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isAdminOrManager } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateFlowModal } from "@/components/workflow/create-flow-modal";
import { Users, PhoneCall, TrendingUp, CalendarCheck, CalendarPlus, IndianRupee, LogIn, ListTodo, ChevronRight, Loader2, Phone, Percent, Filter, XCircle } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, startOfYear, subMonths } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Page });

interface StatusRow { id: string; name: string; color: string; is_sales: boolean; is_lost: boolean; sort_order: number; }
interface LeadLite { id: string; client_name: string; status_id: string | null; sales_value: number | null; created_at: string; }
interface ProfileLite { id: string; full_name: string | null; email: string | null; }

function Page() {
  const { user, roles } = useAuth();
  const isManager = isAdminOrManager(roles);
  const isPM = roles.includes("project_manager");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  const [from, setFrom] = useState<string>(format(startOfMonth(today), "yyyy-MM-dd"));
  const [to, setTo] = useState<string>(format(endOfMonth(today), "yyyy-MM-dd"));
  const [kpiSheet, setKpiSheet] = useState<{ open: boolean; label: string; leads: LeadLite[] }>({ open: false, label: "", leads: [] });
  const [busyPunch, setBusyPunch] = useState(false);
  const [smFrom, setSmFrom] = useState<string>(format(startOfMonth(today), "yyyy-MM-dd"));
  const [smTo, setSmTo] = useState<string>(format(endOfMonth(today), "yyyy-MM-dd"));
  const [smAssigned, setSmAssigned] = useState<string>("all");
  const [tasksOpen, setTasksOpen] = useState(false);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  const [punchOutGuard, setPunchOutGuard] = useState<{ pending: number } | null>(null);

  const fromIso = useMemo(() => startOfDay(new Date(from)).toISOString(), [from]);
  const toIso = useMemo(() => endOfDay(new Date(to)).toISOString(), [to]);
  const smFromIso = useMemo(() => startOfDay(new Date(smFrom)).toISOString(), [smFrom]);
  const smToIso = useMemo(() => endOfDay(new Date(smTo)).toISOString(), [smTo]);

  // Static data — shared cache across pages (5-min staleTime)
  const { data: statuses = [] } = useQuery<StatusRow[]>({
    queryKey: ["statuses"],
    queryFn: async () => {
      const { data } = await supabase.from("statuses").select("id, name, color, is_sales, is_lost, sort_order").order("sort_order");
      return (data ?? []) as StatusRow[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });

  const { data: profiles = [] } = useQuery<ProfileLite[]>({
    queryKey: ["profiles_directory"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles_directory").select("id, full_name, email").order("full_name");
      return (data ?? []) as ProfileLite[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });

  // Main dashboard data: leads + connected calls + meetings
  const { data: dashMain, isLoading: loading } = useQuery({
    queryKey: ["dashboard_main", fromIso, toIso, user?.id, isPM],
    queryFn: async () => {
      const leadsQuery = isPM
        ? supabase.from("leads").select("id, client_name, status_id, sales_value, created_at, assigned_to").eq("assigned_to", user!.id)
        : supabase.from("leads").select("id, client_name, status_id, sales_value, created_at").gte("created_at", fromIso).lte("created_at", toIso);
      const [l, calls, mSched] = await Promise.all([
        leadsQuery,
        supabase.from("calls").select("lead_id").eq("status", "connected").gte("called_at", fromIso).lte("called_at", toIso),
        supabase.from("meetings").select("id", { count: "exact", head: true }).gte("scheduled_at", fromIso).lte("scheduled_at", toIso),
      ]);
      return {
        leads: (l.data ?? []) as LeadLite[],
        connectedLeadIds: new Set((calls.data ?? []).map((c: { lead_id: string }) => c.lead_id)),
        meetingsScheduled: mSched.count ?? 0,
      };
    },
    staleTime: 30 * 1000,
    enabled: !!user,
    placeholderData: (prev) => prev,
  });

  // Calls made today by this user
  const { data: callsToday = 0 } = useQuery({
    queryKey: ["dashboard_calls_today", user?.id, todayStr],
    queryFn: async () => {
      const todayStart = startOfDay(new Date()).toISOString();
      const todayEnd = endOfDay(new Date()).toISOString();
      const { count } = await supabase.from("calls").select("id", { count: "exact", head: true }).eq("user_id", user!.id).gte("called_at", todayStart).lte("called_at", todayEnd);
      return count ?? 0;
    },
    staleTime: 30 * 1000,
    enabled: !!user,
  });

  // Pending tasks created by this user
  const { data: pendingTasks = [] } = useQuery<{ id: string; title: string; due_date: string | null; lead_id: string }[]>({
    queryKey: ["dashboard_tasks", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("id, title, due_date, lead_id").eq("status", "pending").eq("created_by", user!.id).order("due_date", { ascending: true, nullsFirst: false }).limit(50);
      return (data ?? []) as { id: string; title: string; due_date: string | null; lead_id: string }[];
    },
    staleTime: 30 * 1000,
    enabled: !!user,
  });

  // Status movement panel
  const { data: smLeadsData, isLoading: smLoading } = useQuery<LeadLite[]>({
    queryKey: ["dashboard_sm", smFromIso, smToIso, smAssigned, user?.id, isPM],
    queryFn: async () => {
      let q = supabase.from("leads").select("id, client_name, status_id, sales_value, created_at");
      if (isPM) {
        q = (q as any).eq("assigned_to", user!.id);
      } else {
        q = (q as any).gte("created_at", smFromIso).lte("created_at", smToIso);
        if (smAssigned !== "all") q = (q as any).eq("assigned_to", smAssigned);
      }
      const { data } = await q;
      return (data ?? []) as LeadLite[];
    },
    staleTime: 30 * 1000,
    enabled: !!user,
    placeholderData: (prev) => prev,
  });
  const smLeads: LeadLite[] | null = smLeadsData ?? null;

  // Punch record for today
  const { data: punch = null } = useQuery<{ id: string; punch_in_at: string; punch_out_at: string | null } | null>({
    queryKey: ["punch", user?.id, todayStr],
    queryFn: async () => {
      const workDate = format(new Date(), "yyyy-MM-dd");
      const { data } = await supabase.from("attendance").select("id, punch_in_at, punch_out_at").eq("user_id", user!.id).eq("work_date", workDate).maybeSingle();
      return data ?? null;
    },
    staleTime: 60 * 1000,
    enabled: !!user && !isManager,
  });

  // Derived from dashMain
  const leads = dashMain?.leads ?? [];
  const connectedLeadIds = dashMain?.connectedLeadIds ?? new Set<string>();
  const meetingsScheduled = dashMain?.meetingsScheduled ?? 0;

  // Realtime: invalidate relevant queries on DB changes
  useEffect(() => {
    if (!user) return;
    const timer = { main: null as ReturnType<typeof setTimeout> | null, sm: null as ReturnType<typeof setTimeout> | null };
    const invalidateMain = () => {
      if (timer.main) clearTimeout(timer.main);
      timer.main = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["dashboard_main"] });
        void queryClient.invalidateQueries({ queryKey: ["dashboard_calls_today"] });
      }, 400);
    };
    const invalidateSm = () => {
      if (timer.sm) clearTimeout(timer.sm);
      timer.sm = setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["dashboard_sm"] }), 400);
    };
    const ch = supabase
      .channel("dashboard-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => { invalidateMain(); invalidateSm(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, invalidateMain)
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, invalidateMain)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        if (timer.main) clearTimeout(timer.main);
        timer.main = setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["dashboard_tasks"] }), 400);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "statuses" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["statuses"] });
        invalidateSm();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => void queryClient.invalidateQueries({ queryKey: ["punch"] }))
      .subscribe();
    return () => {
      if (timer.main) clearTimeout(timer.main);
      if (timer.sm) clearTimeout(timer.sm);
      void supabase.removeChannel(ch);
    };
  }, [user]);

  const totalLeads = leads.length;
  const connectedCount = connectedLeadIds.size;
  const pct = (n: number) => totalLeads > 0 ? Math.round((n / totalLeads) * 100) : 0;

  const meetingDoneLeads = useMemo(() => leads.filter((l) => {
    const st = statuses.find((s) => s.id === l.status_id);
    return st ? /meeting\s*done/i.test(st.name) : false;
  }), [leads, statuses]);
  const meetingsDone = meetingDoneLeads.length;

  const salesLeads = useMemo(() => leads.filter((l) => {
    const st = statuses.find((s) => s.id === l.status_id);
    return st ? (st.is_sales || /sale|won|converted|closed/i.test(st.name)) : false;
  }), [leads, statuses]);

  const lostLeads = useMemo(() => leads.filter((l) => {
    const st = statuses.find((s) => s.id === l.status_id);
    return st ? (st.is_lost || /lost|rejected|dropped|no.?response|not.?interested/i.test(st.name)) : false;
  }), [leads, statuses]);

  const totalSalesValue = salesLeads.reduce((sum, l) => sum + Number(l.sales_value ?? 0), 0);
  const conversionsCount = salesLeads.length;
  const conversionRate = connectedCount > 0
    ? Math.round(((conversionsCount + meetingsDone) / connectedCount) * 100)
    : 0;
  const meetingConversionRate = meetingsDone > 0 ? Math.round((conversionsCount / meetingsDone) * 100) : 0;
  const assignedConversionRate = totalLeads > 0 ? Math.round((conversionsCount / totalLeads) * 100) : 0;

  const byStatus = useMemo(() => {
    const map = new Map<string, LeadLite[]>();
    for (const l of smLeads ?? []) {
      if (!l.status_id) continue;
      const arr = map.get(l.status_id) ?? [];
      arr.push(l);
      map.set(l.status_id, arr);
    }
    return map;
  }, [smLeads]);

  function openStatusLeads(s: StatusRow) {
    navigate({
      to: "/leads",
      search: {
        status: s.id,
        assigned: smAssigned !== "all" ? smAssigned : undefined,
        from: smFromIso,
        to: smToIso,
      },
    });
  }

  function applySmMonthPreset(preset: "current" | "last" | "year" | "custom") {
    const now = new Date();
    if (preset === "current") {
      setSmFrom(format(startOfMonth(now), "yyyy-MM-dd"));
      setSmTo(format(endOfMonth(now), "yyyy-MM-dd"));
    } else if (preset === "last") {
      const prev = subMonths(now, 1);
      setSmFrom(format(startOfMonth(prev), "yyyy-MM-dd"));
      setSmTo(format(endOfMonth(prev), "yyyy-MM-dd"));
    } else if (preset === "year") {
      setSmFrom(format(startOfYear(now), "yyyy-MM-dd"));
      setSmTo(format(now, "yyyy-MM-dd"));
    }
  }

  async function punchIn() {
    if (!user) return;
    setBusyPunch(true);
    const workDate = format(new Date(), "yyyy-MM-dd");
    const { error } = await supabase.from("attendance").insert({ user_id: user.id, work_date: workDate });
    setBusyPunch(false);
    if (error) return toast.error(error.message);
    toast.success("Punched in");
    void queryClient.invalidateQueries({ queryKey: ["punch"] });
  }

  async function punchOut() {
    if (!user || !punch) return;
    const workDate = format(new Date(), "yyyy-MM-dd");
    const { data: flow } = await supabase.from("calling_flows").select("id").eq("user_id", user.id).eq("work_date", workDate).maybeSingle();
    if (flow) {
      const { count } = await supabase.from("calling_flow_items").select("id", { count: "exact", head: true }).eq("flow_id", flow.id).in("status", ["pending", "in_progress"]);
      if ((count ?? 0) > 0) { setPunchOutGuard({ pending: count ?? 0 }); return; }
    }
    void doPunchOut();
  }

  async function doPunchOut() {
    if (!user || !punch) return;
    setBusyPunch(true);
    const { error } = await supabase.from("attendance").update({ punch_out_at: new Date().toISOString() }).eq("id", punch.id);
    setBusyPunch(false);
    if (error) return toast.error(error.message);
    toast.success("Punched out");
    setPunchOutGuard(null);
    void queryClient.invalidateQueries({ queryKey: ["punch"] });
  }

  async function movePendingToTomorrow() {
    if (!user) return;
    const workDate = format(new Date(), "yyyy-MM-dd");
    const tomorrow = format(new Date(Date.now() + 86400000), "yyyy-MM-dd");
    const { data: flow } = await supabase.from("calling_flows").select("id").eq("user_id", user.id).eq("work_date", workDate).maybeSingle();
    if (!flow) return doPunchOut();
    const { data: items } = await supabase.from("calling_flow_items").select("lead_id, category, priority, attempts_planned").eq("flow_id", flow.id).in("status", ["pending", "in_progress"]);
    await supabase.from("calling_flows").delete().eq("user_id", user.id).eq("work_date", tomorrow);
    const flowName = `Workflow — ${format(new Date(tomorrow), "MMM d, yyyy")}`;
    const { data: newFlow } = await supabase.from("calling_flows").insert({ user_id: user.id, work_date: tomorrow, status: "active", name: flowName }).select("id").single();
    if (newFlow && items && items.length) {
      await supabase.from("calling_flow_items").insert(items.map((i) => ({ flow_id: newFlow.id, ...i, attempts_done: 0, status: "pending" as const })));
    }
    toast.success(`Moved ${items?.length ?? 0} leads to tomorrow`);
    void doPunchOut();
  }

  const kpis = isManager
    ? [
        { label: "Total Assigned Clients", value: totalLeads, sub: undefined, icon: Users, accent: "from-indigo-500/20 to-indigo-500/0" },
        { label: "Meetings Scheduled", value: meetingsScheduled, sub: undefined, icon: CalendarPlus, accent: "from-fuchsia-500/20 to-fuchsia-500/0" },
        { label: "Meetings Done", value: meetingsDone, sub: undefined, icon: CalendarCheck, accent: "from-violet-500/20 to-violet-500/0" },
        { label: "Conversions", value: conversionsCount, sub: undefined, icon: TrendingUp, accent: "from-emerald-500/20 to-emerald-500/0" },
        { label: "Meeting → Sales Rate", value: `${meetingConversionRate}%`, sub: undefined, icon: Percent, accent: "from-sky-500/20 to-sky-500/0" },
        { label: "Assigned → Sales Rate", value: `${assignedConversionRate}%`, sub: undefined, icon: Percent, accent: "from-teal-500/20 to-teal-500/0" },
        { label: "Sales Value", value: `₹${totalSalesValue.toLocaleString("en-IN")}`, sub: undefined, icon: IndianRupee, accent: "from-amber-500/20 to-amber-500/0" },
      ]
    : isPM
    ? [
        { label: "Total Assigned Leads", value: totalLeads, sub: undefined, icon: Users, accent: "from-indigo-500/20 to-indigo-500/0", onClick: () => setKpiSheet({ open: true, label: "Total Assigned Leads", leads }) },
        { label: "Meetings Done", value: meetingsDone, sub: `${pct(meetingsDone)}% of assigned`, icon: CalendarCheck, accent: "from-violet-500/20 to-violet-500/0", onClick: () => setKpiSheet({ open: true, label: "Meetings Done", leads: meetingDoneLeads }) },
        { label: "Total Sale", value: conversionsCount, sub: `${pct(conversionsCount)}% of assigned`, icon: TrendingUp, accent: "from-emerald-500/20 to-emerald-500/0", onClick: () => setKpiSheet({ open: true, label: "Total Sale", leads: salesLeads }) },
        { label: "Lost", value: lostLeads.length, sub: `${pct(lostLeads.length)}% of assigned`, icon: XCircle, accent: "from-rose-500/20 to-rose-500/0", onClick: () => setKpiSheet({ open: true, label: "Lost", leads: lostLeads }) },
      ]
    : [
        { label: "Total Leads", value: totalLeads, sub: undefined, icon: Users, accent: "from-indigo-500/20 to-indigo-500/0" },
        { label: "Connected Leads", value: connectedCount, sub: undefined, icon: PhoneCall, accent: "from-sky-500/20 to-sky-500/0" },
        { label: "Conversion Rate", value: `${conversionRate}%`, sub: undefined, icon: TrendingUp, accent: "from-emerald-500/20 to-emerald-500/0" },
        { label: "Meetings Done", value: meetingsDone, sub: undefined, icon: CalendarCheck, accent: "from-violet-500/20 to-violet-500/0" },
        { label: "Sales Value", value: `₹${totalSalesValue.toLocaleString("en-IN")}`, sub: undefined, icon: IndianRupee, accent: "from-amber-500/20 to-amber-500/0" },
      ];

  function setRange(preset: "today" | "week" | "month" | "all") {
    const now = new Date();
    if (preset === "today") { setFrom(format(now, "yyyy-MM-dd")); setTo(format(now, "yyyy-MM-dd")); }
    if (preset === "week") { const d = new Date(now); d.setDate(d.getDate() - 6); setFrom(format(d, "yyyy-MM-dd")); setTo(format(now, "yyyy-MM-dd")); }
    if (preset === "month") { setFrom(format(startOfMonth(now), "yyyy-MM-dd")); setTo(format(endOfMonth(now), "yyyy-MM-dd")); }
    if (preset === "all") { setFrom("2020-01-01"); setTo(format(now, "yyyy-MM-dd")); }
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
          {isPM
            ? <p className="text-muted-foreground mt-1 text-sm">All your assigned leads</p>
            : <p className="text-muted-foreground mt-1 text-sm">{format(new Date(from), "MMM d, yyyy")} → {format(new Date(to), "MMM d, yyyy")}</p>
          }
        </div>
        {!isPM && (
          <Card className="p-3 flex flex-wrap items-end gap-2 shadow-card">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px]" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px]" />
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setRange("today")}>Today</Button>
              <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setRange("week")}>7d</Button>
              <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setRange("month")}>Month</Button>
              <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setRange("all")}>All</Button>
            </div>
          </Card>
        )}
      </div>

      {/* KPI cards */}
      <div className={`grid gap-3 sm:gap-4 mt-6 ${isPM ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-5"}`}>
        {loading
          ? Array.from({ length: isPM ? 4 : 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          : kpis.map((k) => {
            const cardInner = (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-medium">{k.label}</div>
                  <div className="font-display text-xl sm:text-2xl font-bold mt-2 truncate">{k.value}</div>
                  {k.sub && <div className="text-xs text-muted-foreground mt-0.5">{k.sub}</div>}
                </div>
                <div className="size-8 sm:size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <k.icon className="size-4" />
                </div>
              </div>
            );
            const kOnClick = (k as { onClick?: () => void }).onClick;
            return kOnClick ? (
              <button key={k.label} onClick={kOnClick} className="text-left">
                <Card className={`relative overflow-hidden p-4 sm:p-5 shadow-card border-0 bg-gradient-to-br ${k.accent} bg-card hover:shadow-elegant transition-shadow cursor-pointer`}>
                  {cardInner}
                </Card>
              </button>
            ) : (
              <Card key={k.label} className={`relative overflow-hidden p-4 sm:p-5 shadow-card border-0 bg-gradient-to-br ${k.accent} bg-card`}>
                {cardInner}
              </Card>
            );
          })}
      </div>

      {/* Activity grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        {/* Punch + Calls + Tasks */}
        <div className="space-y-4">
          {!isManager && (
            <Card className="p-5 shadow-card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold flex items-center gap-2"><LogIn className="size-4 text-primary" />Punch-in</h3>
                <span className="text-[10px] text-muted-foreground">{format(new Date(), "EEE, MMM d")}</span>
              </div>
              {punch ? (
                <div className="space-y-2">
                  <p className="text-sm">In at <span className="font-semibold">{format(new Date(punch.punch_in_at), "h:mm a")}</span></p>
                  {punch.punch_out_at
                    ? <p className="text-sm text-muted-foreground">Out at {format(new Date(punch.punch_out_at), "h:mm a")}</p>
                    : (
                      <div className="space-y-2">
                        <Button onClick={() => setCreateFlowOpen(true)} size="sm" className="w-full bg-gradient-primary"><Phone className="size-3 mr-2" />Create today's flow</Button>
                        <Button onClick={() => navigate({ to: "/workflow" })} variant="outline" size="sm" className="w-full">Open workflow</Button>
                        <Button onClick={punchOut} disabled={busyPunch} variant="ghost" size="sm" className="w-full">{busyPunch && <Loader2 className="size-3 mr-2 animate-spin" />}Punch out</Button>
                      </div>
                    )}
                </div>
              ) : (
                <Button onClick={punchIn} disabled={busyPunch} className="w-full bg-gradient-primary">{busyPunch && <Loader2 className="size-3 mr-2 animate-spin" />}Punch in</Button>
              )}
            </Card>
          )}

          <Card className="p-5 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-semibold flex items-center gap-2"><PhoneCall className="size-4 text-primary" />Calls today</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Your activity</p>
              </div>
              <div className="font-display text-3xl font-bold">{callsToday}</div>
            </div>
          </Card>

          <button onClick={() => setTasksOpen(true)} className="w-full text-left">
            <Card className="p-5 shadow-card hover:shadow-elegant transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display font-semibold flex items-center gap-2"><ListTodo className="size-4 text-primary" />Pending tasks</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Click to view</p>
                </div>
                <div className="font-display text-3xl font-bold flex items-center gap-1">{pendingTasks.length}<ChevronRight className="size-5 text-muted-foreground" /></div>
              </div>
            </Card>
          </button>
        </div>

        {/* Status movement */}
        <Card className="lg:col-span-2 p-5 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold flex items-center gap-2"><Filter className="size-4 text-primary" />Status movement</h3>
            <span className="text-xs text-muted-foreground hidden sm:inline">Click a status to open filtered leads</span>
          </div>

          {/* Filter bar — hidden for PM since they always see all assigned leads */}
          {!isPM && <div className="flex flex-wrap items-end gap-2 mb-4 p-3 rounded-lg bg-muted/40 border">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">From</label>
              <Input type="date" value={smFrom} onChange={(e) => setSmFrom(e.target.value)} className="h-8 w-[140px]" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">To</label>
              <Input type="date" value={smTo} onChange={(e) => setSmTo(e.target.value)} className="h-8 w-[140px]" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Month</label>
              <Select onValueChange={(v) => applySmMonthPreset(v as "current" | "last" | "year" | "custom")}>
                <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Preset" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current Month</SelectItem>
                  <SelectItem value="last">Last Month</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isManager && (
              <div className="min-w-[170px]">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Team member</label>
                <Select value={smAssigned} onValueChange={setSmAssigned}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All team members</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name || p.email || p.id.slice(0, 8)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {smLoading && (smLeads === null) && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            {!smLoading && statuses.map((s) => {
              const count = (byStatus.get(s.id) ?? []).length;
              return (
                <button key={s.id} onClick={() => openStatusLeads(s)} className="group flex items-center justify-between rounded-lg border bg-card p-3 hover:border-primary/50 hover:shadow-sm transition-all text-left">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="size-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-sm font-medium truncate">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-display text-lg font-bold">{count}</span>
                    <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </button>
              );
            })}
            {statuses.length === 0 && <p className="text-xs text-muted-foreground col-span-2 text-center py-6">No statuses configured.</p>}
          </div>
        </Card>
      </div>

      {/* Tasks drawer */}
      <Sheet open={tasksOpen} onOpenChange={setTasksOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle className="font-display">Pending tasks ({pendingTasks.length})</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-2">
            {pendingTasks.length === 0 && <p className="text-sm text-muted-foreground">All caught up.</p>}
            {pendingTasks.map((t) => (
              <button key={t.id} onClick={() => { setTasksOpen(false); navigate({ to: "/leads" }); }} className="w-full text-left rounded-lg border p-3 hover:border-primary/50 transition-colors">
                <p className="font-medium text-sm">{t.title}</p>
                {t.due_date && <p className="text-[11px] text-muted-foreground">Due {format(new Date(t.due_date), "MMM d, h:mm a")}</p>}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* KPI leads sheet (PM) */}
      <Sheet open={kpiSheet.open} onOpenChange={(v) => setKpiSheet((s) => ({ ...s, open: v }))}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle className="font-display">{kpiSheet.label} ({kpiSheet.leads.length})</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-2">
            {kpiSheet.leads.map((l) => {
              const st = statuses.find((s) => s.id === l.status_id);
              return (
                <div key={l.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="size-2 rounded-full shrink-0" style={{ background: st?.color ?? "#888" }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{l.client_name}</p>
                    {st && <p className="text-xs text-muted-foreground">{st.name}</p>}
                  </div>
                  {l.sales_value ? <span className="text-xs text-muted-foreground shrink-0">₹{Number(l.sales_value).toLocaleString("en-IN")}</span> : null}
                </div>
              );
            })}
            {kpiSheet.leads.length === 0 && <p className="text-sm text-muted-foreground">No clients in this category.</p>}
          </div>
        </SheetContent>
      </Sheet>

      <CreateFlowModal open={createFlowOpen} onOpenChange={setCreateFlowOpen} onCreated={() => navigate({ to: "/workflow" })} />

      <AlertDialog open={!!punchOutGuard} onOpenChange={(v) => !v && setPunchOutGuard(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pending calls detected</AlertDialogTitle>
            <AlertDialogDescription>You have {punchOutGuard?.pending} leads still in today's workflow queue. What would you like to do?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <Button variant="outline" onClick={() => { setPunchOutGuard(null); void doPunchOut(); }}>Ignore & punch out</Button>
            <AlertDialogAction onClick={() => void movePendingToTomorrow()}>Move to tomorrow</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
