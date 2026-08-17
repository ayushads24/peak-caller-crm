import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestUser } from "@/lib/server-auth";

export const Route = createFileRoute("/api/team-tasks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await getRequestUser(request);
        if (!caller) return new Response("Unauthorized", { status: 401 });

        const { data: roleRow } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", caller.id)
          .maybeSingle();
        const isAdmin = roleRow?.role === "admin" || roleRow?.role === "team_leader";

        let query = supabaseAdmin
          .from("team_tasks")
          .select("id,title,description,lead_id,created_by,assigned_to,status,priority,due_date,reviewed_by,reviewed_at,created_at,updated_at")
          .order("created_at", { ascending: false })
          .limit(500);

        if (!isAdmin) {
          query = query.or(`created_by.eq.${caller.id},assigned_to.eq.${caller.id}`);
        }

        const { data: tasks, error } = await query;
        if (error) return new Response(error.message, { status: 500 });

        const rows = tasks ?? [];

        const profileIds = Array.from(
          new Set(rows.flatMap((r) => [r.created_by, r.assigned_to, r.reviewed_by]).filter(Boolean) as string[])
        );
        const leadIds = Array.from(new Set(rows.map((r) => r.lead_id).filter(Boolean) as string[]));

        const [profsRes, leadsRes] = await Promise.all([
          profileIds.length
            ? supabaseAdmin.from("profiles").select("id,full_name,email").in("id", profileIds)
            : Promise.resolve({ data: [] }),
          leadIds.length
            ? supabaseAdmin.from("leads").select("id,client_name,phone").in("id", leadIds)
            : Promise.resolve({ data: [] }),
        ]);

        return Response.json({
          tasks: rows,
          profiles: profsRes.data ?? [],
          leads: leadsRes.data ?? [],
        });
      },

      POST: async ({ request }) => {
        const caller = await getRequestUser(request);
        if (!caller) return new Response("Unauthorized", { status: 401 });

        const body = await request.json() as {
          title: string;
          description?: string;
          assigned_to: string;
          lead_id?: string | null;
          due_date?: string | null;
          priority?: string;
        };
        if (!body.title?.trim()) return new Response("title required", { status: 400 });
        if (!body.assigned_to) return new Response("assigned_to required", { status: 400 });

        const { data: task, error } = await supabaseAdmin
          .from("team_tasks")
          .insert({
            title: body.title.trim(),
            description: body.description?.trim() || null,
            assigned_to: body.assigned_to,
            lead_id: body.lead_id || null,
            due_date: body.due_date || null,
            priority: body.priority ?? "medium",
            created_by: caller.id,
            status: "pending",
          })
          .select()
          .single();

        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ task });
      },

      DELETE: async ({ request }) => {
        const caller = await getRequestUser(request);
        if (!caller) return new Response("Unauthorized", { status: 401 });

        const { id } = await request.json() as { id: string };
        if (!id) return new Response("id required", { status: 400 });

        // Verify ownership before delete
        const { data: task } = await supabaseAdmin
          .from("team_tasks")
          .select("created_by")
          .eq("id", id)
          .maybeSingle();

        if (!task) return new Response("Task not found", { status: 404 });
        if (task.created_by !== caller.id) return new Response("Only the creator can delete this task", { status: 403 });

        const { error } = await supabaseAdmin.from("team_tasks").delete().eq("id", id);
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
