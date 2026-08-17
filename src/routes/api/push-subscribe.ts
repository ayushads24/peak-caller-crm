import { createFileRoute } from "@tanstack/react-router";
import { saveSubscription, deleteSubscription } from "@/lib/push.server";

export const Route = createFileRoute("/api/push-subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { userId, subscription } = await request.json() as { userId: string; subscription: PushSubscriptionJSON };
        if (!userId || !subscription) return new Response("userId and subscription required", { status: 400 });
        await saveSubscription(userId, subscription);
        return Response.json({ ok: true });
      },
      DELETE: async ({ request }) => {
        const { userId } = await request.json() as { userId: string };
        if (!userId) return new Response("userId required", { status: 400 });
        await deleteSubscription(userId);
        return Response.json({ ok: true });
      },
    },
  },
});
