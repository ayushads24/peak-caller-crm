import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Page });

function Page() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <h1 className="font-display text-3xl font-bold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground mt-1">Your sales pulse at a glance.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        {["Total Leads", "Fresh Leads", "Follow-ups Pending", "Sales Closed"].map((k) => (
          <Card key={k} className="p-5 shadow-card">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{k}</div>
            <div className="font-display text-3xl font-bold mt-2">—</div>
          </Card>
        ))}
      </div>
      <Card className="p-8 mt-8 shadow-card border-dashed bg-gradient-card">
        <h2 className="font-display text-xl font-semibold">Welcome to PulseCRM</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl">
          Your backend is live with statuses, labels, roles and full RLS. KPI charts, the leads table, lead detail timeline, and settings panel are next — ask me to continue and I'll wire them up to live data.
        </p>
      </Card>
    </div>
  );
}