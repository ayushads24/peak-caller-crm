import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Role = z.enum(["admin", "team_leader", "caller", "project_manager"]);

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r: { role: string }) => r.role === "admin")) {
    throw new Error("Admin access required");
  }
}

export const listPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: perms } = await supabaseAdmin
      .from("permissions")
      .select("key, module, action, label, sort_order")
      .order("sort_order");
    const { data: mappings } = await supabaseAdmin
      .from("role_permissions")
      .select("role, permission_key");
    return {
      permissions: perms ?? [],
      mappings: mappings ?? [],
    };
  });

export const setRolePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      role: Role,
      permission_key: z.string().min(1).max(120),
      granted: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.role === "admin") {
      // Admin always has all permissions — block modification
      throw new Error("Admin role cannot be modified");
    }
    if (data.granted) {
      await supabaseAdmin
        .from("role_permissions")
        .upsert({ role: data.role, permission_key: data.permission_key });
    } else {
      await supabaseAdmin
        .from("role_permissions")
        .delete()
        .eq("role", data.role)
        .eq("permission_key", data.permission_key);
    }
    return { ok: true };
  });