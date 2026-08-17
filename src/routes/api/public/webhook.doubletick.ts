import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
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
  } catch { /* log failure must never crash the webhook */ }
}

async function markLogProcessed(key: string, result: unknown) {
  try {
    const { data } = await supabaseAdmin.storage.from(LOG_BUCKET).download(key);
    if (!data) return;
    const original = JSON.parse(await data.text());
    const bytes = new TextEncoder().encode(JSON.stringify({ ...original, _result: result, _processedAt: new Date().toISOString() }));
    await supabaseAdmin.storage.from(LOG_BUCKET).upload(`processed/${key}`, bytes, {
      contentType: "application/json", upsert: true,
    });
    await supabaseAdmin.storage.from(LOG_BUCKET).remove([key]);
  } catch { /* ignore */ }
}

// Recursively search any JSON value for a phone-like string (10-13 digits)
function extractPhone(val: unknown, depth = 0): string {
  if (depth > 6) return "";
  if (typeof val === "string") {
    const d = val.replace(/\D/g, "");
    if (d.length >= 10 && d.length <= 13) return d;
    return "";
  }
  if (typeof val === "number") {
    const d = String(val);
    if (d.length >= 10 && d.length <= 13) return d;
    return "";
  }
  if (Array.isArray(val)) {
    for (const item of val) {
      const found = extractPhone(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (val && typeof val === "object") {
    const phoneKeys = ["customerPhone", "phone", "mobile", "wa_id", "waId", "from", "sender",
      "phoneNumber", "phone_number", "whatsapp", "number", "contact_number", "msisdn"];
    const obj = val as Record<string, unknown>;
    for (const k of phoneKeys) {
      if (k in obj) {
        const found = extractPhone(obj[k], depth + 1);
        if (found) return found;
      }
    }
    for (const k of Object.keys(obj)) {
      if (phoneKeys.includes(k)) continue;
      const found = extractPhone(obj[k], depth + 1);
      if (found) return found;
    }
  }
  return "";
}

function extractName(val: unknown, depth = 0): string {
  if (depth > 6) return "";
  if (Array.isArray(val)) {
    for (const item of val) {
      const found = extractName(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (val && typeof val === "object") {
    const nameKeys = ["customerName", "name", "full_name", "display_name", "username",
      "senderName", "contact_name", "profile_name", "pushname", "notify"];
    const obj = val as Record<string, unknown>;
    for (const k of nameKeys) {
      if (k in obj && typeof obj[k] === "string" && (obj[k] as string).trim()) {
        return (obj[k] as string).trim();
      }
    }
    for (const k of Object.keys(obj)) {
      if (nameKeys.includes(k)) continue;
      const found = extractName(obj[k], depth + 1);
      if (found) return found;
    }
  }
  return "";
}

function extractContactId(val: unknown, depth = 0): string {
  if (depth > 6) return "";
  if (typeof val === "string" && val.startsWith("customer_")) return val;
  if (Array.isArray(val)) {
    for (const item of val) {
      const found = extractContactId(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (val && typeof val === "object") {
    const idKeys = ["id", "customer_id", "contact_id", "customerId", "contactId"];
    const obj = val as Record<string, unknown>;
    for (const k of idKeys) {
      if (k in obj) {
        const found = extractContactId(obj[k], depth + 1);
        if (found) return found;
      }
    }
  }
  return "";
}

async function processPayload(payload: Record<string, unknown>): Promise<{ ok: boolean; reason?: string; skipped?: string; lead_id?: string }> {
  const phoneRaw = extractPhone(payload);
  const phone = sanitizePhone(phoneRaw);
  if (!phone) {
    console.log("[DoubleTick] no phone found in payload");
    return { ok: false, reason: "no phone found" };
  }

  const name = extractName(payload) || "WhatsApp Lead";
  const rawId = extractContactId(payload).replace(/^customer_/i, "").trim();
  const doubletick_contact_id = rawId ? `customer_${rawId}` : null;

  const { data: existing } = await supabaseAdmin
    .from("leads").select("id, doubletick_contact_id").eq("phone", phone).limit(1).maybeSingle();
  if (existing) {
    if (doubletick_contact_id && !(existing as any).doubletick_contact_id) {
      await supabaseAdmin.from("leads").update({ doubletick_contact_id } as any).eq("id", existing.id);
    }
    return { ok: true, skipped: "duplicate", lead_id: existing.id };
  }

  const { data: lead, error } = await supabaseAdmin
    .from("leads")
    .insert({ client_name: name, phone, lead_source: "DoubleTick WhatsApp", doubletick_contact_id } as any)
    .select("id").single();
  if (error) throw new Error(`DB error: ${error.message}`);

  if (lead?.id) {
    await autoAssignNewLead(lead.id).catch((e) =>
      console.error("[DoubleTick] auto-assign failed:", e?.message)
    );
  }

  return { ok: true, lead_id: lead?.id };
}

export const Route = createFileRoute("/api/public/webhook/doubletick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth check
        const secret = process.env.DOUBLETICK_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook secret not configured", { status: 500 });
        const url = new URL(request.url);
        const token = url.searchParams.get("token") || "";
        let tokenOk = false;
        try {
          tokenOk = token.length === secret.length &&
            timingSafeEqual(Buffer.from(token), Buffer.from(secret));
        } catch { /* length mismatch throws */ }
        if (!tokenOk) return new Response("Unauthorized", { status: 401 });

        // Parse body
        const body = await request.text();
        let payload: Record<string, unknown>;
        try { payload = JSON.parse(body); }
        catch { return new Response("Bad JSON", { status: 400 }); }

        console.log("[DoubleTick] payload:", JSON.stringify(payload).slice(0, 500));

        // Save raw payload immediately — survives any downstream failure
        const logKey = `${Date.now()}_${extractPhone(payload) || "unknown"}.json`;
        await saveLog(logKey, { payload, receivedAt: new Date().toISOString() });

        // Process with full error protection — NEVER return 5xx to DoubleTick
        try {
          const result = await processPayload(payload);
          await markLogProcessed(logKey, result);
          return Response.json(result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[DoubleTick] processing failed:", msg);
          // Save error in log but still return 200 — DoubleTick retry won't help a DB error
          await saveLog(logKey, { payload, receivedAt: new Date().toISOString(), _error: msg });
          return Response.json({ ok: false, error: msg });
        }
      },
    },
  },
});
