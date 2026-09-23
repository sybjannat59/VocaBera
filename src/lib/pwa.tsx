"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaCtx {
  canInstall: boolean;
  installed: boolean;
  isIOS: boolean;
  online: boolean;
  swReady: boolean;
  install: () => Promise<boolean>;
}

const Ctx = createContext<PwaCtx>({ canInstall: false, installed: false, isIOS: false, online: true, swReady: false, install: async () => false });

export function PwaProvider({ children }: { children: ReactNode }) {
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [online, setOnline] = useState(true);
  const [swReady, setSwReady] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    setOnline(navigator.onLine);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    const onInstalled = () => {
      deferred.current = null;
      setCanInstall(false);
      setInstalled(true);
      toast.success("VocaBera installed! Open it from your home screen.");
    };
    const onOnline = () => {
      setOnline(true);
      toast.success("Back online");
    };
    const onOffline = () => {
      setOnline(false);
      toast.message("You're offline — saved words still work. Changes need a connection.");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Service worker registration + update flow (production only; dev caching causes stale bundles).
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    const promptUpdate = (reg: ServiceWorkerRegistration) => {
      const waiting = reg.waiting;
      if (!waiting || !navigator.serviceWorker.controller) return;
      toast("A new version of VocaBera is ready", {
        duration: Infinity,
        action: { label: "Update", onClick: () => waiting.postMessage({ type: "SKIP_WAITING" }) },
      });
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        setSwReady(true);
        promptUpdate(reg);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed") promptUpdate(reg);
          });
        });
        const check = () => document.visibilityState === "visible" && reg.update().catch(() => undefined);
        document.addEventListener("visibilitychange", check);
        setInterval(check, 60 * 60_000);
      } catch (err) {
        console.warn("Service worker registration failed", err);
      }
    };
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", () => void register(), { once: true });
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  const install = useCallback(async () => {
    const e = deferred.current;
    if (!e) return false;
    await e.prompt();
    const { outcome } = await e.userChoice;
    deferred.current = null;
    setCanInstall(false);
    return outcome === "accepted";
  }, []);

  const value = useMemo(() => ({ canInstall, installed, isIOS, online, swReady, install }), [canInstall, installed, isIOS, online, swReady, install]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePwa = () => useContext(Ctx);
