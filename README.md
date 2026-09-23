# VocaBera — Smart Vocabulary Builder

A mobile-first, installable (PWA) vocabulary app for English learners with Bangla meanings.

- **Words** — add words with Bangla meaning, definition, synonyms, antonyms, example, prefix / root / suffix, mnemonic
- **AI Auto-fill** — Wiktionary, Datamuse, Tatoeba and MyMemory research, refined by AI
- **Smart quiz** (11 adaptive question types), **Match pairs**, **3D flashcards** with spaced repetition
- **Progress** — charts, study calendar, forecasts and 20 achievements; daily recap popup
- **Excel / CSV / JSON import & export**, **live sync** between two devices over Wi‑Fi (WebRTC)
- **Works offline** — installable app; study progress made offline syncs automatically

**Tech:** Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · PostgreSQL + Drizzle ORM

---

## Deploy to Vercel (upload files to GitHub manually)

You need a free **GitHub** account and a free **Vercel** account (sign up with GitHub). The database is free too (Neon, created inside Vercel in step 4).

### 1. Get the files

Download **`vocabera-source.zip`** and extract it. Inside you'll see the folders `src` and `public` and files such as `package.json`.

Never upload `node_modules`, `.next` or `.env` — they aren't in the zip.

### 2. Upload to GitHub

1. Go to **github.com → + (top right) → New repository**, name it `vocabera`, choose Public or Private, and click **Create repository**.
2. On the new, empty repository page click **“uploading an existing file”**.
3. Open the extracted folder, select **everything inside it** (Ctrl + A / ⌘ + A) and **drag it into the browser**. Folders keep their structure. Use **Chrome or Edge** (Safari can't drag folders).
4. Wait until all files are listed (93 files — GitHub allows 100 per upload), then click **Commit changes**.

✅ Check: the repository root must show `package.json`, `src` and `public` directly — not one folder that contains them. (Hidden files like `.gitignore` are optional.)

### 3. Import the repository into Vercel

1. Go to **vercel.com → Add New… → Project** and **Import** the `vocabera` repository. If it isn't listed, click **Adjust GitHub App Permissions** and allow access.
2. Framework Preset: **Next.js** (detected automatically). Leave Root Directory as `./` and all build settings as default.
3. Click **Deploy**. The build succeeds even before the database exists — the site will say the database isn't configured until step 4.

### 4. Add a free Postgres database (Neon)

1. In your Vercel project open the **Storage** tab → **Create Database** → **Neon (Serverless Postgres)**.
2. Choose the region closest to your users (for Bangladesh: **Singapore**) and the **Free** plan, then connect it to the project for all environments. Vercel adds `DATABASE_URL` automatically.
3. Open **Deployments → ⋯ (latest deployment) → Redeploy**.

Tables are created automatically on the first visit — there is no migration step.

**Tip:** under **Settings → Functions → Function Region**, pick the same region as the database (e.g. Singapore `sin1`) for faster loading.

**Using Supabase, Railway or another Postgres?** Add `DATABASE_URL` yourself in **Settings → Environment Variables** (use the *pooled* connection string), then redeploy.

### 5. Check that it works

Open `https://<your-app>.vercel.app/api/health` — you should see `{"ok":true}`. Then open the site and load the sample words or add your own.

### Optional: more reliable AI Auto-fill

AI Auto-fill works without any key (free dictionaries + Pollinations AI, which can be slow when busy). For faster, more reliable results, add these in **Settings → Environment Variables**, then redeploy:

| Variable | Groq (free tier) | Google Gemini (free tier) | OpenAI |
| --- | --- | --- | --- |
| `AI_API_KEY` | your Groq key | your Gemini key | your OpenAI key |
| `AI_BASE_URL` | `https://api.groq.com/openai/v1` | `https://generativelanguage.googleapis.com/v1beta/openai` | `https://api.openai.com/v1` |
| `AI_MODEL` | `llama-3.3-70b-versatile` | `gemini-2.5-flash` | `gpt-4o-mini` |

### Updating the app later

Upload the changed files to the same GitHub repository (**Add file → Upload files**; files with the same path are replaced) and commit. Vercel redeploys automatically, and installed apps show **“A new version is ready → Update”**.

---

## Install as an app (PWA)

- **Android** (Chrome, Edge, Samsung Internet): tap **Install** on the Home screen banner, or menu **⋮ → Install app**.
- **iPhone / iPad** (Safari): **Share → Add to Home Screen**.
- **Windows / Mac** (Chrome, Edge): click the install icon in the address bar.

After the first visit the app opens offline. Quizzes, flashcards and match games work offline and their progress syncs when you reconnect. Adding or editing words, AI Auto-fill and live sync need a connection.

## Environment variables

| Name | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string (added automatically by the Vercel + Neon integration) |
| `AI_API_KEY` | No | Key for any OpenAI-compatible API |
| `AI_BASE_URL` | No | API base URL (default `https://api.openai.com/v1`) |
| `AI_MODEL` | No | Model name (default `gpt-4o-mini`) |

## Run locally

```bash
npm install
cp .env.example .env   # then put your own DATABASE_URL in .env
npm run dev            # http://localhost:3000
```

## Troubleshooting

- **`/api/health` says “DATABASE_URL is not set”** — add the variable (step 4) and redeploy; environment changes only apply to new deployments.
- **“Database unreachable”** — check the connection string (hosted databases need `?sslmode=require`). A free Neon database may take a second to wake up, so refresh once.
- **The repository shows a single folder containing the files** — either re-upload the folder *contents*, or set that folder as **Root Directory** in Vercel → Settings → General.
- **Build error about missing packages** — make sure `package.json` and `package-lock.json` were uploaded.
- **Still seeing the old version** — accept the “Update” prompt, or close and reopen the installed app.

Vercel's free Hobby plan is meant for personal, non-commercial projects.
