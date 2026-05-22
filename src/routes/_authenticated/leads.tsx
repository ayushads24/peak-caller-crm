import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/leads")({ component: Page });

function Page() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <h1 className="font-display text-3xl font-bold tracking-tight">Leads</h1>
      <Card className="p-8 mt-6 shadow-card border-dashed">
        <p className="text-sm text-muted-foreground">Leads table, filters, bulk actions and CSV export ship in the next message.</p>
      </Card>
    </div>
  );
}