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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-accent="indigo" suppressHydrationWarning className={`${jakarta.variable} ${hind.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
