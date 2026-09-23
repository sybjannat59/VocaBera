# Deploy VocaBera to Vercel (GitHub · manual file upload)

No Git or terminal needed. Everything happens in the browser, in about 10 minutes.

---

## 0. Before you start: back up your current words (optional)

The deployed site starts with an **empty database**. To bring your existing words along:

1. Open the current app → **Manage** (top-right icon) → **Data** → **Export app data**.
2. Keep the downloaded `vocabera-app-data-YYYY-MM-DD.json`. You'll import it in step 5.

---

## 1. Prepare the files to upload

Upload **only these** from the project folder:

```
src/                    ← whole folder (keeps sub-folders)
public/                 ← whole folder
package.json
package-lock.json
next.config.ts
tsconfig.json
postcss.config.mjs
eslint.config.mjs
drizzle.config.json
.gitignore              (optional, hidden file)
.env.example            (optional, hidden file)
README.md
DEPLOY.md
```

**Never upload** these:

| Don't upload | Why |
|---|---|
| `node_modules/` | Huge; Vercel installs it automatically |
| `.next/` | Build output; Vercel rebuilds it |
| `.env` | Contains your local database password |

About 80 files in total, which is under GitHub's 100-files-per-upload limit.

> **Tip (macOS):** press `Cmd + Shift + .` in Finder to show hidden files like `.gitignore`. They're optional anyway.

---

## 2. Create the GitHub repository and upload

1. Go to **https://github.com/new**
2. Name it `vocabera`, choose **Private** (or Public), leave every "Initialize" box **unchecked**, then click **Create repository**.
3. On the empty repo page, click the link **"uploading an existing file"**.
4. **Drag the files and the `src` and `public` folders** from step 1 into the page.
   Use **Chrome or Edge**; they keep the folder structure when you drag folders.
5. Wait until every file is listed, then click **Commit changes**.
6. Check that the repo shows `src/`, `public/` and `package.json` at the **top level**, not inside an extra folder.

> Updating later: open the repo → **Add file → Upload files** → drag the changed files/folders again (same paths overwrite the old ones) → **Commit**. Vercel redeploys automatically.

---

## 3. Import the repo into Vercel

1. Go to **https://vercel.com/new** and sign in with GitHub.
2. Find your `vocabera` repository and click **Import**. If it's missing, click **"Adjust GitHub App Permissions"** and grant access to the repo.
3. Framework Preset: **Next.js** (auto-detected). Leave Build Command, Output Directory and Install Command at their defaults.
4. Click **Deploy**.
   The first build succeeds even without a database. The app will show a "Couldn't reach the server" message until you finish step 4.

---

## 4. Add a free PostgreSQL database (Neon)

1. In your Vercel project, open the **Storage** tab → **Create Database** → **Neon (Serverless Postgres)** → **Continue**.
2. Pick the free plan and the region closest to you (e.g. *Singapore* for Bangladesh), then click **Create**.
3. When asked, **connect it to your project** for *Production*, *Preview* and *Development*.
   This adds `DATABASE_URL` to **Settings → Environment Variables** automatically.
4. Go to **Deployments** → open the ⋯ menu on the latest deployment → **Redeploy**.

VocaBera creates its tables automatically on the first request, so no migration step is needed.

**Check it:** open `https://YOUR-APP.vercel.app/api/health`. It should show `{"ok":true}`.

> **Using Supabase or another host instead?** Add an environment variable `DATABASE_URL` with the **pooled / transaction** connection string (Supabase: port `6543`), then redeploy.

---

## 5. Restore your words (if you exported them in step 0)

On the deployed site: **Manage → Data → Import app data** → choose the JSON file → **Merge** → **Import**.

---

## 6. Install it as an app (PWA)

| Device | How |
|---|---|
| Android (Chrome / Samsung Internet) | Menu ⋮ → **Install app**, or **Manage → Settings → Install app** |
| Windows / macOS (Chrome / Edge) | Install icon in the address bar, or **Manage → Settings → Install app** |
| iPhone / iPad | Open in **Safari** → **Share** → **Add to Home Screen** |

The installed app opens full-screen, works offline with your saved words, and shows **"A new version is ready → Update"** after each redeploy.

PWA install needs **HTTPS**, which every `*.vercel.app` URL already has.

---

## 7. Optional: faster AI Auto-fill

AI Auto-fill works out of the box with the free Pollinations AI. For faster, more reliable results, add these in **Vercel → Settings → Environment Variables**, then redeploy:

| Name | Example |
|---|---|
| `AI_API_KEY` | your key (OpenAI, Groq, OpenRouter…) |
| `AI_BASE_URL` | `https://api.openai.com/v1` · `https://api.groq.com/openai/v1` · `https://openrouter.ai/api/v1` |
| `AI_MODEL` | `gpt-4o-mini` · `llama-3.3-70b-versatile` · `openai/gpt-4o-mini` |

Never put API keys in files you upload to GitHub. Use Vercel's Environment Variables only.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Build fails: `Couldn't find any pages or app directory` | `src/` isn't at the repo root. Re-upload so `src/` sits next to `package.json`. |
| `/api/health` shows `{"ok":false}` | `DATABASE_URL` is missing or wrong. Check Settings → Environment Variables, then **Redeploy**. |
| Changes don't appear | Hard-refresh, or tap **Update** on the "new version" toast. Vercel redeploys after every GitHub commit. |
| No install button | Open the site in Chrome/Edge (or Safari on iOS) over HTTPS; the button appears once the browser allows installation. |
| AI Auto-fill says "AI busy" | The free AI is rate-limited. Try again shortly, or add your own `AI_API_KEY` (step 7). |
