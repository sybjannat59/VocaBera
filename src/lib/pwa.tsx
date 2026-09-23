"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    __vbInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

type InstallOutcome = "accepted" | "dismissed" | "unavailable";

interface PwaCtx {
  online: boolean;
  canInstall: boolean;
  installed: boolean;
  isIOS: boolean;
  offlineReady: boolean;
  version: string;
  promptInstall: () => Promise<InstallOutcome>;
  checkForUpdate: () => Promise<void>;
  repair: () => Promise<void>;
}

const Ctx = createContext<PwaCtx | null>(null);
const READY_KEY = "vb-offline-ready";

/**
 * Last-resort fix for a stuck app: removes the service worker and cached files, then reloads.
 * Your words and progress live in IndexedDB and are not touched.
 */
export async function repairApp() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    /* no service worker */
  }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("vb-") || k.startsWith("next-")).map((k) => caches.delete(k)));
  } catch {
    /* Cache Storage unavailable */
  }
  try {
    sessionStorage.removeItem("vb-chunk-reload");
  } catch {
    /* ignore */
  }
  window.location.reload();
}

function detectStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [version, setVersion] = useState("");
  const regRef = useRef<ServiceWorkerRegistration | null>(null);

  // Install prompt, display mode & connectivity.
  useEffect(() => {
    setOnline(navigator.onLine);
    setIsIOS(detectIOS());
    setInstalled(detectStandalone());
    if (window.__vbInstallPrompt) setDeferred(window.__vbInstallPrompt);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__vbInstallPrompt = e as BeforeInstallPromptEvent;
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onEarly = () => window.__vbInstallPrompt && setDeferred(window.__vbInstallPrompt);
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      window.__vbInstallPrompt = null;
      toast.success("VocaBera installed", { description: "Open it from your home screen or app list." });
    };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const mq = window.matchMedia("(display-mode: standalone)");
    const onMode = () => setInstalled(detectStandalone());

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("vb:installable", onEarly);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    mq.addEventListener("change", onMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("vb:installable", onEarly);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      mq.removeEventListener("change", onMode);
    };
  }, []);

  // Service worker (production only). New versions activate by themselves; the page is never
  // force-reloaded mid-task — Next.js reloads on the next navigation when the build changed.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    let hadController = !!navigator.serviceWorker.controller;

    const readVersion = (worker: ServiceWorker | null | undefined) => {
      if (!worker) return;
      const channel = new MessageChannel();
      channel.port1.onmessage = (e) => setVersion(String(e.data ?? ""));
      worker.postMessage({ type: "GET_VERSION" }, [channel.port2]);
    };
    const onControllerChange = () => {
      readVersion(navigator.serviceWorker.controller);
      if (!hadController) {
        hadController = true; // first install — nothing to announce
        return;
      }
      toast.success("VocaBera was updated", {
        id: "vb-updated",
        description: "You're on the latest version.",
        action: { label: "Reload", onClick: () => window.location.reload() },
      });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") regRef.current?.update().catch(() => undefined);
    };

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        regRef.current = reg;
        const ready = await navigator.serviceWorker.ready;
        setOfflineReady(true);
        readVersion(ready.active);
        try {
          if (!localStorage.getItem(READY_KEY)) {
            localStorage.setItem(READY_KEY, "1");
            toast.success("VocaBera now works offline", {
              description: "Your words, flashcards and quizzes open even without internet.",
            });
          }
        } catch {
          /* storage unavailable */
        }
        interval = setInterval(() => reg.update().catch(() => undefined), 30 * 60 * 1000);
        document.addEventListener("visibilitychange", onVisible);
      } catch (err) {
        console.warn("Service worker registration failed", err);
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", () => void register(), { once: true });
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
      if (interval) clearInterval(interval);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    const e = deferred ?? window.__vbInstallPrompt ?? null;
    if (!e) return "unavailable";
    try {
      await e.prompt();
      const choice = await e.userChoice;
      return choice.outcome;
    } catch {
      return "dismissed";
    } finally {
      setDeferred(null);
      window.__vbInstallPrompt = null;
    }
  }, [deferred]);

  const checkForUpdate = useCallback(async () => {
    const reg = regRef.current;
    if (!reg) {
      toast.message("Updates are checked automatically in the installed app");
      return;
    }
    try {
      await reg.update();
      if (reg.installing || reg.waiting) toast.message("Downloading the latest version…", { id: "vb-updated" });
      else toast.success("You're on the latest version");
    } catch {
      toast.error("Couldn't check for updates — are you online?");
    }
  }, []);

  const value = useMemo<PwaCtx>(
    () => ({
      online,
      canInstall: !!deferred && !installed,
      installed,
      isIOS,
      offlineReady,
      version,
      promptInstall,
      checkForUpdate,
      repair: repairApp,
    }),
    [online, deferred, installed, isIOS, offlineReady, version, promptInstall, checkForUpdate],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePwa() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePwa must be used inside PwaProvider");
  return ctx;
}
