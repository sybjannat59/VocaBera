// Source of public/tts-worker.js — rebuild after editing:
//   npx esbuild scripts/tts-worker.ts --bundle --format=esm --platform=browser --minify --outfile=public/tts-worker.js
/// <reference lib="webworker" />
// On-device neural text-to-speech (Kokoro-82M, Apache-2.0) running in a Web Worker so the UI never stutters.
// The model (~90 MB) is downloaded once from Hugging Face and cached by the browser for offline use.
import { env } from "@huggingface/transformers";
import { KokoroTTS } from "kokoro-js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
/** Tried in order: Hugging Face, then a public mirror for networks where huggingface.co is blocked or slow. */
const DEFAULT_HOSTS = ["https://huggingface.co/", "https://hf-mirror.com/"];

type Incoming = { type: "load"; hosts?: string[] } | { type: "speak"; id: number; text: string; voice: string; speed: number; hosts?: string[] };

let loading: Promise<KokoroTTS> | null = null;
let hosts = DEFAULT_HOSTS;
const files = new Map<string, { loaded: number; total: number }>();

function post(message: unknown, transfer: Transferable[] = []) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer);
}

const voiceUrl = (host: string, voice: string) => `${host}${MODEL_ID}/resolve/main/voices/${voice}.bin`;

/**
 * kokoro-js always looks voices up in Cache Storage under their huggingface.co address.
 * Filling that cache entry from whichever host responds makes mirrors work for voices too.
 */
async function ensureVoice(voice: string) {
  if (!/^[a-z]{2}_[a-z]+$/.test(voice)) return;
  const key = voiceUrl("https://huggingface.co/", voice);
  const cache = await caches.open("kokoro-voices");
  if (await cache.match(key)) return;
  for (const host of hosts) {
    try {
      const res = await fetch(voiceUrl(host, voice));
      if (res.ok) {
        await cache.put(key, new Response(await res.arrayBuffer()));
        return;
      }
    } catch {
      /* try the next host */
    }
  }
}

function load() {
  loading ??= (async () => {
    let lastError: unknown;
    for (const host of hosts) {
      env.remoteHost = host;
      files.clear();
      try {
        return await KokoroTTS.from_pretrained(MODEL_ID, {
          dtype: "q8",
          device: "wasm",
          progress_callback: (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
            if (p.status === "progress" && p.file && typeof p.total === "number" && p.total > 0) {
              files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
              let loaded = 0;
              let total = 0;
              for (const f of files.values()) {
                loaded += f.loaded;
                total += f.total;
              }
              post({ type: "progress", loaded, total, progress: total ? loaded / total : 0 });
            }
          },
        });
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Couldn't download the AI voice");
  })().then(
    (model) => {
      post({ type: "ready" });
      return model;
    },
    (err: unknown) => {
      loading = null;
      post({ type: "error", error: err instanceof Error ? err.message : String(err) });
      throw err;
    },
  );
  return loading;
}

self.onmessage = async (event: MessageEvent<Incoming>) => {
  const msg = event.data;
  if (msg.hosts?.length) hosts = msg.hosts;
  if (msg.type === "load") {
    load().catch(() => undefined);
    return;
  }
  if (msg.type === "speak") {
    try {
      const model = await load();
      await ensureVoice(msg.voice);
      const audio = await model.generate(msg.text, { voice: msg.voice as "af_heart", speed: msg.speed });
      const pcm = audio.audio as Float32Array;
      post({ type: "audio", id: msg.id, pcm, rate: audio.sampling_rate }, [pcm.buffer]);
    } catch (err) {
      post({ type: "speak-error", id: msg.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
};
