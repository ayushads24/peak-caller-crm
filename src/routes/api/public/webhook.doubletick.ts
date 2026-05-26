import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitizePhone } from "@/lib/utils";

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
    // Prioritise keys that sound like phone
    const phoneKeys = ["phone", "mobile", "wa_id", "waId", "from", "sender",
      "phoneNumber", "phone_number", "whatsapp", "number", "contact_number", "msisdn"];
    const obj = val as Record<string, unknown>;
    for (const k of phoneKeys) {
      if (k in obj) {
        const found = extractPhone(obj[k], depth + 1);
        if (found) return found;
      }
    }
    // Then try all other keys
    for (const k of Object.keys(obj)) {
      if (phoneKeys.includes(k)) continue;
      const found = extractPhone(obj[k], depth + 1);
      if (found) return found;
    }
  }
  return "";
}

// Recursively find a name string
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
    const nameKeys = ["name", "full_name", "display_name", "username",
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

// Recursively find DoubleTick customer ID
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

export const Route = createFileRoute("/api/public/webhook/doubletick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.DOUBLETICK_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook secret not configured", { status: 500 });

        const url = new URL(request.url);
        const token = url.searchParams.get("token") || "";
        const tokenOk = token.length === secret.length &&
          timingSafeEqual(Buffer.from(token), Buffer.from(secret));
        if (!tokenOk) return new Response("Unauthorized", { status: 401 });

        const body = await request.text();
        let payload: Record<string, unknown>;
        try { payload = JSON.parse(body); } catch { return new Response("Bad JSON", { status: 400 }); }

        console.log("[DoubleTick] payload keys:", Object.keys(payload));
        console.log("[DoubleTick] payload:", JSON.stringify(payload).slice(0, 800));

        const phoneRaw = extractPhone(payload);
        const phone = sanitizePhone(phoneRaw);
        if (!phone) {
          console.log("[DoubleTick] no phone found in payload");
          // Return 200 so DoubleTick doesn't keep retrying
          return Response.json({ ok: false, reason: "no phone found" });
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
          return Response.json({ ok: true, skipped: "duplicate", lead_id: existing.id });
        }

        const { data: lead, error } = await supabaseAdmin
          .from("leads")
          .insert({ client_name: name, phone, lead_source: "DoubleTick WhatsApp", doubletick_contact_id } as any)
          .select("id").single();
        if (error) return new Response(`DB error: ${error.message}`, { status: 500 });

        return Response.json({ ok: true, lead_id: lead?.id });
      },
    },
  },
});
