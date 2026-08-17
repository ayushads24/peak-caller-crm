import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestUser } from "@/lib/server-auth";

export const Route = createFileRoute("/api/team-task-update")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await getRequestUser(request);
        if (!caller) return new Response("Unauthorized", { status: 401 });

        const body = await request.json() as {
          id: string;
          status?: string;
          priority?: string;
          due_date?: string | null;
          description?: string | null;
          assigned_to?: string;
          title?: string;
          // for submitting or marking done — adds a comment automatically
          comment?: string;
        };
        if (!body.id) return new Response("id required", { status: 400 });

        // Enforce status transition rules server-side
        if (body.status) {
          const { data: task } = await supabaseAdmin
            .from("team_tasks")
            .select("created_by,assigned_to,status")
            .eq("id", body.id)
            .maybeSingle();

          if (!task) return new Response("Task not found", { status: 404 });

          const isCreator  = task.created_by  === caller.id;
          const isAssignee = task.assigned_to === caller.id;

          if (body.status === "in_progress" && task.status === "pending" && !isAssignee)
            return new Response("Only the assignee can start this task", { status: 403 });
          if (body.status === "submitted" && task.status === "in_progress" && !isAssignee)
            return new Response("Only the assignee can submit this task", { status: 403 });
          if (body.status === "done" && task.status === "submitted" && !isCreator)
            return new Response("Only the creator can mark this task as done", { status: 403 });
        }

        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.status !== undefined) update.status = body.status;
        if (body.priority !== undefined) update.priority = body.priority;
        if (body.due_date !== undefined) update.due_date = body.due_date;
        if (body.description !== undefined) update.description = body.description;
        if (body.assigned_to !== undefined) update.assigned_to = body.assigned_to;
        if (body.title !== undefined) update.title = body.title;

        if (body.status === "done") {
          update.reviewed_by = caller.id;
          update.reviewed_at = new Date().toISOString();
        }

        const { error } = await supabaseAdmin
          .from("team_tasks")
          .update(update)
          .eq("id", body.id);
        if (error) return new Response(error.message, { status: 500 });

        // Auto-insert comment when submitting or marking done
        if (body.comment?.trim()) {
          await supabaseAdmin.from("team_task_comments").insert({
            task_id: body.id,
            user_id: caller.id,
            content: body.comment.trim(),
          });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
