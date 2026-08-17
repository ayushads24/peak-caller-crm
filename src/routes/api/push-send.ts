import { createFileRoute } from "@tanstack/react-router";
import { sendPush } from "@/lib/push.server";

// Internal route — called by assign-lead, add-task, etc.
export const Route = createFileRoute("/api/push-send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { userId, title, body, tag } = await request.json() as {
          userId: string; title: string; body: string; tag?: string;
        };
        if (!userId || !title) return new Response("userId and title required", { status: 400 });
        await sendPush(userId, { title, body, tag });
        return Response.json({ ok: true });
      },
    },
  },
});
