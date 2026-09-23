"use client";

import {
  Camera,
  Check,
  CircleCheck,
  Info,
  QrCode,
  RotateCcw,
  Clipboard,
  Copy,
  Link2,
  LoaderCircle,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Unplug,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useLiveSync } from "@/lib/live-sync";
import { QrCodeCard, SameWifiNote, ScanInput } from "./qr-pairing";
import { Button, Card, Field, IconTile, Segmented, Switch, inputCls } from "./ui";
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
    pairMode,
    setPairMode,
    pairCode,
    qrPayload,
    qrLink,
    qrBusy,
    startQrHost,
    submitScannedCode,
    resetQrPairing,
  } = useLiveSync();
  const [name, setName] = useState(localName);
  const [joinCode, setJoinCode] = useState("");
  const [busyAction, setBusyAction] = useState<"create" | "join" | "send" | null>(null);
  const [copied, setCopied] = useState(false);
  const active = phase === "connected";
  const inRoom = phase === "waiting" || phase === "connecting" || active || (phase === "error" && !!code);
  const canUseRtc = typeof window !== "undefined" && "RTCPeerConnection" in window;

  useEffect(() => setName(localName), [localName]);

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
          ? "Waiting for the other device…"
          : phase === "connecting"
            ? "Connecting devices…"
            : phase === "error"
              ? "Connection needs attention"
              : "Not connected";

  const message =
    phase === "waiting"
      ? "On the other device, open Manage → Sync, enter this code and tap Connect."
      : phase === "connecting"
        ? "Keep both devices on this page while the secure peer connection is established."
        : active
          ? "Your devices are paired directly. The room server relays only the connection handshake."
          : "Create a room on one device, then enter its code on the other device.";

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
            <Segmented
              value={pairMode}
              onChange={(m) => {
                setPairMode(m);
                resetQrPairing();
              }}
              options={[
                { value: "server", label: "Room code", icon: Wifi },
                { value: "qr", label: "QR over Wi‑Fi", icon: QrCode },
              ]}
            />

            {pairMode === "qr" && (
              <QrPairSection
                role={role}
                phase={phase}
                active={active}
                pairCode={pairCode}
                qrPayload={qrPayload}
                qrLink={qrLink}
                qrBusy={qrBusy}
                peerName={peerName}
                localName={name}
                error={error}
                onStart={() => void startQrHost(name)}
                onSubmit={submitScannedCode}
                onReset={resetQrPairing}
              />
            )}

            {pairMode === "server" && active && (
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

            {pairMode === "server" && inRoom && code && (
              <div className="rounded-[22px] bg-black/[0.035] p-4 dark:bg-white/[0.045]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">Room code · {role === "host" ? "Share this code" : "Paired room"}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted">
                    <Radio className="size-3.5" /> Expires after 10 min inactive
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void copyCode()}
                  className="mt-2 flex w-full items-center justify-between rounded-2xl border border-brand-500/20 bg-white/70 px-4 py-3 text-left shadow-sm transition active:scale-[0.99] dark:bg-white/[0.04]"
                  aria-label={`Copy room code ${code}`}
                  title="Tap to copy room code"
                >
                  <span className="font-mono text-[32px] font-black tracking-[0.22em] text-gradient">{code}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-2 text-xs font-bold text-brand-700 dark:text-brand-200">
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? "Copied" : "Copy"}
                  </span>
                </button>
              </div>
            )}

            {pairMode === "server" && (phase === "idle" || (phase === "error" && !code)) ? (
              <>
                <Field label="This device name" hint="Shown to the paired device">
                  <input
                    maxLength={48}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => name.trim() && setLocalName(name)}
                    placeholder="e.g. My iPhone"
                    className={inputCls}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-[22px] bg-linear-to-br from-brand-500/10 to-glow-500/5 p-4 ring-1 ring-brand-500/15">
                    <div className="mb-2 flex items-center gap-2">
                      <IconTile icon={Wifi} tone="brand" size="sm" />
                      <span className="font-bold">This device creates</span>
                    </div>
                    <p className="mb-3 text-xs leading-relaxed text-muted">Generate a unique 5-character code, then share it with your other device.</p>
                    <Button className="w-full" icon={Link2} loading={busyAction === "create"} disabled={busyAction !== null} onClick={() => void create()}>
                      Create room
                    </Button>
                  </div>
                  <form onSubmit={connect} className="rounded-[22px] bg-linear-to-br from-sky-500/10 to-cyan-500/5 p-4 ring-1 ring-sky-500/15">
                    <div className="mb-2 flex items-center gap-2">
                      <IconTile icon={Clipboard} tone="sky" size="sm" />
                      <label htmlFor="sync-code" className="font-bold">Other device connects</label>
                    </div>
                    <p className="mb-3 text-xs leading-relaxed text-muted">Enter the code displayed on the first device.</p>
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

            {(pairMode === "server" ? active : active) && (
              <>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/[0.035] px-4 py-3 dark:bg-white/[0.05]">
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">Auto-sync</span>
                    <span className="block text-xs text-muted">Push changes after a short pause</span>
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

            {((pairMode === "server" && inRoom) || (pairMode === "qr" && (active || !!qrPayload))) && (
              <Button
                variant="danger"
                icon={Unplug}
                className="w-full"
                onClick={() => {
                  if (pairMode === "qr") {
                    resetQrPairing();
                    toast.message("QR pairing reset");
                  } else void endSession();
                }}
              >
                End session
              </Button>
            )}
          </div>
        </Card>
      </div>

      <div className="space-y-4 lg:col-span-5">
        <Card className="divide-y divide-[var(--line)] px-4 sm:px-5">
          <div className="flex items-start gap-3 py-4">
            <IconTile icon={ShieldCheck} tone="emerald" size="sm" />
            <div>
              <div className="text-sm font-bold">Private, direct transfer</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">Your words, progress and history travel through an encrypted WebRTC data channel between devices. The room server relays only the short-lived connection handshake.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 py-4">
            <IconTile icon={RefreshCw} tone="violet" size="sm" />
            <div>
              <div className="text-sm font-bold">Change-aware auto-sync</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">Updates are debounced and hash-checked. A received snapshot is marked as the new baseline, preventing echo loops between the paired devices.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 py-4">
            <IconTile icon={Wifi} tone="sky" size="sm" />
            <div>
              <div className="text-sm font-bold">Best on the same Wi‑Fi</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">WebRTC tries a direct local connection first. Some guest networks block device-to-device traffic; use the same trusted Wi‑Fi and keep both devices awake while pairing.</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <IconTile icon={RefreshCw} tone="amber" size="sm" />
            <div>
              <div className="text-sm font-bold">What gets synced?</div>
              <div className="text-xs text-muted">The full vocabulary backup, merged safely.</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["Words & meanings", "Favorites & tags", "Mastery & review schedule", "Daily activity", "Quiz results", "Answer history"].map((s) => (
              <span key={s} className="rounded-full bg-brand-500/10 px-2.5 py-1 text-[11.5px] font-semibold text-brand-700 dark:text-brand-200">{s}</span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------- QR pairing section ----------------------------- */

function StepBadge({ n }: { n: number }) {
  return <span className="grid size-6 shrink-0 place-items-center rounded-full brand-gradient text-[11px] font-extrabold text-white">{n}</span>;
}

function QrPairSection({
  role,
  phase,
  active,
  pairCode,
  qrPayload,
  qrLink,
  qrBusy,
  peerName,
  localName,
  error,
  onStart,
  onSubmit,
  onReset,
}: {
  role: "host" | "guest" | null;
  phase: string;
  active: boolean;
  pairCode: string;
  qrPayload: string | null;
  qrLink: string | null;
  qrBusy: boolean;
  peerName: string;
  localName: string;
  error: string;
  onStart: () => void;
  onSubmit: (text: string) => Promise<void>;
  onReset: () => void;
}) {
  const isGuest = role === "guest";
  const started = !!qrPayload || isGuest;

  if (active) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-[20px] bg-emerald-500/10 p-3.5 ring-1 ring-emerald-500/20">
          <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
            <CircleCheck className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Paired by QR</div>
            <div className="truncate font-bold">{peerName || "Paired device"}</div>
          </div>
        </div>
        <SameWifiNote />
        <p className="flex items-start gap-1.5 px-1 text-[12px] text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" /> Keep this page open while syncing. Reloading the page ends the session — just create a new code to pair again.
        </p>
        <QrActions
          active
          qrBusy={qrBusy}
          qrPayload={qrPayload}
          qrLink={qrLink}
          localName={localName}
        />
      </div>
    );
  }

  if (!started) {
    return (
      <div className="space-y-4">
        <SameWifiNote />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onStart}
            disabled={qrBusy}
            className="surface flex flex-col items-start rounded-[22px] p-4 text-left transition hover:-translate-y-0.5 active:scale-[0.99] disabled:opacity-60"
          >
            <span className="grid size-11 place-items-center rounded-[14px] brand-gradient text-white shadow-lg shadow-brand-500/30">
              <QrCode className="size-5" />
            </span>
            <span className="mt-3 font-bold">Show a QR code</span>
            <span className="text-xs leading-snug text-muted">On the device that has your words — show this to the other device</span>
          </button>
          <div className="surface rounded-[22px] p-4">
            <span className="grid size-11 place-items-center rounded-[14px] bg-sky-500/12 text-sky-600 dark:text-sky-300">
              <Camera className="size-5" />
            </span>
            <span className="mt-3 block font-bold">Scan a QR code</span>
            <span className="block text-xs leading-snug text-muted">On the device you want to copy words to — scan the code shown on the other device</span>
            <div className="mt-3">
              <ScanInput busy={qrBusy} label="Scan to receive words" onText={(t) => void onSubmit(t)} />
            </div>
          </div>
        </div>
        {error && <div role="alert" className="rounded-2xl bg-rose-500/10 px-3.5 py-3 text-[13px] font-medium text-rose-700 dark:text-rose-300">{error}</div>}
        <p className="px-1 text-[12px] leading-relaxed text-muted">
          Nothing is uploaded: the two devices exchange a one-time handshake inside the QR code and then talk directly over your Wi‑Fi.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SameWifiNote />
      {pairCode && (
        <div className="flex items-center justify-between rounded-2xl bg-black/[0.035] px-4 py-3 dark:bg-white/[0.05]">
          <span className="text-[12.5px] font-semibold text-muted">Pairing code</span>
          <span className="font-mono text-lg font-black tracking-[0.2em] text-gradient">{pairCode}</span>
        </div>
      )}

      {isGuest ? (
        <>
          <div className="flex items-center gap-2.5">
            <StepBadge n={1} />
            <p className="text-[13px] font-semibold">Show this reply code to the first device</p>
          </div>
          <QrCodeCard payload={qrPayload} busy={qrBusy} label="Reply code" hint="On the other device, tap “Scan reply” and point the camera here." />
        </>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <StepBadge n={1} />
            <p className="text-[13px] font-semibold">On the other device: scan this code (in VocaBera or with the camera app)</p>
          </div>
          <QrCodeCard payload={qrPayload} busy={qrBusy} label="Invitation" hint="Then come back here and scan the reply code it shows you." />
          <div className="flex items-center gap-2.5 pt-1">
            <StepBadge n={2} />
            <p className="text-[13px] font-semibold">Scan the reply code</p>
          </div>
          <ScanInput busy={qrBusy} label="Scan reply from the other device" onText={(t) => void onSubmit(t)} />
        </>
      )}

      {qrLink && (
        <p className="break-all rounded-2xl bg-black/[0.035] px-3.5 py-2.5 text-[11px] leading-relaxed text-muted dark:bg-white/[0.05]">
          <b className="text-fg">Camera app tip:</b> scanning this code with a normal camera opens VocaBera and pairs automatically.
        </p>
      )}

      {phase === "error" && error && <div role="alert" className="rounded-2xl bg-rose-500/10 px-3.5 py-3 text-[13px] font-medium text-rose-700 dark:text-rose-300">{error}</div>}

      {!active && (
        <p className="flex items-start gap-1.5 px-1 text-[12px] leading-relaxed text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" /> Keep both screens open until the status says “Live sync active”. A QR code stays valid for 45 minutes and can never “expire” mid-pairing.
        </p>
      )}

      <Button variant="secondary" icon={RotateCcw} className="w-full" onClick={onReset}>
        Start over
      </Button>
    </div>
  );
}

function QrActions({
  qrBusy,
  qrPayload,
  qrLink,
  localName,
}: {
  active: boolean;
  qrBusy: boolean;
  qrPayload: string | null;
  qrLink: string | null;
  localName: string;
}) {
  const [showCode, setShowCode] = useState(false);
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setShowCode((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold text-brand-600 hover:bg-brand-500/10 dark:text-brand-300"
      >
        <QrCode className="size-3.5" /> {showCode ? "Hide pairing code" : "Show pairing code again"}
      </button>
      {showCode && <QrCodeCard payload={qrPayload} busy={qrBusy} label={`From ${localName}`} size={200} hint="Scan this on another device to add it to the same sync group." />}
      {qrLink && (
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(qrLink).then(() => toast.success("Link copied")).catch(() => toast.error("Couldn't copy"))}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-black/[0.04] px-3 text-[12px] font-bold text-muted dark:bg-white/[0.06]"
        >
          <Copy className="size-3.5" /> Copy invite link
        </button>
      )}
    </div>
  );
}
