import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/webhook/doubletick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.DOUBLETICK_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook secret not configured", { status: 500 });

        const body = await request.text();
        const signature = request.headers.get("x-doubletick-signature") || request.headers.get("x-signature") || "";
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const ok = signature && signature.length === expected.length &&
          timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
        if (!ok) return new Response("Invalid signature", { status: 401 });

        let payload: Record<string, unknown>;
        try { payload = JSON.parse(body); } catch { return new Response("Bad JSON", { status: 400 }); }

        // DoubleTick payload shape (typical): { contact: { name, phone }, message: { text }, ... }
        const contact = (payload.contact ?? payload) as Record<string, unknown>;
        const name = String(contact.name ?? contact.full_name ?? contact.display_name ?? "WhatsApp Lead").trim();
        const phoneRaw = String(contact.phone ?? contact.wa_id ?? contact.mobile ?? "").trim();
        const phone = phoneRaw.replace(/\D/g, "");
        if (!phone) return new Response("Missing phone", { status: 400 });

        const msg = (payload.message ?? {}) as Record<string, unknown>;
        const messageText = typeof msg.text === "string" ? msg.text : (typeof payload.message === "string" ? payload.message : "");

        // Skip duplicate by phone
        const { data: existing } = await supabaseAdmin
          .from("leads").select("id").eq("phone", phoneRaw).limit(1).maybeSingle();
        if (existing) return Response.json({ ok: true, skipped: "duplicate", lead_id: existing.id });

        const { data: lead, error } = await supabaseAdmin
          .from("leads")
          .insert({ client_name: name, phone: phoneRaw, lead_source: "DoubleTick WhatsApp" })
          .select("id").single();
        if (error) return new Response(`DB error: ${error.message}`, { status: 500 });

        if (messageText && lead) {
          await supabaseAdmin.from("notes").insert({ lead_id: lead.id, content: `WhatsApp: ${messageText}` });
        }
        return Response.json({ ok: true, lead_id: lead?.id });
      },
    },
  },
});
