import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitizePhone } from "@/lib/utils";
import { autoAssignNewLead } from "@/lib/lead-distribution.functions";

const LOG_BUCKET = "webhook-logs";

async function saveLog(key: string, data: unknown) {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    await supabaseAdmin.storage.createBucket(LOG_BUCKET, { public: false }).catch(() => {});
    await supabaseAdmin.storage.from(LOG_BUCKET).upload(key, bytes, {
      contentType: "application/json",
      upsert: true,
    });
  } catch { /* never crash */ }
}

// Facebook does NOT send field_data in the webhook — must fetch from Graph API
async function fetchLeadFields(leadgenId: string): Promise<Record<string, string>> {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error("FB_PAGE_ACCESS_TOKEN not set");
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${leadgenId}?fields=field_data&access_token=${encodeURIComponent(token)}`
  );
  if (!res.ok) throw new Error(`Graph API ${res.status}: ${await res.text()}`);
  const data = await res.json() as { field_data?: Array<{ name: string; values: string[] }> };
  const fields: Record<string, string> = {};
  for (const f of data.field_data ?? []) {
    fields[f.name.toLowerCase()] = f.values?.[0] ?? "";
  }
  return fields;
}

async function processLeadgen(leadgenId: string): Promise<{ ok: boolean; reason?: string; skipped?: string; lead_id?: string }> {
  const fields = await fetchLeadFields(leadgenId);

  const firstName = fields["first_name"] ?? "";
  const lastName = fields["last_name"] ?? "";
  const name = fields["full_name"] || fields["name"] ||
    [firstName, lastName].filter(Boolean).join(" ") ||
    "Facebook Lead";

  const phone = sanitizePhone(fields["phone_number"] ?? fields["phone"] ?? "");
  const email = fields["email"] || null;

  if (!phone && !email) return { ok: false, reason: "no phone or email in form" };

  if (phone) {
    const { data: dup } = await supabaseAdmin
      .from("leads").select("id").eq("phone", phone).limit(1).maybeSingle();
    if (dup) return { ok: true, skipped: "duplicate", lead_id: dup.id };
  }

  const { data: newLead, error } = await supabaseAdmin.from("leads").insert({
    client_name: name,
    phone: phone || null,
    email,
    lead_source: "Facebook Lead Ads",
  }).select("id").single();

  if (error) throw new Error(`DB error: ${error.message}`);

  if (newLead?.id) {
    await autoAssignNewLead(newLead.id).catch((e) =>
      console.error("[Facebook] auto-assign failed:", e?.message)
    );
  }

  return { ok: true, lead_id: newLead?.id };
}

export const Route = createFileRoute("/api/public/webhook/facebook")({
  server: {
    handlers: {
      // Meta verifies the webhook URL with a GET request
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.FACEBOOK_VERIFY_TOKEN;
        const tokenMatch =
          !!token && !!expected &&
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

        // Verify HMAC signature from Meta
        const sigHeader = request.headers.get("x-hub-signature-256") ?? "";
        const expectedSig = "sha256=" + createHmac("sha256", appSecret).update(body).digest("hex");
        const sigOk = sigHeader.length === expectedSig.length &&
          timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expectedSig));
        if (!sigOk) return new Response("Invalid signature", { status: 401 });

        let payload: { entry?: Array<{ changes?: Array<{ value?: Record<string, unknown> }> }> };
        try { payload = JSON.parse(body); }
        catch { return new Response("Bad JSON", { status: 400 }); }

        console.log("[Facebook] payload:", JSON.stringify(payload).slice(0, 500));
        const logKey = `fb_${Date.now()}.json`;
        await saveLog(logKey, { payload, receivedAt: new Date().toISOString() });

        // Facebook retries on non-200 — always return 200
        try {
          const results = [];
          for (const entry of payload.entry ?? []) {
            for (const change of entry.changes ?? []) {
              const leadgenId = String(change.value?.leadgen_id ?? "");
              if (!leadgenId) continue;
              const result = await processLeadgen(leadgenId);
              results.push({ leadgenId, ...result });
            }
          }
          return Response.json({ ok: true, results });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[Facebook] processing failed:", msg);
          return Response.json({ ok: false, error: msg });
        }
      },
    },
  },
});
