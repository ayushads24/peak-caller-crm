import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "@tanstack/react-router";
import { Bell, ListTodo, AlarmClock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Alarm {
  id: string;
  type: "lead" | "task" | "task_due";
  title: string;       // lead name
  subtitle?: string;   // task title
  leadId: string;
}
type SnoozedAlarm = Omit<Alarm, "id"> & { id: string; snoozeUntil: number };

const SNOOZE_KEY = "ctg_pm_alarm_snooze_v2";
const FIRED_KEY = "ctg_pm_task_fired_v2"; // v2: time-based expiry

interface FiredEntry { id: string; at: number }
const FIRED_TTL = 2 * 60 * 60 * 1000; // 2 hours — same pending task can re-alarm after 2h

function loadFired(): Set<string> {
  try {
    const entries: FiredEntry[] = JSON.parse(localStorage.getItem(FIRED_KEY) ?? "[]");
    const cutoff = Date.now() - FIRED_TTL;
    const fresh = entries.filter((e) => e.at > cutoff);
    // Write back cleaned list
    localStorage.setItem(FIRED_KEY, JSON.stringify(fresh.slice(-200)));
    return new Set(fresh.map((e) => e.id));
  } catch { return new Set(); }
}
function markFired(taskId: string) {
  try {
    const entries: FiredEntry[] = JSON.parse(localStorage.getItem(FIRED_KEY) ?? "[]");
    entries.push({ id: taskId, at: Date.now() });
    localStorage.setItem(FIRED_KEY, JSON.stringify(entries.slice(-200)));
  } catch { /* ignore */ }
}

function loadSnooze(): SnoozedAlarm[] {
  try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "[]"); }
  catch { return []; }
}
function saveSnooze(items: SnoozedAlarm[]) {
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(items));
}

async function playAlarm() {
  try {
    const ctx = new AudioContext();
    // Mobile WebView creates AudioContext in "suspended" state — must resume before scheduling
    if (ctx.state === "suspended") await ctx.resume();
    const beep = (start: number, freq = 880) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.35, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.start(start);
      osc.stop(start + 0.4);
    };
    beep(ctx.currentTime, 880);
    beep(ctx.currentTime + 0.45, 1100);
    beep(ctx.currentTime + 0.9, 880);
  } catch { /* browser blocked audio */ }
}

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function subscribeToPush(userId: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await fetch("/api/push-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, subscription: sub.toJSON() }),
    });
  } catch { /* ignore */ }
}

