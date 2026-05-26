import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Remove country code +91 / 91 from Indian mobile numbers, keep 10 digits
export function sanitizePhone(p: unknown): string {
  const digits = String(p ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

// Build WhatsApp/DoubleTick chat URL
// If DoubleTick biz number + contact ID both available → opens exact DoubleTick conversation
// Else if dtTemplate set → uses template with {phone}/{phone91}
// Else → plain wa.me
export function whatsappUrl(
  phone: string | null | undefined,
  dtTemplate: string,
  doubletickContactId?: string | null,
): string {
  const raw = String(phone ?? "").replace(/\D/g, "");
  let digits = raw;
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!digits) return "";

  // Extract biz number from template (part before first placeholder or path segment)
  const tpl = dtTemplate.trim();
  // If contact ID known, try to build exact DoubleTick URL from template
  // Template expected: https://web.doubletick.io/conversations/919193868840/{dtContactId}
  if (doubletickContactId && tpl.includes("{dtContactId}")) {
    return tpl
      .replace("{dtContactId}", doubletickContactId)
      .replace("{phone91}", `91${digits}`)
      .replace("{phone}", digits);
  }

  if (tpl) {
    return tpl
      .replace("{phone91}", `91${digits}`)
      .replace("{phone}", digits);
  }
  return `https://wa.me/91${digits}`;
}
