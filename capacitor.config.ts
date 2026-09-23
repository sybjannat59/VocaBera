import type { CapacitorConfig } from "@capacitor/cli";

/**
 * VocaBera Android wrapper.
 *
 * VocaBera's data layer is server-side (Next.js route handlers + PostgreSQL),
 * so the APK is a native shell that loads the deployed instance — full-screen,
 * no browser UI, native splash screen and icon, offline cache and PWA intact.
 *
 * Point `server.url` at your own deployment to make the APK permanent:
 *   https://your-vocabera-domain.com
 */
const config: CapacitorConfig = {
  appId: "app.vocabera.mobile",
  appName: "VocaBera",
  webDir: "public",
  android: {
    // Mixed content is not needed; keep the WebView locked down
    allowMixedContent: false,
    // The deployed VocaBera instance (must be HTTPS)
    // Override at build time with CAPACITOR_SERVER_URL
  },
  server: {
    url: process.env.CAPACITOR_SERVER_URL || "https://3000-i8fx9tvh5dg7br366m9k9.e2b.app",
    cleartext: false,
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: "#eef0ff",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashImmersive: true,
    },
  },
};

export default config;
