import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitizePhone } from "@/lib/utils";
import { autoAssignNewLead } from "@/lib/lead-distribution.functions";

const DT_BASE = "https://public.doubletick.io";

interface DtContact {
  id?: string;
  customerId?: string;
  name?: string;
  customerName?: string;
  phoneNumber?: string;
  customerPhone?: string;
  phone?: string;
}

async function fetchDtPage(page: number, limit: number): Promise<{ contacts: DtContact[]; hasMore: boolean }> {
  const apiKey = process.env.DOUBLETICK_API_KEY;
  if (!apiKey) throw new Error("DOUBLETICK_API_KEY not set");

  const url = `${DT_BASE}/customer?page=${page}&limit=${limit}`;
  const res = await fetch(url, {
    headers: { Authorization: apiKey },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DoubleTick API ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  // DoubleTick may return { customers: [...] } or { data: [...] } or an array directly
  const list: DtContact[] = json.customers ?? json.data ?? json.contacts ?? (Array.isArray(json) ? json : []);
  const total: number = json.total ?? json.totalCount ?? (list.length < limit ? page * list.length : Infinity);
  const hasMore = list.length === limit && page * limit < total;
  return { contacts: list, hasMore };
}

function getPhone(c: DtContact): string {
  return sanitizePhone(c.customerPhone ?? c.phoneNumber ?? c.phone ?? "") ?? "";
}

function getName(c: DtContact): string {
  return (c.customerName ?? c.name ?? "").trim() || "WhatsApp Lead";
}

function getContactId(c: DtContact): string | null {
  const raw = c.customerId ?? c.id ?? "";
  if (!raw) return null;
  const stripped = raw.replace(/^customer_/i, "").trim();
  return stripped ? `customer_${stripped}` : null;
}

export const Route = createFileRoute("/api/sync-doubletick")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Auth — same token as webhook
        const secret = process.env.DOUBLETICK_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook secret not configured", { status: 500 });
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";
        let tokenOk = false;
        try {
          tokenOk = token.length === secret.length &&
            timingSafeEqual(Buffer.from(token), Buffer.from(secret));
        } catch { /* length mismatch */ }
        if (!tokenOk) return new Response("Unauthorized", { status: 401 });

        const maxPages = parseInt(url.searchParams.get("pages") ?? "20", 10);
        const limit = 100;

        const created: { phone: string; name: string; lead_id: string }[] = [];
        const skipped: string[] = [];
        const errors: string[] = [];

        try {
          for (let page = 1; page <= maxPages; page++) {
            let contacts: DtContact[];
            let hasMore: boolean;
            try {
              ({ contacts, hasMore } = await fetchDtPage(page, limit));
            } catch (err) {
              errors.push(`Page ${page} fetch failed: ${err instanceof Error ? err.message : String(err)}`);
              break;
            }

            if (!contacts.length) break;

            for (const c of contacts) {
              const phone = getPhone(c);
              if (!phone) { skipped.push(`no-phone:${c.id ?? "?"}`); continue; }

              try {
                const { data: existing } = await supabaseAdmin
                  .from("leads")
                  .select("id, doubletick_contact_id")
                  .eq("phone", phone)
                  .limit(1)
                  .maybeSingle();

                const doubletick_contact_id = getContactId(c);

                if (existing) {
                  // Backfill contact ID if missing
                  if (doubletick_contact_id && !(existing as any).doubletick_contact_id) {
                    await supabaseAdmin.from("leads")
                      .update({ doubletick_contact_id } as any)
                      .eq("id", existing.id);
                  }
                  skipped.push(phone);
                  continue;
                }

                const name = getName(c);
                const { data: lead, error } = await supabaseAdmin
                  .from("leads")
                  .insert({ client_name: name, phone, lead_source: "DoubleTick WhatsApp", doubletick_contact_id } as any)
                  .select("id")
                  .single();

                if (error) { errors.push(`insert ${phone}: ${error.message}`); continue; }

                if (lead?.id) {
                  await autoAssignNewLead(lead.id).catch((e: Error) =>
                    console.error("[sync-dt] auto-assign failed:", e?.message)
                  );
                  created.push({ phone, name, lead_id: lead.id });
                }
              } catch (err) {
                errors.push(`contact ${phone}: ${err instanceof Error ? err.message : String(err)}`);
              }
            }

            if (!hasMore) break;
          }
        } catch (err) {
          errors.push(`outer: ${err instanceof Error ? err.message : String(err)}`);
        }

        return Response.json({
          ok: true,
          created: created.length,
          skipped: skipped.length,
          errors: errors.length,
          createdLeads: created,
          errorDetails: errors,
        });
      },
    },
  },
});
