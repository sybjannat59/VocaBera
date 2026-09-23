import type { DataConnection, Peer, PeerOptions } from "peerjs";
import { toast } from "sonner";
import { exportSyncSnapshot, getDeviceId, hashText, isSyncSnapshot, mergeSyncSnapshot, snapshotDigest, type MergeResult } from "./sync-data";
import type { BootstrapData } from "./types";

/* ================================== Types ================================== */

export type SyncPhase = "idle" | "starting" | "waiting" | "connecting" | "connected" | "reconnecting" | "error";
export type SyncRole = "host" | "guest";
/** How the two devices are linked: same Wi‑Fi (host candidates), direct through the router, or relayed. */
export type LinkRoute = "lan" | "direct" | "relay" | "unknown";

export interface SyncDevice {
  key: string;
  name: string;
  route: LinkRoute;
  rtt: number | null;
  since: number;
}

export interface SyncTransfer {
  direction: "send" | "receive";
  peer: string;
  progress: number;
}

export interface SyncState {
  phase: SyncPhase;
  role: SyncRole | null;
  code: string;
  joinLink: string;
  localName: string;
  devices: SyncDevice[];
  error: string;
  attempt: number;
  transfer: SyncTransfer | null;
  lastSyncAt: string | null;
  lastResult: string;
  signal: "online" | "offline";
}

export const IDLE_STATE: SyncState = {
  phase: "idle",
  role: null,
  code: "",
  joinLink: "",
  localName: "VocaBera device",
  devices: [],
  error: "",
  attempt: 0,
  transfer: null,
  lastSyncAt: null,
  lastResult: "",
  signal: "online",
};

interface Link {
  key: string;
  conn: DataConnection;
  name: string;
  deviceId: string;
  created: number;
  since: number;
  lastSeen: number;
  route: LinkRoute;
  rtt: number | null;
  gzip: boolean;
  helloed: boolean;
  sentDigest: string | null;
  recvDigest: string | null;
  queue: Promise<void>;
  transfers: Map<string, Incoming>;
  autoSends: number[];
  silent: boolean;
  bye: boolean;
}

interface Incoming {
  total: number;
  size: number;
  hash: string;
  digest: string;
  gz: boolean;
  force: boolean;
  parts: (string | undefined)[];
  received: number;
}

type Msg = { t?: string } & Record<string, unknown>;

/* ================================ Constants ================================ */

const PROTOCOL = 3;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;
/** 9 000 bytes → ~12 KB base64: safely below PeerJS's 16 300‑byte JSON message limit. */
const CHUNK = 9000;
const MAX_BYTES = 48 * 1024 * 1024;
const SESSION_KEY = "vb-sync-session";
const NAME_KEY = "vb-device-name";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const HEARTBEAT_MS = 4000;
const DEAD_AFTER_MS = 16000;
const OPEN_TIMEOUT_MS = 20000;

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: "stun:stun.cloudflare.com:3478" },
  // Free PeerJS relays: only used when a direct Wi‑Fi path is blocked (e.g. router client isolation).
  { urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" },
];

/* ================================= Helpers ================================= */

export const peerIdFor = (code: string) => `vocabera-${code}`;

export function joinLinkFor(code: string) {
  return typeof window === "undefined" || !code ? "" : `${window.location.origin}/manage?tab=sync&join=${code}`;
}

