# Developer Community Pulse

A Friday-morning brief for Sumit, the PM at a 15-person code review automation startup. It replaces 90 minutes of manual searching with a ranked view of what developers are complaining about in his problem space, whether each complaint is growing or shrinking compared with last week, and which problems nobody has solved yet.

**Live app:** https://dev-community-pulse-gamma.vercel.app

**Components Map:** [COMPONENTS.md](COMPONENTS.md) (who does what, step by step, plus the Friday API call flow)

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

Next.js 14 (App Router) on Vercel · Neon Postgres (`@neondatabase/serverless`) · Gemini Flash REST API · Resend email · Tailwind CSS · Vercel Cron.

### Why Neon instead of Supabase

The brief asked for topics and keywords to be stored in Supabase. We store them in **Neon**, a deliberate swap made at the start of the build:

- **Same thing underneath.** Supabase's database *is* managed Postgres. Neon is managed Postgres too. The tables (`topic_categories`, `keywords`, `pain_point_taxonomy`, `sources`) and every query are plain SQL and would run unchanged on Supabase: only the connection string in `lib/server.js → db()` changes.
- **Supabase's free plan pauses projects after 7 days without activity.** Pulse is used once a week, so a paused database would mean the Friday brief could fail exactly when Sumit opens it. Neon's free plan scales to zero and wakes on the first query in under a second, with no manual unpause.
- **What the requirement is for is still met:** the watchlist is stored in a database, not in code, and is edited from the app (Topics & keywords page) without a redeploy.
- **Moving to Supabase later** takes about 10 minutes: create a project, run `db/schema.sql` in its SQL editor, set `DATABASE_URL` to its Postgres connection string.

## Setup

1. Create a Neon project and run `db/schema.sql` in its SQL editor (creates tables and seeds the watchlist). The app creates `runs`, `shortlist` and `votes` itself on first use.
2. Import this repo into Vercel and add environment variables:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Neon connection string |
| `GEMINI_API_KEY` | yes | Gemini key: an OpenRouter key (`sk-or-…`) or a Google AI Studio key (`AIza…`). The app detects which |
| `OPENROUTER_API_KEY` | no | use instead of `GEMINI_API_KEY` for an OpenRouter key. Calls use Google models only, served only by Google |
| `GEMINI_MODEL` / `OPENROUTER_MODEL` | no | pin a model; otherwise the newest Gemini Flash in the model list is used |
| `GITHUB_TOKEN` | no | raises GitHub search rate limits |
| `STACKEXCHANGE_KEY` | no | raises Stack Exchange quota |
| `CRON_SECRET` | recommended | only Vercel Cron can start the Friday job; Vercel sends it automatically |
| `RESEND_API_KEY` | no | enables email: the Friday brief and health alerts |
| `BRIEF_EMAIL` | no | who gets the Friday brief (comma-separated). Falls back to `ALERT_EMAIL` |
| `ALERT_EMAIL` | no | who gets health-check alerts |
| `BRIEF_FROM` | no | sender, e.g. `Pulse <brief@yourdomain.com>`. Default `onboarding@resend.dev` only delivers to your own Resend account email |

3. Open the app and click **Run the first brief**. The first run backfills about eight weeks so week-over-week comparisons work immediately.

## Schedule (vercel.json)

- Friday 06:00 IST: fetch and label (`/api/cron`), followed by two labelling passes.
- Daily 08:00 IST: health check of the database and Gemini (`/api/health?deep=1&alert=1`).

## API

All routes live in `app/api/[action]/route.js`.

- Read (public): `GET brief`, `GET watchlist`, `GET shortlist`, `GET health`, `GET delivery`, `GET auth`
- Change (open to everyone in this trial version): `POST run`, `POST classify`, `POST summarize`, `POST watchlist`, `POST shortlist`, `POST draft`, `POST email`
- Schedule (`CRON_SECRET` when set): `GET cron`, `GET cron?phase=classify`

## Proof that the Friday job works

The System page shows the last scheduled run and the last *scheduled* email separately from emails sent by hand. Every send is logged in the `deliveries` table with `channel = 'email'` (scheduled) or `'manual'` (button).

## Known limits

- Reddit blocks anonymous requests from cloud servers, so it is read through Reddit's official API (`REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`). Reddit now approves API access by request; until approved the brief shows Reddit as "not connected" and leaves it out of every week. Discord and X have no free, permitted read access and are shown as not connected.
- Free Gemini tiers are rate limited. Large first runs label in rounds; the header offers **Finish labelling** if any threads are left.
