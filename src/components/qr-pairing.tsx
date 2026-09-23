"use client";

import jsQR from "jsqr";
import { CameraOff, Check, Copy, LoaderCircle, ScanLine, Share2, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "./ui";

/* -------------------------------- QR display ------------------------------- */

export function QrCodeCard({ value, caption, size = 200 }: { value: string; caption: string; size?: number }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: "Join my VocaBera sync", text: "Open this on your other device to sync VocaBera:", url: value });
    } catch {
      /* dismissed */
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="rounded-[24px] bg-white p-3 shadow-xl ring-1 ring-black/[0.06]">
        <QRCodeSVG value={value} size={size} level="M" marginSize={1} bgColor="#ffffff" fgColor="#0f172a" title={caption} />
      </div>
      <p className="mt-3 max-w-[16rem] text-center text-[12.5px] leading-snug text-muted">{caption}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <Button size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={() => void copy()}>
          {copied ? "Copied" : "Copy link"}
        </Button>
        {canShare && (
          <Button size="sm" variant="secondary" icon={Share2} onClick={() => void share()}>
            Share
          </Button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- QR scanner ------------------------------- */

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

/** Camera QR scanner: native BarcodeDetector when available, jsQR everywhere else. */
export function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "denied" | "unsupported">("starting");
  const resultRef = useRef(onResult);
  resultRef.current = onResult;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    let lastScan = 0;
    let detector: BarcodeDetectorLike | null = null;
    const Native = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (Native) {
      try {
        detector = new Native({ formats: ["qr_code"] });
      } catch {
        detector = null;
      }
    }

    const found = (text: string) => {
      if (stopped || !text) return;
      stopped = true;
      navigator.vibrate?.(30);
      resultRef.current(text);
    };

    const tick = async (time: number) => {
      if (stopped) return;
      raf = requestAnimationFrame((t) => void tick(t));
      const video = videoRef.current;
      if (!video || video.readyState < video.HAVE_ENOUGH_DATA || time - lastScan < 120) return;
      lastScan = time;
      try {
        if (detector) {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) found(codes[0].rawValue);
          return;
        }
        const canvas = canvasRef.current;
        if (!canvas) return;
        const scale = Math.min(1, 640 / (video.videoWidth || 640));
        const w = Math.round((video.videoWidth || 640) * scale);
        const h = Math.round((video.videoHeight || 480) * scale);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, w, h);
        const image = ctx.getImageData(0, 0, w, h);
        const code = jsQR(image.data, w, h, { inversionAttempts: "dontInvert" });
        if (code?.data) found(code.data);
      } catch {
        /* keep scanning */
      }
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        setStatus("scanning");
        raf = requestAnimationFrame((t) => void tick(t));
      } catch (err) {
        if (!stopped) setStatus(err instanceof DOMException && err.name === "NotAllowedError" ? "denied" : "unsupported");
      }
    };

    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-[22px] bg-slate-950 ring-1 ring-black/10">
      <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="relative size-[60%] max-w-[230px]">
          <span className="absolute inset-0 rounded-[20px] border-2 border-white/60" />
          <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse bg-emerald-400 shadow-[0_0_16px_4px_rgba(16,185,129,0.5)]" />
          {(["left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-[18px]", "right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-[18px]", "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-[18px]", "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-[18px]"] as const).map((c) => (
            <span key={c} className={cn("absolute size-7 border-emerald-400", c)} />
          ))}
        </div>
      </div>
      {status !== "scanning" && (
        <div className="absolute inset-0 grid place-items-center bg-slate-950/75 p-5 text-center text-white">
          {status === "starting" ? (
            <div>
              <LoaderCircle className="mx-auto size-7 animate-spin" />
              <p className="mt-2 text-[13px] font-semibold">Starting camera…</p>
            </div>
          ) : (
            <div>
              <CameraOff className="mx-auto size-7 text-amber-300" />
              <p className="mt-2 text-[13px] font-semibold">{status === "denied" ? "Camera access was blocked" : "Camera not available"}</p>
              <p className="mt-1 text-[12px] text-white/70">Type the 5-character code instead.</p>
            </div>
          )}
        </div>
      )}
      <span className="pointer-events-none absolute bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-slate-950/70 px-3 py-1 text-[11px] font-semibold text-white/90">
        <ScanLine className="size-3.5" /> Point at the QR code on the other device
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close scanner"
        className="absolute right-2.5 top-2.5 grid size-9 place-items-center rounded-full bg-slate-950/60 text-white transition active:scale-90"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
