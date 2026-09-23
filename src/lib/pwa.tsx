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
}

const Ctx = createContext<PwaCtx | null>(null);
const READY_KEY = "vb-offline-ready";

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
  const updateRequested = useRef(false);

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

  // Service worker registration + update flow (production only).
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    let pendingReload = false;
    const onControllerChange = () => {
      if (pendingReload) window.location.reload();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && regRef.current?.active) regRef.current?.update().catch(() => undefined);
    };
    const promptUpdate = (worker: ServiceWorker) => {
      toast("A new version of VocaBera is ready", {
        id: "vb-update",
        duration: Infinity,
        description: "Update now to get the latest features and fixes.",
        action: {
          label: "Update",
          onClick: () => {
            pendingReload = true;
            worker.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    };
    const readVersion = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const channel = new MessageChannel();
      channel.port1.onmessage = (e) => setVersion(String(e.data ?? ""));
      worker.postMessage({ type: "GET_VERSION" }, [channel.port2]);
    };

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        regRef.current = reg;
        let pumpId: number | undefined;
        const pump = () => {
          pumpId = window.setTimeout(() => {
            if (document.visibilityState === "visible" && regRef.current?.waiting) {
              const worker = regRef.current.waiting;
              if (worker?.state === "installed") {
                // A tab is waiting on a broken preload. Ask the SW to skip waiting now.
                pendingReload = true;
                worker.postMessage({ type: "SKIP_WAITING" });
              }
            } else pump();
          }, 4000) as unknown as number;
        };
        pump();
        if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) promptUpdate(worker);
          });
        });
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "SW_ACTIVATED") {
            clearTimeout(pumpId);
            setOfflineReady(true);
          }
        });
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
        interval = setInterval(() => {
          reg.update().catch(() => undefined);
          pump();
        }, 60 * 60 * 1000);
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
      if (!reg.waiting && !reg.installing) toast.success("You're on the latest version");
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
