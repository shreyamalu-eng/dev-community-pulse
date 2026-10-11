import { NextResponse } from 'next/server';
import { db, ensureSchema, ingest, classify, briefData, draftBrief, health, alertIfDown, latestCompleteWeek } from '../../../lib/server';
import { CATS } from '../../../lib/painpoints';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ok = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (e, status) => ok({ error: String(e?.message || e) }, status || e?.status || 500);
const userError = (m) => Object.assign(new Error(m), { status: 400 });

function cronAllowed(req) {
  const secret = process.env.CRON_SECRET;
  return !secret || req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req, { params }) {
  const url = new URL(req.url);
  try {
    switch (params.action) {
      case 'brief':
        return ok(await briefData(url.searchParams.get('week')));
      case 'watchlist':
        return ok(await watchlist());
      case 'shortlist':
        return ok(await shortlist(url.searchParams.get('week') || latestCompleteWeek()));
      case 'health': {
        const h = await health(url.searchParams.get('deep') === '1');
        if (url.searchParams.get('alert') === '1' && cronAllowed(req)) h.alerted = await alertIfDown(h);
        return ok(h, h.db.ok ? 200 : 503);
      }
      case 'cron': {
        // Vercel Cron: Friday 06:00 IST fetch, then follow-up labelling passes.
        if (!cronAllowed(req)) return fail('Unauthorized', 401);
        if (url.searchParams.get('phase') === 'classify') {
          let last = null;
          for (let i = 0; i < 3; i++) { last = await classify(150); if (!last.remaining) break; }
          return ok(last);
        }
        const r = await ingest('cron');
        const c = r.busy ? null : await classify(150);
        return ok({ ingest: r, classify: c });
      }
      default:
        return fail('Not found', 404);
    }
  } catch (e) { return fail(e); }
}

export async function POST(req, { params }) {
  let body = {};
  try { body = await req.json(); } catch {}
  try {
    switch (params.action) {
      case 'run': {
        const r = await ingest('manual');
        if (r.busy) return ok({ error: 'A run is already in progress. Try again in a couple of minutes.' }, 409);
        return ok(r);
      }
      case 'classify':
        return ok(await classify(150));
      case 'watchlist':
        return ok(await watchlistWrite(body));
      case 'shortlist':
        return ok(await shortlistWrite(body));
      case 'draft': {
        const ids = Array.isArray(body.ids) ? body.ids.slice(0, 6) : [];
        if (!ids.length) return fail('Pick at least one pain point', 400);
        return ok(await draftBrief(ids, body.week));
      }
      default:
        return fail('Not found', 404);
    }
  } catch (e) { return fail(e); }
}

/* ── watchlist: stored in Neon `keywords`, read by every run ── */
async function watchlist() {
  await ensureSchema();
  const sql = db();
  const [lastRun] = await sql`SELECT started_at FROM runs WHERE status IN ('ok','partial') ORDER BY id DESC LIMIT 1`;
  const rows = await sql`
    SELECT k.id, k.category_id, k.term, k.kind, k.created_at,
      (SELECT count(*)::int FROM threads t WHERE k.kind='include' AND lower(k.term) = ANY (SELECT lower(x) FROM unnest(t.matched_keywords) x) AND t.week_start >= ${latestCompleteWeek()}::date - 21) AS found
    FROM keywords k WHERE k.active ORDER BY k.created_at DESC, k.id DESC`;
  return { terms: rows.map((r) => ({ ...r, fresh: !lastRun || new Date(r.created_at) > new Date(lastRun.started_at) })), categories: CATS };
}

