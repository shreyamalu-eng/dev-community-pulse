# Developer Community Pulse

A Friday-morning brief for Sumit, the PM at a 15-person code review automation startup. It replaces 90 minutes of manual searching with a ranked view of what developers are complaining about in his problem space, whether each complaint is growing or shrinking compared with last week, and which problems nobody has solved yet.

**Live app:** _add your Vercel URL here_

## What it does

1. **Fetches** new threads from Hacker News, Stack Overflow, GitHub Issues and Reddit for every term on the watchlist.
2. **Labels** each thread with Gemini Flash: real pain or debugging noise, which pain point, solved or not, plus a short quote.
3. **Counts** unique threads per pain point per week in Neon Postgres (Friday 00:00 IST to Thursday 23:59 IST).
4. **Compares** this week with last week and with the four-week normal, and flags unusual spikes (deterministic maths, never the AI).
5. **Ranks** the three things to act on, lets the team vote, lets Sumit make the call, and drafts a Monday sprint pack.

## Design decisions

- **The AI labels, the database counts.** Gemini never produces a number that appears in a trend, so every count is reproducible and links to its source threads.
- **The watchlist is data, not code.** Topics, terms to track and terms to exclude live in Neon (`keywords`, `topic_categories`, `pain_point_taxonomy`) and are editable in the app. Spelling mistakes ("flakey test") and ambiguous terms ("pipeline") are caught before saving.
- **Failures are visible, not silent.** If a source fails, it is left out of every week so trends still compare like for like, and the header says so. If Gemini fails, keyword rules label the threads and the brief says how many.
- **Humans decide.** Nothing is posted, sent or ticketed automatically. Sumit makes the sprint call; drafts are labelled as AI drafts.

## Stack

Next.js 14 (App Router) on Vercel · Neon Postgres (`@neondatabase/serverless`) · Gemini Flash REST API · Tailwind CSS · Vercel Cron.

## Setup

1. Create a Neon project and run `db/schema.sql` in its SQL editor (creates tables and seeds the watchlist). The app creates `runs`, `shortlist` and `votes` itself on first use.
2. Import this repo into Vercel and add environment variables:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Neon connection string |
| `GEMINI_API_KEY` | yes | Gemini API key from Google AI Studio |
| `GEMINI_MODEL` | no | defaults to `gemini-2.5-flash` |
| `GITHUB_TOKEN` | no | raises GitHub search rate limits |
| `STACKEXCHANGE_KEY` | no | raises Stack Exchange quota |
| `CRON_SECRET` | no | protects the cron endpoints |
| `RESEND_API_KEY` | no | enables email: the Friday brief and health alerts |
| `BRIEF_EMAIL` | no | who gets the Friday brief (comma-separated). Falls back to `ALERT_EMAIL` |
| `ALERT_EMAIL` | no | who gets health-check alerts |
| `BRIEF_FROM` | no | sender, e.g. `Pulse <brief@yourdomain.com>`. Default `onboarding@resend.dev` only delivers to your own Resend account email |

3. Open the app and click **Run the first brief**. The first run backfills about eight weeks so week-over-week comparisons work immediately.

## Schedule (vercel.json)

- Friday 06:00 IST: fetch and label (`/api/cron`), followed by two labelling passes.
- Daily 08:00 IST: health check of the database and Gemini (`/api/health?deep=1&alert=1`).

## API

All routes live in `app/api/[action]/route.js`: `GET brief`, `GET|POST watchlist`, `GET|POST shortlist`, `POST run`, `POST classify`, `POST draft`, `GET health`, `GET cron`.

## Known limits

- Reddit often blocks unauthenticated server requests. When it does, the brief shows Reddit as unavailable and compares the other sources like for like.
- Free Gemini tiers are rate limited. Large first runs label in rounds; the header offers **Finish labelling** if any threads are left.
