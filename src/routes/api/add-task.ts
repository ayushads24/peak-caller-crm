import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPush } from "@/lib/push.server";

export const Route = createFileRoute("/api/add-task")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json() as {
          lead_id: string; title: string; created_by: string;
          due_date?: string | null; assigned_to?: string | null;
        };
        if (!body.lead_id || !body.title) return new Response("lead_id and title required", { status: 400 });

        const { error } = await supabaseAdmin.from("tasks").insert({
          lead_id: body.lead_id,
          title: body.title,
          created_by: body.created_by,
          status: "pending",
          due_date: body.due_date ?? null,
          assigned_to: body.assigned_to ?? null,
        });
        if (error) return new Response(error.message, { status: 500 });

        // Push to PM if lead is assigned to a PM (and task not created by them)
        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("client_name, assigned_to")
          .eq("id", body.lead_id)
          .maybeSingle();

        if (lead?.assigned_to && lead.assigned_to !== body.created_by) {
          const { data: role } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", lead.assigned_to)
            .maybeSingle();
          if (role?.role === "project_manager") {
            void sendPush(lead.assigned_to, {
              title: `New Task: ${body.title}`,
              body: lead.client_name ?? "",
              tag: `task-new-${body.lead_id}`,
            });
          }
        }

        // Push to the PM themselves if they created it with a due_date (self-reminder)
        if (body.due_date && lead?.assigned_to === body.created_by) {
          const { data: role } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", body.created_by)
            .maybeSingle();
          if (role?.role === "project_manager") {
            // Immediate confirmation push — actual due-time push is handled by cron
            // (no immediate push needed here, cron will fire at due_date)
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
