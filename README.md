# VocaBera

A mobile-first, installable (PWA) vocabulary builder for English with **Bangla meanings**. Built with Next.js 16 (App Router), React 19, Tailwind CSS 4, Drizzle ORM and PostgreSQL.

## Features

- **Words:** add, edit, search and filter, with Bangla + English meanings, synonyms, antonyms, examples, prefix/root/suffix, mnemonic, tags and difficulty
- **AI Auto-fill:** Wiktionary, Datamuse, Tatoeba, MyMemory NMT and Free Dictionary evidence, refined by AI and validated before it reaches the form
- **Smart adaptive quiz:** 11 question types, plus a timed Match Pairs game
- **Flashcards:** 3D flip and swipe cards with spaced repetition
- **Progress:** heatmap, charts, review forecast and 20 achievements, plus a daily recap popup
- **Data:** Excel / CSV / JSON import and export, and live device-to-device sync (WebRTC)
- **PWA:** installable with SVG icons, works offline, prompts for updates

## Deploy

See **[DEPLOY.md](./DEPLOY.md)** for the step-by-step guide (GitHub web upload → Vercel → Neon Postgres).

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (tables are created automatically) |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | optional | Your own OpenAI-compatible model for AI Auto-fill |

## Local development

```bash
npm install
cp .env.example .env   # then set DATABASE_URL
npm run dev
```
