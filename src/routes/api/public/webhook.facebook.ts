import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitizePhone } from "@/lib/utils";

export const Route = createFileRoute("/api/public/webhook/facebook")({
  server: {
    handlers: {
      // Facebook verification handshake
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.FACEBOOK_VERIFY_TOKEN;
        const tokenMatch =
          !!token &&
          !!expected &&
          token.length === expected.length &&
          timingSafeEqual(Buffer.from(token), Buffer.from(expected));
        if (mode === "subscribe" && tokenMatch) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const appSecret = process.env.FACEBOOK_APP_SECRET;
        if (!appSecret) return new Response("App secret not configured", { status: 500 });

        const body = await request.text();
        const sigHeader = request.headers.get("x-hub-signature-256") || "";
        const expected = "sha256=" + createHmac("sha256", appSecret).update(body).digest("hex");
        const ok = sigHeader.length === expected.length &&
          timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected));
        if (!ok) return new Response("Invalid signature", { status: 401 });

        let payload: { entry?: Array<{ changes?: Array<{ value?: Record<string, unknown> }> }> };
        try { payload = JSON.parse(body); } catch { return new Response("Bad JSON", { status: 400 }); }

        let created = 0;
        for (const entry of payload.entry ?? []) {
          for (const change of entry.changes ?? []) {
            const v = change.value ?? {};
            const leadgenId = String(v.leadgen_id ?? "");
            const fieldData = (v.field_data as Array<{ name: string; values: string[] }> | undefined) ?? [];
            const fields: Record<string, string> = {};
            for (const f of fieldData) fields[f.name.toLowerCase()] = (f.values?.[0] ?? "");

            const name = fields["full_name"] || fields["name"] || `FB Lead ${leadgenId || ""}`.trim();
            const phoneRaw = fields["phone_number"] || fields["phone"] || "";
            const email = fields["email"] || null;
            const phone = sanitizePhone(phoneRaw);
            if (!phone && !email) continue;

            if (phone) {
              const { data: dup } = await supabaseAdmin
                .from("leads").select("id").eq("phone", phone).limit(1).maybeSingle();
              if (dup) continue;
            }
            const { error } = await supabaseAdmin.from("leads").insert({
              client_name: name,
              phone: phone || null,
              email,
              lead_source: "Facebook Lead Ads",
            });
            if (!error) created++;
          }
        }
        return Response.json({ ok: true, created });
      },
    },
  },
});
