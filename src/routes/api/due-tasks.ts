import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/due-tasks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const userId = url.searchParams.get("user_id");
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        if (!userId || !from || !to) return new Response("user_id, from, to required", { status: 400 });

        // Alarm only for: tasks assigned to user, OR unassigned tasks created by user
        const { data: tasks } = await supabaseAdmin
          .from("tasks")
          .select("id, title, lead_id, due_date, leads(id, client_name)")
          .or(`assigned_to.eq.${userId},and(assigned_to.is.null,created_by.eq.${userId})`)
          .in("status", ["pending", "in_progress"])
          .gte("due_date", from)
          .lte("due_date", to);

        return Response.json(
          (tasks ?? []).map((t) => ({
            id: t.id,
            title: t.title,
            lead_id: t.lead_id,
            leadName: (t.leads as { client_name: string } | null)?.client_name ?? "Lead",
            due_date: t.due_date,
          }))
        );
      },
    },
  },
});
