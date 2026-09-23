"use client";

import {
  Camera,
  CircleAlert,
  CircleCheck,
  Copy,
  Globe,
  Laptop,
  Link2,
  LoaderCircle,
  Lock,
  QrCode,
  RefreshCw,
  Router,
  Send,
  ShieldCheck,
  Smartphone,
  Unplug,
  Users,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { extractSyncCode, useLiveSync, type LinkRoute, type SyncDevice, type SyncPhase } from "@/lib/live-sync";
import { cn } from "@/lib/utils";
import { QrCodeCard, QrScanner } from "./qr-pairing";
import { Button, Card, Field, IconTile, Switch, inputCls, type IconType, type Tone } from "./ui";

const PHASE_META: Record<SyncPhase, { title: string; icon: IconType; tone: Tone; badge: string; badgeCls: string }> = {
  idle: { title: "Not connected", icon: WifiOff, tone: "slate", badge: "Offline", badgeCls: "bg-black/[0.05] text-muted dark:bg-white/[0.06]" },
  starting: { title: "Creating a room…", icon: Wifi, tone: "sky", badge: "Starting", badgeCls: "bg-sky-500/12 text-sky-700 dark:text-sky-300" },
  waiting: { title: "Waiting for a device…", icon: Wifi, tone: "brand", badge: "Room open", badgeCls: "bg-brand-500/12 text-brand-700 dark:text-brand-200" },
  connecting: { title: "Connecting…", icon: Link2, tone: "sky", badge: "Pairing", badgeCls: "bg-sky-500/12 text-sky-700 dark:text-sky-300" },
  connected: { title: "Live sync active", icon: Wifi, tone: "emerald", badge: "Connected", badgeCls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  reconnecting: { title: "Reconnecting…", icon: RefreshCw, tone: "amber", badge: "Reconnecting", badgeCls: "bg-amber-500/12 text-amber-700 dark:text-amber-300" },
  error: { title: "Connection needs attention", icon: CircleAlert, tone: "rose", badge: "Error", badgeCls: "bg-rose-500/12 text-rose-700 dark:text-rose-300" },
};

const ROUTE_META: Record<LinkRoute, { label: string; icon: IconType; cls: string; hint: string }> = {
  lan: { label: "Same Wi‑Fi · direct", icon: Router, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", hint: "Data stays inside your local network" },
  direct: { label: "Direct peer-to-peer", icon: Zap, cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300", hint: "Direct link through your router" },
  relay: { label: "Relayed · encrypted", icon: Globe, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300", hint: "Direct path blocked — using an encrypted relay" },
  unknown: { label: "Checking route…", icon: LoaderCircle, cls: "bg-black/[0.05] text-muted dark:bg-white/[0.06]", hint: "Measuring the connection" },
};

const isComputer = (name: string) => /PC|Mac|Linux|Chromebook|Windows/i.test(name) && !/iPhone|iPad|Android/i.test(name);

function RouteBadge({ route }: { route: LinkRoute }) {
  const meta = ROUTE_META[route];
  return (
    <span title={meta.hint} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold", meta.cls)}>
      <meta.icon className={cn("size-3", route === "unknown" && "animate-spin")} />
      {meta.label}
    </span>
  );
}

function DeviceRow({ device }: { device: SyncDevice }) {
  const Icon = isComputer(device.name) ? Laptop : Smartphone;
  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-emerald-500/10 p-3.5 ring-1 ring-emerald-500/20">
      <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Paired device</div>
        <div className="truncate font-bold">{device.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <RouteBadge route={device.route} />
          {device.rtt !== null && <span className="text-[11px] font-semibold tabular-nums text-muted">{device.rtt} ms</span>}
        </div>
      </div>
      <CircleCheck className="size-5 shrink-0 text-emerald-500" />
    </div>
  );
}

export function SyncPanel() {
  const s = useLiveSync();
  const [name, setName] = useState(s.localName);
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => setName(s.localName), [s.localName]);
  useEffect(() => {
    if (s.phase !== "idle") setScanning(false);
  }, [s.phase]);

  const isHost = s.role === "host";
  const connected = s.phase === "connected";
  const inSession = s.phase !== "idle" && s.phase !== "error";
  const meta = PHASE_META[s.phase];

  const join = (raw: string) => {
    const found = extractSyncCode(raw);
    if (!found) {
      toast.error("That isn't a VocaBera sync code");
      return;
    }
    setScanning(false);
    setCode(found);
    void s.joinRoom(found, name);
  };

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    if (code.length === 5) join(code);
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(s.code);
      toast.success("Room code copied");
    } catch {
      toast.error("Couldn't copy — read the code aloud instead");
    }
  };

  const description = (() => {
    switch (s.phase) {
      case "idle":
        return "Create a room on one device, then join it from the other. Connect both devices to the same Wi‑Fi router.";
      case "starting":
        return "Registering your room with the pairing service…";
      case "waiting":
        return "On your other device open Manage → Sync, then enter the code or scan the QR code.";
      case "connecting":
        return `Looking for room ${s.code} on your network…`;
      case "connected":
        return s.devices.length > 1 ? `${s.devices.length} devices are syncing live.` : "Your devices are linked directly and stay in sync.";
      case "reconnecting":
        return isHost
          ? `Restoring room ${s.code}${s.attempt > 1 ? ` · attempt ${s.attempt}` : ""}…`
          : `Reconnecting to the other device${s.attempt > 1 ? ` · attempt ${s.attempt}` : ""}…`;
      case "error":
        return "The session was stopped. Try again, or cancel and start over.";
    }
  })();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 [&>*]:min-w-0">
      <div className="space-y-4 lg:col-span-7">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[var(--line)] p-4 sm:p-5">
            <IconTile icon={meta.icon} tone={meta.tone} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold">{meta.title}</h2>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", meta.badgeCls)}>
                  <span className={cn("size-1.5 rounded-full bg-current", connected && "animate-pulse")} />
                  {meta.badge}
                </span>
                {inSession && s.signal === "offline" && (
                  <span title="New devices can't join until the pairing service is back. Paired devices keep syncing." className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[10.5px] font-bold text-amber-700 dark:text-amber-300">
                    Pairing service reconnecting
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>
            </div>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            {/* ------------------------------ Idle ------------------------------ */}
            {s.phase === "idle" && (
              <>
                <Field label="This device's name" hint="Shown on the other device">
                  <input
                    maxLength={48}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => name.trim() && s.setLocalName(name)}
                    placeholder="e.g. My phone"
                    className={inputCls}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col rounded-[22px] bg-linear-to-br from-brand-500/10 to-glow-500/5 p-4 ring-1 ring-brand-500/15">
                    <div className="mb-2 flex items-center gap-2">
                      <IconTile icon={QrCode} tone="brand" size="sm" />
                      <span className="font-bold">This device creates</span>
                    </div>
                    <p className="mb-3 text-xs leading-relaxed text-muted">Get a 5-character code and a QR code to share with your other device.</p>
                    <Button className="mt-auto w-full" icon={Wifi} onClick={() => void s.createRoom(name)}>
                      Create room
                    </Button>
                  </div>
                  <form onSubmit={onJoin} className="flex flex-col rounded-[22px] bg-linear-to-br from-sky-500/10 to-cyan-500/5 p-4 ring-1 ring-sky-500/15">
                    <div className="mb-2 flex items-center gap-2">
                      <IconTile icon={Link2} tone="sky" size="sm" />
                      <label htmlFor="sync-code" className="font-bold">
                        Other device connects
                      </label>
                    </div>
                    <p className="mb-3 text-xs leading-relaxed text-muted">Type the code shown on the first device, or scan its QR code.</p>
                    <div className="flex gap-2">
                      <input
                        id="sync-code"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
                        placeholder="K7M2P"
                        maxLength={5}
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                        className="field h-11 min-w-0 flex-1 px-3 text-center font-mono text-lg font-extrabold uppercase tracking-[0.18em] outline-none"
                      />
                      <Button type="submit" disabled={code.length !== 5} aria-label="Connect to room">
                        Connect
                      </Button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScanning((v) => !v)}
                      className="mt-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold text-sky-700 transition hover:bg-sky-500/10 dark:text-sky-300"
                    >
                      <Camera className="size-4" /> {scanning ? "Close scanner" : "Scan QR code"}
                    </button>
                  </form>
                </div>
                {scanning && <QrScanner onResult={join} onClose={() => setScanning(false)} />}
              </>
            )}

            {/* ------------------------------ Error ------------------------------ */}
            {s.phase === "error" && (
              <div className="space-y-3">
                <div role="alert" className="rounded-2xl bg-rose-500/10 px-3.5 py-3 text-[13px] font-medium leading-relaxed text-rose-700 dark:text-rose-300">
                  {s.error}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button icon={RefreshCw} onClick={s.retry}>
                    Try again
                  </Button>
                  <Button variant="secondary" onClick={() => void s.endSession()}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* ------------------------------ Host invite ------------------------------ */}
            {isHost && s.phase === "starting" && (
              <div className="flex items-center gap-3 rounded-[20px] bg-sky-500/10 p-4 text-[13px] font-semibold text-sky-800 dark:text-sky-200">
                <LoaderCircle className="size-5 animate-spin" /> Creating your room…
              </div>
            )}
            {isHost && s.code && s.phase !== "starting" && s.phase !== "error" && (!connected || showInvite) && (
              <div className="grid grid-cols-1 items-center gap-5 rounded-[22px] bg-black/[0.035] p-4 dark:bg-white/[0.045] sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Room code</span>
                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    title="Tap to copy room code"
                    aria-label={`Copy room code ${s.code}`}
                    className="mt-1 flex w-full items-center justify-between gap-2 rounded-2xl border border-brand-500/20 bg-white/70 px-4 py-3 text-left shadow-sm transition active:scale-[0.99] dark:bg-white/[0.04]"
                  >
                    <span className="font-mono text-[32px] font-black tracking-[0.22em] text-gradient">{s.code}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-500/10 px-2.5 py-1.5 text-xs font-bold text-brand-700 dark:text-brand-200">
                      <Copy className="size-3.5" /> Copy
                    </span>
                  </button>
                  <ol className="mt-3 space-y-1.5 text-[12.5px] leading-snug text-muted">
                    <li>1. Connect both devices to the same Wi‑Fi.</li>
                    <li>2. On the other device: Manage → Sync → enter this code, or scan the QR.</li>
                    <li>3. Keep this screen open until it shows “Live sync active”.</li>
                  </ol>
                  {!connected && s.phase === "waiting" && (
                    <p className="mt-3 flex items-center gap-2 text-[12.5px] font-semibold text-brand-700 dark:text-brand-200">
                      <span className="relative flex size-2.5">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-60" />
                        <span className="relative inline-flex size-2.5 rounded-full bg-brand-500" />
                      </span>
                      Waiting for a device on your Wi‑Fi…
                    </p>
                  )}
                </div>
                {s.joinLink && <QrCodeCard value={s.joinLink} caption="Scan with the other device's camera to join instantly" size={164} />}
              </div>
            )}

            {/* ------------------------------ Guest connecting ------------------------------ */}
            {!isHost && (s.phase === "connecting" || s.phase === "reconnecting") && (
              <div className="flex items-center gap-3 rounded-[20px] bg-sky-500/10 p-4">
                <LoaderCircle className="size-5 shrink-0 animate-spin text-sky-600 dark:text-sky-300" />
                <div className="min-w-0">
                  <div className="font-bold">{s.phase === "connecting" ? `Joining room ${s.code}…` : "Reconnecting to the other device…"}</div>
                  <div className="text-xs text-muted">
                    {s.attempt > 1 ? `Attempt ${s.attempt} · retrying automatically` : "Setting up a direct, encrypted connection over your Wi‑Fi"}
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------ Paired devices ------------------------------ */}
            {s.devices.length > 0 && (
              <div className="space-y-2">
                {s.devices.map((d) => (
                  <DeviceRow key={d.key} device={d} />
                ))}
              </div>
            )}
            {isHost && connected && (
              <button
                type="button"
                onClick={() => setShowInvite((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold text-brand-600 transition hover:bg-brand-500/10 dark:text-brand-300"
              >
                <Users className="size-3.5" /> {showInvite ? "Hide invite" : "Add another device"}
              </button>
            )}

            {/* ------------------------------ Sync controls ------------------------------ */}
            {connected && (
              <>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/[0.035] px-4 py-3 dark:bg-white/[0.05]">
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">Auto-sync</span>
                    <span className="block text-xs text-muted">Pushes new words, edits and progress automatically</span>
                  </span>
                  <Switch checked={s.autoSync} onChange={s.setAutoSync} label="Auto-sync changes" />
                </div>
                {s.transfer && (
                  <div>
                    <div className="mb-1 flex justify-between text-xs font-semibold text-muted">
                      <span>
                        {s.transfer.direction === "send" ? "Sending to" : "Receiving from"} {s.transfer.peer}…
                      </span>
                      <span className="tabular-nums">{s.transfer.progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/10">
                      <div className="h-full rounded-full brand-gradient transition-[width]" style={{ width: `${Math.max(4, s.transfer.progress)}%` }} />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button icon={Send} disabled={!!s.transfer} onClick={() => void s.sendMine()}>
                    Send mine
                  </Button>
                  <Button variant="secondary" icon={RefreshCw} disabled={!!s.transfer} onClick={s.getLatest}>
                    Get latest
                  </Button>
                </div>
                {s.lastSyncAt && (
                  <p className="text-center text-xs text-muted">
                    Last synced {new Date(s.lastSyncAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    {s.lastResult ? ` · ${s.lastResult}` : ""}
                  </p>
                )}
              </>
            )}

            {inSession && (
              <Button variant="danger" icon={Unplug} className="w-full" onClick={() => void s.endSession()}>
                End session
              </Button>
            )}
          </div>
        </Card>
      </div>

      <div className="space-y-4 lg:col-span-5">
        <Card className="divide-y divide-[var(--line)] px-4 sm:px-5">
          {[
            {
              icon: ShieldCheck,
              tone: "emerald" as Tone,
              title: "Private & encrypted",
              text: "Your words travel directly between your devices over an encrypted WebRTC channel. Only a tiny handshake uses the free PeerJS pairing service — nothing is stored on a server.",
            },
            {
              icon: Router,
              tone: "teal" as Tone,
              title: "Same Wi‑Fi, direct",
              text: "When both devices share a router, data stays inside your home network. The badge on each paired device shows the route in use.",
            },
            {
              icon: Zap,
              tone: "violet" as Tone,
              title: "Smart two-way merge",
              text: "New words, edits, favorites, learning progress and deletions sync both ways. The newest change wins and nothing is ever duplicated.",
            },
            {
              icon: RefreshCw,
              tone: "amber" as Tone,
              title: "Self-healing connection",
              text: "Heartbeats detect drops and reconnect automatically, and reloading the page resumes the session. The screen stays awake while a session is open.",
            },
          ].map((row) => (
            <div key={row.title} className="flex items-start gap-3 py-4">
              <IconTile icon={row.icon} tone={row.tone} size="sm" />
              <div>
                <div className="text-sm font-bold">{row.title}</div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{row.text}</p>
              </div>
            </div>
          ))}
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <IconTile icon={Lock} tone="slate" size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">Local network only</div>
              <div className="text-xs leading-relaxed text-muted">Never use an internet relay. Both devices must be on the same Wi‑Fi. Applies to the next room you create or join.</div>
            </div>
            <Switch checked={s.localOnly} onChange={s.setLocalOnly} label="Local network only" />
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="text-sm font-bold">What gets synced?</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["Words & meanings", "Edits & favorites", "Tags & difficulty", "Mastery & review schedule", "Deleted words", "Daily activity & streaks", "Quiz results", "Answer history"].map((item) => (
              <span key={item} className="rounded-full bg-brand-500/10 px-2.5 py-1 text-[11.5px] font-semibold text-brand-700 dark:text-brand-200">
                {item}
              </span>
            ))}
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="text-sm font-bold">Trouble connecting?</div>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
            <li>• Put both devices on the same Wi‑Fi network (not a guest network) and turn off VPNs.</li>
            <li>• If it keeps reconnecting, turn off “AP / client isolation” on the router, or switch off Local network only so the encrypted relay can help.</li>
            <li>• Keep VocaBera open on both screens while syncing — you can move between tabs freely.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
