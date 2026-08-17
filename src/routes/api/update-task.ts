import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/update-task")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json() as {
          id: string;
          status?: string;
          completed_at?: string | null;
          due_date?: string | null;
          priority?: string;
        };
        if (!body.id) return new Response("id required", { status: 400 });

        const update: Record<string, unknown> = {};
        if (body.status !== undefined) update.status = body.status;
        if (body.completed_at !== undefined) update.completed_at = body.completed_at;
        if (body.due_date !== undefined) update.due_date = body.due_date;
        if (body.priority !== undefined) update.priority = body.priority;

        const { error } = await supabaseAdmin.from("tasks").update(update).eq("id", body.id);
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
