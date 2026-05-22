import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "manager" | "caller";

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
}

let cached: AuthState = { user: null, session: null, loading: true, roles: [] };
const listeners = new Set<(s: AuthState) => void>();

function emit(next: AuthState) {
  cached = next;
  listeners.forEach((l) => l(next));
}

async function loadRoles(userId: string): Promise<AppRole[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role as AppRole);
}

let initialized = false;
function init() {
  if (initialized) return;
  if (typeof window === "undefined") return;
  initialized = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      emit({ ...cached, user: session.user, session, loading: false });
      setTimeout(async () => {
        const roles = await loadRoles(session.user.id);
        emit({ user: session.user, session, loading: false, roles });
      }, 0);
    } else {
      emit({ user: null, session: null, loading: false, roles: [] });
    }
  });
  supabase.auth.getSession().then(async ({ data }) => {
    if (data.session?.user) {
      const roles = await loadRoles(data.session.user.id);
      emit({ user: data.session.user, session: data.session, loading: false, roles });
    } else {
      emit({ user: null, session: null, loading: false, roles: [] });
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
  return roles.includes("admin") || roles.includes("manager");
}