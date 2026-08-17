import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Extract and verify the caller's Supabase JWT from an API request.
 *  Returns the user object if valid, null otherwise.
 *  Checks Authorization header first, then falls back to the sb-*-auth-token cookie.
 */
export async function getRequestUser(request: Request) {
  // 1. Authorization: Bearer <token>
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) return user;
  }

  // 2. Cookie fallback (same-origin browser requests)
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/sb-[^=]+-auth-token=([^;]+)/);
  if (match) {
    try {
      const val = JSON.parse(decodeURIComponent(match[1]));
      const token: string | undefined = Array.isArray(val)
        ? val[0]?.access_token
        : val?.access_token;
      if (token) {
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (user) return user;
      }
    } catch { /* malformed cookie */ }
  }

  return null;
}
