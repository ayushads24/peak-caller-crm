import { registerPlugin } from "@capacitor/core";

interface PhoneCallerPlugin {
  call(opts: { phone: string }): Promise<{ method: "direct" | "dialer" }>;
  addListener(
    event: "callEnded",
    handler: (data: { answered: boolean; duration: number; phone: string }) => void
  ): Promise<{ remove: () => void }>;
}

const PhoneCaller = registerPlugin<PhoneCallerPlugin>("PhoneCaller");

export async function makeCall(phone: string): Promise<void> {
  try {
    await PhoneCaller.call({ phone: phone.replace(/\D/g, "") });
  } catch {
    // Native plugin not available (web/desktop) — fall back to tel: link
    window.location.href = `tel:${phone}`;
  }
}

export function onCallEnded(
  handler: (data: { answered: boolean; duration: number; phone: string }) => void
): () => void {
  let handle: { remove: () => void } | null = null;
  PhoneCaller.addListener("callEnded", handler)
    .then((h) => { handle = h; })
    .catch(() => {});
  return () => { handle?.remove(); };
}
