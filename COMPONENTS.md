# Components Map: Developer Community Pulse

Each row is a person or a system; each column is a moment, from what starts it to what comes out. Numbers in brackets are the order things happen on a Friday morning. Layer tags: **FE** screens, **BE** server logic, **DB** database, **API** outside service, **VC** version control.

| Who / what | 1 · Trigger | 2 · Input | 3 · Context | 4 · Processing | 5 · Output |
|---|---|---|---|---|---|
| **Sumit** (PM, final call) | Opens the brief or the Friday email (FE) | Picks a week, filters by topic or platform (FE) | Opens the real threads behind any number (FE) | | (10) Puts problems in the sprint or parks them; opens the Monday pack (FE) |
| **Team** (Neha, Kabir) | Reads the brief link (FE) | (9) Votes 👍 / 👎 (FE) | | | Sees the vote tally (FE) |
| **Builder** | Spots a new topic (FE) | Adds or blocks a keyword; spelling and two-meaning checks (FE) | | | New keyword back-filled across 8 weeks (FE) |
| **Vercel Cron** | (1) Fri 06:00 IST start; 06:30 and 07:00 finish labelling; daily 08:00 health check (BE) | | | | Alert email if the database or Gemini is down (BE) |
| **Pulse app** (Next.js on Vercel) | | (2) Loads tracked and blocked keywords (BE) | Checks the last run so it only fetches new threads (BE) | (4) Keeps keyword matches, removes duplicates; (7) counts per week, compares with last week and the 4-week normal (BE) | (8) Brief, Trends, Topics & keywords, System pages; AI-labelled draft brief (FE) |
| **Platforms** | | (3) Hacker News, Stack Overflow, GitHub return new threads (API). Reddit via official API once approved; Discord and X not connected | | | |
| **Gemini Flash** | | | | (5) Labels each thread: complaint or how-to, which of 10 problems, solved or not (12 per call); (6) writes "Developers say / Missing today / Try next" (API) | |
| **Neon Postgres** | | | Keywords, topics, the 10 problems, run history (DB) | Stores threads, labels, summaries, votes, deliveries (DB) | Exact counts, each linked to its threads (DB) |
| **Resend** | | | | | (8) Emails the Friday brief once per week (API) |
| **GitHub** | New code pushed (VC) | | | Vercel builds automatically (VC) | Live site updates (VC) |

## Friday API call flow

1. Vercel Cron → `GET /api/cron` (with `CRON_SECRET`)
2. Load keywords → Neon
3. Fetch new threads → Hacker News Algolia, Stack Exchange, GitHub Search (Reddit when connected)
4. Keep keyword matches, drop duplicates (**no API call**)
5. Label threads in batches of 12 → Gemini Flash (the job re-calls itself until everything is labelled)
6. Summarise the top problems → Gemini Flash
7. Count per week and flag unusual changes (**no API call, maths only**)
8. Email the brief → Resend; log it in `deliveries`
9. Team votes → Neon
10. Sumit decides (**human only**)

## Three rules

1. **AI labels, the database counts.** No number on screen comes from AI.
2. **A platform that fails is left out of every week**, so comparisons stay fair.
3. **Humans decide.** Nothing is posted, sent or added to the sprint without a person.

A picture version is in `pulse-components-map.png`.
