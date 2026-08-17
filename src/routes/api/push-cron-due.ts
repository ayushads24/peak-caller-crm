import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPush } from "@/lib/push.server";

// Called by Vercel Cron every minute
export const Route = createFileRoute("/api/push-cron-due")({
  server: {
    handlers: {
      GET: async () => {
        const now = new Date();
        // 10-min window: GitHub Actions free cron can drift up to ~5 min, buffer for reliability
        const windowStart = new Date(now.getTime() - 10 * 60 * 1000);

        // Tasks due in the last 10 minutes (pending), with their assigned user
        const [{ data: tasks }, { data: teamTasks }] = await Promise.all([
          supabaseAdmin
            .from("tasks")
            .select("id, title, lead_id, due_date, assigned_to, created_by")
            .eq("status", "pending")
            .gte("due_date", windowStart.toISOString())
            .lte("due_date", now.toISOString()),
          supabaseAdmin
            .from("team_tasks")
            .select("id, title, due_date, assigned_to, created_by")
            .in("status", ["pending", "in_progress"])
            .gte("due_date", windowStart.toISOString())
            .lte("due_date", now.toISOString()),
        ]);

        if (!tasks?.length && !teamTasks?.length) return Response.json({ ok: true, sent: 0 });

        // Fetch lead names for context
        const leadIds = [...new Set((tasks ?? []).map((t) => t.lead_id).filter(Boolean))];
        const { data: leads } = leadIds.length
          ? await supabaseAdmin.from("leads").select("id, client_name").in("id", leadIds)
          : { data: [] };
        const leadMap = Object.fromEntries((leads ?? []).map((l) => [l.id, l.client_name]));

        let sent = 0;
        await Promise.all([
          ...(tasks ?? []).map(async (task) => {
            const leadName = leadMap[task.lead_id] ?? "Lead";
            const recipients = [...new Set([task.assigned_to, task.created_by].filter(Boolean) as string[])];
            await Promise.all(
              recipients.map((userId) =>
                sendPush(userId, {
                  title: `Task Due: ${task.title}`,
                  body: leadName,
                  tag: `due-task-${task.id}-${userId}`,
                })
              )
            );
            sent += recipients.length;
          }),
          ...(teamTasks ?? []).map(async (task) => {
            const recipients = [...new Set([task.assigned_to, task.created_by].filter(Boolean) as string[])];
            await Promise.all(
              recipients.map((userId) =>
                sendPush(userId, {
                  title: `Team Task Due: ${task.title}`,
                  body: "Due now",
                  tag: `due-team-task-${task.id}-${userId}`,
                })
              )
            );
            sent += recipients.length;
          }),
        ]);

        return Response.json({ ok: true, sent });
      },
    },
  },
});
