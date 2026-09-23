"use client";

import { CircleCheck, Download, Share, SquarePlus, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { usePwa } from "@/lib/pwa";
import { Button, Card, IconTile } from "./ui";

export function InstallCard() {
  const { canInstall, installed, isIOS, online, swReady, install } = usePwa();

  return (
    <Card className="overflow-hidden p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <img src="/icons/icon.svg" alt="" width={48} height={48} className="size-12 shrink-0 rounded-[14px] shadow-lg shadow-brand-500/30" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">Install VocaBera</span>
            {installed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                <CircleCheck className="size-3" /> Installed
              </span>
            )}
            {swReady && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/12 px-2 py-0.5 text-[11px] font-bold text-sky-700 dark:text-sky-300">
                <WifiOff className="size-3" /> Offline ready
              </span>
            )}
          </div>
          <p className="text-xs leading-snug text-muted">
            {installed ? "Running as an app. Launch it from your home screen or dock." : "Full-screen app with an icon on your home screen, faster launch and offline access."}
          </p>
        </div>
      </div>

      {!installed && canInstall && (
        <Button
          className="mt-4 w-full"
          icon={Download}
          onClick={async () => {
            const ok = await install();
            if (!ok) toast.message("Installation cancelled");
          }}
        >
          Install app
        </Button>
      )}

      {!installed && !canInstall && isIOS && (
        <div className="mt-4 space-y-2 rounded-2xl bg-black/[0.035] p-3.5 text-[13px] dark:bg-white/[0.05]">
          <div className="font-bold">Install on iPhone / iPad (Safari)</div>
          <div className="flex items-center gap-2">
            <IconTile icon={Share} tone="sky" size="sm" /> 1. Tap the <b>Share</b> button in Safari
          </div>
          <div className="flex items-center gap-2">
            <IconTile icon={SquarePlus} tone="brand" size="sm" /> 2. Choose <b>Add to Home Screen</b>
          </div>
        </div>
      )}

      {!installed && !canInstall && !isIOS && (
        <p className="mt-3 rounded-2xl bg-black/[0.035] p-3 text-xs leading-relaxed text-muted dark:bg-white/[0.05]">
          {online
            ? "Use your browser menu → “Install app” / “Add to Home screen” (Chrome, Edge, Samsung Internet). The install button appears here automatically when your browser allows it."
            : "Reconnect to the internet to install the app."}
        </p>
      )}
    </Card>
  );
}
