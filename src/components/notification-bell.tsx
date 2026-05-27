import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Bell, UserPlus, Flame, CheckCheck, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { format, isToday } from "date-fns";

interface Notif {
  id: string;
  type: "lead_assigned" | "lead_deleted" | "fresh_queue" | "task_due";
  title: string;
  body: string;
  at: string;
  read: boolean;
}

const STORAGE_KEY = "ctg_notifs_v1";

function loadStored(): Notif[] {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}
function persist(notifs: Notif[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(notifs.slice(0, 60)));
}

function NotifIcon({ type }: { type: Notif["type"] }) {
  if (type === "fresh_queue") return <Flame className="size-3.5 text-orange-500" />;
  if (type === "lead_deleted") return <Trash2 className="size-3.5 text-destructive" />;
  return <UserPlus className="size-3.5 text-primary" />;
}

export function NotificationBell({ sidebarStyle }: { sidebarStyle?: boolean }) {
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<Notif[]>(loadStored);
  const [open, setOpen] = useState(false);
  const unread = notifs.filter((n) => !n.read).length;

  function push(n: Omit<Notif, "id" | "at" | "read">) {
    setNotifs((prev) => {
      const next = [
        { ...n, id: Math.random().toString(36).slice(2, 10), at: new Date().toISOString(), read: false },
        ...prev,
      ].slice(0, 60);
      persist(next);
      return next;
    });
  }

  function markAllRead() {
    setNotifs((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      persist(next);
      return next;
    });
  }

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("notif-bell")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads" }, (payload) => {
        const row = payload.new as { client_name: string; assigned_to: string | null };
        if (row.assigned_to === user.id) {
          push({ type: "lead_assigned", title: "New lead assigned to you", body: row.client_name });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leads" }, (payload) => {
        const oldRow = payload.old as { assigned_to: string | null };
        const newRow = payload.new as { client_name: string; assigned_to: string | null };
        if (newRow.assigned_to === user.id && oldRow.assigned_to !== user.id) {
          push({ type: "lead_assigned", title: "Lead assigned to you", body: newRow.client_name });
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "leads" }, (payload) => {
        const oldRow = payload.old as { client_name: string; assigned_to: string | null };
        if (oldRow.assigned_to === user.id) {
          push({ type: "lead_deleted", title: "Assigned lead deleted", body: oldRow.client_name });
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user]);

  useEffect(() => {
    if (open && unread > 0) markAllRead();
  }, [open]);

  function formatTime(iso: string) {
    const d = new Date(iso);
    return isToday(d) ? format(d, "h:mm a") : format(d, "MMM d, h:mm a");
  }

  if (sidebarStyle) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-[var(--sidebar-muted)] hover:text-[var(--sidebar-fg)] hover:bg-[var(--sidebar-accent)]"
          >
            <Bell className="size-4 mr-2" />
            Notifications
            {unread > 0 && (
              <span className="ml-auto size-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" side="right" align="end" sideOffset={8}>
          <NotifPanel notifs={notifs} formatTime={formatTime} markAllRead={markAllRead} unread={unread} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-full hover:bg-muted transition-colors">
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" sideOffset={8}>
        <NotifPanel notifs={notifs} formatTime={formatTime} markAllRead={markAllRead} unread={unread} />
      </PopoverContent>
    </Popover>
  );
}

function NotifPanel({ notifs, formatTime, markAllRead, unread }: {
  notifs: Notif[];
  formatTime: (iso: string) => string;
  markAllRead: () => void;
  unread: number;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-sm">Notifications</h3>
        {unread > 0 && (
          <button onClick={markAllRead} className="text-[10px] text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors">
            <CheckCheck className="size-3" /> Mark all read
          </button>
        )}
      </div>
      <div className="max-h-96 overflow-y-auto divide-y">
        {notifs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
            <Bell className="size-6 opacity-30" />
            <p className="text-sm">No notifications yet</p>
          </div>
        )}
        {notifs.map((n) => (
          <div key={n.id} className={`flex items-start gap-3 px-4 py-3 transition-colors ${n.read ? "" : "bg-primary/5"}`}>
            <div className={`mt-0.5 size-7 rounded-full flex items-center justify-center shrink-0 ${n.read ? "bg-muted" : "bg-primary/10"}`}>
              <NotifIcon type={n.type} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-snug">{n.title}</p>
              <p className="text-xs text-muted-foreground truncate">{n.body}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{formatTime(n.at)}</p>
            </div>
            {!n.read && <span className="size-2 rounded-full bg-primary mt-2 shrink-0" />}
          </div>
        ))}
      </div>
    </>
  );
}
