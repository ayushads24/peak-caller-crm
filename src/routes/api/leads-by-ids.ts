import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FIELDS = "id, client_name, phone, email, status_id, sales_value, lead_source, created_at, assigned_to, created_by, doubletick_contact_id";

export const Route = createFileRoute("/api/leads-by-ids")({
  server: {
    handlers: {
      GET: async ({ request }) => {

        const url = new URL(request.url);
        const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
        if (!ids.length) return Response.json([]);

        const { data, error } = await supabaseAdmin
          .from("leads")
          .select(FIELDS)
          .in("id", ids);

        if (error) return new Response(error.message, { status: 500 });
        return Response.json(data ?? []);
      },
    },
  },
});
