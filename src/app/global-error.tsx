"use client";

import { useEffect } from "react";

/** Shown if the root layout itself fails. Uses inline styles because the app's CSS may not be loaded. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const repair = async () => {
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("vb-")).map((k) => caches.delete(k)));
    } catch {
      /* best effort */
    }
    window.location.reload();
  };

  const btn = (primary: boolean) => ({
    height: 44,
    padding: "0 18px",
    borderRadius: 14,
    border: primary ? "none" : "1px solid rgba(15,23,42,.12)",
    background: primary ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "#fff",
    color: primary ? "#fff" : "#0f172a",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  });

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#f4f6fc", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#0f172a" }}>
        <div style={{ maxWidth: 380, padding: 28, textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>VocaBera needs a restart</div>
          <p style={{ color: "#64748b", lineHeight: 1.5 }}>Something went wrong while loading the app. Your words and progress are safe on this device.</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 18 }}>
            <button type="button" style={btn(true)} onClick={() => reset()}>
              Try again
            </button>
            <button type="button" style={btn(false)} onClick={() => window.location.reload()}>
              Reload
            </button>
            <button type="button" style={btn(false)} onClick={() => void repair()}>
              Repair app
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
