import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/all-activities")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const from   = url.searchParams.get("from");
        const to     = url.searchParams.get("to");
        const userIds = url.searchParams.get("user_ids")?.split(",").filter(Boolean) ?? []; // comma-separated, optional

        if (!from || !to) return new Response("from and to required", { status: 400 });

        const limit  = parseInt(url.searchParams.get("limit")  ?? "50");
        const offset = parseInt(url.searchParams.get("offset") ?? "0");

        let q = supabaseAdmin
          .from("activities")
          .select("id, lead_id, description, type, created_by, created_at")
          .gte("created_at", from)
          .lte("created_at", to)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (userIds.length === 1) q = q.eq("created_by", userIds[0]);
        else if (userIds.length > 1) q = q.in("created_by", userIds);

        const { data, error } = await q;
        if (error) return new Response(error.message, { status: 500 });

        const rows = data ?? [];

        // Resolve lead names and creator names
        const leadIds    = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))] as string[];
        const creatorIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[];

        const [leadsRes, profilesRes] = await Promise.all([
          leadIds.length
            ? supabaseAdmin.from("leads").select("id, client_name").in("id", leadIds)
            : Promise.resolve({ data: [] }),
          creatorIds.length
            ? supabaseAdmin.from("profiles").select("id, full_name").in("id", creatorIds)
            : Promise.resolve({ data: [] }),
        ]);

        const leadMap    = new Map((leadsRes.data ?? []).map((l) => [l.id, l.client_name]));
        const profileMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name]));

        const items = rows.map((r) => ({
          id:           r.id,
          type:         r.type,
          description:  r.description,
          created_at:   r.created_at,
          created_by:   r.created_by,
          creator_name: r.created_by ? (profileMap.get(r.created_by) ?? null) : null,
          lead_id:      r.lead_id,
          lead_name:    r.lead_id ? (leadMap.get(r.lead_id) ?? null) : null,
        }));

        return Response.json({ items, hasMore: items.length === limit });
      },
    },
  },
});
