import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitizePhone } from "@/lib/utils";
import { autoAssignNewLead } from "@/lib/lead-distribution.functions";

export const Route = createFileRoute("/api/public/webhook/sheets")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Secret check
        const secret = process.env.SHEETS_WEBHOOK_SECRET;
        if (!secret) return Response.json({ ok: false, error: "not configured" }, { status: 500 });

        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";
        let tokenOk = false;
        try {
          tokenOk = token.length === secret.length && timingSafeEqual(Buffer.from(token), Buffer.from(secret));
        } catch { /* length mismatch */ }
        if (!tokenOk) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

        let body: Record<string, unknown>;
        try { body = await request.json() as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }

        const name = (body.name as string | undefined)?.trim();
        const phoneRaw = String(body.phone ?? "").replace(/\D/g, "");
        const phone = sanitizePhone(phoneRaw);

        if (!name) return Response.json({ ok: false, error: "name required" }, { status: 422 });
        if (!phone) return Response.json({ ok: false, error: "valid phone required" }, { status: 422 });

        // Duplicate check
        const { data: existing } = await supabaseAdmin
          .from("leads").select("id").eq("phone", phone).limit(1).maybeSingle();
        if (existing) return Response.json({ ok: true, skipped: "duplicate", lead_id: existing.id });

        const insert: Record<string, unknown> = {
          client_name: name,
          phone,
          lead_source: (body.lead_source as string | undefined)?.trim() || "Google Sheet",
        };
        if (body.email) insert.email = String(body.email).trim();
        if (body.sales_value) insert.sales_value = Number(body.sales_value) || null;

        const { data: lead, error } = await supabaseAdmin
          .from("leads").insert(insert as any).select("id").single();
        if (error) {
          console.error("[Sheets webhook] DB error:", error.message);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        // Add note if provided
        if (body.notes && lead?.id) {
          const noteText = String(body.notes).trim();
          if (noteText) {
            await supabaseAdmin.from("notes").insert({ lead_id: lead.id, content: noteText } as any).catch(() => {});
          }
        }

        // Auto-assign
        if (lead?.id) {
          await autoAssignNewLead(lead.id).catch((e) =>
            console.error("[Sheets webhook] auto-assign failed:", e?.message)
          );
        }

        return Response.json({ ok: true, lead_id: lead?.id });
      },
    },
  },
});
