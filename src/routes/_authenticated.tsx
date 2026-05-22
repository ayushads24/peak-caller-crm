import { createFileRoute, Outlet, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, Settings, LogOut, Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({ component: Layout });

function Layout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  async function logout() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/login" });
  }

  const navItems = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/leads", icon: Users, label: "Leads" },
    { to: "/settings", icon: Settings, label: "Settings" },
  ] as const;

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-64 flex-col bg-[var(--sidebar-bg)] text-[var(--sidebar-fg)] p-4 gap-1">
        <div className="flex items-center gap-2 font-display text-lg font-semibold px-2 py-4">
          <div className="size-8 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow">
            <Zap className="size-4 text-white" />
          </div>
          PulseCRM
        </div>
        <nav className="flex-1 flex flex-col gap-1 mt-2">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-fg)] transition-colors"
              activeProps={{ className: "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-gradient-primary text-white shadow-elegant" }}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 pt-3 mt-3">
          <div className="px-3 py-2 text-xs text-[var(--sidebar-muted)] truncate">{user.email}</div>
          <Button variant="ghost" size="sm" onClick={logout} className="w-full justify-start text-[var(--sidebar-muted)] hover:text-[var(--sidebar-fg)] hover:bg-[var(--sidebar-accent)]">
            <LogOut className="size-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
        <div className="h-20 md:hidden" />
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-border flex items-center justify-around px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {navItems.map((item) => (
          <Link key={item.to} to={item.to} className="flex flex-col items-center gap-0.5 px-4 py-1.5 text-[10px] font-medium text-muted-foreground rounded-lg"
            activeProps={{ className: "flex flex-col items-center gap-0.5 px-4 py-1.5 text-[10px] font-medium text-primary rounded-lg" }}>
            <item.icon className="size-5" />
            {item.label}
          </Link>
        ))}
        <button onClick={logout} className="flex flex-col items-center gap-0.5 px-4 py-1.5 text-[10px] font-medium text-muted-foreground">
          <LogOut className="size-5" />
          Sign out
        </button>
      </nav>
    </div>
  );
}