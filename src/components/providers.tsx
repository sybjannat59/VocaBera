"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { CircleQuestionMark, TriangleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { SettingsProvider, useSettings } from "@/lib/settings";
import { LiveSyncProvider } from "@/lib/live-sync";
import { PwaProvider } from "@/lib/pwa";
import { VocabProvider, WordSheetProvider } from "@/lib/store";
import { Button, IconTile, PresenceLayer, inputCls, type IconType } from "./ui";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "primary";
  icon?: IconType;
  requireText?: string;
}

type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;
const ConfirmCtx = createContext<ConfirmFn>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState("");

  const confirm = useCallback<ConfirmFn>(
    (o) =>
      new Promise<boolean>((resolve) => {
        setTyped("");
        setState({ ...o, resolve });
      }),
    [],
  );

  const close = useCallback(
    (v: boolean) => {
      setState((s) => {
        s?.resolve(v);
        return null;
      });
    },
    [],
  );

  const blocked = !!state?.requireText && typed.trim() !== state.requireText;

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter" && !blocked) close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, blocked, close]);

  const danger = state?.tone === "danger";

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {state && (
          <PresenceLayer key="confirm" className="fixed inset-0 z-[80] grid place-items-center p-5">
            <motion.div
              className="absolute inset-0 bg-slate-950/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => close(false)}
            />
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-label={state.title}
              className="relative w-full max-w-sm rounded-[30px] border border-white/70 bg-[rgba(248,250,255,0.97)] p-6 text-center shadow-2xl dark:border-white/10 dark:bg-[rgba(16,21,37,0.97)]"
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            >
              <IconTile
                icon={state.icon ?? (danger ? TriangleAlert : CircleQuestionMark)}
                tone={danger ? "rose" : "brand"}
                size="lg"
                className="mx-auto"
              />
              <h3 className="mt-4 text-lg font-bold tracking-tight">{state.title}</h3>
              {state.message && <p className="mt-1.5 text-sm leading-relaxed text-muted">{state.message}</p>}
              {state.requireText && (
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={`Type ${state.requireText} to confirm`}
                  className={`${inputCls} mt-4 text-center`}
                />
              )}
              <div className="mt-6 grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => close(false)}>
                  {state.cancelText ?? "Cancel"}
                </Button>
                <Button variant={danger ? "danger" : "primary"} disabled={blocked} onClick={() => close(true)}>
                  {state.confirmText ?? "Confirm"}
                </Button>
              </div>
            </motion.div>
          </PresenceLayer>
        )}
      </AnimatePresence>
    </ConfirmCtx.Provider>
  );
}

function ThemedToaster() {
  const { settings } = useSettings();
  return (
    <Toaster
      position="top-center"
      theme={settings.theme}
      richColors
      closeButton
      toastOptions={{ style: { borderRadius: 18, fontFamily: "inherit" } }}
    />
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <SettingsProvider>
        <PwaProvider>
        <VocabProvider>
          <LiveSyncProvider>
            <WordSheetProvider>
              <ConfirmProvider>
                {children}
                <ThemedToaster />
              </ConfirmProvider>
            </WordSheetProvider>
          </LiveSyncProvider>
        </VocabProvider>
        </PwaProvider>
      </SettingsProvider>
    </MotionConfig>
  );
}
