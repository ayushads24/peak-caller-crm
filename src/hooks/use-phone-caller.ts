import { registerPlugin } from "@capacitor/core";

interface PhoneCallerPlugin {
  call(opts: { phone: string }): Promise<{ method: "direct" | "dialer" }>;
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
