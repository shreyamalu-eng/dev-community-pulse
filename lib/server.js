import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';
import { META, metaFor, SOURCES, SOURCE_NAMES, stats, trendWords } from './painpoints';

export const PROMPT_VER = 'v1';
let MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
let modelPromise = null;

/* Gemini is reached one of two ways:
   - OpenRouter (key starts with sk-or-, in OPENROUTER_API_KEY or GEMINI_API_KEY): only Google models, served only by Google
   - Google AI Studio directly (an AIza… key in GEMINI_API_KEY) */
const clean = (v) => String(v || '').trim().replace(/^['"]|['"]$/g, '').trim();
export function aiKey() {
  const or = clean(process.env.OPENROUTER_API_KEY);
  const g = clean(process.env.GEMINI_API_KEY);
  if (or) return { via: 'openrouter', key: or };
  if (g.startsWith('sk-or-')) return { via: 'openrouter', key: g };
  if (g) return { via: 'google', key: g };
  return null;
}
const OR_BASE = 'https://openrouter.ai/api/v1';
const OR_PROVIDER = { only: ['google-vertex', 'google-ai-studio'], allow_fallbacks: false };
let OR_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-3.7-flash';
let orModelPromise = null;
// Check the model list first and use the newest Google Flash model that exists, so a retired ID never breaks the app.
function resolveORModel() {
  if (process.env.OPENROUTER_MODEL) return Promise.resolve(OR_MODEL);
  if (!orModelPromise) orModelPromise = (async () => {
    const r = await fetch(`${OR_BASE}/models`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`model list ${r.status}`);
    const ids = ((await r.json()).data || []).map((m) => m.id);
    const flash = ids.filter((n) => /^google\/gemini-[\d.]+-flash$/.test(n)).sort((a, b) => parseFloat(b.split('-')[1]) - parseFloat(a.split('-')[1]));
    if (flash.length) OR_MODEL = flash[0];
    return OR_MODEL;
  })().catch(() => { orModelPromise = null; return OR_MODEL; });
  return orModelPromise;
}
// Google's schema style (OBJECT, STRING…) → standard JSON Schema (object, string…)
function toJsonSchema(s) {
  if (Array.isArray(s)) return s.map(toJsonSchema);
  if (!s || typeof s !== 'object') return s;
  const o = {};
  for (const [k, v] of Object.entries(s)) o[k] = k === 'type' && typeof v === 'string' ? v.toLowerCase() : k === 'enum' ? v : toJsonSchema(v);
  return o;
}
export function aiModel() { const a = aiKey(); return a?.via === 'openrouter' ? OR_MODEL : MODEL; }
async function openrouterJSON(key, prompt, schema, signal) {
  const model = await resolveORModel();
  // wrap in an object: structured output is most reliable with an object at the top
  const wrapped = schema ? { type: 'object', properties: { result: toJsonSchema(schema) }, required: ['result'] } : null;
  const r = await fetch(`${OR_BASE}/chat/completions`, {
    method: 'POST', signal,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://dev-community-pulse-gamma.vercel.app', 'X-Title': 'Developer Community Pulse' },
    body: JSON.stringify({
      model, temperature: 0, provider: OR_PROVIDER,
      messages: [{ role: 'user', content: prompt }],
      ...(wrapped ? { response_format: { type: 'json_schema', json_schema: { name: 'result', strict: false, schema: wrapped } } } : {}),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Gemini via OpenRouter ${j.error?.code || r.status}: ${j.error?.message || r.statusText}`);
  const text = j.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Gemini returned an empty response');
  if (!schema) return text;
  const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  return parsed && typeof parsed === 'object' && 'result' in parsed ? parsed.result : parsed;
}
// Pick the newest Flash model this key can use, so a retired model name never breaks the app.
// One shared promise, so parallel calls all wait for the same lookup.
function resolveModel(key) {
  if (process.env.GEMINI_MODEL) return Promise.resolve(MODEL);
  if (!modelPromise) modelPromise = (async () => {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, cache: 'no-store' });
    if (!r.ok) throw new Error(`model list ${r.status}`);
    const j = await r.json();
    const names = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace('models/', ''));
    const flash = names.filter((n) => /^gemini-[\d.]+-flash$/.test(n)).sort((a, b) => parseFloat(b.split('-')[1]) - parseFloat(a.split('-')[1]));
    const fallback = names.find((n) => /flash/.test(n) && !/(lite|image|tts|live|audio|preview)/.test(n));
    if (flash.length) MODEL = flash[0]; else if (fallback) MODEL = fallback;
    return MODEL;
  })().catch(() => { modelPromise = null; return MODEL; });
  return modelPromise;
}

/* ───────────── database ───────────── */
let _sql = null;
export function db() {
  if (globalThis.__pulseSql) return globalThis.__pulseSql; // test hook
  // Accept the names Vercel/Neon integrations use, not just DATABASE_URL
  const url = process.env.DATABASE_URL || process.env.Neon || process.env.NEON || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Database connection string is not set in Vercel environment variables');
  if (!_sql) _sql = neon(url);
  return _sql;
}

let schemaReady = false;
export async function ensureSchema() {
  if (schemaReady) return;
  const sql = db();
  const stmts = [
    `CREATE TABLE IF NOT EXISTS runs (id serial PRIMARY KEY, kind text NOT NULL DEFAULT 'manual', started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, status text NOT NULL DEFAULT 'running', since timestamptz, stats jsonb DEFAULT '{}')`,
    `CREATE TABLE IF NOT EXISTS shortlist (week_start date NOT NULL, pain_point_id text NOT NULL, decision text, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (week_start, pain_point_id))`,
    `CREATE TABLE IF NOT EXISTS votes (week_start date NOT NULL, pain_point_id text NOT NULL, voter text NOT NULL, vote text NOT NULL CHECK (vote IN ('up','down')), PRIMARY KEY (week_start, pain_point_id, voter))`,
    `CREATE TABLE IF NOT EXISTS insights (week_start date NOT NULL, pain_point_id text NOT NULL, summary text, gap text, next_step text, threads_used int, model text, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (week_start, pain_point_id))`,
    `CREATE TABLE IF NOT EXISTS deliveries (id serial PRIMARY KEY, week_start date NOT NULL, channel text NOT NULL DEFAULT 'email', recipients text, status text NOT NULL, detail text, sent_at timestamptz NOT NULL DEFAULT now())`,
    // AI summaries for monthly and custom-range views (weekly ones stay in insights)
    `CREATE TABLE IF NOT EXISTS period_insights (period_key text NOT NULL, pain_point_id text NOT NULL, summary text, gap text, next_step text, threads_used int, model text, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (period_key, pain_point_id))`,
    // one row per slice of older history (before the regular 8-week window); sources that failed are retried
    `CREATE TABLE IF NOT EXISTS history_fill (slice_start date PRIMARY KEY, slice_end date NOT NULL, status text NOT NULL, sources jsonb NOT NULL DEFAULT '{}', inserted int NOT NULL DEFAULT 0, done_at timestamptz NOT NULL DEFAULT now())`,
    // emails sent before the channel column existed (all by hand, 12 Oct before 13:00 UTC) are labelled manual;
    // the first scheduled-job email (cron endpoint, 12 Oct 13:43 UTC) is labelled as scheduled
    `UPDATE deliveries SET channel = 'manual' WHERE channel = 'email' AND sent_at < '2026-10-12 13:00:00+00'`,
    `UPDATE deliveries SET channel = 'email' WHERE channel = 'manual' AND sent_at >= '2026-10-12 13:43:00+00' AND sent_at < '2026-10-12 13:44:00+00'`,
  ];
  for (const s of stmts) await sql.query(s);
  schemaReady = true;
}

/* ───────────── weeks (Friday 00:00 IST → Thursday 23:59 IST) ───────────── */
export function weekStartOf(date) {
  const ist = new Date(date.getTime() + 5.5 * 3600e3);
  const diff = (ist.getUTCDay() - 5 + 7) % 7;
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - diff)).toISOString().slice(0, 10);
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const latestCompleteWeek = (now = new Date()) => addDays(weekStartOf(now), -7);
export function weekStartToDate(iso) {
  // Friday 00:00 IST in UTC
  return new Date(new Date(iso + 'T00:00:00Z').getTime() - 5.5 * 3600e3);
}

/* ───────────── periods: weekly, monthly or a custom range (all in IST days) ───────────── */
export const HISTORY_WEEKS = 30; // about seven months, so six full months can be compared
const IST_MS = 5.5 * 3600e3;
export const istDay = (ts = new Date()) => new Date(new Date(ts).getTime() + IST_MS).toISOString().slice(0, 10);
const dayToDate = (iso) => new Date(new Date(iso + 'T00:00:00Z').getTime() - IST_MS); // IST midnight
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dlabel = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const monthStart = (ym) => `${ym}-01`;
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
export const historyStart = (now = new Date()) => addDays(latestCompleteWeek(now), -7 * (HISTORY_WEEKS - 1));
export const lastCompleteMonth = (now = new Date()) => addMonths(istDay(now).slice(0, 7), -1);

// Turns a request into a list of equal buckets; the last bucket is the one being viewed,
// the earlier ones are what it is compared with.
export function resolvePeriod(q = {}, now = new Date()) {
  if (typeof q === 'string' || q == null) q = { grain: 'week', week: q || undefined };
  const latest = latestCompleteWeek(now);
  const hStart = historyStart(now);
  const grain = ['week', 'month', 'custom'].includes(q.grain) ? q.grain : 'week';
  const isDay = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || '');
  if (grain === 'month') {
    const lastM = lastCompleteMonth(now);
    let m = /^\d{4}-\d{2}$/.test(q.month || '') ? q.month : lastM;
    if (m > lastM) m = lastM;
    if (monthStart(m) < hStart.slice(0, 7) + '-01') m = hStart.slice(0, 7);
    const buckets = Array.from({ length: 6 }, (_, i) => addMonths(m, i - 5)).map((x) => ({ key: x, from: monthStart(x), to: monthStart(addMonths(x, 1)), label: `${MONTHS[+x.slice(5) - 1]} ${x.slice(2, 4)}` }));
    const cur = buckets[5];
    return { grain, key: `m:${m}`, unit: 'month', label: `${MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)}`, from: cur.from, to: addDays(cur.to, -1), buckets };
  }
  if (grain === 'custom' && isDay(q.from) && isDay(q.to)) {
    const today = istDay(now);
    let a = q.from < q.to ? q.from : q.to, b = q.from < q.to ? q.to : q.from;
    if (b > today) b = today;
    if (a < hStart) a = hStart;
    if (a > b) a = b;
    const len = daysBetween(a, b) + 1;
    const prior = Math.max(0, Math.min(5, Math.floor(daysBetween(hStart, a) / len)));
    const buckets = Array.from({ length: prior + 1 }, (_, i) => {
      const from = addDays(a, -len * (prior - i));
      return { key: from, from, to: addDays(from, len), label: len === 1 ? dlabel(from) : `${dlabel(from)}–${dlabel(addDays(from, len - 1))}` };
    });
    return { grain, key: `r:${a}_${b}`, unit: 'period', days: len, label: `${dlabel(a)} ${a.slice(0, 4)} – ${dlabel(b)} ${b.slice(0, 4)}`, from: a, to: b, buckets };
  }
  let w = isDay(q.week) ? weekStartOf(new Date(q.week + 'T12:00:00Z')) : latest;
  if (w > latest) w = latest;
  if (w < hStart) w = hStart;
  const buckets = Array.from({ length: 8 }, (_, i) => addDays(w, -7 * (7 - i))).map((x) => ({ key: x, from: x, to: addDays(x, 7), label: dlabel(x) }));
  return { grain: 'week', key: `w:${w}`, week: w, unit: 'week', label: `Fri ${dlabel(w)} – Thu ${dlabel(addDays(w, 6))}`, from: w, to: addDays(w, 6), buckets };
}

/* ───────────── helpers ───────────── */
const UA = 'DevCommunityPulse/1.0 (weekly PM brief; contact via GitHub repo)';
async function getJSON(url, headers = {}, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function pool(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.allSettled(items.slice(i, i + size).map(fn))));
  return out;
}
const strip = (h = '') => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/\s+/g, ' ').trim();
const hash = (s) => crypto.createHash('sha1').update(s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()).digest('hex');
const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

/* ───────────── sources ───────────── */
// Each returns normalised threads: {id, platform, external_id, url, title, body, author, created_at(Date), score, comment_count, accepted}

async function fetchHN(term, from, to) {
  const multi = term.trim().includes(' ');
  const tags = multi ? '(story,comment)' : 'story';
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(`"${term}"`)}&advancedSyntax=true&tags=${tags}&hitsPerPage=60&numericFilters=${encodeURIComponent(`created_at_i>${Math.floor(from / 1000)},created_at_i<=${Math.floor(to / 1000)}`)}`;
  const j = await getJSON(url);
  return (j.hits || []).map((h) => ({
    id: `hn_${h.objectID}`, platform: 'hackernews', external_id: String(h.objectID),
    url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    title: strip(h.title || h.story_title || '(comment)'),
    body: strip(h.comment_text || h.story_text || ''),
    author: h.author || null, created_at: new Date(h.created_at_i * 1000),
    score: h.points || 0, comment_count: h.num_comments || 0, accepted: false,
  }));
}

async function fetchSO(term, from, to) {
  const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=creation&q=${encodeURIComponent(term)}&site=stackoverflow&pagesize=100&fromdate=${Math.floor(from / 1000)}&todate=${Math.floor(to / 1000)}${process.env.STACKEXCHANGE_KEY ? `&key=${process.env.STACKEXCHANGE_KEY}` : ''}`;
  const j = await getJSON(url);
  if (j.error_message) throw new Error(j.error_message);
  return (j.items || []).map((q) => ({
    id: `so_${q.question_id}`, platform: 'stackoverflow', external_id: String(q.question_id),
    url: q.link, title: strip(q.title), body: (q.tags || []).join(' '),
    author: q.owner?.display_name || null, created_at: new Date(q.creation_date * 1000),
    score: q.score || 0, comment_count: q.answer_count || 0, accepted: !!q.accepted_answer_id,
  }));
}

async function fetchGitHub(terms, from, to) {
  const since = new Date(from).toISOString().slice(0, 10);
  const until = to ? new Date(to - 1).toISOString().slice(0, 10) : null;
  const q = `${terms.map((t) => `"${t}"`).join(' OR ')} in:title,body is:issue created:${until ? `${since}..${until}` : `>=${since}`}`;
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const j = await getJSON(`https://api.github.com/search/issues?q=${encodeURIComponent(q)}&sort=created&order=desc&per_page=100`, headers);
  return (j.items || []).map((i) => ({
    id: `gh_${i.id}`, platform: 'github', external_id: String(i.id),
    url: i.html_url, title: strip(i.title), body: strip((i.body || '').slice(0, 1200)),
    author: i.user?.login || null, created_at: new Date(i.created_at),
    score: i.reactions?.total_count || 0, comment_count: i.comments || 0, accepted: i.state === 'closed' && i.state_reason === 'completed',
  }));
}

// Reddit blocks anonymous requests from cloud servers (403), so it is fetched through the official API
// with an app-only token. Being signed in to Reddit in a browser does not change what the server can reach.
export const redditConnected = () => !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
let _rdTok = null;
async function redditToken() {
  if (_rdTok && _rdTok.exp > Date.now() + 60e3) return _rdTok.v;
  const basic = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64');
  const r = await fetch('https://www.reddit.com/api/v1/access_token', { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials', cache: 'no-store' });
  if (!r.ok) throw new Error(`Reddit sign-in ${r.status}: check REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET`);
  const j = await r.json();
  _rdTok = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return _rdTok.v;
}
async function fetchReddit(subs, terms, from) {
  const q = terms.map((t) => `"${t}"`).join(' OR ');
  const span = Date.now() - from > 31 * 864e5 ? 'year' : 'month';
  const tok = await redditToken();
  const j = await getJSON(`https://oauth.reddit.com/r/${subs.join('+')}/search?q=${encodeURIComponent(q)}&restrict_sr=1&sort=new&t=${span}&limit=100&raw_json=1`, { Authorization: `Bearer ${tok}` });
  return (j.data?.children || []).map((c) => c.data).filter((d) => d.created_utc * 1000 > from).map((d) => ({
    id: `rd_${d.id}`, platform: 'reddit', external_id: d.id,
    url: `https://www.reddit.com${d.permalink}`, title: strip(d.title), body: strip((d.selftext || '').slice(0, 1200)),
    author: d.author || null, created_at: new Date(d.created_utc * 1000),
    score: d.score || 0, comment_count: d.num_comments || 0, accepted: false,
  }));
}

/* ───────────── step 1: ingest ───────────── */
// keep only threads that really mention a tracked term and no excluded term; dedupe; insert new ones
async function storeThreads(sql, all, include, exclude) {
  const seenId = new Set(), seenHash = new Set();
  const rows = [];
  for (const t of all) {
    const text = `${t.title} ${t.body}`.toLowerCase();
    const matched = include.filter((k) => text.includes(k.toLowerCase()));
    if (!matched.length) continue;
    if (exclude.some((e) => text.includes(e))) continue;
    const h = hash(t.title + (t.platform === 'hackernews' && t.body ? t.body.slice(0, 200) : ''));
    if (seenId.has(t.id) || seenHash.has(h)) continue;
    seenId.add(t.id); seenHash.add(h);
    rows.push({ ...t, hash: h, matched, week: weekStartOf(t.created_at) });
  }

  let inserted = 0;
  for (const part of chunk(rows, 400)) {
    const cols = ['id', 'platform', 'external_id', 'url', 'title', 'body', 'author', 'created_at', 'week', 'score', 'comment_count', 'accepted', 'hash', 'matched'];
    const arr = cols.map((c) => part.map((r) => {
      if (c === 'created_at') return r.created_at.toISOString();
      if (c === 'matched') return r.matched.join('|');
      if (c === 'body') return (r.body || '').slice(0, 2000);
      return r[c];
    }));
    const res = await sql.query(
      `INSERT INTO threads (id, platform, external_id, url, canonical_url, title, body, author, created_at, week_start, score, comment_count, accepted, content_hash, matched_keywords)
       SELECT x.id, x.platform, x.eid, x.url, x.url, x.title, x.body, x.author, x.created_at::timestamptz, x.week::date, x.score, x.cc, x.acc, x.h, string_to_array(x.m, '|')
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::int[], $11::int[], $12::bool[], $13::text[], $14::text[])
         AS x(id, platform, eid, url, title, body, author, created_at, week, score, cc, acc, h, m)
       WHERE NOT EXISTS (SELECT 1 FROM threads t WHERE t.content_hash = x.h)
       ON CONFLICT DO NOTHING RETURNING id`, arr);
    inserted += res.length;
  }

  return { kept: rows.length, inserted };
}

export async function ingest(kind = 'manual') {
  await ensureSchema();
  const sql = db();
  const running = await sql`SELECT id FROM runs WHERE status='running' AND started_at > now() - interval '3 minutes' LIMIT 1`;
  if (running.length) return { busy: true };

  const last = await sql`SELECT started_at FROM runs WHERE status IN ('ok','partial') ORDER BY started_at DESC LIMIT 1`;
  const backfillFrom = weekStartToDate(addDays(latestCompleteWeek(), -7 * 8)).getTime(); // 9 complete weeks incl. this one
  const from = last.length ? new Date(last[0].started_at).getTime() - 2 * 864e5 : backfillFrom;
  const to = Date.now();
  const isBackfill = !last.length;
  const [run] = await sql`INSERT INTO runs (kind, since) VALUES (${kind}, ${new Date(from).toISOString()}) RETURNING id`;

  const kw = await sql`SELECT k.term, k.kind, k.category_id, k.created_at FROM keywords k JOIN topic_categories c ON c.id=k.category_id WHERE k.active AND c.active`;
  const include = kw.filter((k) => k.kind === 'include').map((k) => k.term);
  const exclude = kw.filter((k) => k.kind === 'exclude').map((k) => k.term.toLowerCase());
  // Terms added since the last run are back-filled for the full 8 weeks, so a new keyword
  // never shows up as a fake "spike" just because older weeks were never searched for it.
  const lastStart = last.length ? new Date(last[0].started_at).getTime() : 0;
  const fresh = isBackfill ? include : kw.filter((k) => k.kind === 'include' && new Date(k.created_at).getTime() > lastStart).map((k) => k.term);
  const steady = include.filter((t) => !fresh.includes(t));
  const srcRows = await sql`SELECT platform, target FROM sources WHERE active`;
  const subs = srcRows.filter((s) => s.platform === 'reddit').map((s) => s.target);

  // weekly windows for back-fills so busy weeks are not truncated
  const weekly = [];
  for (let t = backfillFrom; t < to; t += 7 * 864e5) weekly.push([t, Math.min(t + 7 * 864e5, to)]);
  const triWeekly = chunk(weekly, 3).map((w) => [w[0][0], w[w.length - 1][1]]);
  const inc = [[from, to]];
  const hnJobs = [...fresh.flatMap((t) => weekly.map(([a, b]) => () => fetchHN(t, a, b))), ...steady.flatMap((t) => inc.map(([a, b]) => () => fetchHN(t, a, b)))];
  const soJobs = [...fresh.flatMap((t) => triWeekly.map(([a, b]) => () => fetchSO(t, a, b))), ...steady.flatMap((t) => inc.map(([a, b]) => () => fetchSO(t, a, b)))];
  const ghJobs = [...chunk(fresh, 5).map((c) => () => fetchGitHub(c, backfillFrom)), ...chunk(steady, 5).map((c) => () => fetchGitHub(c, from))];
  const rdJobs = subs.length && redditConnected() ? [...chunk(fresh, 6).map((c) => () => fetchReddit(subs, c, backfillFrom)), ...chunk(steady, 6).map((c) => () => fetchReddit(subs, c, from))] : [];

  const status = {};
  const all = [];
  const run1 = async (name, jobs) => {
    const res = await pool(jobs, 12, (f) => f());
    const ok = res.filter((r) => r.status === 'fulfilled');
    ok.forEach((r) => all.push(...r.value));
    const errs = res.filter((r) => r.status === 'rejected').map((r) => String(r.reason?.message || r.reason));
    status[name] = { ok: ok.length, failed: errs.length, error: errs[0] || null, fetched: ok.reduce((a, r) => a + r.value.length, 0), at: new Date().toISOString() };
  };
  await Promise.all([run1('hackernews', hnJobs), run1('stackoverflow', soJobs), run1('github', ghJobs), run1('reddit', rdJobs)]);
  if (!redditConnected()) status.reddit.connected = false;

  const { kept, inserted } = await storeThreads(sql, all, include, exclude);

  const failedSources = Object.entries(status).filter(([, s]) => s.ok === 0 && s.failed > 0).map(([k]) => k);
  await sql`UPDATE runs SET stats = ${JSON.stringify({ sources: status, fetched: all.length, kept, inserted, failedSources, backfilledTerms: isBackfill ? [] : fresh })}::jsonb WHERE id = ${run.id}`;
  return { runId: run.id, backfill: isBackfill, backfilledTerms: isBackfill ? [] : fresh, sources: status, fetched: all.length, kept, inserted, failedSources };
}

/* ───────────── step 2: classify with Gemini Flash ───────────── */
export async function geminiJSON(prompt, schema, ms = 45000) {
  const ak = aiKey();
  if (!ak) throw new Error('GEMINI_API_KEY is not set');
  const key = ak.key;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    if (ak.via === 'openrouter') return await openrouterJSON(key, prompt, schema, ctl.signal);
    const model = await resolveModel(key);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}) },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${j.error?.message || r.statusText}`);
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    if (!text) throw new Error('Gemini returned an empty response');
    return schema ? JSON.parse(text) : text;
  } finally { clearTimeout(t); }
}

function rulesLabel(t, ids) {
  const text = `${t.title} ${t.body}`.toLowerCase();
  const id = ids.find((pid) => (META[pid]?.rules || []).some((r) => new RegExp(r, 'i').test(text)));
  const painy = /(annoy|hate|frustrat|painful|broken|nobody|every time|constantly|too many|noise|noisy|waste|stuck|blocked|ignored|muted|disabled|terrible|nightmare|why (does|is)|anyone else)/i.test(text);
  return { is_pain: !!id && painy, pain_point_id: id && painy ? id : 'NONE', candidate_label: '', intent: painy ? 'vent' : 'how_to', cause: 'unknown', resolved: !!t.accepted, severity: 2, sarcasm: false, evidence_quote: '' };
}

async function finishRuns(sql) {
  await sql`UPDATE runs SET status = CASE WHEN coalesce(jsonb_array_length(stats->'failedSources'),0) > 0 THEN 'partial' ELSE 'ok' END, finished_at = now() WHERE status = 'running'`;
}

export async function classify(limit = 60) {
  await ensureSchema();
  const sql = db();
  const tax = await sql`SELECT id, label, description FROM pain_point_taxonomy WHERE status='active' ORDER BY id`;
  const ids = tax.map((t) => t.id);
  const todo = await sql`
    SELECT t.id, t.platform, t.title, left(coalesce(t.body,''), 450) AS body, t.accepted
    FROM threads t LEFT JOIN classifications c ON c.thread_id = t.id AND c.prompt_ver = ${PROMPT_VER}
    WHERE c.thread_id IS NULL OR (c.model = 'rules' AND c.classified_at < now() - interval '10 minutes')
    ORDER BY (c.thread_id IS NULL) DESC, t.created_at DESC LIMIT ${limit}`;
  if (!todo.length) {
    await finishRuns(sql);
    return { labelled: 0, remaining: 0, model: null };
  }

  const schema = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        id: { type: 'STRING' },
        is_pain: { type: 'BOOLEAN' },
        pain_point_id: { type: 'STRING', enum: [...ids, 'CANDIDATE', 'NONE'] },
        candidate_label: { type: 'STRING' },
        intent: { type: 'STRING', enum: ['how_to', 'bug_report', 'vent', 'workaround', 'tool_request', 'comparison', 'other'] },
        cause: { type: 'STRING', enum: ['tooling', 'process', 'user_error', 'unknown'] },
        resolved: { type: 'BOOLEAN' },
        severity: { type: 'INTEGER' },
        sarcasm: { type: 'BOOLEAN' },
        evidence_quote: { type: 'STRING' },
      },
      required: ['id', 'is_pain', 'pain_point_id', 'intent', 'cause', 'resolved', 'severity', 'evidence_quote'],
    },
  };
  const painList = tax.map((t) => `- ${t.id}: ${t.label}. ${t.description || ''}`).join('\n');
  const mkPrompt = (batch) => `You label developer community threads for the PM of a code review automation startup.
For EVERY thread return one object.
- is_pain: true only when developers describe recurring friction caused by tools or team process: complaints, workarounds, "we disabled X", "is anyone else seeing". false for plain how-to questions, one-off config mistakes (user error), announcements, job posts, or unrelated meanings (medical tests, ML model metrics, sales pipelines).
- pain_point_id: the best id from the list below; "CANDIDATE" if it is real pain that fits none of them; "NONE" when is_pain is false.
- candidate_label: 3-6 word label only when CANDIDATE, otherwise "".
- intent, cause: pick the closest value. Sarcasm counts as complaint.
- resolved: true only if the thread shows a working fix, accepted answer or closed issue.
- severity: 1 (mild) to 5 (blocking work).
- evidence_quote: a verbatim excerpt of at most 200 characters that shows the pain, or "".
Pain points:
${painList}

Threads (JSON):
${JSON.stringify(batch.map((t) => ({ id: t.id, source: t.platform, title: t.title, text: t.body })))}`;

  let error = null;
  const results = await pool(chunk(todo, 12), 5, async (batch) => {
    try {
      let out;
      try { out = await geminiJSON(mkPrompt(batch), schema); }
      catch (e) { if (/429|503|overloaded|RESOURCE_EXHAUSTED/i.test(String(e))) { await new Promise((r) => setTimeout(r, 3000)); out = await geminiJSON(mkPrompt(batch), schema, 20000); } else throw e; }
      const byId = new Map(out.map((o) => [o.id, o]));
      return batch.map((t) => ({ t, l: byId.get(t.id) || rulesLabel(t, ids), m: byId.has(t.id) ? aiModel() : 'rules' }));
    } catch (e) {
      error = String(e.message || e);
      return batch.map((t) => ({ t, l: rulesLabel(t, ids), m: 'rules' }));
    }
  });
  const labelled = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (labelled.length) {
    const L = labelled;
    const okPid = (p) => (p && (ids.includes(p) || p === 'CANDIDATE') ? p : 'NONE');
    await sql.query(
      `INSERT INTO classifications (thread_id, taxonomy_ver, prompt_ver, model, is_pain, pain_point_id, candidate_label, intent, cause, resolved, severity, sarcasm, evidence_quote)
       SELECT x.id, 1, $2, x.model, x.pain, x.pid, nullif(x.cand,''), x.intent, x.cause, x.res, greatest(1, least(5, x.sev)), x.sar, nullif(x.q,'')
       FROM unnest($1::text[], $3::text[], $4::bool[], $5::text[], $6::text[], $7::text[], $8::text[], $9::bool[], $10::int[], $11::bool[], $12::text[])
         AS x(id, model, pain, pid, cand, intent, cause, res, sev, sar, q)
       ON CONFLICT (thread_id, taxonomy_ver, prompt_ver) DO UPDATE SET
         model = EXCLUDED.model, is_pain = EXCLUDED.is_pain, pain_point_id = EXCLUDED.pain_point_id,
         candidate_label = EXCLUDED.candidate_label, intent = EXCLUDED.intent, cause = EXCLUDED.cause,
         resolved = EXCLUDED.resolved, severity = EXCLUDED.severity, sarcasm = EXCLUDED.sarcasm,
         evidence_quote = EXCLUDED.evidence_quote, classified_at = now()`,
      [
        L.map((x) => x.t.id), PROMPT_VER, L.map((x) => x.m),
        L.map((x) => !!x.l.is_pain && okPid(x.l.pain_point_id) !== 'NONE'),
        L.map((x) => okPid(x.l.pain_point_id)),
        L.map((x) => (x.l.candidate_label || '').slice(0, 80)),
        L.map((x) => (['how_to', 'bug_report', 'vent', 'workaround', 'tool_request', 'comparison', 'other'].includes(x.l.intent) ? x.l.intent : 'other')),
        L.map((x) => (['tooling', 'process', 'user_error', 'unknown'].includes(x.l.cause) ? x.l.cause : 'unknown')),
        L.map((x) => !!x.l.resolved || !!x.t.accepted),
        L.map((x) => Number.isFinite(x.l.severity) ? Math.round(x.l.severity) : 2),
        L.map((x) => !!x.l.sarcasm),
        L.map((x) => (x.l.evidence_quote || '').slice(0, 240)),
      ],
    );
  }
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM threads t LEFT JOIN classifications c ON c.thread_id=t.id AND c.prompt_ver=${PROMPT_VER} WHERE c.thread_id IS NULL`;
  if (n === 0) await finishRuns(sql);
  await sql`UPDATE runs SET stats = stats || ${JSON.stringify({ gemini: error ? { ok: false, error } : { ok: true, model: aiModel() } })}::jsonb WHERE id = (SELECT max(id) FROM runs)`;
  return { labelled: labelled.length, remaining: n, model: error ? "rules" : aiModel(), error };
}

/* ───────────── six months of history: filled once, slice by slice ───────────── */
const SLICE_WEEKS = 3;
// Every complete week back to HISTORY_WEEKS ago, newest slice first. Recent weeks are included too:
// GitHub search returns at most 100 issues per query, so each week is fetched on its own and all
// weeks are sampled the same way (otherwise older weeks would look busier than recent ones).
async function historySlices() {
  const covered = addDays(latestCompleteWeek(), 7);
  const start = historyStart();
  const out = [];
  for (let end = covered; end > start; end = addDays(end, -7 * SLICE_WEEKS)) {
    const from = addDays(end, -7 * SLICE_WEEKS) < start ? start : addDays(end, -7 * SLICE_WEEKS);
    out.push({ from, to: end });
  }
  return out;
}

export async function historyStatus() {
  await ensureSchema();
  const sql = db();
  const slices = await historySlices();
  const rows = await sql`SELECT slice_start::text AS s, status, sources FROM history_fill`;
  const by = Object.fromEntries(rows.map((r) => [r.s, r]));
  const done = slices.filter((x) => by[x.from]?.status === 'ok').length;
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM threads t LEFT JOIN classifications c ON c.thread_id=t.id AND c.prompt_ver=${PROMPT_VER} WHERE c.thread_id IS NULL`;
  return { start: historyStart(), slices: slices.length, filled: done, remaining: slices.length - done, unlabelled: n,
    pending: slices.filter((x) => by[x.from]?.status !== 'ok').map((x) => ({ ...x, failed: Object.entries(by[x.from]?.sources || {}).filter(([, v]) => !v.ok).map(([k]) => k) })) };
}

// Fetch one slice of older history. Sources that already succeeded for a slice are not fetched again.
export async function backfillHistory() {
  await ensureSchema();
  const sql = db();
  const slices = await historySlices();
  const rows = await sql`SELECT slice_start::text AS s, status, sources FROM history_fill`;
  const by = Object.fromEntries(rows.map((r) => [r.s, r]));
  const todo = slices.find((x) => !by[x.from]) || slices.find((x) => by[x.from]?.status !== 'ok');
  if (!todo) return { done: true, ...(await historyStatus()) };

  const kw = await sql`SELECT k.term, k.kind FROM keywords k JOIN topic_categories c ON c.id=k.category_id WHERE k.active AND c.active`;
  const include = kw.filter((k) => k.kind === 'include').map((k) => k.term);
  const exclude = kw.filter((k) => k.kind === 'exclude').map((k) => k.term.toLowerCase());
  const a = weekStartToDate(todo.from).getTime(), b = weekStartToDate(todo.to).getTime();
  const weekly = [];
  for (let t = a; t < b; t += 7 * 864e5) weekly.push([t, Math.min(t + 7 * 864e5, b)]);
  const prev = by[todo.from]?.sources || {};
  const jobs = {
    hackernews: include.flatMap((t) => weekly.map(([x, y]) => () => fetchHN(t, x, y))),
    stackoverflow: include.map((t) => () => fetchSO(t, a, b)),
    github: weekly.flatMap(([x, y]) => chunk(include, 5).map((c) => () => fetchGitHub(c, x, y))),
  };
  const status = {}, all = [];
  await Promise.all(Object.entries(jobs).map(async ([name, list]) => {
    if (prev[name]?.ok) { status[name] = prev[name]; return; }
    const res = await pool(list, name === 'github' ? 3 : 10, (f) => f());
    const ok = res.filter((r) => r.status === 'fulfilled');
    ok.forEach((r) => all.push(...r.value));
    const errs = res.filter((r) => r.status === 'rejected').map((r) => String(r.reason?.message || r.reason));
    status[name] = { ok: errs.length === 0, calls: list.length, failed: errs.length, error: errs[0] || null, fetched: ok.reduce((n, r) => n + r.value.length, 0) };
  }));
  // a source that failed part-way keeps what it got; the slice is retried for that source only
  const { kept, inserted } = await storeThreads(sql, all, include, exclude);
  const allOk = Object.values(status).every((x) => x.ok);
  await sql`INSERT INTO history_fill (slice_start, slice_end, status, sources, inserted) VALUES (${todo.from}, ${todo.to}, ${allOk ? 'ok' : 'partial'}, ${JSON.stringify(status)}::jsonb, ${inserted})
    ON CONFLICT (slice_start) DO UPDATE SET status = EXCLUDED.status, sources = EXCLUDED.sources, inserted = history_fill.inserted + EXCLUDED.inserted, done_at = now()`;
  return { slice: todo, sources: status, kept, inserted, ...(await historyStatus()) };
}

// What the calendar needs: threads per day across the history window, and how far history goes.
export async function calendarData() {
  await ensureSchema();
  const sql = db();
  const start = historyStart();
  const days = await sql`SELECT ((created_at AT TIME ZONE 'Asia/Kolkata')::date)::text AS d, count(*)::int AS n FROM threads WHERE created_at >= ${dayToDate(start).toISOString()} GROUP BY 1`;
  const [first] = await sql`SELECT ((min(created_at) AT TIME ZONE 'Asia/Kolkata')::date)::text AS d FROM threads`;
  return { today: istDay(), latestWeek: latestCompleteWeek(), lastMonth: lastCompleteMonth(), historyStart: start, firstData: first?.d || null,
    days: Object.fromEntries(days.map((r) => [r.d, r.n])), history: await historyStatus() };
}

/* ───────────── brief data (counts by SQL, trends by shared maths) ───────────── */
export async function briefData(q) {
  await ensureSchema();
  const sql = db();
  const latest = latestCompleteWeek();
  const per = resolvePeriod(q);
  const B = per.buckets, n = B.length, last = n - 1;
  const t0 = dayToDate(B[0].from).toISOString(), t1 = dayToDate(B[last].to).toISOString();
  const c0 = dayToDate(B[last].from).toISOString();
  // new-problem candidates: last four weeks in the weekly view, otherwise the period itself
  const k0 = per.grain === 'week' ? dayToDate(B[Math.max(0, n - 4)].from).toISOString() : c0;

  const [tax, rows, corpus, labelled, lastRun, unl, totalThreads, cands] = await Promise.all([
    sql`SELECT id, category_id, label FROM pain_point_taxonomy WHERE status='active' ORDER BY id`,
    sql`SELECT t.id, t.platform, t.url, t.title, t.author, t.week_start::text AS ws, ((t.created_at AT TIME ZONE 'Asia/Kolkata')::date)::text AS d, c.pain_point_id, c.resolved, c.evidence_quote, c.severity
        FROM threads t JOIN classifications c ON c.thread_id = t.id AND c.prompt_ver = ${PROMPT_VER}
        WHERE c.is_pain AND c.pain_point_id <> 'CANDIDATE' AND t.created_at >= ${t0} AND t.created_at < ${t1}`,
    sql`SELECT ((created_at AT TIME ZONE 'Asia/Kolkata')::date)::text AS d, count(*)::int AS n FROM threads WHERE created_at >= ${t0} AND created_at < ${t1} GROUP BY 1`,
    sql`SELECT count(*) FILTER (WHERE c.is_pain)::int AS pain, count(*) FILTER (WHERE NOT c.is_pain)::int AS noise, count(*) FILTER (WHERE c.model='rules')::int AS rules
        FROM threads t JOIN classifications c ON c.thread_id=t.id AND c.prompt_ver=${PROMPT_VER} WHERE t.created_at >= ${c0} AND t.created_at < ${t1}`,
    sql`SELECT id, kind, started_at, finished_at, status, stats FROM runs ORDER BY id DESC LIMIT 1`,
    sql`SELECT count(*)::int AS n FROM threads t LEFT JOIN classifications c ON c.thread_id=t.id AND c.prompt_ver=${PROMPT_VER} WHERE c.thread_id IS NULL`,
    sql`SELECT count(*)::int AS n FROM threads`,
    sql`SELECT c.candidate_label AS label, count(*)::int AS n, min(t.url) AS url FROM threads t JOIN classifications c ON c.thread_id=t.id AND c.prompt_ver=${PROMPT_VER}
        WHERE c.pain_point_id='CANDIDATE' AND t.created_at >= ${k0} AND t.created_at < ${t1} AND c.candidate_label IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 5`,
  ]);
  const [ins, lastCron, firstData] = await Promise.all([
    per.grain === 'week'
      ? sql`SELECT pain_point_id, summary, gap, next_step, threads_used, model, created_at FROM insights WHERE week_start = ${per.week}`
      : sql`SELECT pain_point_id, summary, gap, next_step, threads_used, model, created_at FROM period_insights WHERE period_key = ${per.key}`,
    sql`SELECT started_at, status FROM runs WHERE kind = 'cron' ORDER BY id DESC LIMIT 1`,
    sql`SELECT ((min(created_at) AT TIME ZONE 'Asia/Kolkata')::date)::text AS d FROM threads`,
  ]);
  const insightBy = Object.fromEntries(ins.map((i) => [i.pain_point_id, i]));
  const bucketOf = (d) => { for (let i = last; i >= 0; i--) if (d >= B[i].from && d < B[i].to) return i; return -1; };

  const pains = tax.map((t) => {
    const mine = rows.filter((r) => r.pain_point_id === t.id).map((r) => ({ ...r, b: bucketOf(r.d) })).filter((r) => r.b >= 0);
    const bySource = Object.fromEntries(SOURCES.map((s) => [s, Array(n).fill(0)]));
    for (const r of mine) if (bySource[r.platform]) bySource[r.platform][r.b]++;
    const series = B.map((_, i) => SOURCES.reduce((a, s) => a + bySource[s][i], 0));
    const thisP = mine.filter((r) => r.b === last);
    const recent = mine.filter((r) => r.b >= n - 4);
    const pool4 = thisP.length ? thisP : recent;
    const unresolved = pool4.length ? Math.round((pool4.filter((r) => !r.resolved).length / pool4.length) * 100) : 0;
    const voices = new Set(thisP.map((r) => r.author).filter(Boolean)).size;
    const evidence = [...(thisP.length ? thisP : recent)]
      .sort((a, b) => (b.evidence_quote ? 1 : 0) - (a.evidence_quote ? 1 : 0) || (b.severity || 0) - (a.severity || 0))
      .slice(0, 5)
      .map((r) => ({ url: r.url, title: r.title, quote: r.evidence_quote, platform: r.platform, week: r.ws, day: r.d }));
    const communities = new Set(thisP.map((r) => r.platform)).size;
    return { id: t.id, title: t.label, cat: t.category_id, ...metaFor(t.id), rules: undefined, series, bySource, unresolved, voices, communities, evidence, insight: insightBy[t.id] || null };
  });

  const corpusB = Array(n).fill(0);
  for (const c of corpus) { const i = bucketOf(c.d); if (i >= 0) corpusB[i] += c.n; }
  const run = lastRun[0] || null;
  const fd = firstData[0]?.d || null;
  return {
    period: {
      grain: per.grain, key: per.key, unit: per.unit, label: per.label, from: per.from, to: per.to, days: per.days || null,
      // buckets that end before the first collected thread have no data at all (not "zero complaints")
      covered: B.map((b) => !!fd && b.to > fd),
      complete: per.to < istDay(),
    },
    week: per.week || null, weeks: B.map((b) => b.from), labels: B.map((b) => b.label), latest, lastMonth: lastCompleteMonth(), historyStart: historyStart(),
    pains,
    corpus: corpusB,
    counts: labelled[0] || { pain: 0, noise: 0, rules: 0 },
    candidates: cands,
    lastCron: lastCron[0] || null,
    unlabelled: unl[0].n,
    totalThreads: totalThreads[0].n,
    lastRun: run && { id: run.id, kind: run.kind, startedAt: run.started_at, finishedAt: run.finished_at, status: run.status, stats: run.stats },
  };
}

/* ───────────── weekly synthesis (Gemini pass 2): what developers say, the gap, what to investigate ───────────── */
export async function synthesize(q) {
  await ensureSchema();
  const sql = db();
  const data = await briefData(q);
  const per = data.period, L = data.weeks.length - 1;
  const week = data.week;
  const picks = data.pains.filter((p) => p.series[L] > 0).sort((a, b) => b.series[L] - a.series[L]).slice(0, 8);
  if (!picks.length) return { week, period: per.key, written: 0, skipped: `no pain threads this ${per.unit}` };
  const f0 = dayToDate(per.from).toISOString(), f1 = dayToDate(addDays(per.to, 1)).toISOString();
  const rows = await sql`SELECT t.title, t.platform, c.pain_point_id, c.evidence_quote, c.resolved
    FROM threads t JOIN classifications c ON c.thread_id = t.id AND c.prompt_ver = ${PROMPT_VER}
    WHERE c.is_pain AND t.created_at >= ${f0} AND t.created_at < ${f1} AND c.pain_point_id = ANY(${picks.map((p) => p.id)})
    ORDER BY c.severity DESC NULLS LAST LIMIT 160`;
  const input = picks.map((p) => ({
    id: p.id, pain_point: p.title,
    threads: rows.filter((r) => r.pain_point_id === p.id).slice(0, 10).map((r) => ({ title: r.title, quote: r.evidence_quote || '', source: r.platform, solved: !!r.resolved })),
  }));
  const schema = { type: 'ARRAY', items: { type: 'OBJECT', properties: {
    id: { type: 'STRING', enum: picks.map((p) => p.id) },
    summary: { type: 'STRING' }, gap: { type: 'STRING' }, next_step: { type: 'STRING' },
  }, required: ['id', 'summary', 'gap', 'next_step'] } };
  let out;
  try {
    out = await geminiJSON(`You summarise developer community threads for the PM of a code review automation startup.
For EACH pain point below, using ONLY the thread titles and quotes given:
- summary: at most 35 words on what developers are experiencing. Describe, do not exaggerate. No numbers.
- gap: at most 30 words on what developers say existing tools or practices fail to solve. If the threads do not say, return "".
- next_step: at most 25 words: one thing the product team could investigate to learn more. Phrase it as an investigation, not a conclusion.
Never invent facts, tools, companies or numbers that are not in the threads.

${JSON.stringify(input)}`, schema, 40000);
  } catch (e) { return { week, period: per.key, written: 0, error: String(e.message || e) }; }
  let written = 0;
  for (const o of out) {
    const used = input.find((i) => i.id === o.id)?.threads.length || 0;
    if (!used) continue;
    if (per.grain !== 'week') {
      await sql`INSERT INTO period_insights (period_key, pain_point_id, summary, gap, next_step, threads_used, model)
        VALUES (${per.key}, ${o.id}, ${String(o.summary || '').slice(0, 400)}, ${String(o.gap || '').slice(0, 400)}, ${String(o.next_step || '').slice(0, 300)}, ${used}, ${aiModel()})
        ON CONFLICT (period_key, pain_point_id) DO UPDATE SET summary = EXCLUDED.summary, gap = EXCLUDED.gap, next_step = EXCLUDED.next_step,
          threads_used = EXCLUDED.threads_used, model = EXCLUDED.model, created_at = now()`;
      written++;
      continue;
    }
    await sql`INSERT INTO insights (week_start, pain_point_id, summary, gap, next_step, threads_used, model)
      VALUES (${week}, ${o.id}, ${String(o.summary || '').slice(0, 400)}, ${String(o.gap || '').slice(0, 400)}, ${String(o.next_step || '').slice(0, 300)}, ${used}, ${aiModel()})
      ON CONFLICT (week_start, pain_point_id) DO UPDATE SET summary = EXCLUDED.summary, gap = EXCLUDED.gap, next_step = EXCLUDED.next_step,
        threads_used = EXCLUDED.threads_used, model = EXCLUDED.model, created_at = now()`;
    written++;
  }
  return { week, period: per.key, written, model: aiModel() };
}

/* ───────────── sprint brief (Gemini pass 2, numbers supplied) ───────────── */
export function templateBrief(p, weekLabel, unit = 'week') {
  const st = stats(p.series);
  const L = p.series.length - 1;
  const srcs = Object.entries(p.bySource).map(([k, v]) => [k, v[L]]).filter(([, v]) => v).map(([k, v]) => `${SOURCE_NAMES[k]} ${v}`).join(', ') || `none this ${unit}`;
  const q = p.evidence.find((e) => e.quote);
  return `Sprint brief: ${p.title}

Problem
Developers keep reporting this: ${p.title.toLowerCase()}. ${p.unresolved}% of recent threads end unsolved.

Our angle
${p.angle}

Evidence (${unit === 'week' ? `week starting Friday ${weekLabel}` : weekLabel})
- ${st.cur} unique threads, ${trendWords(st, unit)} (normal over the previous ${Math.min(4, L)} ${unit === 'period' ? 'periods' : `${unit}s`}: ${st.mean.toFixed(1)})
- ${p.voices} different developers raised it
- Sources: ${srcs}${q ? `\n- In their words: "${q.quote}" (${q.url})` : ''}

Who it hits hardest
${p.suits}
Less relevant for: ${p.notFor}

What developers try today
${p.tried}

Proposed next step
${p.next}

How we'll know it worked
${p.metric}`;
}

export async function draftBrief(ids, q) {
  const data = await briefData(q);
  const picks = data.pains.filter((p) => ids.includes(p.id));
  const out = [];
  let usedAI = false, aiError = null;
  for (const p of picks) {
    const base = templateBrief(p, data.period.grain === 'week' ? data.week : data.period.label, data.period.unit);
    try {
      const text = await geminiJSON(`You are helping a PM write a one-page sprint brief. Rewrite the draft below so it reads clearly for engineers and sales.
Rules: keep every number and link exactly as given; do not add any number, tool name or claim that is not in the draft; keep the same section headings; plain text, no markdown symbols; under 220 words.

${base}`, null, 25000);
      out.push(text.trim()); usedAI = true;
    } catch (e) { aiError = String(e.message || e); out.push(base); }
  }
  return { text: out.join('\n\n────────\n\n'), usedAI, aiError };
}

/* ───────────── health ───────────── */
export async function health(deep = false) {
  const res = { db: { ok: false }, gemini: { ok: !!aiKey(), configured: !!aiKey(), via: aiKey()?.via || null }, reddit: { connected: redditConnected() }, lastRun: null, checkedAt: new Date().toISOString() };
  try {
    await ensureSchema();
    const sql = db();
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM keywords WHERE active`;
    const r = await sql`SELECT status, started_at, finished_at, stats FROM runs ORDER BY id DESC LIMIT 1`;
    res.db = { ok: true, activeTerms: n };
    res.lastRun = r[0] || null;
    // per-run reliability for the connection gauges: share of requests each source answered, oldest → newest
    const hist = await sql`SELECT kind, started_at, stats FROM runs WHERE stats ? 'sources' ORDER BY id DESC LIMIT 14`;
    res.history = hist.reverse().map((h) => ({
      at: h.started_at, kind: h.kind,
      sources: Object.fromEntries(Object.entries(h.stats.sources || {}).map(([k, s]) => [k, s.ok + s.failed ? Math.round((s.ok / (s.ok + s.failed)) * 100) : null])),
      gemini: h.stats.gemini ? (h.stats.gemini.ok ? 100 : 0) : null,
    }));
  } catch (e) { res.db = { ok: false, error: String(e.message || e) }; }
  if (deep && aiKey()) {
    const via = aiKey().via;
    try { await geminiJSON('Reply with the single word OK.', null, 15000); res.gemini = { ok: true, configured: true, via, model: aiModel() }; }
    catch (e) { res.gemini = { ok: false, configured: true, via, error: String(e.message || e) }; }
  }
  res.ok = res.db.ok && res.gemini.ok;
  return res;
}

export async function alertIfDown(h) {
  if (h.ok || !process.env.RESEND_API_KEY || !process.env.ALERT_EMAIL) return false;
  const lines = [`Database: ${h.db.ok ? 'ok' : h.db.error}`, `Gemini: ${h.gemini.ok ? 'ok' : h.gemini.error || 'not configured'}`].join('\n');
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.ALERT_FROM || 'Pulse <onboarding@resend.dev>', to: [process.env.ALERT_EMAIL], subject: 'Developer Community Pulse: something is down', text: lines }),
  }).catch(() => {});
  return true;
}

