import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPush } from "@/lib/push.server";
export const Route = createFileRoute("/api/assign-lead")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const { leadId, assignedTo } = await request.json() as { leadId: string; assignedTo: string | null };
          if (!leadId) return new Response("leadId required", { status: 400 });

          // Fetch lead name before updating
          const { data: lead } = await supabaseAdmin
            .from("leads")
            .select("client_name, assigned_to")
            .eq("id", leadId)
            .maybeSingle();

          const { error } = await supabaseAdmin
            .from("leads")
            .update({ assigned_to: assignedTo } as never)
            .eq("id", leadId);

          if (error) return new Response(error.message, { status: 500 });

          // Send push if new assignee is a PM and is different from old assignee
          if (assignedTo && lead && assignedTo !== lead.assigned_to) {
            const { data: role } = await supabaseAdmin
              .from("user_roles")
              .select("role")
              .eq("user_id", assignedTo)
              .maybeSingle();
            if (role?.role === "project_manager") {
              void sendPush(assignedTo, {
                title: "New Lead Assigned",
                body: lead.client_name ?? "A lead has been assigned to you",
                tag: `lead-assign-${leadId}`,
              });
            }
          }

          return Response.json({ ok: true });
        } catch {
          return new Response("Server error", { status: 500 });
        }
      },
    },
  },
});
