"use client";

import {
  Camera,
  Check,
  CircleCheck,
  Clipboard,
  Copy,
  Link2,
  QrCode,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Unplug,
  Wifi,
  WifiOff,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useLiveSync } from "@/lib/live-sync";
import { Button, Card, Field, IconTile, Switch, inputCls } from "./ui";
import { cn } from "@/lib/utils";

export function SyncPanel() {
  const {
    phase,
    role,
    code,
    localName,
    peerName,
    error,
    transferProgress,
    lastSyncAt,
    autoSync,
    createRoom,
    joinRoom,
    endSession,
    sendMine,
    getLatest,
    setLocalName,
    setAutoSync,
  } = useLiveSync();
  const [name, setName] = useState(localName);
  const [joinCode, setJoinCode] = useState("");
  const [busyAction, setBusyAction] = useState<"create" | "join" | "send" | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const active = phase === "connected";
  const inRoom = phase === "waiting" || phase === "connecting" || active || (phase === "error" && !!code);
  const canUseRtc = typeof window !== "undefined" && "RTCPeerConnection" in window;

  useEffect(() => setName(localName), [localName]);

  // Check if URL has ?sync=CODE (e.g. from QR code scan or share link)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const syncParam = params.get("sync");
    if (syncParam && /^[A-HJ-NP-Z2-9]{5}$/i.test(syncParam.trim())) {
      setJoinCode(syncParam.trim().toUpperCase());
    }
  }, []);

  // Generate QR code whenever a room code is ready
  useEffect(() => {
    if (!code) {
      setQrDataUrl(null);
      return;
    }

    const shareUrl = typeof window !== "undefined"
      ? `${window.location.origin}/manage?sync=${code}`
      : `https://vocabera.local/manage?sync=${code}`;

    QRCode.toDataURL(shareUrl, {
      margin: 2,
      width: 280,
      color: {
        dark: "#1e1b4b",
        light: "#ffffff",
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.warn("QR code generation failed:", err));
  }, [code]);

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
      toast.success("Room code copied");
    } catch {
      toast.error("Couldn't copy — tap and hold the code to select it");
    }
  };

  const copyShareLink = async () => {
    if (!code || typeof window === "undefined") return;
    const shareUrl = `${window.location.origin}/manage?sync=${code}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Direct pairing link copied!");
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  const connect = async (e: FormEvent) => {
    e.preventDefault();
    if (joinCode.length !== 5 || busyAction) return;
    setBusyAction("join");
    await joinRoom(joinCode, name);
    setBusyAction(null);
  };

  const create = async () => {
    if (busyAction) return;
    if (!canUseRtc) {
      toast.error("Live sync needs a modern browser with WebRTC support.");
      return;
    }
    setBusyAction("create");
    await createRoom(name);
    setBusyAction(null);
  };

  const send = async () => {
    if (busyAction) return;
    setBusyAction("send");
    await sendMine();
    setBusyAction(null);
  };

  const stateLabel =
    phase === "connected"
      ? "Live sync active"
      : phase === "creating"
        ? "Creating secure room…"
        : phase === "waiting"
          ? "Waiting for other device…"
          : phase === "connecting"
            ? "Connecting devices…"
            : phase === "error"
              ? "Connection needs attention"
              : "Not connected";

  const message =
    phase === "waiting"
      ? "On the second device on the same Wi‑Fi router, enter this 5-char code or scan the QR code to pair immediately."
      : phase === "connecting"
        ? "Establishing direct peer connection over your Wi‑Fi network..."
        : active
          ? "Your devices are paired directly over WebRTC. Room server only relays the handshake."
          : "Create a room on device 1, then enter the code or scan the QR code on device 2.";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 [&>*]:min-w-0">
      <div className="space-y-4 lg:col-span-7">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[var(--line)] p-4 sm:p-5">
            <IconTile icon={active ? Wifi : phase === "error" ? WifiOff : Link2} tone={active ? "emerald" : phase === "error" ? "rose" : "sky"} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold">{stateLabel}</h2>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", active ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : inRoom ? "bg-amber-500/12 text-amber-700 dark:text-amber-300" : "bg-black/[0.05] text-muted dark:bg-white/[0.06]")}>
                  <span className={cn("size-1.5 rounded-full", active ? "animate-pulse bg-emerald-500" : inRoom ? "bg-amber-500" : "bg-slate-400")} />
                  {active ? "Connected" : inRoom ? "Pairing" : "Offline"}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{message}</p>
            </div>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            {active && (
              <div className="flex items-center gap-3 rounded-[20px] bg-emerald-500/10 p-3.5 ring-1 ring-emerald-500/20">
                <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                  <Smartphone className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Paired device</div>
                  <div className="truncate font-bold">{peerName || "VocaBera device"}</div>
                </div>
                <CircleCheck className="size-5 shrink-0 text-emerald-500" />
              </div>
            )}

            {inRoom && code && (
              <div className="rounded-[22px] bg-black/[0.035] p-4 dark:bg-white/[0.045]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">Room code · {role === "host" ? "Share code or QR" : "Paired room"}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted">
                    <Radio className="size-3.5 text-emerald-500 animate-pulse" /> Active room (30 min)
                  </span>
                </div>

                <div className="mt-3 flex flex-col sm:flex-row gap-3 items-stretch">
                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    className="flex flex-1 items-center justify-between rounded-2xl border border-brand-500/20 bg-white/70 px-4 py-3 text-left shadow-sm transition active:scale-[0.99] dark:bg-white/[0.04]"
                    aria-label={`Copy room code ${code}`}
                    title="Tap to copy room code"
                  >
                    <span className="font-mono text-[32px] font-black tracking-[0.22em] text-gradient">{code}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-2 text-xs font-bold text-brand-700 dark:text-brand-200">
                      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                      {copied ? "Copied" : "Copy"}
                    </span>
                  </button>

                  {role === "host" && (
                    <Button
                      variant={showQr ? "primary" : "secondary"}
                      icon={QrCode}
                      onClick={() => setShowQr(!showQr)}
                      className="shrink-0 h-auto py-3 sm:py-0"
                    >
                      {showQr ? "Hide QR" : "Show QR"}
                    </Button>
                  )}
                </div>

                {/* QR Code sharing section */}
                {role === "host" && showQr && qrDataUrl && (
                  <div className="mt-4 flex flex-col items-center justify-center p-5 bg-white dark:bg-slate-900 rounded-2xl border border-brand-500/30 text-center animate-fade-up">
                    <div className="p-2 bg-white rounded-xl shadow-md">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrDataUrl}
                        alt={`QR Code for Room ${code}`}
                        className="size-48 sm:size-56 object-contain rounded-lg"
                      />
                    </div>
                    <p className="mt-3 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Scan with your other phone/tablet camera to connect instantly
                    </p>
                    <button
                      type="button"
                      onClick={() => void copyShareLink()}
                      className="mt-2 text-[12px] font-bold text-brand-600 dark:text-brand-300 hover:underline"
                    >
                      Copy direct join link
                    </button>
                  </div>
                )}
              </div>
            )}

            {phase === "idle" || (phase === "error" && !code) ? (
              <>
                <Field label="This device name" hint="Shown to the paired device on the same Wi‑Fi">
                  <input
                    maxLength={48}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => name.trim() && setLocalName(name)}
                    placeholder="e.g. My Phone, Laptop, iPad"
                    className={inputCls}
                  />
                </Field>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-[22px] bg-linear-to-br from-brand-500/10 to-glow-500/5 p-4 ring-1 ring-brand-500/15">
                    <div className="mb-2 flex items-center gap-2">
                      <IconTile icon={Wifi} tone="brand" size="sm" />
                      <span className="font-bold">This device creates</span>
                    </div>
                    <p className="mb-3 text-xs leading-relaxed text-muted">Generate a 5-char code & QR code for device 2 on the same Wi‑Fi.</p>
                    <Button className="w-full" icon={Link2} loading={busyAction === "create"} disabled={busyAction !== null} onClick={() => void create()}>
                      Create room
                    </Button>
                  </div>

                  <form onSubmit={connect} className="rounded-[22px] bg-linear-to-br from-sky-500/10 to-cyan-500/5 p-4 ring-1 ring-sky-500/15">
                    <div className="mb-2 flex items-center gap-2">
                      <IconTile icon={Clipboard} tone="sky" size="sm" />
                      <label htmlFor="sync-code" className="font-bold">Other device connects</label>
                    </div>
                    <p className="mb-3 text-xs leading-relaxed text-muted">Type the 5-char code from device 1 or scan its QR code.</p>
                    <div className="flex gap-2">
                      <input
                        id="sync-code"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
                        placeholder="K7M2P"
                        maxLength={5}
                        autoCapitalize="characters"
                        autoComplete="one-time-code"
                        spellCheck={false}
                        className="field h-11 min-w-0 flex-1 px-3 text-center font-mono text-lg font-extrabold tracking-[0.18em] uppercase outline-none"
                      />
                      <Button type="submit" icon={Link2} loading={busyAction === "join"} disabled={busyAction !== null || joinCode.length !== 5} aria-label="Connect to room">
                        Connect
                      </Button>
                    </div>
                  </form>
                </div>
              </>
            ) : null}

            {error && <div role="alert" className="rounded-2xl bg-rose-500/10 px-3.5 py-3 text-[13px] font-medium leading-relaxed text-rose-700 dark:text-rose-300">{error}</div>}

            {active && (
              <>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/[0.035] px-4 py-3 dark:bg-white/[0.05]">
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">Auto-sync</span>
                    <span className="block text-xs text-muted">Sync new words/reviews as you make them</span>
                  </span>
                  <Switch checked={autoSync} onChange={setAutoSync} label="Auto-sync changes" />
                </div>
                {transferProgress !== null && (
                  <div>
                    <div className="mb-1 flex justify-between text-xs font-semibold text-muted">
                      <span>{transferProgress < 100 ? "Syncing data…" : "Applying changes…"}</span>
                      <span>{transferProgress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/10">
                      <div className="h-full rounded-full brand-gradient transition-[width]" style={{ width: `${transferProgress}%` }} />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button icon={Send} loading={busyAction === "send"} disabled={transferProgress !== null} onClick={() => void send()}>
                    Send mine
                  </Button>
                  <Button variant="secondary" icon={RefreshCw} disabled={transferProgress !== null} onClick={getLatest}>
                    Get latest
                  </Button>
                </div>
                {lastSyncAt && (
                  <p className="text-center text-xs text-muted">
                    Last synced {new Date(lastSyncAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </p>
                )}
              </>
            )}

            {inRoom && (
              <Button variant="danger" icon={Unplug} className="w-full" onClick={() => void endSession()}>
                End session
              </Button>
            )}
          </div>
        </Card>
      </div>

      <div className="space-y-4 lg:col-span-5">
        <Card className="divide-y divide-[var(--line)] px-4 sm:px-5">
          <div className="flex items-start gap-3 py-4">
            <IconTile icon={QrCode} tone="teal" size="sm" />
            <div>
              <div className="text-sm font-bold">QR Code Sharing</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">Show the QR code on your laptop or phone. Point the camera of device 2 at the screen to connect immediately on the same Wi‑Fi.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 py-4">
            <IconTile icon={ShieldCheck} tone="emerald" size="sm" />
            <div>
              <div className="text-sm font-bold">Direct & Safe Local Peer Sync</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">Words and progress travel through an encrypted local WebRTC data channel between devices. Never uploaded to any external server.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 py-4">
            <IconTile icon={Wifi} tone="sky" size="sm" />
            <div>
              <div className="text-sm font-bold">Same Wi‑Fi Network</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">Make sure both your phone and laptop/iPad are on the same Wi‑Fi router network.</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <IconTile icon={RefreshCw} tone="amber" size="sm" />
            <div>
              <div className="text-sm font-bold">What gets synced?</div>
              <div className="text-xs text-muted">Full browser database with smart merge:</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["Words & meanings", "Synonyms & Antonyms", "Word parts & Mnemonics", "Spaced repetition", "Daily streak & Activity", "Quiz results"].map((s) => (
              <span key={s} className="rounded-full bg-brand-500/10 px-2.5 py-1 text-[11.5px] font-semibold text-brand-700 dark:text-brand-200">{s}</span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
