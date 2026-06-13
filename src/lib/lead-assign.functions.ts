import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Bypasses RLS so any authenticated user can assign a lead to anyone.
export const assignLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ leadId: z.string(), assignedTo: z.string().nullable() }))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ assigned_to: data.assignedTo } as never)
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    return { success: true };
  });
