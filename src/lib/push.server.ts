import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import * as admin from "firebase-admin";

const BUCKET = "push-subscriptions";

// ── Firebase Admin (FCM) ─────────────────────────────────────────────────────

function getFirebaseApp(): admin.app.App | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null; // env not set yet
  if (admin.apps.length > 0) return admin.apps[0]!;
  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

async function saveFcmToken(userId: string, token: string) {
  await ensureBucket();
  const bytes = new TextEncoder().encode(token);
  await supabaseAdmin.storage.from(BUCKET).upload(`${userId}-fcm.txt`, bytes, {
    contentType: "text/plain",
    upsert: true,
  });
}

async function getFcmToken(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(`${userId}-fcm.txt`);
  if (error || !data) return null;
  try { return (await data.text()).trim(); }
  catch { return null; }
}

async function sendFcm(fcmToken: string, payload: { title: string; body: string; tag?: string }) {
  const app = getFirebaseApp();
  if (!app) return; // Firebase not configured yet
  try {
    await app.messaging().send({
      token: fcmToken,
      notification: { title: payload.title, body: payload.body },
      android: {
        priority: "high",
        notification: {
          tag: payload.tag,
          sound: "default",
          channelId: "task-due",
        },
      },
    });
  } catch (err: unknown) {
    // Invalid/expired token — remove it
    const code = (err as { errorInfo?: { code?: string } })?.errorInfo?.code ?? "";
    if (code.includes("invalid-registration-token") || code.includes("registration-token-not-registered")) {
      await supabaseAdmin.storage.from(BUCKET).remove([`${/* userId */ ""}-fcm.txt`]);
    }
  }
}

// ── VAPID web-push ───────────────────────────────────────────────────────────

function initVapid() {
  const subject = process.env.VAPID_SUBJECT;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !pub || !priv) throw new Error("VAPID env vars missing");
  webpush.setVapidDetails(subject, pub, priv);
}

async function ensureBucket() {
  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, { public: false });
  if (error && !error.message.includes("already exists")) throw error;
}

export async function saveSubscription(userId: string, sub: PushSubscriptionJSON) {
  await ensureBucket();
  const bytes = new TextEncoder().encode(JSON.stringify(sub));
  await supabaseAdmin.storage.from(BUCKET).upload(`${userId}.json`, bytes, {
    contentType: "application/json",
    upsert: true,
  });
}

export async function deleteSubscription(userId: string) {
  await supabaseAdmin.storage.from(BUCKET).remove([`${userId}.json`]);
}

export { saveFcmToken };

async function getSubscription(userId: string): Promise<PushSubscriptionJSON | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(`${userId}.json`);
  if (error || !data) return null;
  try { return JSON.parse(await data.text()); }
  catch { return null; }
}

// ── Unified send: tries FCM (native) + web-push (browser PWA) ───────────────

export async function sendPush(userId: string, payload: { title: string; body: string; tag?: string }) {
  // Send via both channels in parallel — whichever the user has registered
  await Promise.allSettled([
    // FCM — works even when app is killed on Android
    getFcmToken(userId).then((token) => token ? sendFcm(token, payload) : undefined),
    // Web-push — fallback for browser PWA / when app is in background
    getSubscription(userId).then((sub) => {
      if (!sub) return;
      try {
        initVapid();
        return webpush.sendNotification(sub as webpush.PushSubscription, JSON.stringify(payload));
      } catch (err: unknown) {
        if (err && typeof err === "object" && "statusCode" in err && (err as { statusCode: number }).statusCode === 410) {
          return deleteSubscription(userId);
        }
      }
    }),
  ]);
}

export async function sendPushToAllPMs(payload: { title: string; body: string; tag?: string }) {
  await ensureBucket();
  const { data: pmRoles } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "project_manager");
  if (!pmRoles?.length) return;
  await Promise.all(pmRoles.map((r) => sendPush(r.user_id, payload)));
}
