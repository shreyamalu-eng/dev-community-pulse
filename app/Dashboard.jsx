'use client';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { CATS, REL, SOURCES, SOURCE_NAMES, MODES, stats, priority, trendWords, suggest, ambiguity, guessCat } from '../lib/painpoints';

const PEOPLE = { sumit: { name: 'Sumit', role: 'PM · decides' }, neha: { name: 'Neha', role: 'Eng lead' }, kabir: { name: 'Kabir', role: 'Sales lead' } };
const TONE = {
  Spike: { fg: 'text-up', bg: 'bg-up-soft', stroke: 'var(--up)', plain: 'Unusual spike' },
  Climbing: { fg: 'text-up', bg: 'bg-up-soft', stroke: 'var(--up)', plain: 'Climbing' },
  Steady: { fg: 'text-flat', bg: 'bg-flat-soft', stroke: 'var(--flat)', plain: 'Steady' },
  Cooling: { fg: 'text-down', bg: 'bg-down-soft', stroke: 'var(--down)', plain: 'Cooling' },
};

/* ── utils ── */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const d8 = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const plus = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const range = (iso) => `Fri ${d8(iso)} – Thu ${d8(plus(iso, 6))}`;
const ist = (ts) => { try { return new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST'; } catch { return ''; } };
async function api(path, body) {
  const r = await fetch(`/api/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const j = await r.json().catch(() => ({ error: `Server returned ${r.status}` }));
  if (!r.ok) throw Object.assign(new Error(j.error || `Request failed (${r.status})`), { status: r.status });
  return j;
}
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

/* ── atoms ── */
function Spark({ s, stroke, w = 100, h = 30 }) {
  const max = Math.max(...s, 1), pad = 3;
  const x = (i) => pad + (i * (w - 2 * pad)) / (s.length - 1);
  const y = (v) => h - pad - (v / max) * (h - 2 * pad);
  const pts = s.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} stroke="var(--line)" strokeWidth="1" />
      <polygon points={`${x(0)},${h - pad} ${pts} ${x(s.length - 1)},${h - pad}`} fill={stroke} opacity="0.12" />
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx={x(s.length - 1)} cy={y(s[s.length - 1])} r="2.6" fill={stroke} />
    </svg>
  );
}
const Pill = ({ label }) => { const t = TONE[label]; return <span className={`inline-flex items-center rounded-full px-2 py-[1px] text-[11px] font-medium ${t.bg} ${t.fg}`}>{t.plain}</span>; };
const FewVoices = ({ n }) => <span className="inline-flex rounded-full bg-warn-soft px-2 py-[1px] text-[11px] text-warn" title={`${n} developer(s). Not enough to call a trend.`}>Too few voices</span>;
function RelTag({ rel }) {
  const cls = rel === 'core' ? 'border-accent text-accent' : rel === 'adjacent' ? 'border-line text-ink' : 'border-line text-muted';
  return <span className={`inline-flex rounded border px-1.5 text-[11px] ${cls}`}>{(REL[rel] || REL.adjacent).label}</span>;
}
function Btn({ children, onClick, kind = 'ghost', disabled, title, type = 'button' }) {
  const k = kind === 'primary' ? 'bg-accent text-on-accent hover:opacity-90' : kind === 'soft' ? 'bg-accent-soft text-accent hover:opacity-90' : 'border border-line text-ink hover:border-accent';
  return <button type={type} title={title} disabled={disabled} onClick={onClick} className={`rounded-md px-2.5 py-1 text-[12.5px] font-medium ${k} disabled:cursor-not-allowed disabled:opacity-40`}>{children}</button>;
}

/* ── header ── */
const STEPS = ['Fetching threads from Hacker News, Stack Overflow, GitHub and Reddit', 'Gemini Flash: labelling real pain vs debugging noise', 'Counting this week against last week and the 4-week normal', 'Brief updated'];
function Header({ data, week, setWeek, running, step, stepNote, onRun, onReset, onContinue, healthInfo, healthOpen, setHealthOpen }) {
  const lr = data?.lastRun;
  const failed = lr?.stats?.failedSources || [];
  const gem = lr?.stats?.gemini;
  const problems = [];
  if (healthInfo && !healthInfo.db?.ok) problems.push('Database not reachable');
  if (failed.length) problems.push(`${failed.map((f) => SOURCE_NAMES[f]).join(', ')} not responding`);
  if (gem && !gem.ok) problems.push('Gemini unavailable, keyword rules used');
  const weekOpts = data ? [...data.weeks].reverse().slice(0, 4) : [];
  return (
    <header className="grid gap-3 border-b border-line pb-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-[11px] uppercase tracking-[.1em] text-accent">Developer Community Pulse</div>
          <h1 className="mt-1 font-display text-[30px] font-bold leading-tight sm:text-[36px]">Friday Morning Brief</h1>
          <p className="mt-1 text-muted">{data ? range(week) : 'Loading…'} · for Sumit's Monday sprint planning</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {weekOpts.length > 0 && (<>
            <label htmlFor="week" className="text-[12px] text-muted">Brief</label>
            <select id="week" value={week} onChange={(e) => setWeek(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1 text-[12.5px]">
              {weekOpts.map((w, i) => <option key={w} value={w}>{range(w)}{w === data.latest && i === 0 ? ' (latest)' : ''}</option>)}
            </select>
          </>)}
          <Btn kind="primary" onClick={onRun} disabled={running}>{running ? 'Running…' : 'Run brief now'}</Btn>
          <Btn onClick={onReset} title="Back to the latest brief with default filters. Your watchlist and votes are kept.">Reset view</Btn>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
        <button onClick={() => setHealthOpen(!healthOpen)} aria-expanded={healthOpen} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 hover:border-accent">
          <span className="h-2 w-2 rounded-full" style={{ background: problems.length ? 'var(--warn)' : 'var(--down)' }} /> {problems.length ? problems[0] : 'All systems working'}
        </button>
        <span className="text-muted">{lr ? `Last run ${ist(lr.startedAt)}${lr.kind === 'cron' ? ' (scheduled)' : ''}` : 'No runs yet'}</span>
        <span className="text-muted">Next scheduled run: Friday 06:00 IST</span>
      </div>
      {running && (
        <ol className="grid gap-1 rounded-md border border-line bg-surface p-3 text-[12.5px]" aria-live="polite">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? 'text-down' : i === step ? 'font-medium text-ink' : 'text-muted'}>
              {i < step ? '✓' : i === step ? '…' : '·'} {s}{i === step && stepNote ? ` · ${stepNote}` : ''}
            </li>
          ))}
        </ol>
      )}
      {!running && data?.unlabelled > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warn bg-warn-soft px-3 py-2 text-[12.5px]">
          <span>{data.unlabelled} threads are still waiting for Gemini to label them, so counts may be low.</span>
          <Btn kind="primary" onClick={onContinue}>Finish labelling</Btn>
        </div>
      )}
      {healthOpen && (
        <div className="grid gap-1 rounded-md border border-line bg-surface p-3 text-[12.5px] sm:grid-cols-2">
          <Row k="Neon database" v={healthInfo ? (healthInfo.db?.ok ? `connected · ${healthInfo.db.activeTerms} active watchlist terms` : `error: ${healthInfo.db?.error}`) : 'checking…'} bad={healthInfo && !healthInfo.db?.ok} />
          <Row k="Gemini Flash" v={gem ? (gem.ok ? `responding · ${gem.model}` : `error: ${gem.error}`) : healthInfo?.gemini?.configured ? 'key set · not used yet' : 'API key missing'} bad={gem ? !gem.ok : !healthInfo?.gemini?.configured} />
          {SOURCES.map((s) => { const st = lr?.stats?.sources?.[s]; return <Row key={s} k={SOURCE_NAMES[s]} v={st ? (st.ok ? `ok · ${st.fetched} fetched` : `not responding${st.error ? ` (${st.error.slice(0, 60)})` : ''}`) : 'not run yet'} bad={st && !st.ok && st.failed > 0} />; })}
          <Row k="Daily health check" v="emails an alert if the database or Gemini fails" />
          <Row k="Threads stored" v={data ? data.totalThreads.toLocaleString('en-IN') : '…'} />
        </div>
      )}
      <details className="rounded-md border border-line bg-surface px-3 py-2 text-[13px]">
        <summary className="cursor-pointer font-medium">How to read this brief</summary>
        <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          <Def t="Thread" d="one discussion, counted once even if it has 300 comments or is cross-posted." />
          <Def t="Normal" d="the average of the four weeks before this one." />
          <Def t="Unusual spike / Climbing" d="this week is well above normal, beyond the usual week-to-week wobble." />
          <Def t="Steady" d="any change is within normal wobble, even if the % looks big." />
          <Def t="Unsolved" d="share of threads with no accepted answer, fix or closed issue." />
          <Def t="Debugging noise" d="how-to questions and user errors. Gemini filters these out before counting." />
        </dl>
      </details>
    </header>
  );
}
const Row = ({ k, v, bad }) => <div className="flex justify-between gap-3 border-b border-line py-1 last:border-0"><span>{k}</span><span className={`text-right ${bad ? 'text-warn' : 'text-muted'}`}>{v}</span></div>;
const Def = ({ t, d }) => <div><dt className="inline font-medium">{t}: </dt><dd className="inline text-muted">{d}</dd></div>;

/* ── top 3 ── */
function TopCalls({ rows, mode, shortIds, addShort, openDraft, focusRow, setMode }) {
  const top = rows.filter((r) => r.p.rel !== 'outside' && r.st.cur >= MODES[mode].min && r.p.voices >= 2)
    .sort((a, b) => priority(b.p.rel, b.p.unresolved, b.st) - priority(a.p.rel, a.p.unresolved, a.st)).slice(0, 3);
  return (
    <section className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[20px] font-semibold">Things to act on</h2>
        <span className="text-[12px] text-muted">Ranked by volume, growth, how unsolved, and closeness to our product</span>
      </div>
      {top.length === 0 && (
        <div className="rounded-lg border border-line bg-surface p-4 text-[13.5px] text-muted">
          Nothing meets the "{MODES[mode].label}" evidence level this week.{' '}
          {mode !== 'exploratory' && <button onClick={() => setMode('exploratory')} className="text-accent underline underline-offset-2">Show early signals</button>}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {top.map(({ p, st }, i) => {
          const inList = shortIds.includes(p.id);
          return (
            <article key={p.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-2"><span className="font-mono text-[11px] text-accent">#{i + 1}</span><Pill label={st.label} /></div>
              <h3 className="font-display text-[16.5px] font-semibold leading-snug">{p.title}</h3>
              <p className="text-[13px]"><b className="font-display text-[20px] tnum">{st.cur}</b> <span className="text-muted">threads · {trendWords(st)} · {p.unresolved}% unsolved</span></p>
              <dl className="grid gap-1 text-[12.5px]">
                <Def t="Hits hardest" d={p.suits} />
                <Def t="Less relevant for" d={p.notFor} />
                <Def t="What they try today" d={p.tried} />
              </dl>
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <Btn kind={inList ? 'soft' : 'primary'} onClick={() => addShort(p.id)} disabled={inList}>{inList ? 'On shortlist ✓' : 'Add to shortlist'}</Btn>
                <Btn onClick={() => openDraft([p.id])}>Draft sprint brief</Btn>
                <Btn onClick={() => focusRow(p.id)}>Evidence</Btn>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ── shortlist + votes ── */
function Shortlist({ items, titles, viewer, setViewer, act, openDraft, busy }) {
  const isOrg = viewer === 'sumit';
  const inSprint = items.filter((x) => x.decision === 'in');
  return (
    <aside className="grid min-w-0 content-start gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[17px] font-semibold">Sprint shortlist</h2>
        <label className="flex items-center gap-1.5 text-[12px] text-muted">You are
          <select value={viewer} onChange={(e) => setViewer(e.target.value)} className="rounded border border-line bg-surface px-1.5 py-0.5 text-[12px] text-ink">
            {Object.entries(PEOPLE).map(([k, v]) => <option key={k} value={k}>{v.name} ({v.role})</option>)}
          </select>
        </label>
      </div>
      <p className="text-[12px] text-muted">{isOrg ? "You see everyone's votes and make the final call." : 'Vote 👍 or 👎. Only Sumit sees the full tally and decides.'}</p>
      {items.length === 0 && <p className="text-[13px] text-muted">Nothing shortlisted for this week yet. Use "Add to shortlist" on any pain point.</p>}
      <ul className="grid gap-2">
        {items.map((x) => {
          const vals = Object.values(x.votes || {}); const ups = vals.filter((v) => v === 'up').length, downs = vals.filter((v) => v === 'down').length;
          const mine = x.votes?.[viewer];
          const waiting = Object.keys(PEOPLE).filter((k) => !x.votes?.[k]).map((k) => PEOPLE[k].name);
          return (
            <li key={x.id} className={`rounded-md border p-3 ${x.decision === 'in' ? 'border-down' : x.decision === 'later' ? 'border-line opacity-70' : 'border-line'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-[13.5px] font-medium leading-snug">{titles[x.id] || x.id}</div>
                {isOrg && <button disabled={busy} onClick={() => act({ op: 'remove', id: x.id }, 'Removed from shortlist')} className="text-[12px] text-muted hover:text-ink" aria-label={`Remove ${titles[x.id]} from shortlist`}>✕</button>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {['up', 'down'].map((v) => (
                  <button key={v} disabled={busy} onClick={() => act({ op: 'vote', id: x.id, voter: viewer, vote: mine === v ? null : v })} aria-pressed={mine === v}
                    className={`rounded border px-2 py-0.5 text-[12px] ${mine === v ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}>{v === 'up' ? '👍' : '👎'}</button>
                ))}
                {isOrg ? <span className="text-[12px] text-muted tnum">{ups} for · {downs} against{waiting.length ? ` · waiting on ${waiting.join(', ')}` : ' · everyone voted'}</span>
                  : <span className="text-[12px] text-muted">{mine ? 'Your vote is in' : 'Not voted yet'}</span>}
              </div>
              {isOrg && vals.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
                  {Object.entries(x.votes).map(([k, v]) => <span key={k} className="rounded bg-sunk px-1.5 py-[1px]">{PEOPLE[k]?.name || k} {v === 'up' ? '👍' : '👎'}</span>)}
                </div>
              )}
              {isOrg && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Btn disabled={busy} kind={x.decision === 'in' ? 'primary' : 'ghost'} onClick={() => act({ op: 'decide', id: x.id, voter: 'sumit', decision: x.decision === 'in' ? null : 'in' })}>{x.decision === 'in' ? 'In this sprint ✓' : 'Put in sprint'}</Btn>
                  <Btn disabled={busy} kind={x.decision === 'later' ? 'soft' : 'ghost'} onClick={() => act({ op: 'decide', id: x.id, voter: 'sumit', decision: x.decision === 'later' ? null : 'later' })}>{x.decision === 'later' ? 'Parked' : 'Park'}</Btn>
                  <Btn onClick={() => openDraft([x.id])}>Sprint brief</Btn>
                </div>
              )}
              {!isOrg && x.decision && <div className="mt-1 text-[12px] text-muted">Sumit's call: {x.decision === 'in' ? 'in this sprint' : 'parked'}</div>}
            </li>
          );
        })}
      </ul>
      {isOrg && inSprint.length > 0 && (
        <div className="grid gap-1.5 rounded-md bg-down-soft p-3">
          <div className="text-[13px] font-medium">Ready for Monday: {inSprint.length} item{inSprint.length > 1 ? 's' : ''} in the sprint</div>
          <Btn kind="primary" onClick={() => openDraft(inSprint.map((x) => x.id), true)}>Open Monday pack</Btn>
        </div>
      )}
      {isOrg && !inSprint.length && items.length > 0 && <p className="text-[12px] text-muted">Put at least one item in the sprint to build the Monday pack.</p>}
    </aside>
  );
}

/* ── sprint brief drawer ── */
function DraftPanel({ draft, week, onClose, toast }) {
  const [state, setState] = useState({ loading: true });
  const ref = useRef(null);
  useEffect(() => {
    let live = true;
    setState({ loading: true });
    api('draft', { ids: draft.ids, week }).then((r) => live && setState({ loading: false, ...r })).catch((e) => live && setState({ loading: false, error: e.message }));
    return () => { live = false; };
  }, [draft, week]);
  const header = draft.pack ? `Monday sprint pack: ${draft.ids.length} item${draft.ids.length > 1 ? 's' : ''}\nDeveloper Community Pulse, week of ${range(week)}\nDecided by Sumit after team votes.\n\n` : `Developer Community Pulse, week of ${range(week)}\n\n`;
  const copy = async () => {
    const cur = ref.current ? ref.current.value : '';
    try { await navigator.clipboard.writeText(cur); toast(draft.pack ? 'Monday pack copied' : 'Sprint brief copied'); }
    catch { if (ref.current) { ref.current.focus(); ref.current.select(); } toast('Copy was blocked. The text is selected: press Cmd/Ctrl+C'); }
  };
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-[600px] flex-col gap-3 overflow-y-auto bg-surface p-5" style={{ paddingTop: 'calc(20px + env(safe-area-inset-top,0px))' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Sprint brief draft">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-[19px] font-semibold">{draft.pack ? 'Monday sprint pack' : 'Sprint brief draft'}</h2>
          <button onClick={onClose} className="rounded border border-line px-2 py-0.5 text-[12.5px]">Close</button>
        </div>
        {state.loading ? <p className="text-[13px] text-muted">Gemini Flash is writing the draft from this week's numbers…</p> : state.error ? (
          <p className="rounded-md border border-warn bg-warn-soft p-3 text-[13px]">Couldn't build the draft: {state.error}</p>
        ) : (<>
          <p className="text-[12.5px] text-muted">
            <span className="rounded bg-accent-soft px-1.5 text-accent">{state.usedAI ? 'AI draft' : 'Template draft'}</span>{' '}
            {state.usedAI ? 'Written by Gemini Flash using only the counts and links shown. Check it before sharing.' : `Gemini was unavailable${state.aiError ? ` (${state.aiError.slice(0, 80)})` : ''}, so this uses the standard template.`} Nothing is sent automatically.
          </p>
          <label htmlFor="brief-text" className="sr-only">Sprint brief text</label>
          <textarea id="brief-text" ref={ref} defaultValue={header + state.text} key={draft.ids.join() + week} className="min-h-[440px] w-full flex-1 rounded-md border border-line bg-sunk p-3 font-mono text-[12.5px] leading-relaxed text-ink" />
          <div className="flex gap-2"><Btn kind="primary" onClick={copy}>Copy</Btn><Btn onClick={onClose}>Done</Btn></div>
        </>)}
      </div>
    </div>
  );
}

/* ── leaderboard ── */
function Detail({ p, st, inList, addShort, openDraft, dismiss, weeks }) {
  return (
    <div className="grid gap-5 bg-sunk px-4 py-4 md:grid-cols-[1.3fr_1fr]">
      <div className="grid min-w-0 content-start gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[.08em] text-muted">Source threads</div>
          {p.evidence.length === 0 ? <p className="mt-2 text-[13px] text-muted">No threads for this pain point in the last four weeks.</p> : (
            <ul className="mt-2 grid gap-2">
              {p.evidence.map((e) => (
                <li key={e.url} className="border-l-2 border-line pl-3 text-[13px]">
                  {e.quote && <div>"{e.quote}"</div>}
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{e.title}</a>
                  <span className="text-muted"> · {SOURCE_NAMES[e.platform]} · week of {d8(e.week)} ↗</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <dl className="grid gap-1 text-[13px]">
          <Def t="Hits hardest" d={p.suits} />
          <Def t="Less relevant for" d={p.notFor} />
          <Def t="What they try today" d={p.tried} />
          <Def t="Our angle" d={p.angle} />
        </dl>
        <div className="flex flex-wrap gap-2">
          <Btn kind={inList ? 'soft' : 'primary'} disabled={inList} onClick={() => addShort(p.id)}>{inList ? 'On shortlist ✓' : 'Add to shortlist'}</Btn>
          <Btn onClick={() => openDraft([p.id])}>Draft sprint brief</Btn>
          <Btn onClick={() => dismiss(p.id)}>Not our problem, hide</Btn>
        </div>
      </div>
      <div className="min-w-0">
        <div className="font-mono text-[11px] uppercase tracking-[.08em] text-muted">Unique threads per week</div>
        <div className="mt-2 grid h-[84px] grid-cols-8 items-end gap-1">
          {p.s.map((v, i) => { const max = Math.max(...p.s, 1); return (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="font-mono text-[10px] text-muted tnum">{v}</span>
              <div className={`w-full rounded-sm ${i === 7 ? 'bg-accent' : 'bg-line'}`} style={{ height: `${Math.max(4, (v / max) * 52)}px` }} />
            </div>); })}
        </div>
        <div className="mt-1 grid grid-cols-8 gap-1">{weeks.map((w) => <span key={w} className="text-center font-mono text-[9px] text-muted">{d8(w)}</span>)}</div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px]">
          <dt className="text-muted">Normal (4-week avg)</dt><dd className="text-right font-mono tnum">{st.mean.toFixed(1)}</dd>
          <dt className="text-muted">This week vs normal</dt><dd className="text-right font-mono tnum">{st.mean ? `${st.ratio.toFixed(2)}×` : 'new'}</dd>
          <dt className="text-muted" title="How unusual this week is. 2 or more is very unlikely to be random wobble.">Unusualness score ⓘ</dt><dd className="text-right font-mono tnum">{st.z.toFixed(2)}</dd>
          <dt className="text-muted">Different developers</dt><dd className="text-right font-mono tnum">{p.voices}</dd>
        </dl>
      </div>
    </div>
  );
}

function Leaderboard(props) {
  const { rows, total, failed, extraIfLooser, mode, setMode, cat, setCat, srcSel, toggleSrc, sort, setSort, cmp, setCmp, open, setOpen, clearFilters, shortIds, addShort, openDraft, dismiss, hiddenCount, showHidden, setShowHidden, weeks } = props;
  const filtersOn = cat !== 'all' || srcSel.length !== SOURCES.length || mode !== 'balanced';
  return (
    <section id="board" className="min-w-0 rounded-lg border border-line bg-surface">
      <div className="grid gap-3 border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-[18px] font-semibold">All tracked pain points</h2>
          <div className="flex rounded-md border border-line p-[2px]" role="group" aria-label="Compare this week against">
            {[['wow', 'vs last week'], ['base', 'vs 4-week normal']].map(([k, l]) => (
              <button key={k} onClick={() => setCmp(k)} aria-pressed={cmp === k} className={`rounded px-2.5 py-1 text-[12px] ${cmp === k ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="grid gap-2 lg:grid-cols-[auto_1fr] lg:items-center">
          <span className="text-[12px] font-medium">How much evidence counts?</span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap rounded-md border border-line p-[2px]" role="group" aria-label="Evidence level">
              {Object.entries(MODES).map(([k, m]) => (
                <button key={k} onClick={() => setMode(k)} aria-pressed={mode === k} className={`rounded px-2.5 py-1 text-[12px] ${mode === k ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'}`}>{m.label} <span className="opacity-75">· {m.hint}</span></button>
              ))}
            </div>
            {extraIfLooser > 0 && <button onClick={() => setMode('exploratory')} className="text-[12px] text-accent underline underline-offset-2">+{extraIfLooser} more qualify with Early signals</button>}
          </div>
          <span className="text-[12px] font-medium">Topic</span>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Topic">
            {[['all', 'All'], ...Object.entries(CATS)].map(([k, l]) => (
              <button key={k} aria-pressed={cat === k} onClick={() => setCat(k)} className={`rounded-full border px-2.5 py-[3px] text-[12px] ${cat === k ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'}`}>{l}</button>
            ))}
          </div>
          <span className="text-[12px] font-medium">Sources</span>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Sources">
            {SOURCES.map((s) => { const down = failed.includes(s); const on = srcSel.includes(s) && !down; return (
              <button key={s} disabled={down} aria-pressed={on} onClick={() => toggleSrc(s)} title={down ? `${SOURCE_NAMES[s]} did not respond in the last run` : undefined}
                className={`rounded-full border px-2.5 py-[3px] text-[12px] ${down ? 'cursor-not-allowed border-warn text-warn' : on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted line-through'}`}>{SOURCE_NAMES[s]}{down ? ' · unavailable' : ''}</button>
            ); })}
            <label htmlFor="sort" className="sr-only">Sort by</label>
            <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)} className="ml-auto rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink">
              <option value="priority">Sort: what to act on</option>
              <option value="cur">Sort: most threads</option>
              <option value="change">Sort: biggest change</option>
              <option value="unres">Sort: least solved</option>
            </select>
          </div>
        </div>
        {filtersOn && (
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-muted">Showing {rows.length} of {total}:</span>
            {mode !== 'balanced' && <span className="rounded bg-sunk px-1.5">{MODES[mode].label}</span>}
            {cat !== 'all' && <span className="rounded bg-sunk px-1.5">{CATS[cat]}</span>}
            {srcSel.length !== SOURCES.length && <span className="rounded bg-sunk px-1.5">{srcSel.length ? srcSel.map((s) => SOURCE_NAMES[s]).join(' + ') : 'No sources'}</span>}
            <button onClick={clearFilters} className="text-accent underline underline-offset-2">Clear filters</button>
          </div>
        )}
        {failed.length > 0 && (
          <div className="rounded-md border border-warn bg-warn-soft px-3 py-2 text-[12.5px]" role="status">
            <b>{failed.map((f) => SOURCE_NAMES[f]).join(', ')} didn't respond in the last run.</b> {failed.length > 1 ? 'They are' : 'It is'} left out of every week below, so the trends still compare like for like.
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-muted">
          {srcSel.length === 0 ? 'Pick at least one source to see pain points.' : 'No pain point matches these filters.'} <button onClick={clearFilters} className="text-accent underline underline-offset-2">Clear filters</button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left">
            <thead>
              <tr className="font-mono text-[10.5px] uppercase tracking-[.08em] text-muted">
                <th className="w-8 px-4 py-2 font-medium">#</th>
                <th className="px-2 py-2 font-medium">Pain point</th>
                <th className="px-2 py-2 text-right font-medium">Threads</th>
                <th className="px-2 py-2 text-right font-medium">{cmp === 'wow' ? 'vs last week' : 'vs normal'}</th>
                <th className="px-2 py-2 font-medium">8 weeks</th>
                <th className="px-2 py-2 font-medium">Signal</th>
                <th className="px-4 py-2 text-right font-medium">Unsolved</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, st }, i) => {
                const t = TONE[st.label]; const isOpen = open === p.id;
                const delta = cmp === 'wow' ? st.wow : st.mean > 0 ? Math.round((st.ratio - 1) * 100) : null;
                const sym = delta == null ? '' : delta > 0 ? '▲' : delta < 0 ? '▼' : '■';
                return (
                  <React.Fragment key={p.id}>
                    <tr id={`row-${p.id}`} className={`cursor-pointer border-t border-line hover:bg-sunk ${isOpen ? 'bg-sunk' : ''}`} onClick={() => setOpen(isOpen ? null : p.id)}>
                      <td className="px-4 py-3 align-top font-mono text-[12px] text-muted tnum">{i + 1}</td>
                      <td className="min-w-0 px-2 py-3 align-top">
                        <button onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? null : p.id); }} aria-expanded={isOpen} className="text-left font-medium hover:text-accent">{p.title}</button>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted"><RelTag rel={p.rel} /><span>{CATS[p.cat]}</span><span>{p.voices} developers this week</span>{shortIds.includes(p.id) && <span className="text-accent">On shortlist</span>}</div>
                      </td>
                      <td className="px-2 py-3 text-right align-top">
                        <span className="font-display text-[18px] font-semibold tnum">{st.cur}</span>
                        <div className="font-mono text-[11px] text-muted tnum">{cmp === 'wow' ? `was ${st.prev}` : `normal ${st.mean.toFixed(1)}`}</div>
                      </td>
                      <td className={`px-2 py-3 text-right align-top font-mono text-[13px] tnum ${t.fg}`}>{delta == null ? (st.cur > 0 ? 'new' : '–') : `${sym} ${delta > 0 ? '+' : ''}${delta}%`}</td>
                      <td className="px-2 py-3 align-top"><Spark s={p.s} stroke={t.stroke} /></td>
                      <td className="px-2 py-3 align-top">
                        {p.voices < 2 && st.cur > 0 ? <FewVoices n={p.voices} /> : <Pill label={st.label} />}
                        {st.label === 'Steady' && p.voices >= 2 && Math.abs(delta || 0) >= 30 && <div className="mt-1 text-[10.5px] text-muted">Big % on small numbers</div>}
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        <div className="font-mono text-[13px] tnum">{p.unresolved}%</div>
                        <div className="ml-auto mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-flat-soft"><div className="h-full rounded-full" style={{ width: `${p.unresolved}%`, background: p.unresolved >= 70 ? 'var(--up)' : 'var(--flat)' }} /></div>
                      </td>
                    </tr>
                    {isOpen && <tr><td colSpan={7} className="border-t border-line p-0"><Detail p={p} st={st} weeks={weeks} inList={shortIds.includes(p.id)} addShort={addShort} openDraft={openDraft} dismiss={dismiss} /></td></tr>}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[11.5px] text-muted">
        <span>Threads are unique threads per week across sources. "Signal" compares this week with the 4-week normal, so a big % change on small numbers stays Steady.</span>
        {hiddenCount > 0 && <button onClick={() => setShowHidden(!showHidden)} className="text-accent underline underline-offset-2">{showHidden ? 'Hide dismissed' : `${hiddenCount} dismissed · show`}</button>}
      </div>
    </section>
  );
}

/* ── watchlist ── */
function Watchlist({ terms, reload, toast, candidates }) {
  const [val, setVal] = useState(''); const [kind, setKind] = useState('include'); const [cat, setCat] = useState('auto'); const [catTouched, setCatTouched] = useState(false);
  const [pending, setPending] = useState(null); const [busy, setBusy] = useState(false);
  const onChange = (v) => { setVal(v); setPending(null); if (!catTouched && v.trim()) setCat(guessCat(v)); };
  const commit = async (term, extra = []) => {
    setBusy(true);
    try {
      const r = await api('watchlist', { op: 'add', term, kind, category_id: cat, alsoExclude: extra });
      if (r.duplicate) toast(`"${term}" is already on the list`);
      else { toast(`${kind === 'include' ? 'Tracking' : 'Excluding'} "${term}"${extra.length ? ` + ${extra.length} exclusion${extra.length > 1 ? 's' : ''}` : ''}. Used from the next run.`); setVal(''); setPending(null); setCatTouched(false); }
      await reload();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  const submit = (e) => {
    e.preventDefault(); const t = val.trim().replace(/\s+/g, ' ');
    if (t.length < 3) { toast('Type at least 3 characters'); return; }
    const sug = suggest(t); const amb = kind === 'include' ? ambiguity(t) : null;
    if (sug || amb) { setPending({ term: t, sug, amb, excl: amb ? amb.excl : [] }); return; }
    commit(t);
  };
  const remove = async (x) => {
    try { await api('watchlist', { op: 'remove', id: x.id }); await reload(); toast(`Removed "${x.term}"`, async () => { await api('watchlist', { op: 'restore', id: x.id }); await reload(); }); }
    catch (e) { toast(e.message); }
  };
  const flip = async (x) => { try { await api('watchlist', { op: 'flip', id: x.id }); await reload(); } catch (e) { toast(e.message); } };
  return (
    <section className="min-w-0 rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="font-display text-[18px] font-semibold">Watchlist</h2>
        <span className="text-[12px] text-muted">Saved in Neon · used by every run · no code changes needed</span>
      </div>
      <form onSubmit={submit} className="grid gap-2 px-4 py-3">
        <label htmlFor="term" className="text-[13px] font-medium">Add a term to track or exclude</label>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-md border border-line p-[2px]" role="group" aria-label="Track or exclude">
            {[['include', 'Track'], ['exclude', 'Exclude']].map(([k, l]) => (
              <button type="button" key={k} onClick={() => { setKind(k); setPending(null); }} aria-pressed={kind === k} className={`rounded px-2.5 py-1 text-[12.5px] ${kind === k ? (k === 'include' ? 'bg-accent text-on-accent' : 'bg-up-soft text-up') : 'text-muted'}`}>{l}</button>
            ))}
          </div>
          <input id="term" value={val} onChange={(e) => onChange(e.target.value)} placeholder={kind === 'include' ? 'e.g. merge queue, review latency' : 'e.g. job listing, sales pipeline'} className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13.5px]" autoComplete="off" maxLength={60} />
          <label htmlFor="termcat" className="sr-only">Topic</label>
          <select id="termcat" value={cat} onChange={(e) => { setCat(e.target.value); setCatTouched(true); }} className="rounded-md border border-line bg-surface px-2 py-1 text-[12.5px]">
            {Object.entries(CATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <Btn type="submit" kind="primary" disabled={busy}>{busy ? 'Saving…' : 'Add'}</Btn>
        </div>
        {pending && (
          <div className="grid gap-2 rounded-md border border-warn bg-warn-soft p-3 text-[13px]" role="alert">
            {pending.sug && (
              <div className="flex flex-wrap items-center gap-2">Did you mean <b>"{pending.sug}"</b>?
                <Btn kind="primary" onClick={() => { const a = kind === 'include' ? ambiguity(pending.sug) : null; if (a) setPending({ term: pending.sug, sug: null, amb: a, excl: a.excl }); else commit(pending.sug); }}>Use "{pending.sug}"</Btn>
                {!pending.amb && <Btn onClick={() => commit(pending.term)}>Keep "{pending.term}"</Btn>}
              </div>
            )}
            {pending.amb && !pending.sug && (
              <div className="grid gap-2">
                <div>"{pending.term}" also shows up in unrelated conversations. Exclude these so they don't inflate the count?</div>
                <div className="flex flex-wrap gap-2">
                  {pending.amb.excl.map((e) => (
                    <label key={e} className="inline-flex items-center gap-1.5 rounded border border-line bg-surface px-2 py-0.5 text-[12.5px]">
                      <input type="checkbox" checked={pending.excl.includes(e)} onChange={() => setPending((pp) => ({ ...pp, excl: pp.excl.includes(e) ? pp.excl.filter((x) => x !== e) : [...pp.excl, e] }))} /> {e}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2"><Btn kind="primary" disabled={busy} onClick={() => commit(pending.term, pending.excl)}>Add with {pending.excl.length} exclusion{pending.excl.length === 1 ? '' : 's'}</Btn><Btn onClick={() => setPending(null)}>Cancel</Btn></div>
              </div>
            )}
            {pending.amb && pending.sug && <div className="text-[12px] text-muted">"{pending.term}" is also ambiguous. Pick the spelling first.</div>}
          </div>
        )}
      </form>
      <div className="grid gap-3 border-t border-line px-4 py-3 md:grid-cols-2 xl:grid-cols-4">
        {Object.entries(CATS).map(([ck, cl]) => (
          <div key={ck} className="min-w-0">
            <div className="text-[12px] font-medium">{cl}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {terms.filter((x) => x.category_id === ck).map((x) => (
                <span key={x.id} className={`inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[12px] ${x.kind === 'include' ? 'border-line' : 'border-up text-up'} ${x.fresh ? 'ring-1 ring-accent' : ''}`}>
                  <button onClick={() => flip(x)} title={x.kind === 'include' ? 'Click to exclude instead' : 'Click to track instead'}>{x.kind === 'exclude' ? '− ' : ''}{x.term}</button>
                  {x.kind === 'include' && !x.fresh && <span className="font-mono text-[10.5px] text-accent" title="Threads matching this term in the last 4 weeks">{x.found}</span>}
                  <button onClick={() => remove(x)} aria-label={`Remove ${x.term}`} className="text-muted hover:text-ink">×</button>
                </span>
              ))}
            </div>
            {!terms.some((x) => x.category_id === ck && x.kind === 'include') && <p className="mt-1.5 text-[12px] text-warn">No terms tracked here, so this topic will show zero threads.</p>}
          </div>
        ))}
      </div>
      {candidates?.length > 0 && (
        <div className="border-t border-line px-4 py-3 text-[12.5px]">
          <div className="font-medium">New pain Gemini found that fits none of your pain points (last 4 weeks)</div>
          <ul className="mt-1 flex flex-wrap gap-2">{candidates.map((c) => <li key={c.label}><a className="text-accent hover:underline" href={c.url} target="_blank" rel="noopener noreferrer">{c.label}</a> <span className="text-muted">· {c.n}</span></li>)}</ul>
        </div>
      )}
      <p className="border-t border-line px-4 py-2.5 text-[11.5px] text-muted">The number on each term is how many threads it matched in the last 4 weeks. Terms with a ring are new and get searched on the next run. Red terms with − are excluded; click any term to switch.</p>
    </section>
  );
}

/* ── empty state ── */
function FirstRun({ onRun, running, error }) {
  return (
    <section className="grid gap-3 rounded-lg border border-line bg-surface p-6">
      <h2 className="font-display text-[22px] font-semibold">No brief yet</h2>
      <p className="max-w-[62ch] text-muted">The first run pulls about eight weeks of history from Hacker News, Stack Overflow, GitHub Issues and Reddit, so this week can be compared with what's normal. Gemini Flash then labels each thread. It takes a few minutes; keep this tab open.</p>
      {error && <p className="rounded-md border border-warn bg-warn-soft p-3 text-[13px]">{error}</p>}
      <div><Btn kind="primary" onClick={onRun} disabled={running}>{running ? 'Running…' : 'Run the first brief'}</Btn></div>
    </section>
  );
}

/* ── app ── */
export default function Dashboard() {
  const [data, setData] = useState(null); const [loadError, setLoadError] = useState(null);
  const [week, setWeekState] = useState(null);
  const [cmp, setCmp] = useState('wow'); const [mode, setMode] = useState('balanced'); const [cat, setCat] = useState('all');
  const [srcSel, setSrcSel] = useState(SOURCES); const [sort, setSort] = useState('priority'); const [open, setOpen] = useState(null);
  const [dismissed, setDismissed] = useState([]); const [showHidden, setShowHidden] = useState(false);
  const [short, setShort] = useState({ items: [] }); const [shortBusy, setShortBusy] = useState(false);
  const [viewer, setViewerState] = useState('sumit');
  const [terms, setTerms] = useState([]);
  const [draft, setDraft] = useState(null);
  const [running, setRunning] = useState(false); const [step, setStep] = useState(0); const [stepNote, setStepNote] = useState('');
  const [healthInfo, setHealthInfo] = useState(null); const [healthOpen, setHealthOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState(null); const [undo, setUndo] = useState(null); const tRef = useRef(null);

  const toast = useCallback((m, u = null) => { setToastMsg(m); setUndo(() => u); clearTimeout(tRef.current); tRef.current = setTimeout(() => { setToastMsg(null); setUndo(null); }, 5000); }, []);

  const loadBrief = useCallback(async (w) => {
    try { const d = await api(`brief${w ? `?week=${w}` : ''}`); setData(d); setWeekState(d.week); setLoadError(null); return d; }
    catch (e) { setLoadError(e.message); return null; }
  }, []);
  const loadTerms = useCallback(async () => { try { const r = await api('watchlist'); setTerms(r.terms); } catch (e) { toast(e.message); } }, [toast]);
  const loadShort = useCallback(async (w) => { if (!w) return; try { setShort(await api(`shortlist?week=${w}`)); } catch (e) { toast(e.message); } }, [toast]);

  useEffect(() => {
    setViewerState(store.get('pulse-viewer', 'sumit'));
    try { setDismissed(JSON.parse(store.get('pulse-dismissed', '[]'))); } catch {}
    loadBrief().then((d) => d && loadShort(d.week));
    loadTerms();
    api('health').then(setHealthInfo).catch((e) => setHealthInfo({ db: { ok: false, error: e.message }, gemini: {} }));
  }, [loadBrief, loadShort, loadTerms]);

  const setViewer = (v) => { setViewerState(v); store.set('pulse-viewer', v); };
  const setWeek = async (w) => { setOpen(null); const d = await loadBrief(w); if (d) loadShort(d.week); };
  const saveDismissed = (list) => { setDismissed(list); store.set('pulse-dismissed', JSON.stringify(list)); };

  const failed = data?.lastRun?.stats?.failedSources || [];
  const eff = srcSel.filter((s) => !failed.includes(s));
  const base = useMemo(() => (data ? data.pains.map((p) => {
    const s = data.weeks.map((_, i) => eff.reduce((a, src) => a + (p.bySource[src]?.[i] || 0), 0));
    return { p: { ...p, s }, st: stats(s) };
  }) : []), [data, eff.join()]);

  const visible = base.filter((r) => (cat === 'all' || r.p.cat === cat) && eff.length > 0 && (showHidden || !dismissed.includes(r.p.id)));
  const qualifying = visible.filter((r) => r.st.cur >= MODES[mode].min);
  const extraIfLooser = mode === 'exploratory' ? 0 : visible.filter((r) => r.st.cur >= MODES.exploratory.min).length - qualifying.length;
  const sorters = { priority: (r) => priority(r.p.rel, r.p.unresolved, r.st), cur: (r) => r.st.cur, change: (r) => Math.abs(cmp === 'wow' ? r.st.wow || 0 : (r.st.ratio - 1) * 100), unres: (r) => r.p.unresolved };
  const rows = [...qualifying].sort((a, b) => sorters[sort](b) - sorters[sort](a) || b.st.cur - a.st.cur);
  const topPool = base.filter((r) => !dismissed.includes(r.p.id));
  const titles = Object.fromEntries((data?.pains || []).map((p) => [p.id, p.title]));
  const shortIds = short.items.map((x) => x.id);

  const shortAct = async (body, msg) => {
    setShortBusy(true);
    try { setShort(await api('shortlist', { ...body, week })); if (msg) toast(msg); } catch (e) { toast(e.message); } finally { setShortBusy(false); }
  };
  const addShort = (id) => shortAct({ op: 'add', id }, 'Added to the sprint shortlist');
  const dismiss = (id) => { const next = [...dismissed, id]; saveDismissed(next); setOpen(null); toast('Hidden from this brief', () => saveDismissed(next.filter((x) => x !== id))); };
  const focusRow = (id) => { setCat('all'); setMode('exploratory'); setShowHidden(true); setOpen(id); setTimeout(() => document.getElementById(`row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); };
  const toggleSrc = (s) => setSrcSel((ss) => (ss.includes(s) ? ss.filter((x) => x !== s) : [...ss, s]));
  const clearFilters = () => { setCat('all'); setSrcSel(SOURCES); setMode('balanced'); };
  const reset = () => {
    const snap = { week, cmp, sort, cat, srcSel, mode, showHidden };
    clearFilters(); setCmp('wow'); setSort('priority'); setOpen(null); setShowHidden(false);
    if (data && week !== data.latest) setWeek(data.latest);
    toast('View reset to the latest brief. Your watchlist, votes and hidden items are kept.', () => { setCmp(snap.cmp); setSort(snap.sort); setCat(snap.cat); setSrcSel(snap.srcSel); setMode(snap.mode); setShowHidden(snap.showHidden); if (snap.week !== week) setWeek(snap.week); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const labelLoop = async () => {
    let total = 0, rounds = 0, last = null;
    while (rounds < 40) {
      rounds++;
      last = await api('classify', {});
      total += last.labelled;
      setStepNote(`${total} labelled${last.remaining ? ` · ${last.remaining} to go` : ''}${last.model === 'rules' ? ' · Gemini unavailable, using keyword rules' : ''}`);
      if (!last.remaining || !last.labelled) break;
    }
    return { total, last };
  };
  const run = async () => {
    setRunning(true); setStep(0); setStepNote('');
    try {
      const r = await api('run', {});
      const failedNow = r.failedSources || [];
      setStepNote(`${r.kept} relevant threads from ${r.fetched} fetched${failedNow.length ? ` · ${failedNow.map((f) => SOURCE_NAMES[f]).join(', ')} not responding` : ''}`);
      setStep(1);
      const { total } = await labelLoop();
      setStep(2); setStepNote('');
      const d = await loadBrief(data?.latest || undefined);
      await Promise.all([loadTerms(), d && loadShort(d.week), api('health').then(setHealthInfo).catch(() => {})]);
      setStep(3);
      toast(`Brief updated · ${r.inserted} new threads · ${total} labelled${failedNow.length ? ` · ${failedNow.length} source${failedNow.length > 1 ? 's' : ''} down` : ''}`);
    } catch (e) {
      toast(e.status === 409 ? e.message : `Run stopped: ${e.message}`);
    } finally { setRunning(false); }
  };
  const continueLabelling = async () => {
    setRunning(true); setStep(1); setStepNote('');
    try { await labelLoop(); setStep(2); await loadBrief(week); toast('Labelling finished'); }
    catch (e) { toast(`Labelling stopped: ${e.message}`); } finally { setRunning(false); }
  };

  const empty = data && data.totalThreads === 0;
  return (
    <div className="mx-auto grid max-w-[1240px] gap-6 px-4 py-6 sm:px-6">
      <Header data={data} week={week} setWeek={setWeek} running={running} step={step} stepNote={stepNote} onRun={run} onReset={reset} onContinue={continueLabelling} healthInfo={healthInfo} healthOpen={healthOpen} setHealthOpen={setHealthOpen} />
      {loadError && (
        <div className="rounded-md border border-warn bg-warn-soft p-4 text-[13.5px]">
          <b>The brief couldn't load.</b> {loadError} <button onClick={() => loadBrief(week)} className="ml-1 text-accent underline underline-offset-2">Try again</button>
        </div>
      )}
      {!data && !loadError && <p className="text-muted">Loading the latest brief…</p>}
      {empty && <FirstRun onRun={run} running={running} />}
      {data && !empty && (<>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <TopCalls rows={topPool} mode={mode} setMode={setMode} shortIds={shortIds} addShort={addShort} openDraft={(ids) => setDraft({ ids })} focusRow={focusRow} />
          <Shortlist items={short.items} titles={titles} viewer={viewer} setViewer={setViewer} act={shortAct} busy={shortBusy} openDraft={(ids, pack) => setDraft({ ids, pack })} />
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
          {[
            ['Threads checked', data.corpus[7].toLocaleString('en-IN'), data.corpus[6] ? `${data.corpus[7] >= data.corpus[6] ? '+' : ''}${Math.round(((data.corpus[7] - data.corpus[6]) / data.corpus[6]) * 100)}% vs last week` : 'this week'],
            ['Real pain points', data.counts.pain.toLocaleString('en-IN'), data.counts.rules ? `${data.counts.rules} labelled by keyword rules` : 'kept after Gemini filtering'],
            ['Debugging noise removed', data.counts.noise.toLocaleString('en-IN'), 'how-to questions, user error'],
            ['Sources working', `${SOURCES.length - failed.length} of ${SOURCES.length}`, failed.length ? `${failed.map((f) => SOURCE_NAMES[f]).join(', ')} down` : 'no gaps in this run'],
          ].map(([l, v, n]) => (
            <div key={l} className="bg-surface p-3.5"><div className="text-[12px] text-muted">{l}</div><div className="mt-0.5 font-display text-[22px] font-semibold leading-tight tnum">{v}</div><div className="text-[11.5px] text-muted">{n}</div></div>
          ))}
        </div>
        <Leaderboard rows={rows} total={data.pains.length} failed={failed} extraIfLooser={extraIfLooser} mode={mode} setMode={setMode} cat={cat} setCat={setCat} srcSel={srcSel} toggleSrc={toggleSrc} sort={sort} setSort={setSort} cmp={cmp} setCmp={setCmp} open={open} setOpen={setOpen} clearFilters={clearFilters} shortIds={shortIds} addShort={addShort} openDraft={(ids) => setDraft({ ids })} dismiss={dismiss} hiddenCount={dismissed.length} showHidden={showHidden} setShowHidden={setShowHidden} weeks={data.weeks} />
      </>)}
      <Watchlist terms={terms} reload={loadTerms} toast={toast} candidates={data?.candidates} />
      <footer className="pb-4 font-mono text-[11px] text-muted">Labels by Gemini Flash · counts by Neon Postgres · live sources: Hacker News, Stack Overflow, GitHub Issues, Reddit</footer>
      {draft && week && <DraftPanel draft={draft} week={week} onClose={() => setDraft(null)} toast={toast} />}
      {toastMsg && (
        <div className="fixed left-1/2 z-30 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-md bg-ink px-3.5 py-2 text-[13px] text-bg shadow-lg" style={{ bottom: 'calc(16px + env(safe-area-inset-bottom,0px))' }} role="status">
          {toastMsg}{undo && <button onClick={() => { undo(); setToastMsg(null); }} className="font-medium underline underline-offset-2">Undo</button>}
        </div>
      )}
    </div>
  );
}
