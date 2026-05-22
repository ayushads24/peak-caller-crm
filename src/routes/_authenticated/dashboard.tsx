import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Flame, Clock, Trophy, TrendingUp, Activity as ActivityIcon } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { formatDistanceToNow, subDays, startOfDay, format } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Page });

interface Stats {
  total: number;
  fresh: number;
  pending: number;
  closed: number;
  pipelineValue: number;
}

interface Activity {
  id: string;
  type: string;
  description: string;
  created_at: string;
  lead_id: string;
}

function Page() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [trend, setTrend] = useState<{ date: string; leads: number }[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activities" }, () => load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, []);

  async function load() {
    const [{ data: leads }, { data: acts }, { data: statuses }] = await Promise.all([
      supabase.from("leads").select("id, status_id, sales_value, created_at, closed_at"),
      supabase.from("activities").select("id, type, description, created_at, lead_id").order("created_at", { ascending: false }).limit(8),
      supabase.from("statuses").select("id, name, is_sales, is_lost"),
    ]);
    const salesIds = new Set((statuses ?? []).filter((s) => s.is_sales).map((s) => s.id));
    const freshNames = new Set(["new", "fresh"]);
    const freshIds = new Set((statuses ?? []).filter((s) => freshNames.has(s.name.toLowerCase())).map((s) => s.id));
    const all = leads ?? [];
    const closed = all.filter((l) => l.status_id && salesIds.has(l.status_id));
    const stats: Stats = {
      total: all.length,
      fresh: all.filter((l) => l.status_id && freshIds.has(l.status_id)).length,
      pending: all.filter((l) => !l.closed_at && !(l.status_id && salesIds.has(l.status_id))).length,
      closed: closed.length,
      pipelineValue: all.reduce((sum, l) => sum + Number(l.sales_value ?? 0), 0),
    };
    setStats(stats);
    setActivities((acts ?? []) as Activity[]);

    const buckets: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "MMM d");
      buckets[d] = 0;
    }
    for (const l of all) {
      const key = format(startOfDay(new Date(l.created_at)), "MMM d");
      if (key in buckets) buckets[key]++;
    }
    setTrend(Object.entries(buckets).map(([date, leads]) => ({ date, leads })));
  }

  const kpis = stats && [
    { label: "Total Leads", value: stats.total, icon: Users, accent: "from-indigo-500/20 to-indigo-500/0" },
    { label: "Fresh Leads", value: stats.fresh, icon: Flame, accent: "from-orange-500/20 to-orange-500/0" },
    { label: "Follow-ups", value: stats.pending, icon: Clock, accent: "from-amber-500/20 to-amber-500/0" },
    { label: "Sales Closed", value: stats.closed, icon: Trophy, accent: "from-emerald-500/20 to-emerald-500/0" },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">Your sales pulse at a glance.</p>
        </div>
        {stats && (
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Pipeline value</div>
            <div className="font-display text-2xl font-bold">₹{stats.pipelineValue.toLocaleString("en-IN")}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6">
        {kpis ? kpis.map((k) => (
          <Card key={k.label} className={`relative overflow-hidden p-4 sm:p-5 shadow-card border-0 bg-gradient-to-br ${k.accent} bg-card`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-medium">{k.label}</div>
                <div className="font-display text-2xl sm:text-3xl font-bold mt-2">{k.value}</div>
              </div>
              <div className="size-8 sm:size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <k.icon className="size-4" />
              </div>
            </div>
          </Card>
        )) : Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Card className="lg:col-span-2 p-4 sm:p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display font-semibold flex items-center gap-2"><TrendingUp className="size-4 text-primary" /> Leads (last 14 days)</h2>
            </div>
          </div>
          <div className="h-56 sm:h-64 -ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="leads" stroke="var(--primary)" strokeWidth={2} fill="url(#grad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 sm:p-6 shadow-card">
          <h2 className="font-display font-semibold flex items-center gap-2 mb-4"><ActivityIcon className="size-4 text-primary" /> Recent activity</h2>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {activities.length === 0 && <p className="text-xs text-muted-foreground">No activity yet.</p>}
            {activities.map((a) => (
              <div key={a.id} className="flex gap-3 text-sm">
                <div className="size-2 mt-2 rounded-full bg-primary/60 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="truncate">{a.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}