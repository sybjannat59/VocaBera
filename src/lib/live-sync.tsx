"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { exportLocalData } from "./idb";
import { useSettings } from "./settings";
import { useVocab } from "./store";
import type { BootstrapData } from "./types";

export type SyncPhase = "idle" | "creating" | "waiting" | "connecting" | "connected" | "error";
export type SyncRole = "host" | "guest";

interface RoomCredentials {
  code: string;
  token: string;
  role: SyncRole;
}

interface SyncView {
  phase: SyncPhase;
  role: SyncRole | null;
  code: string;
  localName: string;
  peerName: string;
  error: string;
  transferProgress: number | null;
  lastSyncAt: string | null;
  autoSync: boolean;
}

interface Snapshot {
  app: string;
  version: number;
  exportedAt?: string;
  words: unknown[];
  activity: unknown[];
  sessions: unknown[];
  logs: unknown[];
  settings?: unknown;
  [key: string]: unknown;
}

interface Transfer {
  id: string;
  total: number;
  size: number;
  hash: string;
  parts: (Uint8Array | undefined)[];
  received: number;
}

type Msg = Record<string, unknown> & { t?: string };

interface SyncCtx extends SyncView {
  createRoom: (name?: string) => Promise<void>;
  joinRoom: (code: string, name?: string) => Promise<void>;
  endSession: () => Promise<void>;
  sendMine: () => Promise<void>;
  getLatest: () => void;
  setLocalName: (name: string) => void;
  setAutoSync: (on: boolean) => void;
}

const Ctx = createContext<SyncCtx | null>(null);
const DEVICE_KEY = "vb-device-name";
const CHUNK_BYTES = 9_000;
const MAX_TRANSFER = 32 * 1024 * 1024;
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

function defaultDeviceName() {
  if (typeof navigator === "undefined") return "VocaBera device";
  const ua = navigator.userAgent;
  const device = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
    ? "iPad"
    : /iPhone|iPod/.test(ua)
      ? "iPhone"
      : /Android/.test(ua)
        ? "Android device"
        : /Windows/.test(ua)
          ? "Windows PC"
          : /Mac OS/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux device"
              : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) && !/Edg\//.test(ua) ? "Chrome" : /Safari\//.test(ua) && !/Chrome\//.test(ua) ? "Safari" : "Browser";
  return `${device} · ${browser}`;
}

const cleanName = (name: string) => name.trim().replace(/[<>\u0000-\u001f]/g, "").slice(0, 48) || defaultDeviceName();