/** Accepts a bare code, an invite link or scanned QR text. */
export function extractSyncCode(text: string): string | null {
  const t = (text || "").trim();
  const match =
    t.match(/[?&#](?:join|code|sync)=([A-Za-z0-9]{5})(?![A-Za-z0-9])/) ??
    t.match(/vocabera-([A-Za-z0-9]{5})(?![A-Za-z0-9])/i) ??
    t.match(/^([A-Za-z0-9]{5})$/);
  if (!match) return null;
  const code = match[1].toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

function randomCode() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => CODE_ALPHABET[n & 31]).join("");
}

function defaultDeviceName() {
  if (typeof navigator === "undefined") return "VocaBera device";
  const ua = navigator.userAgent;
  const device =
    /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      ? "iPad"
      : /iPhone|iPod/.test(ua)
        ? "iPhone"
        : /Android/.test(ua)
          ? /Mobile/.test(ua)
            ? "Android phone"
            : "Android tablet"
          : /Windows/.test(ua)
            ? "Windows PC"
            : /Mac OS/.test(ua)
              ? "Mac"
              : /CrOS/.test(ua)
                ? "Chromebook"
                : /Linux/.test(ua)
                  ? "Linux PC"
                  : "Device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  return `${device} · ${browser}`;
}

const cleanName = (name: string) => name.trim().replace(/[<>\u0000-\u001f]/g, "").slice(0, 48) || defaultDeviceName();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const errType = (err: unknown) => (err && typeof err === "object" && "type" in err ? String((err as { type: unknown }).type) : "");
const webrtcSupported = () => typeof window !== "undefined" && typeof RTCPeerConnection !== "undefined";
const canGzip = () => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function friendly(err: unknown): string {
  switch (errType(err)) {
    case "network":
    case "socket-error":
    case "socket-closed":
    case "server-error":
    case "timeout":
      return "Couldn't reach the pairing service. Check that this device is connected to the internet (only a tiny handshake uses it).";
    case "browser-incompatible":
      return "This browser can't make peer-to-peer connections. Use Chrome, Edge, Safari, Samsung Internet or Firefox.";
    case "ssl-unavailable":
      return "Pairing needs a secure (https) connection.";
    case "unavailable-id":
      return "That room code is busy. Create a new room.";
    case "invalid-key":
      return "The pairing server rejected this app's key. Check the custom PeerServer settings.";
    default:
      return err instanceof Error && err.message ? err.message : "The connection failed. Please try again.";
  }
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function gzipBytes(bytes: Uint8Array) {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzipText(bytes: Uint8Array) {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function describe(r: Pick<MergeResult, "added" | "updated" | "removed" | "sessions" | "logs" | "activity">) {
  const parts: string[] = [];
  if (r.added) parts.push(plural(r.added, "new word"));
  if (r.updated) parts.push(`${r.updated} updated`);
  if (r.removed) parts.push(`${r.removed} removed`);
  if (!parts.length && (r.sessions || r.logs || r.activity)) parts.push("progress updated");
  return parts.length ? parts.join(" · ") : "already up to date";
}

interface StatLike {
  type?: string;
  id?: string;
  selectedCandidatePairId?: string;
  selected?: boolean;
  nominated?: boolean;
  state?: string;
  localCandidateId?: string;
  remoteCandidateId?: string;
  candidateType?: string;
  address?: string;
  ip?: string;
  currentRoundTripTime?: number;
}

const PRIVATE_IP = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.)|^f[cd]|^fe80|\.local$/i;

/** Inspects the selected ICE candidate pair to tell whether traffic stays on the local network. */
async function detectRoute(pc: RTCPeerConnection): Promise<{ route: LinkRoute; rtt: number | null }> {
  const stats = await pc.getStats();
  let selectedId: string | undefined;
  stats.forEach((r: StatLike) => {
    if (r.type === "transport" && r.selectedCandidatePairId) selectedId = r.selectedCandidatePairId;
  });
  let pair: StatLike | undefined;
  stats.forEach((r: StatLike) => {
    if (r.type !== "candidate-pair" || pair) return;
    if (selectedId ? r.id === selectedId : r.selected === true || (r.nominated === true && r.state === "succeeded")) pair = r;
  });
  if (!pair) return { route: "unknown", rtt: null };
  const local = stats.get(pair.localCandidateId ?? "") as StatLike | undefined;
  const remote = stats.get(pair.remoteCandidateId ?? "") as StatLike | undefined;
  const rtt = typeof pair.currentRoundTripTime === "number" ? Math.round(pair.currentRoundTripTime * 1000) : null;
  if (local?.candidateType === "relay" || remote?.candidateType === "relay") return { route: "relay", rtt };
  const localIp = local?.address ?? local?.ip ?? "";
  const remoteIp = remote?.address ?? remote?.ip ?? "";
  const lan =
    (local?.candidateType === "host" && remote?.candidateType === "host") || (PRIVATE_IP.test(localIp) && PRIVATE_IP.test(remoteIp));
  return { route: lan ? "lan" : "direct", rtt };
}

function iceServers(localOnly: boolean): RTCIceServer[] {
  if (localOnly) return []; // host candidates only: traffic can never leave the local network
  const servers = [...DEFAULT_ICE];
  const turn = process.env.NEXT_PUBLIC_TURN_URL;
  if (turn) {
    servers.push({
      urls: turn.split(",").map((s) => s.trim()).filter(Boolean),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME || undefined,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || undefined,
    });
  }
  return servers;
}

/** PeerJS options. Uses the free PeerJS cloud by default; a self-hosted PeerServer can be set via env vars. */
export function peerOptions(localOnly: boolean): PeerOptions {
  const options: PeerOptions = {
    debug: 1,
    pingInterval: 5000,
    config: { iceServers: iceServers(localOnly), iceCandidatePoolSize: 2, sdpSemantics: "unified-plan" },
  };
  const host = process.env.NEXT_PUBLIC_PEER_HOST;
  if (host) {
    options.host = host;
    options.port = Number(process.env.NEXT_PUBLIC_PEER_PORT || 443);
    options.path = process.env.NEXT_PUBLIC_PEER_PATH || "/";
    options.key = process.env.NEXT_PUBLIC_PEER_KEY || "peerjs";
    options.secure = (process.env.NEXT_PUBLIC_PEER_SECURE ?? "true") !== "false";
  }
  // Advanced runtime override, e.g. localStorage["vb-peer-server"] = '{"host":"192.168.1.5","port":9000,"path":"/","secure":false}'
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("vb-peer-server") : null;
    if (raw) {
      const o = JSON.parse(raw) as Record<string, unknown>;
      if (typeof o.host === "string") options.host = o.host;
      if (typeof o.port === "number") options.port = o.port;
      if (typeof o.path === "string") options.path = o.path;
      if (typeof o.key === "string") options.key = o.key;
      if (typeof o.secure === "boolean") options.secure = o.secure;
    }
  } catch {
    /* ignore a malformed override */
  }
  return options;
}

function waitForPeerOpen(peer: Peer, ms: number) {
  return new Promise<void>((resolve, reject) => {
    if (peer.open) return resolve();
    const timer = setTimeout(() => {
      peer.off("open", onOpen);
      reject(Object.assign(new Error("timeout"), { type: "timeout" }));
    }, ms);
    const onOpen = () => {
      clearTimeout(timer);
      resolve();
    };
    peer.once("open", onOpen);
  });
}

/* ================================= Engine ================================= */

export class SyncEngine {
  private state: SyncState = IDLE_STATE;
  private listeners = new Set<() => void>();

  /** Wired up by the React provider. */
  applyData: (data: BootstrapData) => void = () => {};
  autoSync = true;
  localOnly = false;

  private deviceId = "";
  private peer: Peer | null = null;
  private links = new Map<string, Link>();
  private session: { role: SyncRole; code: string } | null = null;
  private retryInfo: { role: SyncRole; code: string } | null = null;
  private op = 0;
  private everConnected = false;
  private attempt = 0;
  private signalAttempt = 0;
  private dialing = false;
  private reclaiming = false;
  private ending = false;
  private inited = false;
  private beats = 0;
  private heartbeat?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private changeTimer?: ReturnType<typeof setTimeout>;
  private signalTimer?: ReturnType<typeof setTimeout>;
  private wakeLock: WakeLockSentinel | null = null;

  /* ----------------------------- external store ----------------------------- */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getState = () => this.state;
  getServerState = () => IDLE_STATE;

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  /* -------------------------------- lifecycle ------------------------------- */

  init() {
    if (this.inited || typeof window === "undefined") return;
    this.inited = true;
    this.deviceId = getDeviceId();
    let name = "";
    try {
      name = localStorage.getItem(NAME_KEY) || "";
    } catch {
      /* ignore */
    }
    this.set({ localName: cleanName(name || defaultDeviceName()) });
    document.addEventListener("visibilitychange", this.onVisible);
    window.addEventListener("online", this.onVisible);
    window.addEventListener("pageshow", this.onVisible);

    // Opened from an invite link / scanned QR code → join straight away.
    const params = new URLSearchParams(window.location.search);
    const join = params.get("join");
    if (join) {
      params.delete("join");
      const qs = params.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
      const code = extractSyncCode(join);
      if (code) {
        void this.joinRoom(code);
        return;
      }
    }

    // A reload or a restored tab resumes the running session automatically.
    const saved = this.readSession();
    if (saved) {
      toast.message("Resuming your sync session…", { id: "vb-sync-resume" });
      if (saved.role === "host") void this.resumeHost(saved.code);
      else void this.joinRoom(saved.code, undefined, true);
    }
  }

  destroy() {
    if (!this.inited) return;
    this.inited = false;
    document.removeEventListener("visibilitychange", this.onVisible);
    window.removeEventListener("online", this.onVisible);
    window.removeEventListener("pageshow", this.onVisible);
    this.teardown();
    this.releaseWakeLock();
  }

  setName(name: string) {
    const value = cleanName(name);
    try {
      localStorage.setItem(NAME_KEY, value);
    } catch {
      /* ignore */
    }
    this.set({ localName: value });
  }

  /* --------------------------------- public API --------------------------------- */

  async createRoom(name?: string) {
    if (name !== undefined) this.setName(name);
    if (!webrtcSupported()) return this.fail(friendly({ type: "browser-incompatible" }));
    this.teardown();
    const op = this.op;
    this.session = null;
    this.everConnected = false;
    this.attempt = 0;
    this.set({ phase: "starting", role: "host", code: "", joinLink: "", devices: [], error: "", attempt: 0, transfer: null });
    for (let i = 0; i < 6; i++) {
      const code = randomCode();
      try {
        const peer = await this.openPeer(peerIdFor(code));
        if (op !== this.op) {
          peer.destroy();
          return;
        }
        this.session = { role: "host", code };
        this.bindPeer(peer);
        this.saveSession();
        this.set({ phase: "waiting", code, joinLink: joinLinkFor(code), signal: "online", error: "" });
        this.startHeartbeat();
        void this.acquireWakeLock();
        return;
      } catch (err) {
        if (op !== this.op) return;
        if (errType(err) === "unavailable-id") continue;
        this.retryInfo = { role: "host", code: "" };
        return this.fail(friendly(err));
      }
    }
    this.retryInfo = { role: "host", code: "" };
    this.fail("Couldn't create a room right now. Please try again.");
  }

  async joinRoom(raw: string, name?: string, resume = false) {
    const code = extractSyncCode(raw);
    if (!code) {
      toast.error("Enter the 5-character code shown on the other device");
      return;
    }
    if (name !== undefined) this.setName(name);
    if (!webrtcSupported()) return this.fail(friendly({ type: "browser-incompatible" }));
    this.teardown();
    this.session = { role: "guest", code };
    this.everConnected = resume;
    this.attempt = 0;
    this.saveSession();
    this.set({
      phase: resume ? "reconnecting" : "connecting",
      role: "guest",
      code,
      joinLink: joinLinkFor(code),
      devices: [],
      error: "",
      attempt: 0,
      transfer: null,
    });
    this.startHeartbeat();
    void this.acquireWakeLock();
    await this.dial();
  }

  async endSession() {
    const hadSession = !!this.session;
    this.ending = true;
    for (const link of this.links.values()) this.send(link, { t: "bye" });
    if (this.links.size) await sleep(250); // let the goodbye reach the other device
    this.teardown();
    this.session = null;
    this.retryInfo = null;
    this.clearSession();
    this.releaseWakeLock();
    this.set({ phase: "idle", role: null, code: "", joinLink: "", devices: [], error: "", attempt: 0, transfer: null });
    this.ending = false;
    if (hadSession) toast.message("Sync session ended");
  }

  retry() {
    const info = this.retryInfo ?? (this.state.role ? { role: this.state.role, code: this.state.code } : null);
    if (!info) return;
    if (info.role === "host") void this.createRoom();
    else if (info.code) void this.joinRoom(info.code, undefined, this.everConnected);
  }

  async sendMine() {
    const links = this.openLinkList();
    if (!links.length) {
      toast.error("Connect a device first");
      return;
    }
    await Promise.all(links.map((link) => this.enqueueSync(link, { force: true })));
    toast.success(links.length === 1 ? `Sent your data to ${links[0].name}` : `Sent your data to ${links.length} devices`);
  }

  getLatest() {
    const links = this.openLinkList();
    if (!links.length) {
      toast.error("Connect a device first");
      return;
    }
    for (const link of links) this.send(link, { t: "get" });
    toast.message("Asking for the latest data…");
  }

  /** Called whenever local data changes (debounced). Only differing data is sent. */
  notifyLocalChange() {
    if (!this.autoSync || !this.session || this.openLinkList().length === 0) return;
    clearTimeout(this.changeTimer);
    this.changeTimer = setTimeout(() => {
      for (const link of this.openLinkList()) if (link.helloed) void this.enqueueSync(link, { auto: true });
    }, 1200);
  }

  /* ------------------------------ peer management ------------------------------ */

  private async openPeer(id?: string): Promise<Peer> {
    const { Peer: PeerCtor } = await import("peerjs");
    const options = peerOptions(this.localOnly);
    return new Promise<Peer>((resolve, reject) => {
      let settled = false;
      const peer = id ? new PeerCtor(id, options) : new PeerCtor(options);
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(
        () =>
          finish(() => {
            peer.destroy();
            reject(Object.assign(new Error("timeout"), { type: "timeout" }));
          }),
        15000,
      );
      peer.on("open", () => finish(() => resolve(peer)));
      peer.on("error", (err) =>
        finish(() => {
          peer.destroy();
          reject(err);
        }),
      );
    });
  }

  private bindPeer(peer: Peer) {
    this.peer = peer;
    this.signalAttempt = 0;
    peer.on("connection", (conn) => this.onIncoming(conn));
    peer.on("disconnected", () => this.onSignalLost(peer));
    peer.on("open", () => {
      if (peer !== this.peer) return;
      this.signalAttempt = 0;
      this.set({ signal: "online" });
    });
    peer.on("error", (err) => this.onPeerError(peer, err));
  }

  private onIncoming(conn: DataConnection) {
    const meta = (conn.metadata ?? {}) as { app?: unknown };
    if (this.session?.role !== "host" || meta.app !== "VocaBera" || this.links.size >= 8) {
      try {
        conn.close();
      } catch {
        /* ignore */
      }
      return;
    }
    this.adopt(conn, false);
  }

  private onPeerError(peer: Peer, err: unknown) {
    if (peer !== this.peer) return;
    const type = errType(err);
    const s = this.session;
    if (type === "peer-unavailable") {
      if (s?.role !== "guest") return;
      for (const link of [...this.links.values()]) if (!link.conn.open) this.dropLink(link);
      // The host may be restarting (reloaded page); retry a few times before giving up.
      if (this.everConnected || this.attempt < 2) this.scheduleReconnect();
      else {
        this.retryInfo = { role: "guest", code: s.code };
        this.fail(`No device is showing code ${s.code}. Check the code, and keep the Create room screen open on the other device.`);
      }
      return;
    }
    if (["network", "socket-error", "socket-closed", "server-error", "disconnected"].includes(type)) {
      this.set({ signal: "offline" });
      return; // "disconnected" follows and triggers a signaling reconnect
    }
    if (["browser-incompatible", "ssl-unavailable", "invalid-key"].includes(type)) {
      this.retryInfo = s ?? this.retryInfo;
      this.fail(friendly(err));
      return;
    }
    console.warn("[VocaBera sync] peer error:", type, err);
  }

  /** Lost the signaling server (not the device link!) — existing links keep working. */
  private onSignalLost(peer: Peer) {
    if (peer !== this.peer || !this.session || this.ending) return;
    this.set({ signal: "offline" });
    clearTimeout(this.signalTimer);
    const delay = Math.min(15000, 1000 * 2 ** Math.min(this.signalAttempt++, 4));
    this.signalTimer = setTimeout(() => {
      if (peer !== this.peer || !this.session) return;
      if (peer.destroyed) {
        this.peer = null;
        if (this.session.role === "host") void this.reclaimHost();
        else void this.dial();
      } else if (peer.disconnected) {
        try {
          peer.reconnect();
        } catch (e) {
          console.warn("[VocaBera sync] signaling reconnect failed", e);
        }
      }
    }, delay);
  }

  private async resumeHost(code: string) {
    this.teardown();
    this.session = { role: "host", code };
    this.everConnected = false;
    this.set({ phase: "reconnecting", role: "host", code, joinLink: joinLinkFor(code), devices: [], error: "", attempt: 0 });
    this.startHeartbeat();
    void this.acquireWakeLock();
    await this.reclaimHost();
  }

  /** Re-registers the host's room code (after a reload the server may take a moment to release it). */
  private async reclaimHost() {
    if (this.reclaiming) return;
    const s = this.session;
    if (!s || s.role !== "host") return;
    this.reclaiming = true;
    const op = this.op;
    try {
      for (let i = 0; i < 24; i++) {
        try {
          const peer = await this.openPeer(peerIdFor(s.code));
          if (op !== this.op || this.session !== s) {
            peer.destroy();
            return;
          }
          this.bindPeer(peer);
          this.saveSession();
          this.set({ phase: this.openLinkList().length ? "connected" : "waiting", signal: "online", error: "", attempt: 0 });
          return;
        } catch (err) {
          if (op !== this.op || this.session !== s) return;
          this.set({ phase: "reconnecting", attempt: i + 1, signal: errType(err) === "unavailable-id" ? "online" : "offline" });
          await sleep(errType(err) === "unavailable-id" ? 2500 : Math.min(12000, 1500 * (i + 1)));
        }
      }
      this.retryInfo = { role: "host", code: "" };
      this.fail("Couldn't restore the room. Create a new room to pair again.");
    } finally {
      this.reclaiming = false;
    }
  }

  private async dial() {
    const s = this.session;
    if (!s || s.role !== "guest" || this.dialing || this.openLinkList().length > 0) return;
    this.dialing = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const op = this.op;
    try {
      let peer = this.peer;
      if (!peer || peer.destroyed) {
        peer = await this.openPeer();
        if (op !== this.op) {
          peer.destroy();
          return;
        }
        this.bindPeer(peer);
      } else if (peer.disconnected) {
        peer.reconnect();
        await waitForPeerOpen(peer, 10000);
        if (op !== this.op) return;
      }
      for (const link of [...this.links.values()]) if (!link.conn.open) this.dropLink(link);
      const conn = peer.connect(peerIdFor(s.code), {
        reliable: true,
        serialization: "json",
        metadata: { app: "VocaBera", v: PROTOCOL, name: this.state.localName, deviceId: this.deviceId },
      });
      this.adopt(conn, true);
    } catch (err) {
      if (op !== this.op) return;
      const type = errType(err);
      if (!this.everConnected && (["browser-incompatible", "ssl-unavailable", "invalid-key"].includes(type) || this.attempt >= 2)) {
        this.retryInfo = { role: "guest", code: s.code };
        this.fail(friendly(err));
      } else this.scheduleReconnect();
    } finally {
      if (op === this.op) this.dialing = false;
    }
  }

  private scheduleReconnect() {
    const s = this.session;
    if (!s || s.role !== "guest" || this.ending || this.reconnectTimer || this.openLinkList().length > 0) return;
    const n = this.attempt++;
    if (n >= 60) {
      this.retryInfo = { role: "guest", code: s.code };
      this.fail("Lost contact with the other device. Make sure it's still on the Sync screen and on the same Wi‑Fi, then tap Try again.");
      return;
    }
    const base = Math.min(12000, 1000 * 2 ** Math.min(n, 4));
    const delay = document.visibilityState === "hidden" ? base * 2 : base;
    this.set({ phase: this.everConnected ? "reconnecting" : "connecting", attempt: n + 1 });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.dial();
    }, delay);
  }

  /* ------------------------------ data connections ------------------------------ */

  private adopt(conn: DataConnection, outgoing: boolean) {
    const key = conn.peer;
    const previous = this.links.get(key);
    if (previous && previous.conn !== conn) this.dropLink(previous);
    const meta = (conn.metadata ?? {}) as { name?: unknown; deviceId?: unknown };
    const link: Link = {
      key,
      conn,
      // On an outgoing link the metadata holds *our* name; the peer introduces itself in "hello".
      name: !outgoing && typeof meta.name === "string" && meta.name ? meta.name.slice(0, 48) : "Other device",
      deviceId: !outgoing && typeof meta.deviceId === "string" ? meta.deviceId : "",
      created: Date.now(),
      since: 0,
      lastSeen: Date.now(),
      route: "unknown",
      rtt: null,
      gzip: false,
      helloed: false,
      sentDigest: null,
      recvDigest: null,
      queue: Promise.resolve(),
      transfers: new Map(),
      autoSends: [],
      silent: false,
      bye: false,
    };
    this.links.set(key, link);
    conn.on("open", () => this.onOpen(link));
    conn.on("data", (data) => void this.onData(link, data));
    conn.on("close", () => this.onClose(link));
    conn.on("error", (err) => console.warn("[VocaBera sync] link error:", err));
    if (conn.open) this.onOpen(link);
  }

  private dropLink(link: Link) {
    link.silent = true;
    try {
      link.conn.close();
    } catch {
      /* ignore */
    }
    if (this.links.get(link.key) === link) this.links.delete(link.key);
    this.refreshDevices();
  }

  private onOpen(link: Link) {
    if (this.links.get(link.key) !== link || link.since) return;
    const s = this.session;
    if (!s) {
      this.dropLink(link);
      return;
    }
    link.since = Date.now();
    link.lastSeen = Date.now();
    this.everConnected = true;
    this.attempt = 0;
    this.send(link, { t: "hello", v: PROTOCOL, name: this.state.localName, deviceId: this.deviceId, gzip: canGzip(), role: s.role });
    this.set({ phase: "connected", error: "", attempt: 0 });
    this.refreshDevices();
    setTimeout(() => void this.probeRoute(link), 1500);
  }

  private onClose(link: Link) {
    if (this.links.get(link.key) !== link) return;
    this.links.delete(link.key);
    this.refreshDevices();
    if (link.silent || !this.session || this.ending) return;
    if (this.session.role === "host") {
      this.set({ phase: this.openLinkList().length ? "connected" : "waiting" });
      if (link.since) {
        toast.message(link.bye ? `${link.name} left the sync session` : `${link.name} disconnected`, {
          id: `vb-link-${link.key}`,
          description: link.bye ? undefined : "It reconnects automatically as soon as it's back.",
        });
      }
      return;
    }
    if (link.bye) {
      this.endLocally(`${link.name} ended the sync session`);
      return;
    }
    this.scheduleReconnect();
  }

  private endLocally(message: string) {
    this.teardown();
    this.session = null;
    this.retryInfo = null;
    this.clearSession();
    this.releaseWakeLock();
    this.set({ phase: "idle", role: null, code: "", joinLink: "", devices: [], error: "", attempt: 0, transfer: null });
    toast.message(message);
  }

  private async onData(link: Link, raw: unknown) {
    if (this.links.get(link.key) !== link) return;
    link.lastSeen = Date.now();
    if (!raw || typeof raw !== "object") return;
    const m = raw as Msg;
    switch (m.t) {
      case "hello":
        this.onHello(link, m);
        return;
      case "ping":
        this.send(link, { t: "pong", at: m.at });
        return;
      case "pong":
        if (typeof m.at === "number") {
          const rtt = Date.now() - m.at;
          if (rtt >= 0 && rtt < 60000 && Math.abs((link.rtt ?? -99) - rtt) > 3) {
            link.rtt = rtt;
            this.refreshDevices();
          }
        }
        return;
      case "get":
        void this.enqueueSync(link, { force: true });
        return;
      case "bye":
        link.bye = true;
        try {
          link.conn.close();
        } catch {
          /* ignore */
        }
        return;
      case "begin":
        this.onBegin(link, m);
        return;
      case "part":
        this.onPart(link, m);
        return;
      case "end":
        await this.onEnd(link, m);
        return;
      case "ack":
        this.onAck(link, m);
        return;
    }
  }

  private onHello(link: Link, m: Msg) {
    const first = !link.helloed;
    link.helloed = true;
    if (typeof m.name === "string" && m.name.trim()) link.name = m.name.trim().slice(0, 48);
    if (typeof m.deviceId === "string") link.deviceId = m.deviceId;
    link.gzip = m.gzip === true && canGzip();
    if (link.deviceId && link.deviceId === this.deviceId) {
      toast.error("That's this same browser. Open VocaBera on another device to sync.");
      this.dropLink(link);
      if (this.session?.role === "guest") void this.endSession();
      return;
    }
    // One link per device: a device that reconnects replaces its stale link.
    if (link.deviceId) for (const other of [...this.links.values()]) if (other !== link && other.deviceId === link.deviceId) this.dropLink(other);
    this.refreshDevices();
    if (!first) return;
    const guest = this.session?.role === "guest";
    toast.success(guest ? `Connected to ${link.name}` : `${link.name} joined`, {
      id: `vb-link-${link.key}`,
      description: this.autoSync ? "Live sync active — changes sync automatically." : "Use Send mine / Get latest to sync.",
    });
    if (this.autoSync) setTimeout(() => void this.enqueueSync(link, { auto: true }), 250);
  }

  /* --------------------------------- transfers --------------------------------- */

  private enqueueSync(link: Link, opts: { force?: boolean; auto?: boolean } = {}) {
    link.queue = link.queue
      .then(() => this.sendSnapshot(link, opts))
      .catch((err) => {
        console.warn("[VocaBera sync] send failed:", err);
        if (this.state.transfer?.direction === "send") this.set({ transfer: null });
      });
    return link.queue;
  }

  /** Loop guard: never auto-send more than 12 snapshots a minute to one device. */
  private throttled(link: Link) {
    const now = Date.now();
    link.autoSends = link.autoSends.filter((t) => now - t < 60_000);
    if (link.autoSends.length >= 12) {
      console.warn("[VocaBera sync] auto-sync paused for", link.name, "(too many transfers in a minute)");
      return true;
    }
    link.autoSends.push(now);
    return false;
  }

  private async sendSnapshot(link: Link, { force = false, auto = false }: { force?: boolean; auto?: boolean }) {
    if (!link.conn.open || this.links.get(link.key) !== link) return;
    const snap = await exportSyncSnapshot(this.state.localName);
    const digest = snapshotDigest(snap);
    // Skip when the other device already has exactly this data → no echo loops.
    if (!force && (link.sentDigest === digest || link.recvDigest === digest)) return;
    if (auto && !force && this.throttled(link)) return;

    const json = JSON.stringify(snap);
    const hash = hashText(json);
    const plain = new TextEncoder().encode(json);
    let bytes = plain;
    let gz = false;
    if (link.gzip && plain.length > 4096) {
      try {
        bytes = await gzipBytes(plain);
        gz = true;
      } catch {
        bytes = plain;
      }
    }
    if (bytes.length > MAX_BYTES) throw new Error("Your data is too large to sync live. Use Manage → Data → Export instead.");

    const id = uid();
    const total = Math.max(1, Math.ceil(bytes.length / CHUNK));
    this.set({ transfer: { direction: "send", peer: link.name, progress: 0 } });
    this.send(link, { t: "begin", id, total, size: bytes.length, hash, digest, gz, force });
    for (let i = 0; i < total; i++) {
      if (!link.conn.open) throw new Error("The connection closed during the transfer");
      this.send(link, { t: "part", id, i, d: toBase64(bytes.subarray(i * CHUNK, Math.min(bytes.length, (i + 1) * CHUNK))) });
      if (total > 4 && i % 4 === 3) {
        this.set({ transfer: { direction: "send", peer: link.name, progress: Math.round(((i + 1) / total) * 100) } });
        await sleep(0);
      }
    }
    this.send(link, { t: "end", id });
    link.sentDigest = digest;
    this.set({ transfer: null });
  }

  private onBegin(link: Link, m: Msg) {
    const total = Number(m.total);
    const size = Number(m.size);
    if (
      typeof m.id !== "string" ||
      typeof m.hash !== "string" ||
      typeof m.digest !== "string" ||
      !Number.isInteger(total) ||
      total < 1 ||
      total > 20000 ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > MAX_BYTES
    )
      return;
    link.transfers.set(m.id, { total, size, hash: m.hash, digest: m.digest, gz: m.gz === true, force: m.force === true, parts: new Array(total), received: 0 });
    while (link.transfers.size > 3) link.transfers.delete(link.transfers.keys().next().value as string);
    this.set({ transfer: { direction: "receive", peer: link.name, progress: 0 } });
  }

  private onPart(link: Link, m: Msg) {
    const t = typeof m.id === "string" ? link.transfers.get(m.id) : undefined;
    const i = Number(m.i);
    if (!t || !Number.isInteger(i) || i < 0 || i >= t.total || typeof m.d !== "string") return;
    if (t.parts[i] === undefined) {
      t.parts[i] = m.d;
      t.received++;
    }
    if (t.total > 4 && (t.received % 4 === 0 || t.received === t.total)) {
      this.set({ transfer: { direction: "receive", peer: link.name, progress: Math.round((t.received / t.total) * 100) } });
    }
  }

  private async onEnd(link: Link, m: Msg) {
    const id = typeof m.id === "string" ? m.id : "";
    const t = link.transfers.get(id);
    link.transfers.delete(id);
    if (!t) return;
    if (t.received !== t.total) {
      this.send(link, { t: "ack", id, ok: false, error: "incomplete" });
      this.set({ transfer: null });
      return;
    }
    try {
      const bytes = new Uint8Array(t.size);
      let offset = 0;
      for (const part of t.parts) {
        const piece = fromBase64(part as string);
        bytes.set(piece, offset);
        offset += piece.length;
      }
      if (offset !== t.size) throw new Error("Incomplete data");
      const text = t.gz ? await gunzipText(bytes) : new TextDecoder().decode(bytes);
      if (hashText(text) !== t.hash) throw new Error("The data failed its integrity check");
      const snap: unknown = JSON.parse(text);
      if (!isSyncSnapshot(snap)) throw new Error("Unsupported sync data — update VocaBera on both devices");

      if (!t.force && link.recvDigest === t.digest) {
        this.send(link, { t: "ack", id, ok: true, added: 0, updated: 0, removed: 0 });
        this.set({ transfer: null });
        return;
      }

      const result = await mergeSyncSnapshot(snap, this.deviceId);
      link.recvDigest = t.digest;
      this.applyData(result.data);
      this.send(link, { t: "ack", id, ok: true, added: result.added, updated: result.updated, removed: result.removed, sessions: result.sessions, logs: result.logs, activity: result.activity });
      const summary = describe(result);
      this.set({ transfer: null, lastSyncAt: new Date().toISOString(), lastResult: `From ${link.name}: ${summary}` });
      if (result.added || result.updated || result.removed) toast.success(`Synced with ${link.name}`, { id: "vb-sync-result", description: summary });

      if (this.autoSync) {
        // They are missing something we have → send it back; relay changes to other paired devices.
        if (result.digest !== t.digest) void this.enqueueSync(link, { auto: true });
        if (result.changed) for (const other of this.openLinkList()) if (other !== link && other.helloed) void this.enqueueSync(other, { auto: true });
      }
    } catch (err) {
      console.warn("[VocaBera sync] could not apply data:", err);
      this.send(link, { t: "ack", id, ok: false, error: err instanceof Error ? err.message : "failed" });
      this.set({ transfer: null });
      toast.error(`Couldn't apply data from ${link.name}`, { description: err instanceof Error ? err.message : undefined });
    }
  }

  private onAck(link: Link, m: Msg) {
    if (m.ok === true) {
      const summary = describe({
        added: Number(m.added) || 0,
        updated: Number(m.updated) || 0,
        removed: Number(m.removed) || 0,
        sessions: Number(m.sessions) || 0,
        logs: Number(m.logs) || 0,
        activity: Number(m.activity) || 0,
      });
      this.set({ lastSyncAt: new Date().toISOString(), lastResult: `To ${link.name}: ${summary}` });
    } else {
      link.sentDigest = null; // resend next time
      if (typeof m.error === "string") console.warn("[VocaBera sync]", link.name, "rejected data:", m.error);
    }
  }

  /* ----------------------------- heartbeat & health ----------------------------- */

  private startHeartbeat() {
    if (!this.heartbeat) this.heartbeat = setInterval(() => this.beat(), HEARTBEAT_MS);
  }

  private beat() {
    if (!this.session) return;
    const now = Date.now();
    for (const link of [...this.links.values()]) {
      if (!link.conn.open) {
        if (!link.since && now - link.created > OPEN_TIMEOUT_MS) {
          this.dropLink(link);
          if (this.session.role === "guest") this.scheduleReconnect();
        }
        continue;
      }
      this.send(link, { t: "ping", at: now });
      if (now - link.lastSeen > DEAD_AFTER_MS) {
        console.warn("[VocaBera sync] no heartbeat from", link.name, "— reconnecting");
        link.conn.close(); // emits "close" → automatic reconnect
      }
    }
    this.beats++;
    if (this.beats % 3 === 0) for (const link of this.openLinkList()) void this.probeRoute(link);
    if (this.beats % 5 === 0) this.saveSession();
    if (this.session?.role === "guest" && this.links.size === 0 && !this.reconnectTimer && !this.dialing && this.state.phase !== "error") {
      this.scheduleReconnect();
    }
  }

  private onVisible = () => {
    if (typeof document === "undefined" || document.visibilityState !== "visible" || !this.session) return;
    void this.acquireWakeLock();
    const now = Date.now();
    for (const link of this.openLinkList()) this.send(link, { t: "ping", at: now });
    if (this.session.role === "guest") {
      if (this.openLinkList().length === 0 && !this.dialing) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        this.attempt = Math.min(this.attempt, 1);
        void this.dial();
      }
    } else if (!this.peer || this.peer.destroyed) {
      void this.reclaimHost();
    } else if (this.peer.disconnected) {
      try {
        this.peer.reconnect();
      } catch {
        /* retried by the signaling handler */
      }
    }
  };

  private async probeRoute(link: Link) {
    const pc = link.conn.peerConnection as RTCPeerConnection | undefined;
    if (!pc || !link.conn.open) return;
    try {
      const { route, rtt } = await detectRoute(pc);
      if (route !== link.route || (rtt !== null && link.rtt === null)) {
        link.route = route;
        if (rtt !== null && link.rtt === null) link.rtt = rtt;
        this.refreshDevices();
      }
    } catch {
      /* stats unavailable */
    }
  }

  private async acquireWakeLock() {
    if (this.wakeLock || !this.session || typeof navigator === "undefined" || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      this.wakeLock = lock;
      lock.addEventListener("release", () => {
        if (this.wakeLock === lock) this.wakeLock = null;
      });
    } catch {
      /* not allowed right now */
    }
  }

  private releaseWakeLock() {
    const lock = this.wakeLock;
    this.wakeLock = null;
    lock?.release().catch(() => undefined);
  }

  /* ---------------------------------- utilities ---------------------------------- */

  private openLinkList() {
    return [...this.links.values()].filter((l) => l.conn.open && l.since > 0);
  }

  private send(link: Link, msg: Msg) {
    if (!link.conn.open) return;
    try {
      link.conn.send(msg);
    } catch (err) {
      console.warn("[VocaBera sync] send error:", err);
    }
  }

  private refreshDevices() {
    const devices: SyncDevice[] = this.openLinkList().map((l) => ({ key: l.key, name: l.name, route: l.route, rtt: l.rtt, since: l.since }));
    const cur = this.state.devices;
    const unchanged =
      cur.length === devices.length &&
      cur.every((d, i) => d.key === devices[i].key && d.name === devices[i].name && d.route === devices[i].route && d.rtt === devices[i].rtt);
    if (!unchanged) this.set({ devices });
  }

  private fail(message: string) {
    this.teardown();
    this.session = null;
    this.clearSession();
    this.releaseWakeLock();
    this.set({ phase: "error", error: message, devices: [], transfer: null });
  }

  private teardown() {
    this.op++;
    this.dialing = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    clearTimeout(this.changeTimer);
    clearTimeout(this.signalTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    for (const link of this.links.values()) {
      link.silent = true;
      try {
        link.conn.close();
      } catch {
        /* ignore */
      }
    }
    this.links.clear();
    const peer = this.peer;
    this.peer = null;
    if (peer) {
      try {
        peer.destroy();
      } catch {
        /* ignore */
      }
    }
  }

  private saveSession() {
    if (!this.session) return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role: this.session.role, code: this.session.code, at: Date.now() }));
    } catch {
      /* ignore */
    }
  }

  private readSession(): { role: SyncRole; code: string } | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw) as { role?: unknown; code?: unknown; at?: unknown };
      if ((v.role === "host" || v.role === "guest") && typeof v.code === "string" && CODE_RE.test(v.code) && Date.now() - Number(v.at) < SESSION_TTL_MS) {
        return { role: v.role, code: v.code };
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  private clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
}
