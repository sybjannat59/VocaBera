/**
 * Offline pairing codec.
 *
 * For two devices on the same Wi‑Fi we can skip the signaling server entirely:
 * the host encodes its WebRTC offer (plus gathered ICE candidates) into a QR code,
 * the guest scans it and encodes its answer into a second QR code that the host scans.
 * Nothing but the SDP descriptions ever leaves the two devices.
 */

export const PAIR_VERSION = 1;
const PREFIX = "VB1:";
const SEP = ".";

export interface IceCandidateData {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
}

export interface PairPayload {
  v: number;
  /** "o" = host offer, "a" = guest answer */
  k: "o" | "a";
  /** room code, for display on both devices */
  c: string;
  /** device name */
  n: string;
  /** SDP body (without the type line) */
  s: string;
  /** gathered ICE candidates */
  i: IceCandidateData[];
  /** creation time, used to reject stale codes */
  t: number;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deflate(text: string): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") return enc.encode(text);
  try {
    const stream = new Blob([enc.encode(text)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return enc.encode(text);
  }
}

async function inflate(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === "undefined") return dec.decode(bytes);
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).text();
  } catch {
    return dec.decode(bytes);
  }
}

/** Serialize a payload. Tries compression first, then falls back to raw JSON. */
export async function encodePairPayload(payload: PairPayload): Promise<string> {
  const json = JSON.stringify(payload);
  const packed = `${PREFIX}Z${toBase64Url(await deflate(json))}`;
  if (packed.length <= 2900) return packed;
  const plain = `${PREFIX}R${toBase64Url(enc.encode(json))}`;
  if (plain.length <= 2900) return plain;
  // Last resort: drop candidates (they can be re-gathered over a direct connection).
  const lean: PairPayload = { ...payload, i: [] };
  return `${PREFIX}Z${toBase64Url(await deflate(JSON.stringify(lean)))}`;
}

export async function decodePairPayload(raw: string): Promise<PairPayload | null> {
  const text = raw.trim();
  const start = text.indexOf(PREFIX);
  if (start < 0) return null;
  const body = text.slice(start + PREFIX.length);
  const marker = body[0];
  let json: string | null = null;
  try {
    const bytes = fromBase64Url(body.slice(1));
    json = marker === "Z" ? await inflate(bytes) : dec.decode(bytes);
  } catch {
    return null;
  }
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as PairPayload;
    if (!parsed || parsed.v !== PAIR_VERSION || (parsed.k !== "o" && parsed.k !== "a") || typeof parsed.s !== "string") return null;
    if (!Array.isArray(parsed.i)) parsed.i = [];
    return parsed;
  } catch {
    return null;
  }
}

/** Link that can be scanned by any camera app: opening it on the guest device starts the app. */
export function pairLink(payload: string, origin: string) {
  return `${origin}/sync#p=${payload}`;
}

export function payloadFromLink(text: string) {
  const idx = text.indexOf("#p=");
  return idx >= 0 ? text.slice(idx + 3) : text;
}

/* --------------------------------- WebRTC --------------------------------- */

const hasCompression = typeof CompressionStream !== "undefined";

export function pairingSupported() {
  return (
    hasCompression &&
    typeof RTCPeerConnection !== "undefined" &&
    typeof window !== "undefined" &&
    window.isSecureContext
  );
}

/** Waits until ICE gathering finishes (or the timeout passes) so candidates can travel inside the QR code. */
export function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 3500): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const timer = setTimeout(done, timeoutMs);
    pc.addEventListener("icegatheringstatechange", onChange);
  });
}

/** Local candidates collected so far, ready to embed in a payload. */
export function localCandidates(pc: RTCPeerConnection) {
  const out: IceCandidateData[] = [];
  try {
    const sdp = pc.localDescription?.sdp ?? "";
    for (const line of sdp.split(/\r?\n/)) {
      if (!line.startsWith("a=candidate:")) continue;
      out.push({
        candidate: line.slice(2),
        sdpMid: sdp.match(/a=mid:(\S+)/)?.[1] ?? "0",
        sdpMLineIndex: 0,
      });
    }
  } catch {
    /* fall through with whatever we have */
  }
  return out;
}

export async function applyRemotePayload(
  pc: RTCPeerConnection,
  payload: PairPayload,
  expect: "o" | "a",
): Promise<void> {
  if (payload.k !== expect) throw new Error(`Expected ${expect === "o" ? "an invitation" : "a reply"} code`);
  await pc.setRemoteDescription({ type: payload.k === "o" ? "offer" : "answer", sdp: payload.s });
  let index = 0;
  for (const candidate of payload.i) {
    try {
      await pc.addIceCandidate({
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex ?? index,
      });
    } catch (err) {
      console.warn("Skipped an ICE candidate from the code", err);
    }
    index++;
  }
}