/* ───────────── Friday email delivery (Resend) ───────────── */
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function emailConfig() {
  const to = (process.env.BRIEF_EMAIL || process.env.ALERT_EMAIL || '').split(',').map((x) => x.trim()).filter(Boolean);
  return { configured: !!process.env.RESEND_API_KEY && to.length > 0, hasKey: !!process.env.RESEND_API_KEY, to };
}
export function briefEmail(data, appUrl) {
  const ranked = data.pains.map((p) => ({ p, st: stats(p.series) })).filter((x) => x.st.cur > 0)
    .sort((a, b) => b.st.cur - a.st.cur || b.st.z - a.st.z).slice(0, 5);
  const c = data.counts;
  const total = (c.pain || 0) + (c.noise || 0);
  const subject = ranked.length
    ? `Pulse: ${ranked[0].p.title} leads this week (${ranked[0].st.cur} threads)`
    : 'Pulse: quiet week, no repeated developer pain';
  const rows = ranked.map(({ p, st }) => {
    const prev = p.series[6];
    const ins = p.insight;
    return `<tr><td style="padding:14px 0;border-top:1px solid #e2dfd8">
      <div style="font:600 15px system-ui;color:#15172a">${esc(p.title)}</div>
      <div style="font:13px system-ui;color:#575b70;margin-top:2px">${st.cur} threads · ${st.cur - prev >= 0 ? '+' : ''}${st.cur - prev} vs last week (${prev} → ${st.cur}) · ${esc(trendWords(st))} · ${p.voices} developers · ${p.unresolved}% unsolved</div>
      ${ins ? `<div style="font:13px system-ui;color:#15172a;margin-top:8px"><b>What developers say (AI):</b> ${esc(ins.summary)}</div>
      ${ins.gap ? `<div style="font:13px system-ui;color:#15172a;margin-top:4px"><b>Gap (AI):</b> ${esc(ins.gap)}</div>` : ''}
      <div style="font:13px system-ui;color:#15172a;margin-top:4px"><b>Worth investigating (AI):</b> ${esc(ins.next_step)}</div>` : ''}
      ${p.evidence[0] ? `<div style="font:12px system-ui;margin-top:6px"><a href="${esc(p.evidence[0].url)}" style="color:#a31b20">Read a thread: ${esc(p.evidence[0].title)}</a></div>` : ''}
    </td></tr>`;
  }).join('');
  const html = `<div style="max-width:620px;margin:0 auto;padding:24px;background:#ffffff">
  <div style="font:12px ui-monospace,monospace;letter-spacing:.08em;color:#8a8d9e;text-transform:uppercase">Friday brief · week starting ${esc(data.week)}</div>
  <h1 style="font:700 22px system-ui;color:#15172a;margin:6px 0 4px">What developers are struggling with</h1>
  <p style="font:14px system-ui;color:#575b70;margin:0 0 12px">${c.pain || 0} of ${total} threads describe real developer pain. Counts come from the database; lines marked AI are Gemini summaries of the linked threads.</p>
  <table style="width:100%;border-collapse:collapse">${rows || '<tr><td style="font:14px system-ui;color:#575b70">No pain point had threads this week.</td></tr>'}</table>
  ${appUrl ? `<p style="margin:20px 0 0"><a href="${esc(appUrl)}" style="display:inline-block;background:#a31b20;color:#fff;padding:10px 16px;border-radius:10px;font:600 14px system-ui;text-decoration:none">Open the full brief</a></p>` : ''}
  <p style="font:12px system-ui;color:#8a8d9e;margin-top:20px">Sent automatically every Friday by Developer Community Pulse.</p></div>`;
  const text = [`Friday brief, week starting ${data.week}`, `${c.pain || 0} of ${total} threads describe real developer pain.`, '',
    ...ranked.map(({ p, st }) => `- ${p.title}: ${st.cur} threads (${p.series[6]} -> ${st.cur}), ${trendWords(st)}${p.insight ? `\n  AI: ${p.insight.summary}` : ''}`),
    '', appUrl ? `Full brief: ${appUrl}` : ''].join('\n');
  return { subject, html, text };
}
export async function emailBrief({ week, force = false, appUrl, channel = 'email' } = {}) {
  await ensureSchema();
  const cfg = emailConfig();
  if (!cfg.configured) return { sent: false, reason: cfg.hasKey ? 'No recipient set (BRIEF_EMAIL)' : 'RESEND_API_KEY not set' };
  const sql = db();
  const data = await briefData(week);
  if (!force) {
    const [done] = await sql`SELECT 1 AS x FROM deliveries WHERE week_start = ${data.week} AND status = 'sent' AND channel = 'email' LIMIT 1`;
    if (done) return { sent: false, reason: 'Already sent for this week', week: data.week };
  }
  const url = appUrl || process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  const { subject, html, text } = briefEmail(data, url);
  let status = 'sent', detail = '';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.BRIEF_FROM || process.env.ALERT_FROM || 'Pulse <onboarding@resend.dev>', to: cfg.to, subject, html, text }),
    });
    const body = await r.text();
    if (!r.ok) { status = 'failed'; detail = body.slice(0, 300); }
    else detail = body.slice(0, 120);
  } catch (e) { status = 'failed'; detail = String(e.message || e); }
  await sql`INSERT INTO deliveries (week_start, channel, recipients, status, detail) VALUES (${data.week}, ${channel}, ${cfg.to.join(', ')}, ${status}, ${detail})`;
  return { sent: status === 'sent', week: data.week, to: cfg.to, subject, error: status === 'failed' ? detail : undefined };
}
export async function lastDelivery() {
  await ensureSchema();
  const [d] = await db()`SELECT week_start::text AS week, channel, recipients, status, detail, sent_at FROM deliveries ORDER BY id DESC LIMIT 1`;
  const [sched] = await db()`SELECT week_start::text AS week, status, sent_at FROM deliveries WHERE channel = 'email' ORDER BY id DESC LIMIT 1`;
  return { ...emailConfig(), to: undefined, recipients: emailConfig().to.length, last: d || null, lastScheduled: sched || null };
}
