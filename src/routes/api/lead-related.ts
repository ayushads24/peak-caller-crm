import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/lead-related")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const leadId = url.searchParams.get("lead_id");
        if (!leadId) return new Response("lead_id required", { status: 400 });

        const [leadRes, n, t, a, ll] = await Promise.all([
          supabaseAdmin
            .from("leads")
            .select("id, client_name, email, phone, sales_value, lead_source, status_id, created_at, assigned_to, created_by")
            .eq("id", leadId)
            .maybeSingle(),
          supabaseAdmin
            .from("notes")
            .select("id, content, created_at, created_by")
            .eq("lead_id", leadId)
            .order("created_at", { ascending: false }),
          supabaseAdmin
            .from("tasks")
            .select("id, title, status, due_date, assigned_to, created_at")
            .eq("lead_id", leadId)
            .order("created_at", { ascending: false }),
          supabaseAdmin
            .from("activities")
            .select("id, description, created_at, type, created_by")
            .eq("lead_id", leadId)
            .order("created_at", { ascending: false }),
          supabaseAdmin
            .from("lead_labels")
            .select("label_id")
            .eq("lead_id", leadId),
        ]);

        const creatorIds = [
          ...new Set([
            ...(n.data ?? []).map((r) => r.created_by),
            ...(a.data ?? []).map((r) => r.created_by),
          ].filter(Boolean)),
        ] as string[];
        let profileMap: Record<string, string> = {};
        if (creatorIds.length > 0) {
          const { data: profiles } = await supabaseAdmin
            .from("profiles")
            .select("id, full_name")
            .in("id", creatorIds);
          profileMap = Object.fromEntries(
            (profiles ?? []).map((p) => [p.id, p.full_name])
          );
        }

        const notes = (n.data ?? []).map((r) => ({
          ...r,
          author: r.created_by ? (profileMap[r.created_by] ?? null) : null,
        }));

        const activities = (a.data ?? []).map((r) => ({
          ...r,
          author: r.created_by ? (profileMap[r.created_by] ?? null) : null,
        }));

        return Response.json({
          lead: leadRes.data ?? null,
          notes,
          tasks: t.data ?? [],
          activities,
          leadLabelIds: (ll.data ?? []).map((r) => r.label_id),
        });
      },
    },
  },
});
