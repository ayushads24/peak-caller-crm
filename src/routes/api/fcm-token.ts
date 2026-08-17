import { createFileRoute } from "@tanstack/react-router";
import { saveFcmToken } from "@/lib/push.server";

export const Route = createFileRoute("/api/fcm-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { userId, token } = await request.json() as { userId: string; token: string };
        if (!userId || !token) return new Response("userId and token required", { status: 400 });
        await saveFcmToken(userId, token);
        return Response.json({ ok: true });
      },
    },
  },
});
