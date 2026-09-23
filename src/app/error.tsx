"use client";

import { RefreshCw, RotateCcw, TriangleAlert, Wrench } from "lucide-react";
import { useEffect } from "react";
import { Button, EmptyState } from "@/components/ui";
import { repairApp } from "@/lib/pwa";
import { resetScrollLock } from "@/lib/scroll-lock";

const CHUNK_RE = /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Importing a module script failed/i;

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    resetScrollLock();
    // A file from an older deployment is missing: one reload picks up the current version.
    if (CHUNK_RE.test(`${error?.name} ${error?.message}`)) {
      try {
        const last = Number(sessionStorage.getItem("vb-chunk-reload")) || 0;
        if (Date.now() - last > 30_000) {
          sessionStorage.setItem("vb-chunk-reload", String(Date.now()));
          window.location.reload();
        }
      } catch {
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <EmptyState
      icon={TriangleAlert}
      tone="rose"
      title="Something went wrong"
      text="This screen hit an unexpected problem. Your words and progress are safe on this device."
    >
      <Button icon={RotateCcw} onClick={() => reset()}>
        Try again
      </Button>
      <Button variant="secondary" icon={RefreshCw} onClick={() => window.location.reload()}>
        Reload
      </Button>
      <Button variant="ghost" icon={Wrench} onClick={() => void repairApp()}>
        Repair app
      </Button>
    </EmptyState>
  );
}
