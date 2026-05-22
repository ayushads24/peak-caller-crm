import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "manager" | "team_leader" | "caller" | "project_manager";

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  permissions: Set<string>;
}

let cached: AuthState = { user: null, session: null, loading: true, roles: [], permissions: new Set() };
const listeners = new Set<(s: AuthState) => void>();

function emit(next: AuthState) {
  cached = next;
  listeners.forEach((l) => l(next));
}

async function loadRoles(userId: string): Promise<AppRole[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role as AppRole);
}

async function loadPermissions(roles: AppRole[]): Promise<Set<string>> {
  if (roles.includes("admin")) {
    // Admin: full access — fetch all permission keys
    const { data } = await supabase.from("permissions").select("key");
    return new Set((data ?? []).map((r) => r.key as string));
  }
  if (roles.length === 0) return new Set();
  const { data } = await supabase
    .from("role_permissions")
    .select("permission_key")
    .in("role", roles);
  return new Set((data ?? []).map((r) => r.permission_key as string));
}

async function touchLastLogin(userId: string) {
  try {
    await supabase.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", userId);
  } catch { /* ignore */ }
}

let initialized = false;
function init() {
  if (initialized) return;
  if (typeof window === "undefined") return;
  initialized = true;
  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      emit({ ...cached, user: session.user, session, loading: false });
      setTimeout(async () => {
        const roles = await loadRoles(session.user.id);
        const permissions = await loadPermissions(roles);
        emit({ user: session.user, session, loading: false, roles, permissions });
        if (event === "SIGNED_IN") void touchLastLogin(session.user.id);
      }, 0);
    } else {
      emit({ user: null, session: null, loading: false, roles: [], permissions: new Set() });
    }
  });
  supabase.auth.getSession().then(async ({ data }) => {
    if (data.session?.user) {
      const roles = await loadRoles(data.session.user.id);
      const permissions = await loadPermissions(roles);
      emit({ user: data.session.user, session: data.session, loading: false, roles, permissions });
    } else {
      emit({ user: null, session: null, loading: false, roles: [], permissions: new Set() });
    }
  });
}

export function useAuth(): AuthState {
  init();
  const [state, setState] = useState<AuthState>(cached);
  useEffect(() => {
    listeners.add(setState);
    setState(cached);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

export function hasRole(roles: AppRole[], role: AppRole) {
  return roles.includes(role);
}

export function isAdminOrManager(roles: AppRole[]) {
  return roles.includes("admin") || roles.includes("manager") || roles.includes("team_leader");
}

export function isAdmin(roles: AppRole[]) {
  return roles.includes("admin");
}

export function hasPermission(permissions: Set<string>, key: string) {
  return permissions.has(key);
}