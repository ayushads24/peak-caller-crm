import { Card } from "@/components/ui/card";
import { TrendingUp, Users, ArrowRightLeft, Trophy } from "lucide-react";
import type { StatusRow, LeadRow } from "@/components/leads/lead-detail-sheet";

export interface MovementEvent {
  lead_id: string;
  created_by: string | null;
  created_at: string;
  from?: string | null;
  to?: string | null;
}

export function LeadsAnalyticsStrip({
  total, leads, statuses, movements, profiles,
}: {
  total: number;
  leads: LeadRow[];
  statuses: StatusRow[];
  movements: MovementEvent[];
  profiles: { id: string; full_name: string | null; email: string | null }[];
}) {
  const movedLeadIds = new Set(movements.map((m) => m.lead_id));
  const conversions = leads.filter((l) => statuses.find((s) => s.id === l.status_id)?.is_sales).length;
  const stageCounts = statuses.map((s) => ({
    s, n: leads.filter((l) => l.status_id === s.id).length,
  })).filter((x) => x.n > 0);
  const byUser = new Map<string, number>();
  movements.forEach((m) => { if (m.created_by) byUser.set(m.created_by, (byUser.get(m.created_by) ?? 0) + 1); });
  const topUsers = Array.from(byUser.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const userName = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    return p?.full_name || p?.email?.split("@")[0] || id.slice(0, 6);
  };

  return (
    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
      <Stat icon={<Users className="size-4" />} label="Total Leads" value={total} sub={`${leads.length} shown`} />
      <Stat icon={<ArrowRightLeft className="size-4" />} label="Moved Leads" value={movedLeadIds.size} sub={`${movements.length} transitions`} />
      <Stat icon={<Trophy className="size-4" />} label="Conversions" value={conversions} sub="Sales stage" tone="success" />
      <Stat icon={<TrendingUp className="size-4" />} label="Conversion Rate"
        value={`${leads.length ? Math.round((conversions / leads.length) * 100) : 0}%`} sub="of shown" />

      {stageCounts.length > 0 && (
        <Card className="col-span-2 md:col-span-2 p-3 shadow-card">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Stage-wise</p>
          <div className="flex flex-wrap gap-1.5">
            {stageCounts.map(({ s, n }) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs"
                style={{ background: `${s.color}22`, color: s.color }}>
                <span className="size-1.5 rounded-full" style={{ background: s.color }} />
                {s.name} · <strong>{n}</strong>
              </span>
            ))}
          </div>
        </Card>
      )}

      {topUsers.length > 0 && (
        <Card className="col-span-2 md:col-span-2 p-3 shadow-card">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Top movers</p>
          <div className="flex flex-wrap gap-1.5">
            {topUsers.map(([id, n]) => (
              <span key={id} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-accent/60">
                {userName(id)} · <strong>{n}</strong>
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ icon, label, value, sub, tone }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; tone?: "success";
}) {
  return (
    <Card className="p-3 shadow-card">
      <div className="flex items-center gap-2 text-muted-foreground text-[10px] uppercase tracking-wider">
        {icon}<span>{label}</span>
      </div>
      <p className={"mt-1 text-2xl font-bold font-display " + (tone === "success" ? "text-emerald-600 dark:text-emerald-400" : "")}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </Card>
  );
}