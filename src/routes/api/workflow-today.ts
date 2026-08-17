import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const LEAD_FIELDS = "id, client_name, phone, email, status_id, sales_value, lead_source, created_at, assigned_to, created_by, doubletick_contact_id";

export const Route = createFileRoute("/api/workflow-today")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const userId = url.searchParams.get("user_id");
        const date = url.searchParams.get("date");
        if (!userId || !date) return new Response("user_id and date required", { status: 400 });

        const { data: flows } = await supabaseAdmin
          .from("calling_flows")
          .select("id, status")
          .eq("user_id", userId)
          .eq("work_date", date)
          .neq("status", "completed")
          .order("created_at", { ascending: false });

        const flow = flows?.[0] ?? null;
        if (!flow) return Response.json({ flow: null, items: [], leads: [] });

        const { data: items } = await supabaseAdmin
          .from("calling_flow_items")
          .select("id, lead_id, category, priority, attempts_planned, attempts_done, status, retry_at, retry_count")
          .eq("flow_id", flow.id)
          .order("priority");

        const ids = (items ?? []).map((i) => i.lead_id);
        let leads: unknown[] = [];
        if (ids.length) {
          const { data } = await supabaseAdmin.from("leads").select(LEAD_FIELDS).in("id", ids);
          leads = data ?? [];
        }

        return Response.json({ flow, items: items ?? [], leads });
      },
    },
  },
});
