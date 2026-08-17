import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/leaderboard-calls")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const rawIds = url.searchParams.get("user_ids") ?? url.searchParams.get("user_id");
        const userIds = rawIds ? rawIds.split(",").filter(Boolean) : [];

        if (!from || !to) return new Response("from and to required", { status: 400 });

        let q = supabaseAdmin
          .from("calls")
          .select("user_id, status, duration_seconds, called_at")
          .gte("called_at", from)
          .lte("called_at", to);

        if (userIds.length === 1) q = q.eq("user_id", userIds[0]);
        else if (userIds.length > 1) q = q.in("user_id", userIds);

        const { data, error } = await q;
        if (error) return new Response(error.message, { status: 500 });
        return Response.json(data ?? []);
      },
    },
  },
});