function hashText(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function storeHash(data: Pick<BootstrapData, "words" | "activity" | "sessions">) {
  return hashText(JSON.stringify({ words: data.words, activity: data.activity, sessions: data.sessions }));
}

function backupHash(snapshot: Snapshot) {
  return hashText(JSON.stringify({ words: snapshot.words, activity: snapshot.activity, sessions: snapshot.sessions, logs: snapshot.logs }));
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function LiveSyncProvider({ children }: { children: ReactNode }) {
  const { words, activity, sessions, status, importBackup } = useVocab();
  const { settings, update } = useSettings();
  const [state, setState] = useState<SyncView>({
    phase: "idle",
    role: null,
    code: "",
    localName: "VocaBera device",
    peerName: "",
    error: "",
    transferProgress: null,
    lastSyncAt: null,
    autoSync: true,
  });
  const roomRef = useRef<RoomCredentials | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const pollStopRef = useRef<(() => void) | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transferRef = useRef<Transfer | null>(null);
  const lastObservedHash = useRef<string | null>(null);
  const lastReceivedHash = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendBusy = useRef(false);
  const localNameRef = useRef("VocaBera device");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    try {
      const saved = localStorage.getItem(DEVICE_KEY)?.trim();
      const deviceName = saved || defaultDeviceName();
      localNameRef.current = deviceName;
      setState((s) => ({ ...s, localName: deviceName, autoSync: settings.autoSync }));
    } catch {
      const deviceName = defaultDeviceName();
      localNameRef.current = deviceName;
      setState((s) => ({ ...s, localName: deviceName, autoSync: settings.autoSync }));
    }
    return () => {
      mounted.current = false;
      pollStopRef.current?.();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      channelRef.current?.close();
      pcRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setState((s) => (s.autoSync === settings.autoSync ? s : { ...s, autoSync: settings.autoSync })), [settings.autoSync]);

  const updateState = useCallback((patch: Partial<SyncView>) => {
    if (mounted.current) setState((s) => ({ ...s, ...patch }));
  }, []);

  const post = useCallback(async (room: RoomCredentials, action: string, payload: Record<string, unknown> = {}) => {
    const res = await fetch(`/api/sync/${room.code}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, role: room.role, token: room.token, ...payload }),
      cache: "no-store",
    });
    return parseResponse<{ ok: boolean }>(res);
  }, []);

  const closePeer = useCallback(() => {
    pollStopRef.current?.();
    pollStopRef.current = null;
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    try {
      channelRef.current?.close();
      pcRef.current?.close();
    } catch {
      /* already closed */
    }
    channelRef.current = null;
    pcRef.current = null;
    transferRef.current = null;
    sendBusy.current = false;
  }, []);

  const finishTransfer = useCallback(
    async (data: unknown, expectedHash: string) => {
      const snapshot = data as Snapshot;
      if (!snapshot || !Array.isArray(snapshot.words) || !Array.isArray(snapshot.activity) || !Array.isArray(snapshot.sessions)) {
        throw new Error("The other device sent an invalid backup");
      }
      if (backupHash(snapshot) !== expectedHash) throw new Error("Sync data failed its integrity check. Please try again.");
      if (lastReceivedHash.current === expectedHash) {
        if (channelRef.current?.readyState === "open") channelRef.current.send(JSON.stringify({ t: "ack", hash: expectedHash, duplicate: true }));
        updateState({ transferProgress: null, lastSyncAt: new Date().toISOString() });
        return;
      }
      const result = await importBackup(snapshot, "merge");
      if (!result) throw new Error("Could not apply the received data");
      lastReceivedHash.current = expectedHash;
      lastObservedHash.current = storeHash(result.snapshot);
      updateState({ transferProgress: null, lastSyncAt: new Date().toISOString() });
      const dc = channelRef.current;
      if (dc?.readyState === "open") dc.send(JSON.stringify({ t: "ack", hash: expectedHash }));
      toast.success(`Synced ${result.words} new word${result.words === 1 ? "" : "s"}${result.skipped ? ` · ${result.skipped} already up to date` : ""}`);
    },
    [importBackup, updateState],
  );

  const sendSnapshot = useCallback(
    async (automatic = false) => {
      const dc = channelRef.current;
      if (!dc || dc.readyState !== "open" || sendBusy.current) return;
      sendBusy.current = true;
      updateState({ transferProgress: 0 });
      try {
        let snapshot: Snapshot;
        try {
          snapshot = (await exportLocalData()) as unknown as Snapshot;
        } catch {
          snapshot = await parseResponse<Snapshot>(await fetch("/api/backup", { cache: "no-store" }));
        }
        const encoded = new TextEncoder().encode(JSON.stringify(snapshot));
        if (encoded.length > MAX_TRANSFER) throw new Error("Backup is over 32 MB. Export it as a file instead.");
        const id = crypto.randomUUID();
        const total = Math.ceil(encoded.length / CHUNK_BYTES);
        const hash = backupHash(snapshot);
        dc.send(JSON.stringify({ t: "begin", id, total, size: encoded.length, hash }));
        for (let i = 0; i < total; i++) {
          if (dc.readyState !== "open") throw new Error("Peer connection closed during sync");
          const piece = encoded.subarray(i * CHUNK_BYTES, Math.min((i + 1) * CHUNK_BYTES, encoded.length));
          dc.send(JSON.stringify({ t: "part", id, index: i, data: base64(piece) }));
          if (i % 8 === 7) {
            updateState({ transferProgress: Math.round(((i + 1) / total) * 100) });
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
        dc.send(JSON.stringify({ t: "end", id, hash }));
        if (!automatic) toast.success("Your latest data was sent");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not send data";
        if (!automatic) toast.error(message);
        updateState({ error: message, transferProgress: null });
      } finally {
        sendBusy.current = false;
        setTimeout(() => updateState({ transferProgress: null }), 900);
      }
    },
    [updateState],
  );

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      if (typeof event.data !== "string" || event.data.length > 64_000) return;
      let msg: Msg;
      try {
        msg = JSON.parse(event.data) as Msg;
      } catch {
        return;
      }
      if (msg.t === "hello") {
        if (typeof msg.name === "string") updateState({ peerName: msg.name.slice(0, 48) });
        return;
      }
      if (msg.t === "get") {
        await sendSnapshot(true);
        return;
      }
      if (msg.t === "ack") {
        updateState({ lastSyncAt: new Date().toISOString(), transferProgress: null });
        return;
      }
      if (msg.t === "begin") {
        const total = Number(msg.total);
        const size = Number(msg.size);
        if (typeof msg.id !== "string" || typeof msg.hash !== "string" || !Number.isInteger(total) || total < 1 || total > 5000 || !Number.isInteger(size) || size < 1 || size > MAX_TRANSFER) {
          updateState({ error: "The other device sent an invalid transfer." });
          return;
        }
        transferRef.current = { id: msg.id, total, size, hash: msg.hash, parts: Array(total), received: 0 };
        updateState({ transferProgress: 0, error: "" });
        return;
      }
      if (msg.t === "part") {
        const transfer = transferRef.current;
        const index = Number(msg.index);
        if (!transfer || transfer.id !== msg.id || !Number.isInteger(index) || index < 0 || index >= transfer.total || typeof msg.data !== "string") return;
        try {
          if (!transfer.parts[index]) {
            transfer.parts[index] = fromBase64(msg.data);
            transfer.received++;
          }
          updateState({ transferProgress: Math.round((transfer.received / transfer.total) * 100) });
        } catch {
          updateState({ error: "A sync chunk could not be decoded." });
          transferRef.current = null;
        }
        return;
      }
      if (msg.t === "end") {
        const transfer = transferRef.current;
        transferRef.current = null;
        if (!transfer || transfer.id !== msg.id || transfer.received !== transfer.total) {
          updateState({ error: "Sync transfer incomplete. Use Get latest to retry.", transferProgress: null });
          return;
        }
        try {
          const bytes = new Uint8Array(transfer.size);
          let offset = 0;
          for (const part of transfer.parts) {
            if (!part) throw new Error("Missing sync chunk");
            bytes.set(part, offset);
            offset += part.length;
          }
          if (offset !== transfer.size) throw new Error("Incomplete sync data");
          const hash = String(msg.hash ?? transfer.hash);
          await finishTransfer(JSON.parse(new TextDecoder().decode(bytes)) as unknown, hash);
        } catch (err) {
          updateState({ error: err instanceof Error ? err.message : "Could not apply received data", transferProgress: null });
          toast.error(err instanceof Error ? err.message : "Could not apply sync data");
        }
      }
    },
    [finishTransfer, sendSnapshot, updateState],
  );

  const attachChannel = useCallback(
    (dc: RTCDataChannel) => {
      channelRef.current = dc;
      dc.binaryType = "arraybuffer";
      dc.onopen = () => {
        updateState({ phase: "connected", error: "", peerName: state.peerName || "Paired device" });
        if (dc.readyState === "open") dc.send(JSON.stringify({ t: "hello", name: localNameRef.current }));
        // Stop polling the signaling server once WebRTC peer connection is established
        pollStopRef.current?.();
        pollStopRef.current = null;
        lastObservedHash.current = storeHash({ words, activity, sessions });
        if (settings.autoSync) setTimeout(() => void sendSnapshot(true), 500);
      };
      dc.onmessage = (event) => void handleMessage(event);
      dc.onerror = () => updateState({ error: "The live sync channel encountered an error." });
      dc.onclose = () => {
        if (mounted.current && roomRef.current) updateState({ phase: "error", error: "Connection closed. End this session and pair again." });
      };
    },
    [activity, handleMessage, sendSnapshot, sessions, settings.autoSync, state.peerName, updateState, words],
  );

  const signalLoop = useCallback(
    (room: RoomCredentials, pc: RTCPeerConnection) => {
      let stopped = false;
      let busy = false;
      let candidateCursor = 0;
      let descriptionSet = false;
      let first = true;
      let consecutive404s = 0;

      const poll = async () => {
        if (stopped || busy || roomRef.current?.code !== room.code) return;
        busy = true;
        try {
          const res = await fetch(`/api/sync/${room.code}?role=${room.role}&token=${encodeURIComponent(room.token)}`, { cache: "no-store" });
          
          if (!res.ok) {
            if (res.status === 404) {
              consecutive404s++;
              // Don't kill the room on a single transient 404
              if (consecutive404s >= 3) {
                stopped = true;
                updateState({ phase: "error", error: "This sync room expired. Please create a new room." });
                return;
              }
            } else {
              consecutive404s = 0;
            }
            return;
          }

          consecutive404s = 0;
          const info = (await res.json()) as {
            hostName?: string;
            guestName?: string | null;
            offer?: RTCSessionDescriptionInit | null;
            answer?: RTCSessionDescriptionInit | null;
            remoteCandidates?: RTCIceCandidateInit[];
          };

          if (first) {
            updateState({ peerName: room.role === "host" ? info.guestName || "" : info.hostName || "" });
            first = false;
          } else if (info.guestName || info.hostName) {
            updateState({ peerName: room.role === "host" ? info.guestName || state.peerName : info.hostName || state.peerName });
          }

          if (room.role === "guest" && info.offer && !descriptionSet) {
            descriptionSet = true;
            updateState({ phase: "connecting", error: "" });
            await pc.setRemoteDescription(info.offer);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            const local = pc.localDescription;
            if (local) await post(room, "answer", { description: { type: local.type, sdp: local.sdp } });
          }

          if (room.role === "host" && info.answer && !descriptionSet) {
            descriptionSet = true;
            updateState({ phase: "connecting", error: "" });
            await pc.setRemoteDescription(info.answer);
          }

          const candidates = info.remoteCandidates ?? [];
          if (pc.remoteDescription) {
            while (candidateCursor < candidates.length) {
              const candidate = candidates[candidateCursor++];
              try {
                await pc.addIceCandidate(candidate);
              } catch (err) {
                if (candidate.candidate) console.warn("Could not add remote ICE candidate", err);
              }
            }
          }
        } catch (err) {
          console.warn("Signal poll transient issue:", err);
        } finally {
          busy = false;
          if (!stopped && roomRef.current?.code === room.code) setTimeout(poll, 1200);
        }
      };

      void poll();
      return () => {
        stopped = true;
      };
    },
    [post, state.peerName, updateState],
  );

  const makePeer = useCallback(
    (room: RoomCredentials) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 });
      pcRef.current = pc;
      pc.onicecandidate = (event) => {
        if (event.candidate) void post(room, "candidate", { candidate: event.candidate.toJSON() }).catch(() => undefined);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") updateState({ phase: "connected", error: "" });
        if (pc.connectionState === "failed") updateState({ phase: "error", error: "Could not establish a direct connection. Ensure both devices are connected to the same Wi‑Fi." });
        if (pc.connectionState === "disconnected") updateState({ error: "Connection interrupted — waiting for peer..." });
      };
      pc.ondatachannel = (event) => attachChannel(event.channel);
      return pc;
    },
    [attachChannel, post, updateState],
  );

  const setLocalName = useCallback((name: string) => {
    const value = cleanName(name);
    try {
      localStorage.setItem(DEVICE_KEY, value);
    } catch {
      /* storage unavailable */
    }
    localNameRef.current = value;
    updateState({ localName: value });
  }, [updateState]);

  const setAutoSync = useCallback((on: boolean) => update({ autoSync: on }), [update]);

  const createRoom = useCallback(async (requestedName?: string) => {
    const deviceName = requestedName === undefined ? localNameRef.current : cleanName(requestedName);
    if (requestedName !== undefined) setLocalName(deviceName);
    closePeer();
    roomRef.current = null;
    updateState({ phase: "creating", code: "", role: null, peerName: "", error: "", transferProgress: null });
    try {
      const res = await parseResponse<{ code: string; token: string; role: SyncRole }>(
        await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", name: deviceName }) }),
      );
      roomRef.current = res;
      updateState({ phase: "waiting", code: res.code, role: res.role, error: "" });
      const pc = makePeer(res);
      attachChannel(pc.createDataChannel("vocabera-live-sync", { ordered: true }));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const local = pc.localDescription;
      if (local) await post(res, "offer", { description: { type: local.type, sdp: local.sdp } });
      pollStopRef.current = signalLoop(res, pc);
    } catch (err) {
      closePeer();
      roomRef.current = null;
      updateState({ phase: "error", code: "", role: null, error: err instanceof Error ? err.message : "Could not create a room" });
    }
  }, [attachChannel, closePeer, makePeer, post, setLocalName, signalLoop, updateState]);

  const joinRoom = useCallback(async (rawCode: string, requestedName?: string) => {
    const invite = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(invite)) {
      updateState({ phase: "error", code: "", role: null, error: "Enter the 5-character room code shown on the other device." });
      return;
    }
    const deviceName = requestedName === undefined ? localNameRef.current : cleanName(requestedName);
    if (requestedName !== undefined) setLocalName(deviceName);
    closePeer();
    roomRef.current = null;
    updateState({ phase: "connecting", code: invite, role: null, peerName: "", error: "", transferProgress: null });
    try {
      const res = await parseResponse<{ code: string; token: string; role: SyncRole; hostName: string }>(
        await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", code: invite, name: deviceName }) }),
      );
      roomRef.current = res;
      updateState({ phase: "connecting", code: res.code, role: res.role, peerName: res.hostName, error: "" });
      const pc = makePeer(res);
      pollStopRef.current = signalLoop(res, pc);
    } catch (err) {
      closePeer();
      roomRef.current = null;
      updateState({ phase: "error", code: "", role: null, error: err instanceof Error ? err.message : "Could not join this room" });
    }
  }, [closePeer, makePeer, setLocalName, signalLoop, updateState]);

  const endSession = useCallback(async () => {
    const room = roomRef.current;
    closePeer();
    roomRef.current = null;
    updateState({ phase: "idle", role: null, code: "", peerName: "", error: "", transferProgress: null });
    if (room) {
      try {
        await post(room, "end");
      } catch {
        /* the peer may have already ended */
      }
    }
    toast.message("Live sync session ended");
  }, [closePeer, post, updateState]);

  const sendMine = useCallback(() => sendSnapshot(false), [sendSnapshot]);
  const getLatest = useCallback(() => {
    const dc = channelRef.current;
    if (dc?.readyState !== "open") return toast.error("Connect to a device first");
    dc.send(JSON.stringify({ t: "get" }));
    toast.message("Asking the paired device for its latest data…");
  }, []);

  // Seed the hash once the database bootstrap has arrived.
  useEffect(() => {
    if (status !== "ready" || lastObservedHash.current !== null) return;
    lastObservedHash.current = storeHash({ words, activity, sessions });
  }, [activity, sessions, status, words]);

  // Debounced automatic sync. Changes received from the peer set the observed
  // hash before the store re-renders, so they are never echoed back in a loop.
  useEffect(() => {
    if (status !== "ready" || state.phase !== "connected" || !settings.autoSync) return;
    const data = { words, activity, sessions };
    const nextHash = storeHash(data);
    if (lastObservedHash.current === null) {
      lastObservedHash.current = nextHash;
      return;
    }
    if (nextHash === lastObservedHash.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    lastObservedHash.current = nextHash;
    debounceRef.current = setTimeout(() => {
      if (lastObservedHash.current !== nextHash) return;
      void sendSnapshot(true);
    }, 900);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [activity, sessions, sendSnapshot, settings.autoSync, state.phase, status, words]);

  const value = useMemo<SyncCtx>(
    () => ({ ...state, createRoom, joinRoom, endSession, sendMine, getLatest, setLocalName, setAutoSync }),
    [state, createRoom, joinRoom, endSession, sendMine, getLatest, setLocalName, setAutoSync],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLiveSync() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLiveSync must be used inside LiveSyncProvider");
  return ctx;
}
