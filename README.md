# VocaBera — Smart Vocabulary Builder

A mobile-first, installable (PWA) vocabulary app for English learners with Bangla meanings.

- **Local/Browser Database** — 100% browser-based database (IndexedDB); works offline without requiring any server database setup!
- **Words** — add words with Bangla meaning, definition, synonyms, antonyms, example sentence, prefix, root, suffix, mnemonic
- **AI Auto-fill** — Wiktionary, Datamuse, Tatoeba and MyMemory research, refined by AI
- **Smart quiz** (11 adaptive question types), **Match pairs**, **3D flashcards** with spaced repetition
- **Progress** — charts, study calendar heatmap, forecasts and 20 achievements; daily recap popup
- **Excel (.xlsx) / CSV / JSON import & export**, **live sync** between devices over Wi‑Fi (PeerJS peer-to-peer WebRTC)
- **Works offline** — installable PWA; all words and study progress stay safe in your browser

**Tech:** Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Browser IndexedDB · PeerJS (WebRTC) · Drizzle ORM

---

## Deploy to Vercel (Zero Database Setup Required!)

VocaBera uses a **local/browser-based database (IndexedDB)**. You can deploy it to Vercel completely free with **ZERO environment variables**!

### 1. Get the files

Download **`vocabera-source.zip`** and extract it on your computer. Inside you'll see `src`, `public`, `package.json`, etc.

Never upload `node_modules`, `.next` or `.env` — they are already excluded.

### 2. Upload to GitHub

1. Go to **github.com → + (top right) → New repository**, name it `vocabera`, choose Public or Private, and click **Create repository**.
2. On the new repository page click **“uploading an existing file”**.
3. Open the extracted folder, select **all files and folders inside it** (Ctrl + A / ⌘ + A) and **drag them into the browser window**. Folders keep their structure. Use **Chrome or Edge** (Safari cannot drag folders).
4. Wait until all files are listed, then click **Commit changes**.

   GitHub accepts **at most 100 files per upload**, and VocaBera has about 105. Upload in two rounds: first drag in everything **except** the `src` folder and commit. Then choose **Add file → Upload files**, drag in the `src` folder and commit again. The folder structure is kept.

✅ Check: the repository root must show `package.json`, `src` and `public` directly — not inside a single parent folder.

### 3. Deploy on Vercel

1. Go to **vercel.com → Add New… → Project** and **Import** the `vocabera` repository.
2. Framework Preset: **Next.js** (detected automatically). Leave Root Directory as `./` and all build settings as default.
3. Click **Deploy**.

That's it! Your app will build and go live in ~1 minute. Open your deployed URL — your words, quizzes, flashcards, Excel import, and Wi-Fi sync are all immediately functional!

### Optional: Cloud PostgreSQL Mirror

If you ever want to mirror your words to a cloud PostgreSQL database, you can connect a free Neon database in Vercel → Storage, which sets `DATABASE_URL`. However, this is **completely optional** — the app operates normally in browser storage without it.

### Optional: Custom AI Provider for Auto-fill

AI Auto-fill works out of the box without any API key using free public dictionaries and Pollinations AI. If you want faster AI responses, add these in Vercel **Settings → Environment Variables**:

| Variable | Groq (free tier) | Google Gemini (free tier) | OpenAI |
| --- | --- | --- | --- |
| `AI_API_KEY` | your Groq key | your Gemini key | your OpenAI key |
| `AI_BASE_URL` | `https://api.groq.com/openai/v1` | `https://generativelanguage.googleapis.com/v1beta/openai` | `https://api.openai.com/v1` |
| `AI_MODEL` | `llama-3.3-70b-versatile` | `gemini-2.5-flash` | `gpt-4o-mini` |

---

## Sync between your devices over Wi‑Fi (PeerJS peer-to-peer)

Open **Manage → Sync** on both devices, with both connected to the same Wi‑Fi router.

1. On the device that has your words, tap **Create room**. You get a 5-character code (e.g. `K7M2P`, tap to copy) and a QR code.
2. On the other device, type the code and tap **Connect**, tap **Scan QR code**, or simply scan the QR with the phone's camera app (it opens VocaBera and joins automatically).
3. Both screens show **Live sync active** with the paired device's name and the route in use. **Same Wi‑Fi · direct** means the data never leaves your home network.

