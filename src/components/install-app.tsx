"use client";

import { BadgeCheck, CloudOff, CloudUpload, Download, RefreshCw, Share, Smartphone, SquarePlus, Wifi, Wrench, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { usePwa } from "@/lib/pwa";
import { useVocab } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { Button, Card, IconTile } from "./ui";

const DISMISS_KEY = "vb-install-dismissed";

function useInstall() {
  const pwa = usePwa();
  const install = async () => {
    const outcome = await pwa.promptInstall();
    if (outcome === "unavailable") toast.message("Use your browser menu → “Install app” / “Add to Home Screen”.");
  };
  return { ...pwa, install };
}

/** Compact, dismissible install prompt for the Home page. */
export function InstallBanner() {
  const { canInstall, installed, isIOS, install } = useInstall();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (installed || dismissed || !(canInstall || isIOS)) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="surface mb-4 flex animate-fade-up items-center gap-3 rounded-[22px] p-3 sm:p-3.5">
      <Logo className="size-11 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-bold">Install VocaBera</div>
        <div className="text-[12.5px] leading-snug text-muted">
          {canInstall ? (
            "Opens full-screen like an app and works offline."
          ) : (
            <>
              Tap <Share className="inline size-3.5 -translate-y-px" /> Share, then <b>Add to Home Screen</b>
              <SquarePlus className="ml-0.5 inline size-3.5 -translate-y-px" />
            </>
          )}
        </div>
      </div>
      {canInstall && (
        <Button size="sm" icon={Download} onClick={() => void install()}>
          Install
        </Button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install suggestion"
        className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-black/5 hover:text-fg dark:hover:bg-white/10"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Full install & offline status card for Manage → Settings. */
export function InstallSettingsCard() {
  const { canInstall, installed, isIOS, install, offlineReady, online, version, checkForUpdate, repair } = useInstall();

  const status = installed
    ? { label: "Installed", cls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" }
    : canInstall
      ? { label: "Ready to install", cls: "bg-brand-500/12 text-brand-700 dark:text-brand-200" }
      : { label: "Browser", cls: "bg-slate-500/12 text-muted" };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <IconTile icon={Smartphone} tone="brand" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">VocaBera app</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", status.cls)}>{status.label}</span>
          </div>
          <div className="text-xs text-muted">Install for full-screen use, quick launch and offline study.</div>
        </div>
      </div>

      <div className="mt-4">
        {installed ? (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-500/10 px-3.5 py-3 text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">
            <BadgeCheck className="size-4" /> You&apos;re using the installed app.
          </div>
        ) : canInstall ? (
          <Button className="w-full" icon={Download} onClick={() => void install()}>
            Install VocaBera
          </Button>
        ) : isIOS ? (
          <ol className="space-y-1.5 rounded-2xl bg-black/[0.035] px-4 py-3 text-[13px] dark:bg-white/[0.05]">
            <li>
              1. Tap <Share className="inline size-4 -translate-y-px text-brand-500" /> <b>Share</b> in Safari
            </li>
            <li>
              2. Choose <b>Add to Home Screen</b> <SquarePlus className="inline size-4 -translate-y-px text-brand-500" />
            </li>
            <li>3. Tap <b>Add</b> — VocaBera appears on your home screen</li>
          </ol>
        ) : (
          <p className="rounded-2xl bg-black/[0.035] px-4 py-3 text-[13px] leading-relaxed text-muted dark:bg-white/[0.05]">
            Open your browser menu and choose <b className="text-fg">Install app</b> or <b className="text-fg">Add to Home screen</b>. Works in Chrome, Edge, Samsung Internet and Safari.
          </p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
        <div className="flex items-center gap-2 rounded-2xl bg-black/[0.035] px-3 py-2.5 dark:bg-white/[0.05]">
          {offlineReady ? <BadgeCheck className="size-4 text-emerald-500" /> : <CloudOff className="size-4 text-muted" />}
          <span className="font-semibold">{offlineReady ? "Offline ready" : "Offline: after first load"}</span>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-black/[0.035] px-3 py-2.5 dark:bg-white/[0.05]">
          {online ? <Wifi className="size-4 text-emerald-500" /> : <CloudOff className="size-4 text-amber-500" />}
          <span className="font-semibold">{online ? "Online" : "Offline"}</span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between px-1 text-[11.5px] text-muted">
        <span>{version ? `Build ${version}` : "Build —"}</span>
        <span className="flex items-center gap-3">
          <button type="button" onClick={() => void checkForUpdate()} className="inline-flex items-center gap-1 font-bold text-brand-600 dark:text-brand-300">
            <RefreshCw className="size-3.5" /> Check for updates
          </button>
          <button
            type="button"
            onClick={() => void repair()}
            title="Fixes a stuck or outdated app. Your words and progress are kept."
            className="inline-flex items-center gap-1 font-bold text-muted hover:text-fg"
          >
            <Wrench className="size-3.5" /> Repair app
          </button>
        </span>
      </div>
    </Card>
  );
}

/** Floating pill shown while offline or while offline progress is waiting to sync. */
export function ConnectivityPill() {
  const { online } = usePwa();
  const { pendingSync } = useVocab();
  if (online && !pendingSync) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.4rem)] z-40 flex justify-center px-4">
      <div role="status" className="glass pointer-events-auto inline-flex animate-fade-up items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold">
        {online ? <CloudUpload className="size-3.5 text-brand-500" /> : <CloudOff className="size-3.5 text-amber-500" />}
        {online
          ? `${pendingSync} offline session${pendingSync === 1 ? "" : "s"} waiting to sync`
          : pendingSync
            ? `Offline · ${pendingSync} session${pendingSync === 1 ? "" : "s"} waiting to sync`
            : "Offline · showing your saved words"}
      </div>
    </div>
  );
}