export function PmLeadAlarm() {
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const isPm = roles.includes("project_manager");

  const [queue, setQueue] = useState<Alarm[]>([]);
  const [showSnooze, setShowSnooze] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const soundTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // null = not checked yet, "default" | "denied" | "granted"
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | null>(null);

  const current = queue[0] ?? null;

  const pushAlarm = useCallback((alarm: Alarm) => {
    if (seenRef.current.has(alarm.id)) return;
    seenRef.current.add(alarm.id);
    setQueue((prev) => [...prev, alarm]);
  }, []);

  // Repeat alarm sound every 4s while popup is open
  useEffect(() => {
    if (!current) {
      if (soundTimerRef.current) { clearInterval(soundTimerRef.current); soundTimerRef.current = null; }
      return;
    }
    void playAlarm();
    soundTimerRef.current = setInterval(() => void playAlarm(), 4000);
    return () => { if (soundTimerRef.current) clearInterval(soundTimerRef.current); };
  }, [current?.id]);

  function dismiss() {
    if (soundTimerRef.current) { clearInterval(soundTimerRef.current); soundTimerRef.current = null; }
    setQueue((prev) => prev.slice(1));
    setShowSnooze(false);
  }

  function handleOpen() {
    dismiss();
    if (current) {
      void navigate({ to: "/leads/$leadId", params: { leadId: current.leadId } });
    }
  }

  function handleSnooze(minutes: number) {
    if (!current) return;
    const snooze = loadSnooze().filter((s) => s.id !== current.id);
    snooze.push({ ...current, snoozeUntil: Date.now() + minutes * 60 * 1000 });
    saveSnooze(snooze);
    seenRef.current.delete(current.id);
    dismiss();
  }

  // Check current notification permission on mount
  useEffect(() => {
    if (!("Notification" in window)) return;
    setNotifPerm(Notification.permission);
  }, []);

  // If already granted, subscribe silently (Android PWA / second+ open)
  useEffect(() => {
    if (!user || notifPerm !== "granted") return;
    void subscribeToPush(user.id);
  }, [user, notifPerm]);

  // PM-only: new lead assigned + new task created on PM's lead
  useEffect(() => {
    if (!user || !isPm) return;
    const uid = user.id;
    const ch = supabase
      .channel(`pm-alarm-${uid}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "leads",
        filter: `assigned_to=eq.${uid}`,
      }, (payload) => {
        const row = payload.new as { id: string; client_name: string };
        pushAlarm({ id: row.id, type: "lead", title: row.client_name, leadId: row.id });
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "leads",
        filter: `assigned_to=eq.${uid}`,
      }, (payload) => {
        const n = payload.new as { id: string; client_name: string; assigned_at: string | null };
        if (n.assigned_at && Date.now() - new Date(n.assigned_at).getTime() < 5 * 60 * 1000)
          pushAlarm({ id: n.id, type: "lead", title: n.client_name, leadId: n.id });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks" }, async (payload) => {
        const task = payload.new as { id: string; title: string; lead_id: string; created_by: string | null };
        if (task.created_by === uid) return;
        const { data: lead } = await supabase
          .from("leads")
          .select("id, client_name, assigned_to")
          .eq("id", task.lead_id)
          .maybeSingle();
        if (lead?.assigned_to === uid)
          pushAlarm({ id: task.id, type: "task", title: lead.client_name, subtitle: task.title, leadId: lead.id });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user, isPm, pushAlarm]);

  // ALL users: check tasks due now (every 60s + on app foreground)
  useEffect(() => {
    if (!user) return;
    async function checkDue() {
      const now = new Date();
      // 24h window — catches overdue tasks even if app was closed for hours
      // FIRED_KEY (2h TTL) prevents spam; seenRef prevents same-session duplicates
      const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const to = now.toISOString();
      try {
        const res = await fetch(`/api/due-tasks?user_id=${user!.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
        if (!res.ok) return;
        const tasks: { id: string; title: string; lead_id: string; leadName: string }[] = await res.json();
        const fired = loadFired();
        for (const task of tasks) {
          if (fired.has(task.id)) continue;
          markFired(task.id);
          pushAlarm({ id: `due-${task.id}`, type: "task_due", title: task.leadName, subtitle: task.title, leadId: task.lead_id });
        }
      } catch { /* ignore */ }
    }

    checkDue();
    const id = setInterval(checkDue, 60_000);

    // Android background fix: setInterval freezes when app is in background.
    // Run checkDue immediately whenever user brings app to foreground.
    function onVisible() {
      if (document.visibilityState === "visible") void checkDue();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, pushAlarm]);

  // Re-trigger snoozed alarms
  useEffect(() => {
    if (!user) return;
    function checkSnooze() {
      const now = Date.now();
      const all = loadSnooze();
      const expired = all.filter((s) => s.snoozeUntil <= now);
      if (expired.length === 0) return;
      saveSnooze(all.filter((s) => s.snoozeUntil > now));
      expired.forEach(({ snoozeUntil: _, ...alarm }) => pushAlarm(alarm));
    }
    checkSnooze();
    const id = setInterval(checkSnooze, 30_000);
    return () => clearInterval(id);
  }, [user, pushAlarm]);

  // Show enable-notifications button when permission not yet granted
  // iOS requires a user gesture — we can't call requestPermission() automatically
  if (!current && notifPerm !== null && notifPerm !== "granted" && notifPerm !== "denied") {
    return createPortal(
      <div className="fixed bottom-24 md:bottom-6 right-4 z-50">
        <button
          style={{ touchAction: "manipulation" }}
          onPointerDown={async () => {
            const perm = await Notification.requestPermission();
            setNotifPerm(perm);
            if (perm === "granted" && user) void subscribeToPush(user.id);
          }}
          className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2.5 rounded-full shadow-lg hover:bg-primary/90 active:scale-95 transition-all"
        >
          <Bell className="size-4" />
          Notifications enable karo
        </button>
      </div>,
      document.body
    );
  }

  if (!current) return null;

  const isDue = current.type === "task_due";
  const isTask = current.type === "task" || isDue;

  const accentColor = isDue ? "text-rose-500" : isTask ? "text-amber-500" : "text-primary";
  const accentBg = isDue ? "bg-rose-500/10" : isTask ? "bg-amber-500/10" : "bg-primary/10";
  const btnColor = isDue ? "bg-rose-500 hover:bg-rose-600" : isTask ? "bg-amber-500 hover:bg-amber-600" : "bg-gradient-to-r from-primary to-primary/80";
  const headerLabel = isDue ? "Task Due Now" : isTask ? "New Task Assigned" : "New Lead Assigned";
  const btnLabel = isDue ? "Open Task" : "Check";

  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60"
      style={{ touchAction: "none", pointerEvents: "none" }}
    >
      <div
        className="bg-card border shadow-2xl rounded-2xl w-full max-w-sm mx-4 p-7 flex flex-col items-center gap-5"
        style={{ pointerEvents: "auto", touchAction: "manipulation" }}
        onTouchStart={(e) => e.stopPropagation()}
      >

        {/* Icon */}
        <div className="relative">
          <div className={`size-20 rounded-full flex items-center justify-center ${accentBg}`}>
            {isDue
              ? <AlarmClock className={`size-9 ${accentColor}`} />
              : isTask
              ? <ListTodo className={`size-9 ${accentColor}`} />
              : <Bell className={`size-9 ${accentColor}`} />}
          </div>
          <span className="absolute -top-1 -right-1 size-4 rounded-full bg-red-500 animate-ping" />
          <span className="absolute -top-1 -right-1 size-4 rounded-full bg-red-500" />
        </div>

        {/* Text */}
        <div className="text-center space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {headerLabel}
          </p>
          <h2 className="text-2xl font-bold leading-tight">{current.title}</h2>
          {current.subtitle && (
            <p className="text-sm text-muted-foreground mt-1">"{current.subtitle}"</p>
          )}
        </div>

        {/* Buttons */}
        {!showSnooze ? (
          <div className="flex gap-3 w-full">
            <Button
              className={`flex-1 h-12 text-base text-white ${btnColor}`}
              onPointerDown={(e) => { e.stopPropagation(); handleOpen(); }}
              style={{ touchAction: "manipulation" }}
            >
              {btnLabel}
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-12 text-base"
              onPointerDown={(e) => { e.stopPropagation(); setShowSnooze(true); }}
              style={{ touchAction: "manipulation" }}
            >
              Skip
            </Button>
          </div>
        ) : (
          <div className="w-full space-y-3">
            <p className="text-sm text-center text-muted-foreground">Remind me after…</p>
            <div className="flex gap-2">
              {[{ label: "10 min", value: 10 }, { label: "30 min", value: 30 }, { label: "1 hour", value: 60 }].map(({ label, value }) => (
                <button
                  key={value}
                  onPointerDown={(e) => { e.stopPropagation(); handleSnooze(value); }}
                  style={{ touchAction: "manipulation" }}
                  className="flex-1 py-3 rounded-xl border text-sm font-semibold hover:bg-primary hover:text-white hover:border-primary transition-all duration-150 active:scale-95"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onPointerDown={(e) => { e.stopPropagation(); setShowSnooze(false); }}
              style={{ touchAction: "manipulation" }}
              className="w-full text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
            >
              ← Back
            </button>
          </div>
        )}

        {queue.length > 1 && (
          <p className="text-[11px] text-muted-foreground">+{queue.length - 1} more waiting</p>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
