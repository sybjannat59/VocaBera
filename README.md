# VocaBera — Smart Vocabulary Builder

A mobile-first, installable (PWA) vocabulary app for English learners with Bangla meanings.

- **Local/Browser Database** — 100% browser-based database (IndexedDB); works offline without requiring any server database setup!
- **Words** — add words with Bangla meaning, definition, synonyms, antonyms, example sentence, prefix, root, suffix, mnemonic
- **AI Auto-fill** — Wiktionary, Datamuse, Tatoeba and MyMemory research, refined by AI
- **Smart quiz** (11 adaptive question types), **Match pairs**, **3D flashcards** with spaced repetition
- **Progress** — charts, study calendar heatmap, forecasts and 20 achievements; daily recap popup
- **Excel (.xlsx) / CSV / JSON import & export**, **live sync** between two devices over Wi‑Fi (WebRTC)
- **Works offline** — installable PWA; all words and study progress stay safe in your browser

**Tech:** Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Browser IndexedDB · Drizzle ORM

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
