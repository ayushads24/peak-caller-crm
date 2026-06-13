import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/all-leads")({
  server: {
    handlers: {
      GET: async () => {
        const { data, error } = await supabaseAdmin
          .from("leads")
          .select("id, client_name, email, phone, sales_value, lead_source, status_id, created_at, assigned_to, created_by, doubletick_contact_id")
          .order("created_at", { ascending: false })
          .limit(10000);
        if (error) return new Response(error.message, { status: 500 });
        return Response.json(data ?? []);
      },
    },
  },
});
