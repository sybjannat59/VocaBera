"use client";

import { Camera, CameraOff, Check, Copy, Keyboard, LoaderCircle, QrCode, RefreshCw, ScanLine, Wifi } from "lucide-react";
import jsQR from "jsqr";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button, inputCls } from "./ui";

/* -------------------------------- QR display ------------------------------- */

export function QrCodeCard({
  payload,
  label,
  hint,
  size = 232,
  busy,
}: {
  payload: string | null;
  label: string;
  hint?: string;
  size?: number;
  busy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Pairing code copied");
    } catch {
      toast.error("Couldn't copy — select the text and copy manually");
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative rounded-[26px] bg-white p-3 shadow-xl ring-1 ring-black/[0.06] dark:bg-white">
        {payload ? (
          <QRCodeSVG value={payload} size={size} level="M" marginSize={1} bgColor="#ffffff" fgColor="#0f172a" title={label} />
        ) : (
          <div className="grid place-items-center" style={{ width: size, height: size }}>
            {busy ? <LoaderCircle className="size-8 animate-spin text-brand-500" /> : <QrCode className="size-10 text-slate-300" />}
          </div>
        )}
        {payload && (
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-brand-500 px-3 py-0.5 text-[11px] font-bold text-white shadow-lg">
            {label}
          </span>
        )}
      </div>
      {hint && <p className="mt-4 max-w-xs text-center text-[12.5px] leading-snug text-muted">{hint}</p>}
      {payload && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Button size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={() => void copy()}>
            {copied ? "Copied" : "Copy code"}
          </Button>
          <span className="inline-flex h-9 items-center rounded-xl bg-black/[0.04] px-3 text-[11px] font-semibold text-muted tabular-nums dark:bg-white/[0.06]">
            {payload.length} chars
          </span>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- QR scanner ------------------------------- */

export interface ScannerHandle {
  stop: () => void;
}

export function QrScanner({
  onResult,
  active,
  onError,
}: {
  onResult: (text: string) => void;
  active: boolean;
  onError?: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "denied" | "unsupported">("idle");

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  useEffect(() => {
    if (!active) {
      stop();
      return;
    }
    doneRef.current = false;
    setStatus("starting");
    let cancelled = false;

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || cancelled) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (width && height) {
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, width, height);
            const image = ctx.getImageData(0, 0, width, height);
            const found = jsQR(image.data, width, height, { inversionAttempts: "attemptBoth" });
            if (found?.data && !doneRef.current) {
              doneRef.current = true;
              setStatus("scanning");
              onResult(found.data);
              return;
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        onError?.("This browser can't open the camera. Paste the code instead.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play().catch(() => undefined);
        setStatus("scanning");
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (cancelled) return;
        setStatus("denied");
        onError?.(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera permission was blocked. Allow it, or paste the pairing code instead."
            : "Couldn't open the camera. Paste the pairing code instead.",
        );
      }
    };

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [active, onResult, onError, stop]);

  return (
    <div className="relative overflow-hidden rounded-[22px] bg-slate-950 ring-1 ring-black/10">
      <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="relative size-[62%] max-w-[240px]">
          <span className="absolute inset-0 rounded-[20px] border-2 border-white/70" />
          <span className="absolute inset-x-0 top-1/2 h-0.5 animate-pulse bg-emerald-400 shadow-[0_0_16px_4px_rgba(16,185,129,0.5)]" />
          <Corners />
        </div>
      </div>
      {status !== "scanning" && (
        <div className="absolute inset-0 grid place-items-center bg-slate-950/70 p-4 text-center">
          <div>
            {status === "starting" && (
              <>
                <LoaderCircle className="mx-auto size-7 animate-spin text-white" />
                <p className="mt-2 text-[13px] font-semibold text-white/90">Starting camera…</p>
              </>
            )}
            {status === "denied" && (
              <>
                <CameraOff className="mx-auto size-7 text-rose-300" />
                <p className="mt-2 text-[13px] font-semibold text-white/90">Camera blocked</p>
                <p className="mt-1 text-[12px] text-white/70">Allow camera access, or paste the code below.</p>
              </>
            )}
            {status === "unsupported" && (
              <>
                <CameraOff className="mx-auto size-7 text-amber-300" />
                <p className="mt-2 text-[13px] font-semibold text-white/90">Camera not available</p>
                <p className="mt-1 text-[12px] text-white/70">Paste the pairing code below instead.</p>
              </>
            )}
          </div>
        </div>
      )}
      <span className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-slate-950/70 px-3 py-1 text-[11px] font-semibold text-white/90">
        <ScanLine className="size-3.5" /> Point at the QR code
      </span>
    </div>
  );
}

function Corners() {
  const base = "absolute size-7 border-emerald-400";
  return (
    <>
      <span className={cn(base, "left-0 top-0 rounded-tl-[18px] border-l-[3px] border-t-[3px]")} />
      <span className={cn(base, "right-0 top-0 rounded-tr-[18px] border-r-[3px] border-t-[3px]")} />
      <span className={cn(base, "bottom-0 left-0 rounded-bl-[18px] border-b-[3px] border-l-[3px]")} />
      <span className={cn(base, "bottom-0 right-0 rounded-br-[18px] border-b-[3px] border-r-[3px]")} />
    </>
  );
}

/** Camera + paste fallback in one block. */
export function ScanInput({
  onText,
  label,
  busy,
}: {
  onText: (text: string) => void;
  label: string;
  busy?: boolean;
}) {
  const [camera, setCamera] = useState(false);
  const [pasted, setPasted] = useState("");
  const handle = useCallback(
    (text: string) => {
      setCamera(false);
      onText(text);
    },
    [onText],
  );

  return (
    <div className="space-y-3">
      {camera ? (
        <QrScanner active onResult={handle} onError={(m) => toast.error(m)} />
      ) : (
        <button
          type="button"
          onClick={() => setCamera(true)}
          className="surface flex w-full items-center gap-3 rounded-[22px] p-4 text-left transition active:scale-[0.99]"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-brand-500/12 text-brand-600 dark:text-brand-300">
            <Camera className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{label}</span>
            <span className="block text-xs text-muted">Open the camera and scan the QR code</span>
          </span>
        </button>
      )}

      <div>
        <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[12.5px] font-semibold text-muted">
          <Keyboard className="size-3.5" /> No camera? Paste the code instead
        </div>
        <div className="flex gap-2">
          <input
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="VB1:…"
            className={cn(inputCls, "min-w-0 flex-1 font-mono text-[12px]")}
            spellCheck={false}
          />
          <Button variant="secondary" disabled={!pasted.trim() || busy} loading={busy} onClick={() => handle(pasted.trim())}>
            Use
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Info banner ------------------------------- */

export function SameWifiNote() {
  return (
    <div className="flex items-start gap-2.5 rounded-[20px] bg-emerald-500/10 p-3.5 text-[12.5px] leading-relaxed text-emerald-800 dark:text-emerald-200">
      <Wifi className="mt-0.5 size-4 shrink-0" />
      <span>
        Make sure both devices are on the <b>same Wi‑Fi router</b> (the same network name). Pairing happens directly between the two devices — no
        account, no cloud and no expiry.
      </span>
    </div>
  );
}

export function RefreshHint() {
  return (
    <p className="flex items-center justify-center gap-1.5 text-[11.5px] text-muted">
      <RefreshCw className="size-3.5" /> Code not scanning? Tap the QR card and use the copy button.
    </p>
  );
}
