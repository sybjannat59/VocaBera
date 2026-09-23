"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { runNetworkCheck, type NetworkReport } from "./net-check";
import { readCustomTurn, saveCustomTurn, SyncEngine, type CustomTurn, type SyncState } from "./peer-engine";
import { useSettings } from "./settings";
import { useVocab } from "./store";

export type { CustomTurn, LinkRoute, SyncDevice, SyncPhase, SyncRole } from "./peer-engine";
export type { CheckResult, NetworkReport } from "./net-check";
export { extractSyncCode } from "./peer-engine";

interface SyncCtx extends SyncState {
  autoSync: boolean;
  localOnly: boolean;
  /** Name of the first paired device (convenience). */
  peerName: string;
  createRoom: (name?: string) => Promise<void>;
  joinRoom: (code: string, name?: string) => Promise<void>;
  endSession: () => Promise<void>;
  retry: () => void;
  sendMine: () => Promise<void>;
  getLatest: () => void;
  setLocalName: (name: string) => void;
  setAutoSync: (on: boolean) => void;
  setLocalOnly: (on: boolean) => void;
  /** Runs the connection test (pairing service, local network, internet path, relay). */
  checkNetwork: () => Promise<NetworkReport>;
  customRelay: () => CustomTurn | null;
  setCustomRelay: (value: CustomTurn | null) => Promise<void>;
}

const Ctx = createContext<SyncCtx | null>(null);

/**
 * Peer-to-peer device sync (PeerJS + WebRTC). Mounted once at the app root, so the
 * connection survives navigation between tabs; a page reload resumes it automatically.
 */
export function LiveSyncProvider({ children }: { children: ReactNode }) {
  const { words, activity, sessions, status, applyData } = useVocab();
  const { settings, update } = useSettings();
  const engineRef = useRef<SyncEngine | null>(null);
  if (!engineRef.current) engineRef.current = new SyncEngine();
  const engine = engineRef.current;
  const state = useSyncExternalStore(engine.subscribe, engine.getState, engine.getServerState);

  useEffect(() => {
    engine.applyData = applyData;
  }, [engine, applyData]);

  useEffect(() => {
    engine.autoSync = settings.autoSync;
  }, [engine, settings.autoSync]);

  useEffect(() => {
    engine.localOnly = settings.syncLocalOnly;
  }, [engine, settings.syncLocalOnly]);

  useEffect(() => {
    engine.init();
    return () => engine.destroy();
  }, [engine]);

  // Any local change (new word, review, edit…) is pushed to paired devices after a short pause.
  useEffect(() => {
    if (status === "ready") engine.notifyLocalChange();
  }, [engine, status, words, activity, sessions]);

  const value = useMemo<SyncCtx>(
    () => ({
      ...state,
      autoSync: settings.autoSync,
      localOnly: settings.syncLocalOnly,
      peerName: state.devices[0]?.name ?? "",
      createRoom: (name) => engine.createRoom(name),
      joinRoom: (code, name) => engine.joinRoom(code, name),
      endSession: () => engine.endSession(),
      retry: () => engine.retry(),
      sendMine: () => engine.sendMine(),
      getLatest: () => engine.getLatest(),
      setLocalName: (name) => engine.setName(name),
      setAutoSync: (on) => {
        engine.autoSync = on;
        update({ autoSync: on });
        if (on) engine.notifyLocalChange();
      },
      setLocalOnly: (on) => update({ syncLocalOnly: on }),
      checkNetwork: async () => runNetworkCheck(settings.syncLocalOnly, await engine.loadRelays(true)),
      customRelay: () => readCustomTurn(),
      setCustomRelay: async (value) => {
        saveCustomTurn(value);
        await engine.loadRelays(true);
      },
    }),
    [state, settings.autoSync, settings.syncLocalOnly, engine, update],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLiveSync() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLiveSync must be used inside LiveSyncProvider");
  return ctx;
}