async function watchlistWrite(b) {
  await ensureSchema();
  const sql = db();
  if (b.op === 'add') {
    const term = String(b.term || '').trim().replace(/\s+/g, ' ');
    const kind = b.kind === 'exclude' ? 'exclude' : 'include';
    const cat = CATS[b.category_id] ? b.category_id : 'auto';
    if (term.length < 3 || term.length > 60) throw userError('Terms must be 3 to 60 characters');
    const extras = (Array.isArray(b.alsoExclude) ? b.alsoExclude : []).map((x) => String(x).trim()).filter((x) => x.length >= 3).slice(0, 5);
    const dup = await sql`SELECT 1 FROM keywords WHERE lower(term) = lower(${term}) AND kind = ${kind} AND active`;
    if (dup.length) return { duplicate: true };
    await sql`INSERT INTO keywords (category_id, term, kind) VALUES (${cat}, ${term}, ${kind})
              ON CONFLICT (category_id, term, kind) DO UPDATE SET active = true, created_at = now()`;
    for (const x of extras)
      await sql`INSERT INTO keywords (category_id, term, kind) VALUES (${cat}, ${x}, 'exclude')
                ON CONFLICT (category_id, term, kind) DO UPDATE SET active = true`;
    return { added: term, extras };
  }
  if (b.op === 'remove') { await sql`UPDATE keywords SET active = false WHERE id = ${Number(b.id)}`; return { removed: b.id }; }
  if (b.op === 'restore') { await sql`UPDATE keywords SET active = true WHERE id = ${Number(b.id)}`; return { restored: b.id }; }
  if (b.op === 'flip') {
    const [k] = await sql`SELECT category_id, term, kind FROM keywords WHERE id = ${Number(b.id)}`;
    if (!k) throw userError('Term not found');
    const to = k.kind === 'include' ? 'exclude' : 'include';
    await sql`UPDATE keywords SET active = false WHERE id = ${Number(b.id)}`;
    await sql`INSERT INTO keywords (category_id, term, kind) VALUES (${k.category_id}, ${k.term}, ${to})
              ON CONFLICT (category_id, term, kind) DO UPDATE SET active = true, created_at = now()`;
    return { flipped: k.term, to };
  }
  throw userError('Unknown watchlist action');
}

/* ── shortlist + votes ── */
const VOTERS = ['sumit', 'neha', 'kabir'];
async function shortlist(week) {
  await ensureSchema();
  const sql = db();
  const items = await sql`SELECT pain_point_id AS id, decision FROM shortlist WHERE week_start = ${week} ORDER BY created_at`;
  const votes = await sql`SELECT pain_point_id AS id, voter, vote FROM votes WHERE week_start = ${week}`;
  return { week, items: items.map((i) => ({ ...i, votes: Object.fromEntries(votes.filter((v) => v.id === i.id).map((v) => [v.voter, v.vote])) })) };
}

async function shortlistWrite(b) {
  await ensureSchema();
  const sql = db();
  const week = /^\d{4}-\d{2}-\d{2}$/.test(b.week || '') ? b.week : latestCompleteWeek();
  const id = String(b.id || '');
  const [exists] = await sql`SELECT 1 AS x FROM pain_point_taxonomy WHERE id = ${id}`;
  if (!exists) throw userError('Unknown pain point');
  if (b.op === 'add') await sql`INSERT INTO shortlist (week_start, pain_point_id) VALUES (${week}, ${id}) ON CONFLICT DO NOTHING`;
  else if (b.op === 'remove') { await sql`DELETE FROM votes WHERE week_start=${week} AND pain_point_id=${id}`; await sql`DELETE FROM shortlist WHERE week_start=${week} AND pain_point_id=${id}`; }
  else if (b.op === 'vote') {
    if (!VOTERS.includes(b.voter)) throw userError('Unknown voter');
    if (b.vote === 'up' || b.vote === 'down')
      await sql`INSERT INTO votes (week_start, pain_point_id, voter, vote) VALUES (${week}, ${id}, ${b.voter}, ${b.vote}) ON CONFLICT (week_start, pain_point_id, voter) DO UPDATE SET vote = EXCLUDED.vote`;
    else await sql`DELETE FROM votes WHERE week_start=${week} AND pain_point_id=${id} AND voter=${b.voter}`;
  } else if (b.op === 'decide') {
    if (b.voter !== 'sumit') throw Object.assign(new Error('Only Sumit can make the call'), { status: 403 });
    const d = b.decision === 'in' || b.decision === 'later' ? b.decision : null;
    await sql`UPDATE shortlist SET decision = ${d} WHERE week_start=${week} AND pain_point_id=${id}`;
  } else throw userError('Unknown shortlist action');
  return shortlist(week);
}
