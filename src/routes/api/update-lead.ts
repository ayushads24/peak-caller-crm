import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/update-lead")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const body = await request.json() as {
            leadId: string;
            userId?: string;
            fields?: Record<string, unknown>;
            labelAction?: { action: "add" | "remove"; labelId: string };
            labelsToAdd?: string[];
          };
          const { leadId, userId, fields, labelAction, labelsToAdd } = body;
          if (!leadId) return new Response("leadId required", { status: 400 });

          if (fields && Object.keys(fields).length > 0) {
            const { error } = await supabaseAdmin
              .from("leads")
              .update(fields as never)
              .eq("id", leadId);
            if (error) return new Response(error.message, { status: 500 });

            // The DB trigger logs status_changed with created_by = NULL (service role has no auth.uid()).
            // Fix it immediately after the update if we know who changed it.
            if (userId && "status_id" in fields) {
              const { data: nullAct } = await supabaseAdmin
                .from("activities")
                .select("id")
                .eq("lead_id", leadId)
                .eq("type", "status_changed")
                .is("created_by", null)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (nullAct?.id) {
                await supabaseAdmin.from("activities").update({ created_by: userId }).eq("id", nullAct.id);
              }
            }
          }

          if (labelsToAdd && labelsToAdd.length > 0) {
            const rows = labelsToAdd.map((lid) => ({ lead_id: leadId, label_id: lid }));
            const { error } = await supabaseAdmin
              .from("lead_labels")
              .upsert(rows as never, { onConflict: "lead_id,label_id", ignoreDuplicates: true } as never);
            if (error) return new Response(error.message, { status: 500 });
          }

          if (labelAction) {
            if (labelAction.action === "add") {
              const { error } = await supabaseAdmin
                .from("lead_labels")
                .insert({ lead_id: leadId, label_id: labelAction.labelId } as never);
              if (error && error.code !== "23505") // ignore duplicate
                return new Response(error.message, { status: 500 });
            } else {
              const { error } = await supabaseAdmin
                .from("lead_labels")
                .delete()
                .eq("lead_id", leadId)
                .eq("label_id", labelAction.labelId);
              if (error) return new Response(error.message, { status: 500 });
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
