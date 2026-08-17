import { registerPlugin } from "@capacitor/core";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CallLogPlugin {
  getRecentCall(opts: { phone: string; afterTimestamp: number }): Promise<{
    found: boolean;
    duration?: number;
    connected?: boolean;
  }>;
}

const CallLog = registerPlugin<CallLogPlugin>("CallLog");

const KEY = "crm_pending_call";

interface PendingCall {
  leadId: string;
  leadName: string;
  phone: string;
  userId: string;
  startTime: number;
}

export function setPendingCall(data: PendingCall) {
  sessionStorage.setItem(KEY, JSON.stringify(data));
}

async function processPendingCall() {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return;
  sessionStorage.removeItem(KEY);

  const pending: PendingCall = JSON.parse(raw);
  const digits = pending.phone.replace(/\D/g, "");

  // Wait for Android to write the call log
  await new Promise((r) => setTimeout(r, 2000));

  try {
    const result = await CallLog.getRecentCall({
      phone: digits,
      afterTimestamp: pending.startTime - 5000,
    });

    if (!result.found) return; // user didn't actually dial

    const duration = result.duration ?? 0;
    let description: string;

    if (result.connected && duration > 0) {
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      const dur = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      description = `Called ${pending.leadName} — ${dur}`;
    } else {
      description = `Called ${pending.leadName} — not answered`;
    }

    await supabase.from("activities").insert({
      lead_id: pending.leadId,
      description,
      type: "call_logged" as const,
      created_by: pending.userId,
    });

    await fetch("/api/log-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: pending.leadId,
        user_id: pending.userId,
        status: result.connected && duration > 0 ? "connected" : "not_connected",
        duration_seconds: duration,
      }),
    });
  } catch {
    // Native plugin unavailable (web/desktop) — auto-log based on duration
    const duration = Math.round((Date.now() - pending.startTime) / 1000);
    if (duration < 3) return; // user came back too fast, probably didn't dial
    const connected = duration >= 10;
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    const durStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    const description = connected
      ? `Called ${pending.leadName} — ${durStr}`
      : `Called ${pending.leadName} — not connected`;
    await supabase.from("activities").insert({
      lead_id: pending.leadId,
      description,
      type: "call_logged" as const,
      created_by: pending.userId,
    });
    await fetch("/api/log-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: pending.leadId,
        user_id: pending.userId,
        status: connected ? "connected" : "not_connected",
        duration_seconds: duration,
      }),
    });
  }
}

export function useCallTracker() {
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        void processPendingCall();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
}
