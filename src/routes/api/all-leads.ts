import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FIELDS = "id, client_name, email, phone, sales_value, lead_source, status_id, created_at, assigned_to, created_by, doubletick_contact_id";
const BATCH = 1000;

export const Route = createFileRoute("/api/all-leads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");

        // Fire all three queries in parallel
        let firstBatch = supabaseAdmin
          .from("leads")
          .select(FIELDS)
          .order("created_at", { ascending: false })
          .range(0, BATCH - 1);
        if (from) firstBatch = firstBatch.gte("created_at", from);
        if (to) firstBatch = firstBatch.lte("created_at", to);

        const [leadsRes, leadLabelsRes, pendingTasksRes] = await Promise.all([
          firstBatch,
          supabaseAdmin.from("lead_labels").select("lead_id, label_id"),
          supabaseAdmin.from("tasks").select("lead_id, due_date").neq("status", "completed"),
        ]);

        if (leadsRes.error) return new Response(leadsRes.error.message, { status: 500 });

        const all: unknown[] = [...(leadsRes.data ?? [])];

        // Fetch remaining batches only if first batch was full (> 1000 leads)
        if (leadsRes.data && leadsRes.data.length === BATCH) {
          let offset = BATCH;
          while (true) {
            let query = supabaseAdmin
              .from("leads")
              .select(FIELDS)
              .order("created_at", { ascending: false })
              .range(offset, offset + BATCH - 1);
            if (from) query = query.gte("created_at", from);
            if (to) query = query.lte("created_at", to);
            const { data, error } = await query;
            if (error) return new Response(error.message, { status: 500 });
            all.push(...(data ?? []));
            if (!data || data.length < BATCH) break;
            offset += BATCH;
          }
        }

        return Response.json({
          leads: all,
          leadLabels: leadLabelsRes.data ?? [],
          pendingTasks: pendingTasksRes.data ?? [],
        });
      },
    },
  },
});
