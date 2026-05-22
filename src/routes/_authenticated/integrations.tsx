import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin, hasPermission } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircle, Facebook, Copy, CheckCircle2, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/integrations")({ component: IntegrationsPage });

type IntegrationStats = { source: string; total: number; today: number; lastSync: string | null };

function IntegrationsPage() {
  const { roles, permissions } = useAuth();
  const canView = isAdmin(roles) || hasPermission(permissions, "leads.view");
  const [stats, setStats] = useState<Record<string, IntegrationStats>>({});
  const [loading, setLoading] = useState(true);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const doubletickUrl = `${baseUrl}/api/public/webhook/doubletick`;
  const facebookUrl = `${baseUrl}/api/public/webhook/facebook`;

  useEffect(() => { if (canView) void loadStats(); }, [canView]);

  async function loadStats() {
    setLoading(true);
    const sources = ["DoubleTick WhatsApp", "Facebook Lead Ads"];
    const result: Record<string, IntegrationStats> = {};
    for (const src of sources) {
      const { data } = await supabase
        .from("leads")
        .select("created_at")
        .eq("lead_source", src)
        .order("created_at", { ascending: false })
        .limit(500);
      const rows = (data ?? []) as { created_at: string }[];
      const today = new Date(); today.setHours(0, 0, 0, 0);
      result[src] = {
        source: src,
        total: rows.length,
        today: rows.filter((r) => new Date(r.created_at) >= today).length,
        lastSync: rows[0]?.created_at ?? null,
      };
    }
    setStats(result);
    setLoading(false);
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  }

  if (!canView) {
    return (
      <div className="p-10 max-w-3xl mx-auto">
        <Card className="p-8 text-center">
          <h2 className="font-display text-xl font-semibold">Access restricted</h2>
          <p className="text-sm text-muted-foreground mt-2">You don't have permission to view integrations.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Connect DoubleTick WhatsApp & Facebook Lead Ads. Leads auto-sync into your CRM.
          </p>
        </div>
        <Button variant="outline" onClick={loadStats} disabled={loading} className="gap-2">
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <IntegrationCard
          name="DoubleTick WhatsApp"
          icon={<MessageCircle className="size-5" />}
          color="from-emerald-500 to-green-600"
          webhookUrl={doubletickUrl}
          stats={stats["DoubleTick WhatsApp"]}
          onCopy={copy}
          instructions={[
            "Open DoubleTick dashboard → Settings → Webhooks",
            "Paste the webhook URL above as 'Incoming Lead Webhook'",
            "Signing method: HMAC SHA-256 of body, header: x-doubletick-signature",
            "Use the DOUBLETICK_WEBHOOK_SECRET (already saved) as the shared secret",
            "Enable events: New Contact, Incoming Message",
          ]}
          configFields={[{ label: "Webhook Secret", value: "Saved as DOUBLETICK_WEBHOOK_SECRET" }]}
        />

        <IntegrationCard
          name="Facebook Lead Ads"
          icon={<Facebook className="size-5" />}
          color="from-blue-500 to-indigo-600"
          webhookUrl={facebookUrl}
          stats={stats["Facebook Lead Ads"]}
          onCopy={copy}
          instructions={[
            "Go to developers.facebook.com → Your App → Webhooks → Page",
            "Callback URL: paste the webhook URL above",
            "Verify Token: paste the value of FACEBOOK_VERIFY_TOKEN (saved secret)",
            "Subscribe to 'leadgen' field on your Page",
            "App Secret used to validate signatures: FACEBOOK_APP_SECRET (saved)",
          ]}
          configFields={[
            { label: "Verify Token", value: "Saved as FACEBOOK_VERIFY_TOKEN" },
            { label: "App Secret", value: "Saved as FACEBOOK_APP_SECRET" },
          ]}
        />
      </div>

      <Card className="mt-6 p-6 shadow-card">
        <h2 className="font-display text-lg font-semibold mb-1">How it works</h2>
        <p className="text-sm text-muted-foreground">
          Both endpoints verify incoming requests with cryptographic signatures, deduplicate by phone number,
          and create leads tagged with the correct source. Failed/invalid requests are rejected before touching the database.
        </p>
      </Card>
    </div>
  );
}

function IntegrationCard({
  name, icon, color, webhookUrl, stats, instructions, configFields, onCopy,
}: {
  name: string;
  icon: React.ReactNode;
  color: string;
  webhookUrl: string;
  stats?: IntegrationStats;
  instructions: string[];
  configFields: { label: string; value: string }[];
  onCopy: (text: string, label: string) => void;
}) {
  const connected = (stats?.total ?? 0) > 0;
  return (
    <Card className="p-6 shadow-card flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`size-10 rounded-lg bg-gradient-to-br ${color} text-white flex items-center justify-center`}>
            {icon}
          </div>
          <div>
            <h3 className="font-display font-semibold">{name}</h3>
            <p className="text-xs text-muted-foreground">
              Auto lead source tag: <span className="font-medium">{name}</span>
            </p>
          </div>
        </div>
        {connected ? (
          <Badge className="bg-emerald-500/15 text-emerald-700 border-0 gap-1">
            <CheckCircle2 className="size-3" /> Active
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1"><AlertCircle className="size-3" /> Waiting for first lead</Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/50 p-2">
          <div className="text-lg font-semibold">{stats?.total ?? 0}</div>
          <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Total</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <div className="text-lg font-semibold">{stats?.today ?? 0}</div>
          <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Today</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <div className="text-xs font-semibold">
            {stats?.lastSync ? format(new Date(stats.lastSync), "dd MMM HH:mm") : "—"}
          </div>
          <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Last sync</div>
        </div>
      </div>

      <div>
        <Label className="text-xs">Webhook URL</Label>
        <div className="flex gap-2 mt-1">
          <Input value={webhookUrl} readOnly className="font-mono text-xs" />
          <Button size="icon" variant="outline" onClick={() => onCopy(webhookUrl, "Webhook URL")}>
            <Copy className="size-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {configFields.map((f) => (
          <div key={f.label} className="text-xs flex justify-between border-b border-border/50 py-1.5">
            <span className="text-muted-foreground">{f.label}</span>
            <span className="font-medium">{f.value}</span>
          </div>
        ))}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Setup instructions</summary>
        <ol className="list-decimal pl-5 mt-2 space-y-1 text-xs text-muted-foreground">
          {instructions.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </details>
    </Card>
  );
}
