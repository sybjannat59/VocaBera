import { peerOptions } from "./peer-engine";

export type CheckStatus = "ok" | "warn" | "fail" | "skip";

export interface CheckResult {
  id: "pairing" | "local" | "internet" | "relay";
  status: CheckStatus;
  title: string;
  detail: string;
  ms?: number;
}

export interface NetworkReport {
  results: CheckResult[];
  verdict: string;
}

const STUN: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }];

/** Gathers ICE candidates for a throw-away connection and reports which kinds were found. */
async function gather(servers: RTCIceServer[], policy: RTCIceTransportPolicy, ms: number) {
  const pc = new RTCPeerConnection({ iceServers: servers, iceTransportPolicy: policy });
  const found: { type: string; address: string }[] = [];
  const t0 = performance.now();
  try {
    pc.createDataChannel("probe");
    pc.onicecandidate = (e) => {
      if (e.candidate) found.push({ type: e.candidate.type ?? "", address: e.candidate.address ?? "" });
    };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      const timer = setTimeout(done, ms);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(timer);
          done();
        }
      };
    });
  } finally {
    pc.close();
  }
  return { found, ms: Math.round(performance.now() - t0) };
}

async function checkPairing(localOnly: boolean, relays: RTCIceServer[]): Promise<CheckResult> {
  const t0 = performance.now();
  try {
    const { Peer } = await import("peerjs");
    const ok = await new Promise<boolean>((resolve) => {
      const peer = new Peer(peerOptions(localOnly, relays));
      const finish = (v: boolean) => {
        clearTimeout(timer);
        try {
          peer.destroy();
        } catch {
          /* ignore */
        }
        resolve(v);
      };
      const timer = setTimeout(() => finish(false), 9000);
      peer.on("open", () => finish(true));
      peer.on("error", () => finish(false));
    });
    const ms = Math.round(performance.now() - t0);
    return ok
      ? { id: "pairing", status: "ok", title: "Pairing service", detail: "Reachable — devices can find each other.", ms }
      : { id: "pairing", status: "fail", title: "Pairing service", detail: "Not reachable. Check the internet connection, VPN or firewall on this device.", ms };
  } catch {
    return { id: "pairing", status: "fail", title: "Pairing service", detail: "Couldn't load the pairing library. Reload the page and try again." };
  }
}

export async function runNetworkCheck(localOnly: boolean, relays: RTCIceServer[]): Promise<NetworkReport> {
  if (typeof RTCPeerConnection === "undefined") {
    return {
      results: [{ id: "local", status: "fail", title: "Peer-to-peer support", detail: "This browser can't make peer-to-peer connections." }],
      verdict: "Use Chrome, Edge, Safari, Samsung Internet or Firefox for live sync.",
    };
  }
  const [pairing, local, internet, relay] = await Promise.all([
    checkPairing(localOnly, relays),
    gather([], "all", 2500).then(
      ({ found, ms }): CheckResult => {
        const hosts = found.filter((c) => c.type === "host");
        if (!hosts.length) return { id: "local", status: "fail", title: "Local network", detail: "No local network address found. Is Wi‑Fi turned on?", ms };
        const hidden = hosts.every((c) => c.address.endsWith(".local"));
        return {
          id: "local",
          status: "ok",
          title: "Local network",
          detail: hidden ? "Ready. The browser hides your local address for privacy and shares it only with the paired device." : "Ready. Direct connections on your Wi‑Fi are possible.",
          ms,
        };
      },
      (): CheckResult => ({ id: "local", status: "fail", title: "Local network", detail: "Couldn't test the local network." }),
    ),
    localOnly
      ? Promise.resolve<CheckResult>({ id: "internet", status: "skip", title: "Internet path", detail: "Skipped — Local network only is on." })
      : gather(STUN, "all", 4000).then(
          ({ found, ms }): CheckResult =>
            found.some((c) => c.type === "srflx")
              ? { id: "internet", status: "ok", title: "Internet path", detail: "Working — devices can also connect through your router.", ms }
              : { id: "internet", status: "warn", title: "Internet path", detail: "Blocked on this network. Sync still works if both devices can reach each other on the same Wi‑Fi.", ms },
          (): CheckResult => ({ id: "internet", status: "warn", title: "Internet path", detail: "Couldn't test the internet path." }),
        ),
    relays.length === 0 || localOnly
      ? Promise.resolve<CheckResult>({
          id: "relay",
          status: "skip",
          title: "Relay (optional)",
          detail: localOnly ? "Off — Local network only is on." : "Not set up. Only needed if your router blocks devices from reaching each other.",
        })
      : gather(relays, "relay", 6000).then(
          ({ found, ms }): CheckResult =>
            found.some((c) => c.type === "relay")
              ? { id: "relay", status: "ok", title: "Relay (optional)", detail: "Working — sync still connects if the Wi‑Fi blocks direct links.", ms }
              : { id: "relay", status: "fail", title: "Relay (optional)", detail: "Couldn't use the relay. Check its address, username and password.", ms },
          (): CheckResult => ({ id: "relay", status: "fail", title: "Relay (optional)", detail: "Couldn't test the relay." }),
        ),
  ]);
  const results = [pairing, local, internet, relay];
  let verdict: string;
  if (pairing.status === "fail") verdict = "Devices can't find each other until the pairing service is reachable. Check this device's internet connection.";
  else if (local.status === "fail") verdict = "Turn on Wi‑Fi and connect both devices to the same network.";
  else if (relay.status === "ok") verdict = "Everything looks good. Sync will connect even on strict networks.";
  else if (internet.status === "ok") verdict = "Looks good. If pairing still fails, your router may block devices from talking to each other (client/AP isolation) — add a relay below.";
  else verdict = "Local sync should work on the same Wi‑Fi. If it doesn't, add a relay below.";
  return { results, verdict };
}
