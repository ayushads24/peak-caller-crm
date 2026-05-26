import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AppSettings = Record<string, string>;

let cache: AppSettings | null = null;
const listeners: Array<(s: AppSettings) => void> = [];

function notify(s: AppSettings) {
  cache = s;
  listeners.forEach((fn) => fn(s));
}

export async function loadAppSettings(): Promise<AppSettings> {
  const { data } = await supabase.from("app_settings" as any).select("key, value");
  const map: AppSettings = {};
  ((data ?? []) as { key: string; value: string }[]).forEach((r) => {
    map[r.key] = r.value;
  });
  notify(map);
  return map;
}

export async function saveAppSetting(key: string, value: string) {
  await supabase.from("app_settings" as any).upsert({ key, value, updated_at: new Date().toISOString() });
  const updated = { ...(cache ?? {}), [key]: value };
  notify(updated);
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(cache ?? {});

  useEffect(() => {
    listeners.push(setSettings);
    if (!cache) void loadAppSettings();
    else setSettings(cache);
    return () => {
      const idx = listeners.indexOf(setSettings);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }, []);

  return settings;
}
