import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/log-call")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json();
        const { lead_id, user_id, status, duration_seconds, notes } = body;
        if (!lead_id || !user_id) return new Response("lead_id and user_id required", { status: 400 });
        const { error } = await supabaseAdmin.from("calls").insert({
          lead_id,
          user_id,
          status: status ?? "not_connected",
          duration_seconds: duration_seconds ?? 0,
          notes: notes ?? null,
        });
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
