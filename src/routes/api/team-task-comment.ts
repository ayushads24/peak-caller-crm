import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestUser } from "@/lib/server-auth";

export const Route = createFileRoute("/api/team-task-comment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await getRequestUser(request);
        if (!caller) return new Response("Unauthorized", { status: 401 });

        const body = await request.json() as { task_id: string; content: string };
        if (!body.task_id || !body.content?.trim())
          return new Response("task_id and content required", { status: 400 });

        const { data: comment, error } = await supabaseAdmin
          .from("team_task_comments")
          .insert({ task_id: body.task_id, user_id: caller.id, content: body.content.trim() })
          .select()
          .single();
        if (error) return new Response(error.message, { status: 500 });

        return Response.json({ comment });
      },

      GET: async ({ request }) => {
        const caller = await getRequestUser(request);
        if (!caller) return new Response("Unauthorized", { status: 401 });

        const url = new URL(request.url);
        const taskId = url.searchParams.get("task_id");
        if (!taskId) return new Response("task_id required", { status: 400 });

        const { data: comments, error } = await supabaseAdmin
          .from("team_task_comments")
          .select("id,task_id,user_id,content,created_at")
          .eq("task_id", taskId)
          .order("created_at", { ascending: true });
        if (error) return new Response(error.message, { status: 500 });

        const rows = comments ?? [];
        const profileIds = Array.from(new Set(rows.map((r) => r.user_id)));
        const { data: profiles } = profileIds.length
          ? await supabaseAdmin.from("profiles").select("id,full_name,email").in("id", profileIds)
          : { data: [] };

        return Response.json({ comments: rows, profiles: profiles ?? [] });
      },
    },
  },
});
