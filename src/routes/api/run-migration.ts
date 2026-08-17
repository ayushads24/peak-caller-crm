import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/run-migration")({
  server: {
    handlers: {
      POST: async () => {
        // Create fcm_tokens table for native Android push notifications
        const { error } = await supabaseAdmin.rpc("exec_sql" as never, {
          sql: `
            CREATE TABLE IF NOT EXISTS public.fcm_tokens (
              user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
              token text NOT NULL,
              updated_at timestamptz NOT NULL DEFAULT now()
            );
            ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;
          `,
        });
        if (error) {
          // exec_sql may not exist — try raw query via pg_query workaround
          return Response.json({ ok: false, error: error.message });
        }
        return Response.json({ ok: true, message: "fcm_tokens table ready" });
      },
    },
  },
});
