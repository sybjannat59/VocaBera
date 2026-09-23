import type { Metadata, Viewport } from "next";
import { Hind_Siliguri, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const hind = Hind_Siliguri({
  subsets: ["bengali"],
  weight: ["400", "500", "600"],
  variable: "--font-hind",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "VocaBera — Smart Vocabulary Builder", template: "%s · VocaBera" },
  description:
    "Build your English vocabulary with Bangla meanings, smart adaptive quizzes, beautiful flashcards and spaced repetition.",
  applicationName: "VocaBera",
  appleWebApp: { capable: true, title: "VocaBera", statusBarStyle: "default" },
  other: { "mobile-web-app-capable": "yes" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f4f6fc",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeScript = `(function(){try{var s=JSON.parse(localStorage.getItem('vb-settings')||'{}');var t=s.theme||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d)r.classList.add('dark');r.style.colorScheme=d?'dark':'light';r.setAttribute('data-accent',s.accent||'indigo');}catch(e){}window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__vbInstallPrompt=e;window.dispatchEvent(new Event('vb:installable'));});})();`;

// After a new deployment, an already-open page can request JavaScript files that no longer exist.
// Reload once (at most every 30 s) so the page picks up the new version instead of freezing.
const recoveryScript = `(function(){var K='vb-chunk-reload';function bad(m){return /ChunkLoadError|Loading (CSS )?chunk [\\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(m||'')}function heal(){try{var t=+sessionStorage.getItem(K)||0;if(Date.now()-t<30000)return;sessionStorage.setItem(K,String(Date.now()))}catch(e){}location.reload()}window.addEventListener('error',function(e){var t=e.target;if(t&&(t.tagName==='SCRIPT'||t.tagName==='LINK')&&/\\/_next\\/static\\//.test(t.src||t.href||''))return heal();if(bad(e.message))heal()},true);window.addEventListener('unhandledrejection',function(e){var r=e.reason;if(bad(r&&(r.message||r.name)||String(r)))heal()})})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-accent="indigo" suppressHydrationWarning className={`${jakarta.variable} ${hind.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: recoveryScript }} />
      </head>
      <body className="font-sans antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
