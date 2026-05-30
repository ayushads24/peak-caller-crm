import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Phone, CheckCircle2, TrendingUp, Clock, Trophy, RefreshCw, BarChart2 } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, eachHourOfInterval, addHours } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/leaderboard")({ component: Page });

type Period = "today" | "week" | "month";
type SortBy = "calls" | "connected" | "rate" | "talktime";

interface CallerStat {
  userId: string;
  name: string;
  totalCalls: number;
  connected: number;
  rate: number;
  talkSeconds: number;
}

function periodRange(p: Period): { from: Date; to: Date; label: string } {
  const now = new Date();
  if (p === "today") return { from: startOfDay(now), to: endOfDay(now), label: format(now, "d MMM yyyy") };
  if (p === "week")  return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }), label: "This Week" };
  return { from: startOfMonth(now), to: endOfMonth(now), label: format(now, "MMMM yyyy") };
}

function fmtTime(secs: number) {
  if (secs < 60) return `${secs}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

const MEDALS = ["🥇", "🥈", "🥉"];

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) return <span className="text-xl leading-none">{MEDALS[rank - 1]}</span>;
  return <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">{rank}</span>;
}

function RateColor(rate: number) {
  if (rate >= 60) return "text-emerald-600";
  if (rate >= 40) return "text-amber-600";
  return "text-red-500";
}

function Page() {
  const [period, setPeriod] = useState<Period>("today");
  const [sortBy, setSortBy] = useState<SortBy>("calls");
  const [stats, setStats] = useState<CallerStat[]>([]);
  const [graphData, setGraphData] = useState<{ label: string; total: number; connected: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  async function load(p = period) {
    setLoading(true);
    const { from, to } = periodRange(p);
    const [callsRes, profilesRes] = await Promise.all([
      supabase
        .from("calls")
        .select("user_id, status, duration_seconds, called_at")
        .gte("called_at", from.toISOString())
        .lte("called_at", to.toISOString()),
      supabase.from("profiles_directory").select("id, full_name, email").order("full_name"),
    ]);

    const calls = callsRes.data ?? [];
    const profiles = profilesRes.data ?? [];
    const profileMap = new Map(profiles.map((p) => [p.id, (p.full_name || p.email || "Unknown") as string]));

    // Aggregate by user_id
    const map = new Map<string, { total: number; connected: number; secs: number }>();
    for (const c of calls) {
      const uid = c.user_id as string;
      if (!uid) continue;
      const prev = map.get(uid) ?? { total: 0, connected: 0, secs: 0 };
      map.set(uid, {
        total: prev.total + 1,
        connected: prev.connected + (c.status === "connected" ? 1 : 0),
        secs: prev.secs + ((c.duration_seconds as number) || 0),
      });
    }

    const result: CallerStat[] = [];
    for (const [userId, agg] of map.entries()) {
      result.push({
        userId,
        name: profileMap.get(userId) ?? "Unknown",
        totalCalls: agg.total,
        connected: agg.connected,
        rate: agg.total > 0 ? Math.round((agg.connected / agg.total) * 100) : 0,
        talkSeconds: agg.secs,
      });
    }

    setStats(result);

    // Build time-series graph data
    if (p === "today") {
      // Hourly buckets for today
      const hours = eachHourOfInterval({ start: from, end: to });
      const buckets = hours.map((h) => {
        const hStart = h.getTime();
        const hEnd = addHours(h, 1).getTime();
        const slice = calls.filter((c) => {
          const t = new Date(c.called_at as string).getTime();
          return t >= hStart && t < hEnd;
        });
        return {
          label: format(h, "ha"), // e.g. "9am"
          total: slice.length,
          connected: slice.filter((c) => c.status === "connected").length,
        };
      });
      // Only keep hours up to now + trim leading zeros
      const nowH = new Date().getHours();
      const trimmed = buckets.slice(0, nowH + 1);
      const firstNonZero = trimmed.findIndex((b) => b.total > 0);
      setGraphData(firstNonZero >= 0 ? trimmed.slice(Math.max(0, firstNonZero - 1)) : trimmed.slice(-8));
    } else {
      // Daily buckets for week/month
      const days = eachDayOfInterval({ start: from, end: to });
      const buckets = days.map((d) => {
        const dStart = startOfDay(d).getTime();
        const dEnd = endOfDay(d).getTime();
        const slice = calls.filter((c) => {
          const t = new Date(c.called_at as string).getTime();
          return t >= dStart && t <= dEnd;
        });
        return {
          label: format(d, "d MMM"),
          total: slice.length,
          connected: slice.filter((c) => c.status === "connected").length,
        };
      });
      setGraphData(buckets);
    }

    setLastUpdated(new Date());
    setLoading(false);
  }

  useEffect(() => { void load(period); }, [period]);

  // Realtime — refresh on any new call
  useEffect(() => {
    const ch = supabase
      .channel("leaderboard-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls" }, () => void load(period))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [period]);

  const sorted = useMemo(() => {
    return [...stats].sort((a, b) => {
      if (sortBy === "calls")    return b.totalCalls - a.totalCalls;
      if (sortBy === "connected") return b.connected - a.connected;
      if (sortBy === "rate")     return b.rate - a.rate;
      return b.talkSeconds - a.talkSeconds;
    });
  }, [stats, sortBy]);

  const maxCalls = sorted[0]?.totalCalls || 1;
  const totalCalls = stats.reduce((s, c) => s + c.totalCalls, 0);
  const totalConnected = stats.reduce((s, c) => s + c.connected, 0);
  const totalTalk = stats.reduce((s, c) => s + c.talkSeconds, 0);
  const teamRate = totalCalls > 0 ? Math.round((totalConnected / totalCalls) * 100) : 0;
  const { label } = periodRange(period);

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-5xl mx-auto animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="size-7 text-amber-500" /> Leaderboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{label} · Live rankings</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period selector */}
          <div className="flex rounded-lg border overflow-hidden text-sm">
            {(["today", "week", "month"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 font-medium capitalize transition-colors ${period === p ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-muted"}`}
              >
                {p === "today" ? "Today" : p === "week" ? "This Week" : "This Month"}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Team summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card className="px-4 py-3 flex items-center gap-3">
          <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Phone className="size-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Calls</div>
            <div className="font-display text-xl font-bold">{totalCalls}</div>
          </div>
        </Card>
        <Card className="px-4 py-3 flex items-center gap-3">
          <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="size-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Connected</div>
            <div className="font-display text-xl font-bold">{totalConnected}</div>
          </div>
        </Card>
        <Card className="px-4 py-3 flex items-center gap-3">
          <div className="size-8 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0">
            <TrendingUp className="size-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Team Rate</div>
            <div className={`font-display text-xl font-bold ${RateColor(teamRate)}`}>{teamRate}%</div>
          </div>
        </Card>
        <Card className="px-4 py-3 flex items-center gap-3">
          <div className="size-8 rounded-lg bg-violet-500/10 text-violet-600 flex items-center justify-center shrink-0">
            <Clock className="size-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Talk Time</div>
            <div className="font-display text-xl font-bold">{fmtTime(totalTalk)}</div>
          </div>
        </Card>
      </div>

      {/* Hourly / Daily call graph */}
      {graphData.length > 0 && (
        <Card className="p-4 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="size-4 text-primary" />
            <h2 className="font-semibold text-sm">
              {period === "today" ? "Calls by Hour" : period === "week" ? "Calls by Day (This Week)" : "Calls by Day (This Month)"}
            </h2>
            <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-primary inline-block" /> Total</span>
              <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-emerald-500 inline-block" /> Connected</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={graphData} barCategoryGap="30%" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                cursor={{ fill: "hsl(var(--muted))", radius: 4 }}
                formatter={(value: number, name: string) => [value, name === "total" ? "Total Calls" : "Connected"]}
              />
              <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Bar dataKey="connected" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Sort tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <span className="text-xs text-muted-foreground self-center mr-1">Sort by:</span>
        {([
          { key: "calls",     label: "Total Calls" },
          { key: "connected", label: "Connected" },
          { key: "rate",      label: "Connect %" },
          { key: "talktime",  label: "Talk Time" },
        ] as { key: SortBy; label: string }[]).map((s) => (
          <button
            key={s.key}
            onClick={() => setSortBy(s.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${sortBy === s.key ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Leaderboard */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : sorted.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Phone className="size-8 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No calls recorded yet</p>
          <p className="text-sm mt-1">Calls made during this period will appear here.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((c, idx) => {
            const rank = idx + 1;
            const barPct = Math.round((c.totalCalls / maxCalls) * 100);
            const isTop = rank <= 3;
            return (
              <Card
                key={c.userId}
                className={`px-4 py-3 transition-all ${isTop ? "border-amber-400/40 shadow-sm" : ""} ${rank === 1 ? "bg-gradient-to-r from-amber-500/5 to-transparent" : ""}`}
              >
                <div className="flex items-center gap-3">
                  {/* Rank */}
                  <div className="shrink-0 w-8 flex items-center justify-center">
                    <RankBadge rank={rank} />
                  </div>

                  {/* Name + bar */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">{c.name}</span>
                      {rank === 1 && <Badge className="border-0 bg-amber-500 text-white text-[9px] px-1.5 py-0 h-4 shrink-0">Leader</Badge>}
                    </div>
                    {/* Progress bar */}
                    <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${rank === 1 ? "bg-amber-500" : rank === 2 ? "bg-slate-400" : rank === 3 ? "bg-orange-400" : "bg-primary/50"}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 shrink-0 text-right">
                    <div className="hidden sm:block text-center min-w-[52px]">
                      <div className="font-display text-lg font-bold leading-none">{c.totalCalls}</div>
                      <div className="text-[10px] text-muted-foreground">Calls</div>
                    </div>
                    <div className="hidden sm:block text-center min-w-[52px]">
                      <div className="font-display text-lg font-bold leading-none text-emerald-600">{c.connected}</div>
                      <div className="text-[10px] text-muted-foreground">Connected</div>
                    </div>
                    <div className="text-center min-w-[44px]">
                      <div className={`font-display text-lg font-bold leading-none ${RateColor(c.rate)}`}>{c.rate}%</div>
                      <div className="text-[10px] text-muted-foreground">Rate</div>
                    </div>
                    <div className="hidden md:block text-center min-w-[56px]">
                      <div className="font-display text-sm font-bold leading-none text-violet-600">{fmtTime(c.talkSeconds)}</div>
                      <div className="text-[10px] text-muted-foreground">Talk Time</div>
                    </div>
                    {/* Mobile: calls only */}
                    <div className="sm:hidden text-center min-w-[36px]">
                      <div className="font-display text-lg font-bold leading-none">{c.totalCalls}</div>
                      <div className="text-[10px] text-muted-foreground">Calls</div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-right mt-3">
        Updated {format(lastUpdated, "h:mm:ss a")} · Auto-refreshes on new calls
      </p>
    </div>
  );
}
