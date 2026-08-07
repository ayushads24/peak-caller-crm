import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestUser } from "@/lib/server-auth";

export const Route = createFileRoute("/api/tasks-by-user")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const caller = await getRequestUser(request);
        if (!caller) return new Response("Unauthorized", { status: 401 });

        const { data: roleRow } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", caller.id)
          .maybeSingle();
        const role = roleRow?.role ?? "caller";
        const canViewTeam = role === "admin" || role === "team_leader";

        const url = new URL(request.url);
        const rawIds = url.searchParams.get("user_ids") ?? url.searchParams.get("user_id");

        // Non-privileged users can only see their own tasks regardless of query param
        let userIds: string[];
        if (!canViewTeam) {
          userIds = [caller.id];
        } else {
          if (!rawIds) return new Response("user_id or user_ids required", { status: 400 });
          userIds = rawIds.split(",").filter(Boolean);
        }

        const orFilter = userIds
          .map((id) => `assigned_to.eq.${id},and(assigned_to.is.null,created_by.eq.${id})`)
          .join(",");

        const { data: tasks, error } = await supabaseAdmin
          .from("tasks")
          .select("id, title, description, due_date, status, priority, completed_at, created_at, created_by, assigned_to, lead_id")
          .or(orFilter)
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(500);

        if (error) return new Response(error.message, { status: 500 });

        const rows = tasks ?? [];
        const leadIds    = Array.from(new Set(rows.map((r) => r.lead_id)));
        const profileIds = Array.from(
          new Set(rows.flatMap((r) => [r.assigned_to, r.created_by]).filter(Boolean) as string[])
        );

        const [ldsRes, profsRes] = await Promise.all([
          leadIds.length
            ? supabaseAdmin.from("leads").select("id, client_name, phone, status_id, doubletick_contact_id").in("id", leadIds)
            : Promise.resolve({ data: [] }),
          profileIds.length
            ? supabaseAdmin.from("profiles").select("id, full_name").in("id", profileIds)
            : Promise.resolve({ data: [] }),
        ]);

        return Response.json({
          tasks: rows,
          leads: ldsRes.data ?? [],
          profiles: profsRes.data ?? [],
        });
      },
    },
  },
});
