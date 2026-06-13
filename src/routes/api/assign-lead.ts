import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/assign-lead")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const { leadId, assignedTo } = await request.json() as { leadId: string; assignedTo: string | null };
          if (!leadId) return new Response("leadId required", { status: 400 });

          const { error } = await supabaseAdmin
            .from("leads")
            .update({ assigned_to: assignedTo } as never)
            .eq("id", leadId);

          if (error) return new Response(error.message, { status: 500 });
          return Response.json({ ok: true });
        } catch (e) {
          return new Response("Server error", { status: 500 });
        }
      },
    },
  },
});
