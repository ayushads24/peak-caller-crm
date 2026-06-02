import { registerPlugin } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import { useEffect } from "react";

interface IncomingCallPlugin {
  startService(): Promise<{ started: boolean }>;
  checkOverlayPermission(): Promise<{ granted: boolean }>;
  requestOverlayPermission(): Promise<void>;
}

const IncomingCall = registerPlugin<IncomingCallPlugin>("IncomingCall");

export function useIncomingCallSetup() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    async function setup() {
      try {
        // Start the foreground service (requests READ_PHONE_STATE if needed)
        await IncomingCall.startService();

        // Check overlay permission (SYSTEM_ALERT_WINDOW)
        const { granted } = await IncomingCall.checkOverlayPermission();
        if (!granted) {
          // Slight delay so the user sees the app first
          setTimeout(async () => {
            await IncomingCall.requestOverlayPermission();
          }, 1500);
        }
      } catch {
        // Plugin not available (web/desktop)
      }
    }

    setup();
  }, []);
}