**How it works:** the free [PeerJS](https://peerjs.com) cloud service only introduces the two devices (a few KB of handshake). All vocabulary data then flows directly between the devices over an encrypted WebRTC data channel. Nothing is stored on a server, so rooms can't "expire", and it works on Vercel with zero setup.

- **Auto-sync** pushes new words, edits, favorites, learning progress and deletions automatically. Devices compare content digests, so data never bounces back and forth. **Send mine** / **Get latest** force a full transfer.
- **Smart merge:** the newest edit wins, the most recent review wins, deletions propagate, and quiz history is merged without duplicates. Daily activity is tracked per device and added together, so streaks and XP include both devices.
- **Self-healing:** heartbeats detect dropped connections and reconnect automatically, and reloading either page resumes the session. If a network blocks the connection, you get a clear explanation instead of endless retries. The screen stays awake while a session is open.
- **More than two devices:** on the host, tap **Add another device** to connect a tablet as well.
- **Local network only** (toggle): never use an internet relay; both devices must reach each other directly over the Wi‑Fi.
- **End session** closes the connection on both devices.

**Trouble connecting?** Run **Connection test** on both devices. Use the same Wi‑Fi network (not a guest network) and turn off VPNs. If the devices find each other but can't connect, the router is blocking device-to-device traffic: turn off "AP/client isolation", or add a relay (see below).

### Optional: add a relay (TURN) for strict Wi‑Fi

Most home Wi‑Fi connects devices directly. Some routers block device-to-device traffic ("AP / client isolation", guest networks, some mesh systems). There the devices find each other but can't connect, and the app says so. A relay fixes it. Traffic stays end-to-end encrypted.

**Option A: in the app (no redeploy).** Manage → Sync → **Advanced connection**: paste a TURN address, username and password on both devices.

**Option B: server-side (keeps the credentials secret).** Add ONE of these in Vercel → **Settings → Environment Variables**, then redeploy. The app loads them from `/api/turn`.

| Provider | Variables |
| --- | --- |
| Cloudflare Realtime TURN (free tier) | `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` |
| Metered Open Relay (free 20 GB/month) | `METERED_TURN_APP` (e.g. `myapp`), `METERED_TURN_API_KEY` |
| Any TURN server (e.g. coturn) | `TURN_URLS` (comma separated), `TURN_USERNAME`, `TURN_CREDENTIAL` |

Use **Manage → Sync → Connection test** on both devices to see which step is blocked: pairing service, local network, internet path or relay.

### Optional: self-hosted PeerServer

VocaBera uses the free public PeerJS cloud to introduce devices. To use your own [PeerServer](https://github.com/peers/peerjs-server), set `NEXT_PUBLIC_PEER_HOST`, `NEXT_PUBLIC_PEER_PORT` (443), `NEXT_PUBLIC_PEER_PATH` (/), `NEXT_PUBLIC_PEER_KEY` (peerjs) and `NEXT_PUBLIC_PEER_SECURE` (true), then redeploy.

## Pronunciation (text-to-speech)

Manage → Settings → **Voice & pronunciation** offers three engines:

- **Natural** (default): **real native-speaker recordings** from Wiktionary / Wikimedia Commons for single words (US or UK accent, MP3 for iPhone), plus the clearest voice on your device for sentences. Neural/online voices are picked automatically, and you can choose a specific one.
- **AI Studio**: an on-device neural voice ([Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), Apache-2.0) that runs in a background worker. It's a one-time ~92 MB download, then works offline. The model comes from Hugging Face, with an automatic mirror fallback.
- **Device**: built-in voices only.

It also has speed, pitch and accent controls, 8 AI voices (US/UK, male/female), a test button for each, and a stop button (tap a speaker icon again). Recordings are fetched and cached ahead of time, so repeat plays are instant. If one engine isn't available, the next one speaks.

The AI voice worker is prebuilt into `public/tts-worker.js` from `scripts/tts-worker.ts`. After editing the script, rebuild it with:

```bash
npx esbuild scripts/tts-worker.ts --bundle --format=esm --platform=browser --minify --outfile=public/tts-worker.js
```

## Updates & troubleshooting

- New deployments install themselves: the app switches to the new version automatically and cleans up the old files. Pages are always loaded fresh while online, so an outdated copy can never freeze the app.
- If a screen ever breaks, VocaBera shows **Try again / Reload / Repair app**. **Repair app** (also in Manage → Settings) removes the offline cache and service worker and reloads. **Your words and progress are kept** (they live in the browser's IndexedDB).
- "VocaBera is open in another tab" means an older tab is holding the database. Close it to finish the update.

## Install as a PWA (Mobile & Desktop)

- **Android** (Chrome, Edge, Samsung Internet): tap **Install** on the banner, or menu **⋮ → Install app**.
- **iPhone / iPad** (Safari): tap **Share → Add to Home Screen**.
- **Windows / Mac** (Chrome, Edge): click the install icon in the address bar.

The app works offline. Quizzes, flashcards, match game, and word browsing all run locally in your browser.

## Run locally

```bash
npm install
npm run dev # http://localhost:3000
```
