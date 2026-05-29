import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.callgrow.crm",
  appName: "Call to Grow CRM",
  webDir: "dist/public",
  server: {
    url: "https://tele-calling-crm-6z4f.vercel.app",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#09090b",
  },
};

export default config;
