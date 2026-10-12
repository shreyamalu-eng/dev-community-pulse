'use client';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { CATS, REL, SOURCES, SOURCE_NAMES, MODES, stats, priority, trendWords, suggest, ambiguity, guessCat } from '../lib/painpoints';
import { FlowChart, MiniFlow, Spark, Donut3D, PulseIllustration } from './visuals';

/* ── constants ── */
const PEOPLE = { sumit: { name: 'Sumit', role: 'PM · decides' }, neha: { name: 'Neha', role: 'Eng lead' }, kabir: { name: 'Kabir', role: 'Sales lead' } };
const TONE = {
  Spike: { fg: 'text-red-ink', bg: 'bg-red-soft', stroke: 'var(--red-ink)', plain: 'Unusual spike', icon: '▲▲' },
  Climbing: { fg: 'text-orange-ink', bg: 'bg-orange-soft', stroke: 'var(--orange-ink)', plain: 'Climbing', icon: '▲' },
  Steady: { fg: 'text-steady', bg: 'bg-steady-soft', stroke: 'var(--steady)', plain: 'Steady', icon: '■' },
  Cooling: { fg: 'text-cool', bg: 'bg-cool-soft', stroke: 'var(--cool)', plain: 'Cooling', icon: '▼' },
};
const CAT_COLOR = { auto: 'var(--red)', ci: 'var(--orange)', culture: 'var(--blue-ink)', flow: 'var(--steady)' };
const SERIES_COLORS = ['var(--orange)', 'var(--red-ink)', 'var(--blue-ink)', 'var(--steady)'];
const VIEWS = [['brief', 'Brief'], ['trends', 'Trends'], ['watchlist', 'Topics & keywords'], ['system', 'System']];
const STEPS = [
  ['Fetch', 'Pulling new threads from Hacker News, Stack Overflow, GitHub and Reddit'],
  ['Label', 'Gemini Flash sorts real pain from debugging noise'],
  ['Count', 'Comparing this week with last week and the 4-week normal'],
  ['Summarise', 'Gemini writes a short, sourced summary for each pain point'],
];

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
const Pill = ({ label }) => { const t = TONE[label]; return <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-[2px] text-[11px] font-medium ${t.bg} ${t.fg}`}><span aria-hidden="true" className="text-[9px]">{t.icon}</span>{t.plain}</span>; };
const FewVoices = ({ n }) => <span className="inline-flex rounded-full bg-warn-soft px-2 py-[2px] text-[11px] text-warn" title={`${n} developer(s). Not enough to call a trend.`}>Too few voices</span>;
function RelTag({ rel }) {
  const cls = rel === 'core' ? 'border-red-ink/60 text-red-ink' : rel === 'adjacent' ? 'border-line-strong text-ink' : 'border-line text-faint';
  return <span className={`inline-flex rounded-md border px-1.5 text-[11px] ${cls}`}>{(REL[rel] || REL.adjacent).label}</span>;
}
function Btn({ children, onClick, kind = 'ghost', disabled, title, type = 'button', size = 'md' }) {
  const k = kind === 'primary' ? 'bg-red text-on-red hover:brightness-110 shadow-[0_8px_24px_-12px_rgba(163,27,32,.9)]'
    : kind === 'secondary' ? 'bg-orange-soft text-orange-ink hover:bg-orange/25'
    : kind === 'blue' ? 'bg-blue text-white hover:brightness-125'
    : 'border border-line text-ink hover:border-line-strong hover:bg-surface-2';
  const s = size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3.5 py-2 text-[13px]';
  return <button type={type} title={title} disabled={disabled} onClick={onClick} className={`press inline-flex items-center justify-center gap-1.5 rounded-ctl font-medium ${s} ${k} disabled:cursor-not-allowed disabled:opacity-40`}>{children}</button>;
}
const Def = ({ t, d }) => <div><dt className="inline font-medium text-ink">{t}: </dt><dd className="inline text-muted">{d}</dd></div>;
const Eyebrow = ({ children }) => <div className="font-mono text-[10.5px] uppercase tracking-[.12em] text-faint">{children}</div>;
const Logo = () => (
  <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
    <rect width="32" height="32" rx="9" fill="var(--red)" />
    <path d="M5 18h5l3-7 4 12 3-8 2 3h5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ── navigation ── */
function TopNav({ view, setView, data, week, setWeek, running, onRun, onReset, problems }) {
  const weekOpts = data ? [...data.weeks].reverse().slice(0, 4) : [];
  return (
    <header className="relative z-20 border-b border-line bg-bg/85 backdrop-blur sm:sticky" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div className="leading-tight"><div className="font-display text-[17px] font-bold">Pulse</div><div className="text-[11px] text-muted">Developer community brief</div></div>
        </div>
        <nav aria-label="Sections" className="order-3 flex w-full gap-1 overflow-x-auto rounded-ctl bg-surface p-1 sm:order-none sm:w-auto">
          {VIEWS.map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} aria-current={view === k ? 'page' : undefined}
              className={`press whitespace-nowrap rounded-[9px] px-3.5 py-1.5 text-[13px] font-medium ${view === k ? 'bg-red-soft text-red-ink' : 'text-muted hover:text-ink'}`}>
              {l}{k === 'system' && problems.length > 0 && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-orange align-middle" aria-label="needs attention" />}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {weekOpts.length > 0 && (
            <>
              <label htmlFor="week" className="sr-only">Brief week</label>
              <select id="week" value={week || ''} onChange={(e) => setWeek(e.target.value)} className="rounded-ctl border border-line bg-surface px-2.5 py-2 text-[12.5px] text-ink">
                {weekOpts.map((w, i) => <option key={w} value={w}>{range(w)}{w === data.latest && i === 0 ? ' · latest' : ''}</option>)}
              </select>
            </>
          )}
          <Btn onClick={onReset} title="Clears filters and returns to the latest brief. Topics, keywords, votes and hidden items are kept.">Reset filters</Btn>
          <Btn kind="primary" onClick={onRun} disabled={running}>
            {running ? <><span className="spin inline-block h-3 w-3 rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />Running</> : 'Run brief now'}
          </Btn>
        </div>
      </div>
    </header>
  );
}

/* ── run tracker (timeline) ── */
function RunTracker({ step, note }) {
  return (
    <section className="card card-glow-blue rise p-5" aria-live="polite" aria-label="Run progress">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-[17px] font-semibold">Updating the brief</h2><span className="font-mono text-[11px] text-muted">step {Math.min(step + 1, 4)} of 4</span></div>
      <ol className="relative grid gap-4 pl-6">
        <span className="absolute bottom-2 left-[7px] top-2 w-px bg-line-strong" aria-hidden="true" />
        {STEPS.map(([k, d], i) => (
          <li key={k} className="relative">
            <span className={`absolute -left-6 top-1 h-[15px] w-[15px] rounded-full border-2 ${i < step ? 'border-ok bg-ok' : i === step ? 'dot-live border-orange bg-orange' : 'border-line-strong bg-surface'}`} aria-hidden="true" />
            <div className={`text-[13.5px] font-medium ${i <= step ? 'text-ink' : 'text-faint'}`}>{i < step ? '✓ ' : ''}{k}</div>
            <div className="text-[12.5px] text-muted">{d}{i === step && note ? ` · ${note}` : ''}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ── brief view: hero row ── */
function Hero({ top, data, failed, weekLabel, onEvidence }) {
  const pains = data.pains;
  const catTotals = Object.keys(CATS).map((c) => ({ id: c, label: CATS[c], color: CAT_COLOR[c], value: pains.filter((p) => p.cat === c).reduce((a, p) => a + p.s[7], 0) }));
  const totalPain = catTotals.reduce((a, c) => a + c.value, 0);
  const srcCounts = SOURCES.map((s) => ({ s, n: pains.reduce((a, p) => a + (p.bySource[s]?.[7] || 0), 0) }));
  const srcMax = Math.max(1, ...srcCounts.map((x) => x.n));
  return (
    <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr_0.9fr]">
      <article className="card card-glow lift relative grid min-w-0 gap-3 overflow-hidden p-5 rise">
        <div className="flex items-start justify-between gap-3">
          <div><Eyebrow>Loudest pain · {weekLabel}</Eyebrow><h2 className="mt-1 font-display text-[22px] font-semibold leading-tight sm:text-[24px]">{top ? top.p.title : 'Not enough signal yet'}</h2></div>
          {top && <Pill label={top.st.label} />}
        </div>
        {top ? (<>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div><div className="font-display text-[48px] font-bold leading-none tnum">{top.st.cur}</div><div className="text-[12.5px] text-muted">threads this week</div></div>
            <div className="pb-1 text-[13px] text-muted"><span className="text-ink">{trendWords(top.st)}</span><br />{top.p.unresolved}% end unsolved · {top.p.voices} developers</div>
          </div>
          <MiniFlow values={top.p.s} color="var(--orange)" />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
            <span>8-week trend · normal {top.st.mean.toFixed(1)} a week</span>
            <Btn size="sm" onClick={() => onEvidence(top.p.id)}>See the threads</Btn>
          </div>
        </>) : <p className="text-muted">Run the brief or switch to Early signals to see weaker signals.</p>}
      </article>

      <article className="card lift grid min-w-0 gap-2 p-5 rise" style={{ animationDelay: '60ms' }}>
        <Eyebrow>Where the pain is</Eyebrow>
        <h2 className="font-display text-[17px] font-semibold">Share by topic, this week</h2>
        {totalPain === 0 ? <p className="text-[13px] text-muted">No pain threads this week yet.</p> : (
          <div className="grid justify-items-center gap-4">
            <Donut3D parts={catTotals} total={totalPain} size={190} />
            <ul className="grid w-full gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-2">
              {catTotals.map((c) => (
                <li key={c.id} className="flex min-w-0 items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2"><i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.color }} /><span className="truncate">{c.label}</span></span>
                  <span className="shrink-0 whitespace-nowrap font-mono text-[11.5px] tnum text-muted">{Math.round((c.value / totalPain) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>

      <article className="card card-glow-blue lift grid min-w-0 content-start gap-3 p-5 rise" style={{ animationDelay: '120ms' }}>
        <Eyebrow>Sources</Eyebrow>
        <h2 className="font-display text-[17px] font-semibold">Pain threads by community</h2>
        <ul className="grid gap-2.5">
          {srcCounts.map(({ s, n }) => { const down = failed.includes(s); return (
            <li key={s} className="grid gap-1">
              <div className="flex items-center justify-between text-[12.5px]"><span>{SOURCE_NAMES[s]}</span><span className={`font-mono tnum ${down ? 'text-warn' : 'text-muted'}`}>{down ? 'unavailable' : n}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-sunk">{!down && <div className="h-full rounded-full bg-blue-ink" style={{ width: `${(n / srcMax) * 100}%`, transition: 'width .6s var(--ease)' }} />}{down && <div className="hatch h-full w-full" />}</div>
            </li>
          ); })}
        </ul>
      </article>
    </div>
  );
}

/* ── things to act on ── */
/* ── evidence helpers ── */
const diffText = (st) => { const d = st.cur - st.prev; return `${d > 0 ? '+' : ''}${d} vs last week (${st.prev} → ${st.cur})`; };
function confidence(p, st) {
  if (st.cur === 0) return { label: 'No data', cls: 'bg-steady-soft text-steady', why: 'No threads this week.' };
  if (p.voices >= 8 && p.communities >= 2) return { label: 'High confidence', cls: 'bg-ok-soft text-ok', why: `${p.voices} developers across ${p.communities} communities.` };
  if (p.voices >= 3) return { label: 'Medium confidence', cls: 'bg-blue-soft text-blue-ink', why: `${p.voices} developers${p.communities < 2 ? ', one community only' : ` across ${p.communities} communities`}.` };
  return { label: 'Low confidence', cls: 'bg-warn-soft text-warn', why: `Only ${p.voices} developer${p.voices === 1 ? '' : 's'} this week. Treat as an early signal.` };
}
const Layer = ({ k, tag, children }) => (
  <div className="grid gap-0.5">
    <div className="flex items-center gap-1.5"><span className="font-mono text-[10px] uppercase tracking-[.1em] text-faint">{k}</span>{tag && <span className="rounded-md bg-orange-soft px-1.5 text-[10px] text-orange-ink">{tag}</span>}</div>
    <div className="text-[12.5px] leading-snug text-ink">{children}</div>
  </div>
);

/* ── key findings (deterministic, from counts) ── */
function findings(rows) {
  const live = rows.filter((r) => r.st.cur > 0);
  // each tile names a different pain point where possible, so four tiles carry four findings
  const used = new Set();
  const pick = (list) => { const r = list.find((x) => !used.has(x.p.id)) || null; if (r) used.add(r.p.id); return r; };
  const loud = pick([...live].sort((a, b) => b.st.cur - a.st.cur));
  const rising = pick([...live].filter((r) => r.p.voices >= 2 && r.st.cur - r.st.prev > 0).sort((a, b) => b.st.z - a.st.z));
  const unsolved = pick([...live].filter((r) => r.st.cur >= 2).sort((a, b) => b.p.unresolved - a.p.unresolved || b.st.cur - a.st.cur));
  const fresh = pick([...live].filter((r) => r.st.mean === 0).sort((a, b) => b.st.cur - a.st.cur));
  return { loud, rising, unsolved, fresh };
}
function ExecSummary({ rows, data, failed }) {
  const f = findings(rows);
  const total = data.counts.pain;
  const parts = [];
  if (!total) parts.push('No real pain threads were found this week.');
  else parts.push(`${total} of ${data.corpus[7]} threads this week describe real developer pain; the rest were how-to questions or noise.`);
  if (f.loud) parts.push(`The most discussed problem is "${f.loud.p.title}" (${f.loud.st.cur} threads, ${diffText(f.loud.st).replace(/ \(.*\)/, '')}).`);
  if (f.rising && f.rising !== f.loud) parts.push(`"${f.rising.p.title}" is rising fastest (${f.rising.st.prev} → ${f.rising.st.cur}).`);
  if (f.unsolved) parts.push(`${f.unsolved.p.unresolved}% of "${f.unsolved.p.title}" threads end without a fix.`);
  const caveats = [];
  if (failed.length) caveats.push(`${failed.length} source${failed.length > 1 ? 's' : ''} unavailable, excluded from every week`);
  if (total && total < 15) caveats.push('low volume, so read changes as early signals');
  return (
    <section className="card card-glow grid gap-2 p-5" aria-label="Summary of this week">
      <Eyebrow>This week in one paragraph · from counts, not AI</Eyebrow>
      <p className="max-w-[90ch] text-[15px] leading-relaxed">{parts.join(' ')}</p>
      {caveats.length > 0 && <p className="text-[12.5px] text-warn">Caveat: {caveats.join('; ')}.</p>}
    </section>
  );
}
function KeyFindings({ rows, onEvidence }) {
  const f = findings(rows);
  const tiles = [
    ['Most discussed', f.loud, (r) => `${r.st.cur} threads · ${r.p.voices} developers`],
    ['Rising fastest', f.rising, (r) => diffText(r.st)],
    ['Least solved', f.unsolved, (r) => `${r.p.unresolved}% of ${r.st.cur} threads unsolved`],
    ['New this week', f.fresh, (r) => `${r.st.cur} threads, none in the 4 weeks before`],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map(([k, r, m]) => (
        <article key={k} className="card lift grid min-w-0 content-start gap-1.5 p-4">
          <Eyebrow>{k}</Eyebrow>
          {r ? (<>
            <div className="font-display text-[15.5px] font-semibold leading-snug">{r.p.title}</div>
            <div className="text-[12.5px] text-muted tnum">{m(r)}</div>
            <button onClick={() => onEvidence(r.p.id)} className="justify-self-start text-[12px] text-blue-ink underline underline-offset-2">See the threads</button>
          </>) : <div className="text-[13px] text-faint">No other pain point qualifies this week.</div>}
        </article>
      ))}
    </div>
  );
}

/* ── things to act on: observation → AI reading → next step, kept visually distinct ── */
function TopCalls({ rows, mode, setMode, shortIds, addShort, openDraft, focusRow, onSummarize, summarizing }) {
  const top = rows.filter((r) => r.p.rel !== 'outside' && r.st.cur >= MODES[mode].min && r.p.voices >= 2)
    .sort((a, b) => priority(b.p.rel, b.p.unresolved, b.st) - priority(a.p.rel, a.p.unresolved, a.st)).slice(0, 3);
  return (
    <section className="grid min-w-0 content-start gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[20px] font-semibold">What to look into</h2>
        <span className="text-[12px] text-muted">Ranked by volume, growth, how unsolved, and closeness to our product</span>
      </div>
      {top.length === 0 && (
        <div className="card p-5 text-[13.5px] text-muted">Nothing meets the "{MODES[mode].label}" evidence level this week.{' '}
          {mode !== 'exploratory' && <button onClick={() => setMode('exploratory')} className="text-orange-ink underline underline-offset-2">Show early signals</button>}
        </div>
      )}
      <div className={`grid gap-3 ${top.length >= 3 ? 'md:grid-cols-3' : top.length === 2 ? 'md:grid-cols-2' : ''}`}>
        {top.map(({ p, st }, i) => {
          const inList = shortIds.includes(p.id);
          const c = confidence(p, st);
          const ins = p.insight;
          return (
            <article key={p.id} className="card lift rise flex min-w-0 flex-col gap-3 p-4" style={{ animationDelay: `${i * 70}ms` }}>
              <div className="flex items-center justify-between gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-sunk font-mono text-[12px] text-muted">{i + 1}</span><Pill label={st.label} /></div>
              <h3 className="font-display text-[16.5px] font-semibold leading-snug">{p.title}</h3>
              <Layer k="What happened">
                <div className="flex items-end justify-between gap-2">
                  <span><b className="mr-1 font-display text-[22px] tnum">{st.cur}</b><span className="text-muted">unique threads</span><br /><span className="text-muted tnum">{diffText(st)}</span></span>
                  <Spark values={p.s} color={TONE[st.label].stroke} w={86} h={30} />
                </div>
                <div className="mt-1 text-muted">{p.voices} developers · {p.communities} communit{p.communities === 1 ? 'y' : 'ies'} · {p.unresolved}% unsolved</div>
                <span className={`mt-1 inline-flex rounded-full px-2 py-[1px] text-[11px] ${c.cls}`} title={c.why}>{c.label}</span>
              </Layer>
              {ins ? (<>
                <Layer k="What developers say" tag={`AI summary of ${ins.threads_used} threads`}>{ins.summary}</Layer>
                {ins.gap && <Layer k="Gap they describe" tag="AI">{ins.gap}</Layer>}
                <Layer k="Worth investigating" tag="AI suggestion">{ins.next_step}</Layer>
              </>) : (
                <div className="rounded-ctl border border-dashed border-line p-2.5 text-[12px] text-muted">
                  No AI summary for this week yet. <button disabled={summarizing} onClick={onSummarize} className="text-blue-ink underline underline-offset-2 disabled:opacity-50">{summarizing ? 'Writing…' : 'Summarise the threads'}</button>
                </div>
              )}
              <details className="text-[12px]">
                <summary className="cursor-pointer text-muted">Team notes <span className="text-faint">(written by your team, not from this week's data)</span></summary>
                <dl className="mt-1.5 grid gap-1">
                  <Def t="Hits hardest" d={p.suits} />
                  <Def t="Less relevant for" d={p.notFor} />
                  <Def t="Our angle" d={p.angle} />
                </dl>
              </details>
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <Btn size="sm" kind={inList ? 'secondary' : 'primary'} onClick={() => addShort(p.id)} disabled={inList}>{inList ? 'On shortlist ✓' : 'Add to shortlist'}</Btn>
                <Btn size="sm" onClick={() => openDraft([p.id])}>Draft sprint brief</Btn>
                <Btn size="sm" onClick={() => focusRow(p.id)}>See the threads</Btn>
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
    <aside className="card grid min-w-0 content-start gap-3 p-4" aria-label="Sprint shortlist">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[17px] font-semibold">Sprint shortlist</h2>
        <label className="flex items-center gap-1.5 text-[12px] text-muted">You are
          <select value={viewer} onChange={(e) => setViewer(e.target.value)} className="rounded-lg border border-line bg-surface-2 px-1.5 py-1 text-[12px] text-ink">
            {Object.entries(PEOPLE).map(([k, v]) => <option key={k} value={k}>{v.name} ({v.role})</option>)}
          </select>
        </label>
      </div>
      <p className="text-[12px] text-muted">{isOrg ? "You see everyone's votes and make the final call." : 'Vote 👍 or 👎. Only Sumit sees the full tally and decides.'}</p>
      {items.length === 0 && <p className="rounded-ctl border border-dashed border-line p-3 text-[13px] text-muted">Nothing shortlisted for this week yet. Use "Add to shortlist" on any pain point.</p>}
      <ul className="grid gap-2">
        {items.map((x) => {
          const vals = Object.values(x.votes || {}); const ups = vals.filter((v) => v === 'up').length, downs = vals.filter((v) => v === 'down').length;
          const mine = x.votes?.[viewer];
          const waiting = Object.keys(PEOPLE).filter((k) => !x.votes?.[k]).map((k) => PEOPLE[k].name);
          return (
            <li key={x.id} className={`rounded-ctl border bg-surface-2 p-3 ${x.decision === 'in' ? 'border-ok' : 'border-line'} ${x.decision === 'later' ? 'opacity-70' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-[13.5px] font-medium leading-snug">{titles[x.id] || x.id}</div>
                {isOrg && <button disabled={busy} onClick={() => act({ op: 'remove', id: x.id }, 'Removed from shortlist')} className="press rounded px-1 text-[12px] text-muted hover:text-ink" aria-label={`Remove ${titles[x.id]} from shortlist`}>✕</button>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {['up', 'down'].map((v) => (
                  <button key={v} disabled={busy} onClick={() => act({ op: 'vote', id: x.id, voter: viewer, vote: mine === v ? null : v })} aria-pressed={mine === v} aria-label={v === 'up' ? 'Vote for' : 'Vote against'}
                    className={`press rounded-lg border px-2 py-0.5 text-[13px] ${mine === v ? 'border-orange bg-orange-soft' : 'border-line'}`}>{v === 'up' ? '👍' : '👎'}</button>
                ))}
                {isOrg ? <span className="text-[12px] text-muted tnum">{ups} for · {downs} against{waiting.length ? ` · waiting on ${waiting.join(', ')}` : ' · everyone voted'}</span>
                  : <span className="text-[12px] text-muted">{mine ? 'Your vote is in' : 'Not voted yet'}</span>}
              </div>
              {isOrg && vals.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1 text-[11px]">{Object.entries(x.votes).map(([k, v]) => <span key={k} className="rounded-md bg-sunk px-1.5 py-[1px]">{PEOPLE[k]?.name || k} {v === 'up' ? '👍' : '👎'}</span>)}</div>
              )}
              {isOrg && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Btn size="sm" disabled={busy} kind={x.decision === 'in' ? 'blue' : 'ghost'} onClick={() => act({ op: 'decide', id: x.id, voter: 'sumit', decision: x.decision === 'in' ? null : 'in' })}>{x.decision === 'in' ? 'In this sprint ✓' : 'Put in sprint'}</Btn>
                  <Btn size="sm" disabled={busy} kind={x.decision === 'later' ? 'secondary' : 'ghost'} onClick={() => act({ op: 'decide', id: x.id, voter: 'sumit', decision: x.decision === 'later' ? null : 'later' })}>{x.decision === 'later' ? 'Parked' : 'Park'}</Btn>
                  <Btn size="sm" onClick={() => openDraft([x.id])}>Sprint brief</Btn>
                </div>
              )}
              {!isOrg && x.decision && <div className="mt-1 text-[12px] text-muted">Sumit's call: {x.decision === 'in' ? 'in this sprint' : 'parked'}</div>}
            </li>
          );
        })}
      </ul>
      {isOrg && inSprint.length > 0 && (
        <div className="grid gap-2 rounded-ctl bg-blue-soft p-3">
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
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const header = draft.pack ? `Monday sprint pack: ${draft.ids.length} item${draft.ids.length > 1 ? 's' : ''}\nDeveloper Community Pulse, week of ${range(week)}\nDecided by Sumit after team votes.\n\n` : `Developer Community Pulse, week of ${range(week)}\n\n`;
  const copy = async () => {
    const cur = ref.current ? ref.current.value : '';
    try { await navigator.clipboard.writeText(cur); toast(draft.pack ? 'Monday pack copied' : 'Sprint brief copied'); }
    catch { if (ref.current) { ref.current.focus(); ref.current.select(); } toast('Copy was blocked. The text is selected: press Cmd/Ctrl+C'); }
  };
  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/50 backdrop-blur-[2px]" onClick={onClose}>
      <div className="rise flex h-full w-full max-w-[620px] flex-col gap-3 overflow-y-auto border-l border-line bg-surface p-5" style={{ paddingTop: 'calc(20px + env(safe-area-inset-top,0px))' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Sprint brief draft">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-[20px] font-semibold">{draft.pack ? 'Monday sprint pack' : 'Sprint brief draft'}</h2>
          <Btn size="sm" onClick={onClose}>Close</Btn>
        </div>
        {state.loading ? (
          <div className="grid gap-2" aria-live="polite">
            <p className="text-[13px] text-muted">Gemini Flash is writing the draft from this week's numbers…</p>
            {[90, 70, 82, 60, 76].map((w, i) => <div key={i} className="h-3 animate-pulse rounded bg-surface-2" style={{ width: `${w}%` }} />)}
          </div>
        ) : state.error ? (
          <p className="rounded-ctl border border-warn bg-warn-soft p-3 text-[13px]">Couldn't build the draft: {state.error}</p>
        ) : (<>
          <p className="text-[12.5px] text-muted">
            <span className="rounded-md bg-orange-soft px-1.5 py-[1px] text-orange-ink">{state.usedAI ? 'AI draft' : 'Template draft'}</span>{' '}
            {state.usedAI ? 'Written by Gemini Flash using only the counts and links shown. Check it before sharing.' : `Gemini was unavailable${state.aiError ? ` (${state.aiError.slice(0, 80)})` : ''}, so this uses the standard template.`} Nothing is sent automatically.
          </p>
          <label htmlFor="brief-text" className="sr-only">Sprint brief text</label>
          <textarea id="brief-text" ref={ref} defaultValue={header + state.text} key={draft.ids.join() + week} className="min-h-[440px] w-full flex-1 rounded-ctl border border-line bg-sunk p-3 font-mono text-[12.5px] leading-relaxed text-ink" />
          <div className="flex gap-2"><Btn kind="primary" onClick={copy}>Copy</Btn><Btn onClick={onClose}>Done</Btn></div>
        </>)}
      </div>
    </div>
  );
}

/* ── trends view ── */
function TrendChart({ rows, weeks }) {
  const ranked = [...rows].sort((a, b) => priority(b.p.rel, b.p.unresolved, b.st) - priority(a.p.rel, a.p.unresolved, a.st));
  const [picked, setPicked] = useState(null);
  const ids = picked || ranked.slice(0, 3).map((r) => r.p.id);
  const toggle = (id) => setPicked((cur) => { const base = cur || ids; return base.includes(id) ? base.filter((x) => x !== id) : [...base, id].slice(-4); });
  const series = ids.map((id, i) => { const r = rows.find((x) => x.p.id === id); return r && { id, label: r.p.title, short: r.p.title.split(' ').slice(0, 4).join(' '), values: r.p.s, color: SERIES_COLORS[i % 4] }; }).filter(Boolean);
  return (
    <section className="card card-glow-blue grid min-w-0 gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div><Eyebrow>Eight-week view</Eyebrow><h2 className="font-display text-[20px] font-semibold">How the conversation is moving</h2></div>
        <span className="text-[12px] text-muted">Pick up to 4 pain points · hover a week for exact counts</span>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pain points shown on chart">
        {ranked.map((r) => { const on = ids.includes(r.p.id); const i = ids.indexOf(r.p.id); return (
          <button key={r.p.id} onClick={() => toggle(r.p.id)} aria-pressed={on}
            className={`press inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] ${on ? 'border-line-strong bg-surface-2 text-ink' : 'border-line text-muted hover:text-ink'}`}>
            <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: on ? SERIES_COLORS[i % 4] : 'var(--line-strong)' }} />{r.p.title}
          </button>
        ); })}
      </div>
      {series.length ? <FlowChart series={series} labels={weeks.map(d8)} /> : <p className="py-10 text-center text-muted">Pick a pain point above to plot it.</p>}
    </section>
  );
}

function Detail({ p, st, inList, addShort, openDraft, dismiss, weeks }) {
  return (
    <div className="grid gap-5 bg-sunk px-4 py-4 md:grid-cols-[1.3fr_1fr]">
      <div className="grid min-w-0 content-start gap-3">
        {p.insight && (
          <div className="grid gap-2 rounded-ctl border border-line bg-surface p-3">
            <Layer k="What developers say" tag={`AI summary of ${p.insight.threads_used} threads`}>{p.insight.summary}</Layer>
            {p.insight.gap && <Layer k="Gap they describe" tag="AI">{p.insight.gap}</Layer>}
            <Layer k="Worth investigating" tag="AI suggestion">{p.insight.next_step}</Layer>
          </div>
        )}
        <div>
          <Eyebrow>Source threads</Eyebrow>
          {p.evidence.length === 0 ? <p className="mt-2 text-[13px] text-muted">No threads for this pain point in the last four weeks.</p> : (
            <ul className="mt-2 grid gap-2.5">
              {p.evidence.map((e) => (
                <li key={e.url} className="border-l-2 border-orange/60 pl-3 text-[13px]">
                  {e.quote && <div className="text-ink">"{e.quote}"</div>}
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-blue-ink hover:underline">{e.title}</a>
                  <span className="text-muted"> · {SOURCE_NAMES[e.platform]} · week of {d8(e.week)} ↗</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <dl className="grid gap-1 text-[13px]">
          <dt className="font-mono text-[10px] uppercase tracking-[.1em] text-faint">Team notes (not from this week's data)</dt>
          <Def t="Hits hardest" d={p.suits} />
          <Def t="Less relevant for" d={p.notFor} />
          <Def t="Our angle" d={p.angle} />
        </dl>
        <div className="flex flex-wrap gap-2">
          <Btn size="sm" kind={inList ? 'secondary' : 'primary'} disabled={inList} onClick={() => addShort(p.id)}>{inList ? 'On shortlist ✓' : 'Add to shortlist'}</Btn>
          <Btn size="sm" onClick={() => openDraft([p.id])}>Draft sprint brief</Btn>
          <Btn size="sm" onClick={() => dismiss(p.id)}>Not our problem, hide</Btn>
        </div>
      </div>
      <div className="min-w-0">
        <Eyebrow>Unique threads per week</Eyebrow>
        <div className="mt-2 grid h-[92px] grid-cols-8 items-end gap-1.5">
          {p.s.map((v, i) => { const max = Math.max(...p.s, 1); return (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="font-mono text-[10px] text-muted tnum">{v}</span>
              <div className={`w-full rounded-md ${i === 7 ? 'bg-orange' : 'bg-blue-soft'}`} style={{ height: `${Math.max(4, (v / max) * 56)}px`, transition: 'height .5s var(--ease)' }} />
            </div>); })}
        </div>
        <div className="mt-1 grid grid-cols-8 gap-1.5">{weeks.map((w) => <span key={w} className="text-center font-mono text-[9px] text-faint">{d8(w)}</span>)}</div>
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
  const seg = (on) => `press rounded-[9px] px-2.5 py-1 text-[12px] ${on ? 'bg-blue text-white' : 'text-muted hover:text-ink'}`;
  const chip = (on) => `press rounded-full border px-2.5 py-[4px] text-[12px] ${on ? 'border-orange/70 bg-orange-soft text-orange-ink' : 'border-line text-muted hover:text-ink'}`;
  return (
    <section id="board" className="card min-w-0 overflow-hidden">
      <div className="grid gap-3 border-b border-line px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-[19px] font-semibold">All tracked pain points</h2>
          <div className="flex rounded-ctl border border-line bg-sunk p-[3px]" role="group" aria-label="Compare this week against">
            {[['wow', 'vs last week'], ['base', 'vs 4-week normal']].map(([k, l]) => <button key={k} onClick={() => setCmp(k)} aria-pressed={cmp === k} className={seg(cmp === k)}>{l}</button>)}
          </div>
        </div>
        <div className="grid gap-2.5 lg:grid-cols-[auto_1fr] lg:items-center">
          <span className="text-[12px] font-medium">How much evidence counts?</span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap rounded-ctl border border-line bg-sunk p-[3px]" role="group" aria-label="Evidence level">
              {Object.entries(MODES).map(([k, m]) => <button key={k} onClick={() => setMode(k)} aria-pressed={mode === k} className={seg(mode === k)}>{m.label} <span className="opacity-75">· {m.hint}</span></button>)}
            </div>
            {extraIfLooser > 0 && <button onClick={() => setMode('exploratory')} className="text-[12px] text-orange-ink underline underline-offset-2">+{extraIfLooser} more qualify with Early signals</button>}
          </div>
          <span className="text-[12px] font-medium">Topic</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Topic">
            {[['all', 'All'], ...Object.entries(CATS)].map(([k, l]) => <button key={k} aria-pressed={cat === k} onClick={() => setCat(k)} className={chip(cat === k)}>{l}</button>)}
          </div>
          <span className="text-[12px] font-medium">Sources</span>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sources">
            {SOURCES.map((s) => { const down = failed.includes(s); const on = srcSel.includes(s) && !down; return (
              <button key={s} disabled={down} aria-pressed={on} onClick={() => toggleSrc(s)} title={down ? `${SOURCE_NAMES[s]} did not respond in the last run` : undefined}
                className={down ? 'cursor-not-allowed rounded-full border border-dashed border-warn px-2.5 py-[4px] text-[12px] text-warn' : `${chip(on)} ${on ? '' : 'line-through'}`}>{SOURCE_NAMES[s]}{down ? ' · unavailable' : ''}</button>
            ); })}
            <label htmlFor="sort" className="sr-only">Sort by</label>
            <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)} className="ml-auto rounded-ctl border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink">
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
            {mode !== 'balanced' && <span className="rounded-md bg-sunk px-1.5">{MODES[mode].label}</span>}
            {cat !== 'all' && <span className="rounded-md bg-sunk px-1.5">{CATS[cat]}</span>}
            {srcSel.length !== SOURCES.length && <span className="rounded-md bg-sunk px-1.5">{srcSel.length ? srcSel.map((s) => SOURCE_NAMES[s]).join(' + ') : 'No sources'}</span>}
            <button onClick={clearFilters} className="text-orange-ink underline underline-offset-2">Clear filters</button>
          </div>
        )}
        {failed.length > 0 && (
          <div className="rounded-ctl border border-warn/60 bg-warn-soft px-3 py-2 text-[12.5px]" role="status">
            <b>{failed.map((f) => SOURCE_NAMES[f]).join(', ')} didn't respond in the last run.</b> {failed.length > 1 ? 'They are' : 'It is'} left out of every week below, so the trends still compare like for like.
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-muted">
          {srcSel.length === 0 ? 'Pick at least one source to see pain points.' : 'No pain point matches these filters.'} <button onClick={clearFilters} className="text-orange-ink underline underline-offset-2">Clear filters</button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left">
            <thead>
              <tr className="font-mono text-[10.5px] uppercase tracking-[.08em] text-faint">
                <th className="w-8 px-4 py-2.5 font-medium">#</th>
                <th className="px-2 py-2.5 font-medium">Pain point</th>
                <th className="px-2 py-2.5 text-right font-medium">Threads</th>
                <th className="px-2 py-2.5 text-right font-medium">{cmp === 'wow' ? 'vs last week' : 'vs normal'}</th>
                <th className="px-2 py-2.5 font-medium">8 weeks</th>
                <th className="px-2 py-2.5 font-medium">Signal</th>
                <th className="px-4 py-2.5 text-right font-medium">Unsolved</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, st }, i) => {
                const t = TONE[st.label]; const isOpen = open === p.id;
                const delta = cmp === 'wow' ? st.wow : st.mean > 0 ? Math.round((st.ratio - 1) * 100) : null;
                const sym = delta == null ? '' : delta > 0 ? '▲' : delta < 0 ? '▼' : '■';
                return (
                  <React.Fragment key={p.id}>
                    <tr id={`row-${p.id}`} className={`cursor-pointer border-t border-line transition-colors hover:bg-surface-2 ${isOpen ? 'bg-surface-2' : ''}`} onClick={() => setOpen(isOpen ? null : p.id)}>
                      <td className="px-4 py-3 align-top font-mono text-[12px] text-faint tnum">{i + 1}</td>
                      <td className="min-w-0 px-2 py-3 align-top">
                        <button onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? null : p.id); }} aria-expanded={isOpen} className="text-left font-medium hover:text-orange-ink">{p.title}</button>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted"><RelTag rel={p.rel} /><span>{CATS[p.cat]}</span><span>{p.voices} developers · {p.communities} communit{p.communities === 1 ? 'y' : 'ies'}</span>{shortIds.includes(p.id) && <span className="text-orange-ink">On shortlist</span>}</div>
                      </td>
                      <td className="px-2 py-3 text-right align-top">
                        <span className="font-display text-[19px] font-semibold tnum">{st.cur}</span>
                        <div className="font-mono text-[11px] text-faint tnum">{cmp === 'wow' ? `was ${st.prev}` : `normal ${st.mean.toFixed(1)}`}</div>
                      </td>
                      <td className={`px-2 py-3 text-right align-top font-mono text-[13px] tnum ${t.fg}`}>
                        {cmp === 'wow' ? `${sym || (st.cur - st.prev > 0 ? '▲' : st.cur - st.prev < 0 ? '▼' : '■')} ${st.cur - st.prev > 0 ? '+' : ''}${st.cur - st.prev}` : (delta == null ? (st.cur > 0 ? 'new' : '–') : `${sym} ${delta > 0 ? '+' : ''}${delta}%`)}
                        {cmp === 'wow' && <div className="text-[11px] opacity-80">{delta == null ? (st.cur > 0 ? 'new' : '') : `${delta > 0 ? '+' : ''}${delta}%`}</div>}
                      </td>
                      <td className="px-2 py-3 align-top"><Spark values={p.s} color={t.stroke} /></td>
                      <td className="px-2 py-3 align-top">
                        {p.voices < 2 && st.cur > 0 ? <FewVoices n={p.voices} /> : <Pill label={st.label} />}
                        {st.label === 'Steady' && p.voices >= 2 && Math.abs(delta || 0) >= 30 && <div className="mt-1 text-[10.5px] text-muted">Big % on small numbers</div>}
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        <div className="font-mono text-[13px] tnum">{p.unresolved}%</div>
                        <div className="ml-auto mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-sunk"><div className="h-full rounded-full" style={{ width: `${p.unresolved}%`, background: p.unresolved >= 70 ? 'var(--red)' : 'var(--steady)' }} /></div>
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-[11.5px] text-muted">
        <span>Threads are unique threads per week across sources. "Signal" compares this week with the 4-week normal, so a big % change on small numbers stays Steady.</span>
        {hiddenCount > 0 && <button onClick={() => setShowHidden(!showHidden)} className="text-orange-ink underline underline-offset-2">{showHidden ? 'Hide dismissed' : `${hiddenCount} dismissed · show`}</button>}
      </div>
    </section>
  );
}

/* ── watchlist ── */
function Watchlist({ terms, termsError, reload, toast, candidates }) {
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
  const seg = (on, k) => `press rounded-[9px] px-3 py-1.5 text-[12.5px] ${on ? (k === 'include' ? 'bg-blue text-white' : 'bg-red text-on-red') : 'text-muted'}`;
  return (
    <section className="card min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
        <div><Eyebrow>What Pulse listens for</Eyebrow><h2 className="font-display text-[20px] font-semibold">Topics & keywords</h2></div>
        <span className="text-[12px] text-muted">Saved in Neon · used by every run · no code changes needed</span>
      </div>
      <form onSubmit={submit} className="grid gap-2 px-5 py-4">
        <label htmlFor="term" className="text-[13px] font-medium">Add a term to track or exclude</label>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-ctl border border-line bg-sunk p-[3px]" role="group" aria-label="Track or exclude">
            {[['include', 'Track'], ['exclude', 'Exclude']].map(([k, l]) => <button type="button" key={k} onClick={() => { setKind(k); setPending(null); }} aria-pressed={kind === k} className={seg(kind === k, k)}>{l}</button>)}
          </div>
          <input id="term" value={val} onChange={(e) => onChange(e.target.value)} placeholder={kind === 'include' ? 'e.g. merge queue, review latency' : 'e.g. job listing, sales pipeline'} className="min-w-0 flex-1 rounded-ctl border border-line bg-surface-2 px-3 py-2 text-[13.5px] text-ink placeholder:text-faint" autoComplete="off" maxLength={60} />
          <label htmlFor="termcat" className="sr-only">Topic</label>
          <select id="termcat" value={cat} onChange={(e) => { setCat(e.target.value); setCatTouched(true); }} className="rounded-ctl border border-line bg-surface-2 px-2.5 py-2 text-[12.5px] text-ink">
            {Object.entries(CATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <Btn type="submit" kind="primary" disabled={busy}>{busy ? 'Saving…' : 'Add'}</Btn>
        </div>
        {pending && (
          <div className="rise grid gap-2 rounded-ctl border border-warn/60 bg-warn-soft p-3 text-[13px]" role="alert">
            {pending.sug && (
              <div className="flex flex-wrap items-center gap-2">Did you mean <b>"{pending.sug}"</b>?
                <Btn size="sm" kind="primary" onClick={() => { const a = kind === 'include' ? ambiguity(pending.sug) : null; if (a) setPending({ term: pending.sug, sug: null, amb: a, excl: a.excl }); else commit(pending.sug); }}>Use "{pending.sug}"</Btn>
                {!pending.amb && <Btn size="sm" onClick={() => commit(pending.term)}>Keep "{pending.term}"</Btn>}
              </div>
            )}
            {pending.amb && !pending.sug && (
              <div className="grid gap-2">
                <div>"{pending.term}" also shows up in unrelated conversations. Exclude these so they don't inflate the count?</div>
                <div className="flex flex-wrap gap-2">
                  {pending.amb.excl.map((e) => (
                    <label key={e} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-[12.5px]">
                      <input type="checkbox" checked={pending.excl.includes(e)} onChange={() => setPending((pp) => ({ ...pp, excl: pp.excl.includes(e) ? pp.excl.filter((x) => x !== e) : [...pp.excl, e] }))} /> {e}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2"><Btn size="sm" kind="primary" disabled={busy} onClick={() => commit(pending.term, pending.excl)}>Add with {pending.excl.length} exclusion{pending.excl.length === 1 ? '' : 's'}</Btn><Btn size="sm" onClick={() => setPending(null)}>Cancel</Btn></div>
              </div>
            )}
            {pending.amb && pending.sug && <div className="text-[12px] text-muted">"{pending.term}" is also ambiguous. Pick the spelling first.</div>}
          </div>
        )}
      </form>
      {termsError ? (
        <div className="border-t border-line px-5 py-5 text-[13px] text-warn">The watchlist couldn't load: {termsError}</div>
      ) : (
        <div className="grid gap-4 border-t border-line px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(CATS).map(([ck, cl]) => (
            <div key={ck} className="min-w-0">
              <div className="flex items-center gap-2 text-[12.5px] font-medium"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: CAT_COLOR[ck] }} />{cl}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {terms.filter((x) => x.category_id === ck).map((x) => (
                  <span key={x.id} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[12px] ${x.kind === 'include' ? 'border-line bg-surface-2' : 'border-red-ink/50 text-red-ink'} ${x.fresh ? 'ring-1 ring-orange' : ''}`}>
                    <button onClick={() => flip(x)} title={x.kind === 'include' ? 'Click to exclude instead' : 'Click to track instead'}>{x.kind === 'exclude' ? '− ' : ''}{x.term}</button>
                    {x.kind === 'include' && !x.fresh && <span className="font-mono text-[10.5px] text-orange-ink" title="Threads matching this term in the last 4 weeks">{x.found}</span>}
                    <button onClick={() => remove(x)} aria-label={`Remove ${x.term}`} className="text-faint hover:text-ink">×</button>
                  </span>
                ))}
              </div>
              {terms.length > 0 && !terms.some((x) => x.category_id === ck && x.kind === 'include') && <p className="mt-1.5 text-[12px] text-warn">No terms tracked here, so this topic will show zero threads.</p>}
            </div>
          ))}
        </div>
      )}
      {candidates?.length > 0 && (
        <div className="border-t border-line px-5 py-4 text-[12.5px]">
          <div className="font-medium">New pain Gemini found that fits none of your pain points (last 4 weeks)</div>
          <ul className="mt-1.5 flex flex-wrap gap-2">{candidates.map((c) => <li key={c.label}><a className="text-blue-ink hover:underline" href={c.url} target="_blank" rel="noopener noreferrer">{c.label}</a> <span className="text-muted">· {c.n}</span></li>)}</ul>
        </div>
      )}
      <p className="border-t border-line px-5 py-3 text-[11.5px] text-muted">The number on each term is how many threads it matched in the last 4 weeks. Terms with an orange ring are new: the next run searches them across all 8 weeks, so adding a term never shows up as a fake spike. Red terms with − are excluded; click any term to switch. Removing a term stops new matches but keeps past threads.</p>
    </section>
  );
}

/* ── Friday email delivery ── */
function EmailDelivery({ week }) {
  const [info, setInfo] = useState(null);
  const [state, setState] = useState({ busy: false, msg: '', bad: false });
  const load = useCallback(() => api('delivery').then(setInfo).catch((e) => setInfo({ error: e.message })), []);
  useEffect(() => { load(); }, [load]);
  const send = async () => {
    setState({ busy: true, msg: 'Sending…', bad: false });
    try {
      const r = await api('email', { week });
      setState({ busy: false, msg: r.sent ? `Sent to ${r.to.length} recipient${r.to.length > 1 ? 's' : ''}: "${r.subject}"` : r.reason || r.error || 'Not sent', bad: !r.sent });
    } catch (e) { setState({ busy: false, msg: e.message, bad: true }); }
    load();
  };
  const last = info?.last;
  const status = !info ? 'checking…' : info.error ? `error: ${info.error}`
    : !info.configured ? (info.hasKey ? 'Resend key set · add BRIEF_EMAIL in Vercel to choose who gets it' : 'Not set up · add RESEND_API_KEY and BRIEF_EMAIL in Vercel')
    : `Fridays ~06:30 IST to ${info.recipients} recipient${info.recipients > 1 ? 's' : ''}`;
  return (
    <div className="rounded-ctl border border-line bg-surface-2 px-3 py-3 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">Email delivery</div>
          <div className={info && !info.configured ? 'text-warn' : 'text-muted'}>{status}</div>
          {last && <div className="text-[12px] text-muted">Last email: week of {last.week} · {last.status === 'sent' ? `sent ${ist(last.sent_at)}` : `failed (${(last.detail || '').slice(0, 80)})`}</div>}
        </div>
        <button onClick={send} disabled={state.busy || !info?.configured} title={info?.configured ? 'Email the brief for the week you are viewing' : 'Set up email in Vercel first'}
          className="press rounded-ctl border border-line-strong px-3 py-1.5 text-[12.5px] font-medium hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50">
          {state.busy ? 'Sending…' : 'Email this brief now'}
        </button>
      </div>
      {state.msg && !state.busy && <p role="status" className={`mt-2 text-[12px] ${state.bad ? 'text-warn' : 'text-ok'}`}>{state.msg}</p>}
    </div>
  );
}

/* ── system view ── */
function SystemView({ data, healthInfo }) {
  const lr = data?.lastRun; const gem = lr?.stats?.gemini;
  const stages = [
    ['Fetch', `${lr?.stats?.fetched ?? '–'} threads fetched`, !(lr?.stats?.failedSources || []).length],
    ['Label', gem ? (gem.ok ? `Gemini (${gem.model})` : 'keyword rules (Gemini down)') : 'not run yet', gem ? gem.ok : null],
    ['Count', `${data?.totalThreads ?? '–'} threads stored in Neon`, healthInfo ? !!healthInfo.db?.ok : null],
    ['Brief', lr ? `last run ${ist(lr.startedAt)}` : 'no runs yet', lr ? lr.status !== 'running' : null],
  ];
  const Row = ({ k, v, bad }) => <div className="flex justify-between gap-3 border-b border-line py-2 last:border-0"><span>{k}</span><span className={`text-right ${bad ? 'text-warn' : 'text-muted'}`}>{v}</span></div>;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <section className="card card-glow-blue grid gap-4 p-5">
        <div><Eyebrow>How a brief gets made</Eyebrow><h2 className="font-display text-[20px] font-semibold">Pipeline status</h2></div>
        <ol className="grid gap-2 sm:grid-cols-4">
          {stages.map(([k, d, ok], i) => (
            <li key={k} className="relative rounded-ctl border border-line bg-surface-2 p-3">
              <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${ok === null ? 'bg-line-strong' : ok ? 'bg-ok' : 'bg-orange'}`} aria-hidden="true" /><b className="text-[13px]">{i + 1}. {k}</b></div>
              <div className="mt-1 text-[12px] text-muted">{d}</div>
            </li>
          ))}
        </ol>
        <PulseIllustration className="float mx-auto h-auto w-full max-w-[420px]" />
      </section>
      <section className="card grid content-start gap-3 p-5">
        <h2 className="font-display text-[18px] font-semibold">Health</h2>
        <div className="text-[13px]">
          <Row k="Neon database" v={healthInfo ? (healthInfo.db?.ok ? `connected · ${healthInfo.db.activeTerms} active terms` : `error: ${healthInfo.db?.error}`) : 'checking…'} bad={healthInfo && !healthInfo.db?.ok} />
          <Row k="Gemini Flash" v={gem ? (gem.ok ? `responding · ${gem.model}` : `error: ${gem.error}`) : healthInfo?.gemini?.configured ? 'key set · not used yet' : 'API key missing'} bad={gem ? !gem.ok : !healthInfo?.gemini?.configured} />
          {SOURCES.map((s) => { const st = lr?.stats?.sources?.[s]; return <Row key={s} k={SOURCE_NAMES[s]} v={st ? (st.ok ? `ok · ${st.fetched} fetched` : `not responding${st.error ? ` (${st.error.slice(0, 60)})` : ''}`) : 'not run yet'} bad={st && !st.ok && st.failed > 0} />; })}
          <Row k="Scheduled run" v={`Fridays 06:00 IST · last scheduled run: ${data?.lastCron ? `${ist(data.lastCron.started_at)} (${data.lastCron.status})` : 'not yet (first one this Friday)'}`} />
          <Row k="Daily health check" v="emails an alert if the database or Gemini fails" />
        </div>
        <EmailDelivery week={data?.week} />
        <details className="rounded-ctl border border-line bg-surface-2 px-3 py-2 text-[13px]" open>
          <summary className="cursor-pointer font-medium">How to read the brief</summary>
          <dl className="mt-2 grid gap-1.5">
            <Def t="Thread" d="one discussion, counted once even if it has 300 comments or is cross-posted." />
            <Def t="Normal" d="the average of the four weeks before this one." />
            <Def t="Unusual spike / Climbing" d="this week is well above normal, beyond the usual week-to-week wobble." />
            <Def t="Steady" d="any change is within normal wobble, even if the % looks big." />
            <Def t="Unsolved" d="share of threads with no accepted answer, fix or closed issue." />
            <Def t="Debugging noise" d="how-to questions and user errors. Gemini filters these out before counting." />
          </dl>
        </details>
      </section>
    </div>
  );
}

/* ── first run ── */
function FirstRun({ onRun, running }) {
  return (
    <section className="card card-glow grid items-center gap-6 overflow-hidden p-6 md:grid-cols-[1fr_1.1fr]">
      <div className="grid gap-3">
        <Eyebrow>Welcome, Sumit</Eyebrow>
        <h2 className="font-display text-[28px] font-bold leading-tight">Your first Friday brief is one click away</h2>
        <p className="max-w-[56ch] text-muted">Pulse pulls about eight weeks of threads from Hacker News, Stack Overflow, GitHub Issues and Reddit, so this week can be compared with what's normal. Gemini Flash then sorts real pain from debugging noise. It takes a few minutes; keep this tab open.</p>
        <div><Btn kind="primary" onClick={onRun} disabled={running}>{running ? 'Running…' : 'Run the first brief'}</Btn></div>
      </div>
      <PulseIllustration className="float h-auto w-full" />
    </section>
  );
}

/* ── app ── */
export default function Dashboard() {
  const [view, setViewState] = useState('brief');
  const [data, setData] = useState(null); const [loadError, setLoadError] = useState(null);
  const [week, setWeekState] = useState(null);
  const [cmp, setCmp] = useState('wow'); const [mode, setMode] = useState('balanced'); const [cat, setCat] = useState('all');
  const [srcSel, setSrcSel] = useState(SOURCES); const [sort, setSort] = useState('priority'); const [open, setOpen] = useState(null);
  const [dismissed, setDismissed] = useState([]); const [showHidden, setShowHidden] = useState(false);
  const [short, setShort] = useState({ items: [] }); const [shortBusy, setShortBusy] = useState(false);
  const [viewer, setViewerState] = useState('sumit');
  const [terms, setTerms] = useState([]); const [termsError, setTermsError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [running, setRunning] = useState(false); const [step, setStep] = useState(0); const [stepNote, setStepNote] = useState('');
  const [healthInfo, setHealthInfo] = useState(null);
  const [toastMsg, setToastMsg] = useState(null); const [undo, setUndo] = useState(null); const tRef = useRef(null);

  const toast = useCallback((m, u = null) => { setToastMsg(m); setUndo(() => u); clearTimeout(tRef.current); tRef.current = setTimeout(() => { setToastMsg(null); setUndo(null); }, 5000); }, []);
  const setView = (v) => { setViewState(v); try { history.replaceState(null, '', v === 'brief' ? location.pathname : `#${v}`); } catch {} window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const loadBrief = useCallback(async (w) => {
    try { const d = await api(`brief${w ? `?week=${w}` : ''}`); setData(d); setWeekState(d.week); setLoadError(null); return d; }
    catch (e) { setLoadError(e.message); return null; }
  }, []);
  const loadTerms = useCallback(async () => { try { const r = await api('watchlist'); setTerms(r.terms); setTermsError(null); } catch (e) { setTermsError(e.message); } }, []);
  const loadShort = useCallback(async (w) => { if (!w) return; try { setShort(await api(`shortlist?week=${w}`)); } catch (e) { toast(e.message); } }, [toast]);

  useEffect(() => {
    const h = (location.hash || '').slice(1); if (VIEWS.some(([k]) => k === h)) setViewState(h);
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
  const effKey = eff.join();
  const base = useMemo(() => (data ? data.pains.map((p) => {
    const s = data.weeks.map((_, i) => eff.reduce((a, src) => a + (p.bySource[src]?.[i] || 0), 0));
    return { p: { ...p, s }, st: stats(s) };
  }) : []), [data, effKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = base.filter((r) => (cat === 'all' || r.p.cat === cat) && eff.length > 0 && (showHidden || !dismissed.includes(r.p.id)));
  const qualifying = visible.filter((r) => r.st.cur >= MODES[mode].min);
  const extraIfLooser = mode === 'exploratory' ? 0 : visible.filter((r) => r.st.cur >= MODES.exploratory.min).length - qualifying.length;
  const sorters = { priority: (r) => priority(r.p.rel, r.p.unresolved, r.st), cur: (r) => r.st.cur, change: (r) => Math.abs(cmp === 'wow' ? r.st.wow || 0 : (r.st.ratio - 1) * 100), unres: (r) => r.p.unresolved };
  const rows = [...qualifying].sort((a, b) => sorters[sort](b) - sorters[sort](a) || b.st.cur - a.st.cur);
  const topPool = base.filter((r) => !dismissed.includes(r.p.id));
  const heroTop = [...topPool].filter((r) => r.st.cur > 0 && r.p.rel !== 'outside').sort((a, b) => priority(b.p.rel, b.p.unresolved, b.st) - priority(a.p.rel, a.p.unresolved, a.st))[0];
  const titles = Object.fromEntries((data?.pains || []).map((p) => [p.id, p.title]));
  const shortIds = short.items.map((x) => x.id);

  const checked = !!(data && healthInfo) || !!loadError;
  const aiAt = (data?.pains || []).map((p) => p.insight?.created_at).filter(Boolean).sort().pop();
  const problems = [];
  if (healthInfo && !healthInfo.db?.ok) problems.push('Database not reachable');
  if (failed.length) problems.push(`${failed.map((f) => SOURCE_NAMES[f]).join(', ')} not responding`);
  if (data?.lastRun?.stats?.gemini && !data.lastRun.stats.gemini.ok) problems.push('Gemini unavailable, keyword rules used');

  const shortAct = async (body, msg) => {
    setShortBusy(true);
    try { setShort(await api('shortlist', { ...body, week })); if (msg) toast(msg); } catch (e) { toast(e.message); } finally { setShortBusy(false); }
  };
  const addShort = (id) => shortAct({ op: 'add', id }, 'Added to the sprint shortlist');
  const dismiss = (id) => { const next = [...dismissed, id]; saveDismissed(next); setOpen(null); toast('Hidden from this brief', () => saveDismissed(next.filter((x) => x !== id))); };
  const focusRow = (id) => { setView('trends'); setCat('all'); setMode('exploratory'); setShowHidden(true); setOpen(id); setTimeout(() => document.getElementById(`row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120); };
  const toggleSrc = (s) => setSrcSel((ss) => (ss.includes(s) ? ss.filter((x) => x !== s) : [...ss, s]));
  const clearFilters = () => { setCat('all'); setSrcSel(SOURCES); setMode('balanced'); };
  const reset = () => {
    const snap = { week, cmp, sort, cat, srcSel, mode, showHidden, view };
    clearFilters(); setCmp('wow'); setSort('priority'); setOpen(null); setShowHidden(false); setView('brief');
    if (data && week !== data.latest) setWeek(data.latest);
    toast('View reset to the latest brief. Your watchlist, votes and hidden items are kept.', () => { setCmp(snap.cmp); setSort(snap.sort); setCat(snap.cat); setSrcSel(snap.srcSel); setMode(snap.mode); setShowHidden(snap.showHidden); setView(snap.view); if (snap.week !== week) setWeek(snap.week); });
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
    setRunning(true); setStep(0); setStepNote(''); window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const r = await api('run', {});
      const failedNow = r.failedSources || [];
      setStepNote(`${r.kept} relevant threads from ${r.fetched} fetched${failedNow.length ? ` · ${failedNow.map((f) => SOURCE_NAMES[f]).join(', ')} not responding` : ''}`);
      setStep(1);
      const { total } = await labelLoop();
      setStep(2); setStepNote('');
      await loadBrief(data?.latest || undefined);
      setStep(3); setStepNote('');
      const sum = await api('summarize', {}).catch((e) => ({ error: e.message }));
      const d = await loadBrief(data?.latest || undefined);
      await Promise.all([loadTerms(), d && loadShort(d.week), api('health').then(setHealthInfo).catch(() => {})]);
      setStep(4);
      toast(`Brief updated · ${r.inserted} new threads · ${total} labelled${r.backfilledTerms?.length ? ` · ${r.backfilledTerms.length} new term${r.backfilledTerms.length > 1 ? 's' : ''} back-filled 8 weeks` : ''}${sum.error ? ' · summaries failed' : ''}${failedNow.length ? ` · ${failedNow.length} source${failedNow.length > 1 ? 's' : ''} down` : ''}`);
    } catch (e) {
      toast(e.status === 409 ? e.message : `Run stopped: ${e.message}`);
    } finally { setRunning(false); }
  };
  const [summarizing, setSummarizing] = useState(false);
  const summarize = async () => {
    setSummarizing(true);
    try { const r = await api('summarize', { week }); await loadBrief(week); toast(r.error ? `Summary failed: ${r.error}` : `AI summaries written for ${r.written} pain point${r.written === 1 ? '' : 's'}`); }
    catch (e) { toast(`Summary failed: ${e.message}`); } finally { setSummarizing(false); }
  };
  const continueLabelling = async () => {
    setRunning(true); setStep(1); setStepNote('');
    try { await labelLoop(); setStep(2); await loadBrief(week); toast('Labelling finished'); }
    catch (e) { toast(`Labelling stopped: ${e.message}`); } finally { setRunning(false); }
  };

  const empty = data && data.totalThreads === 0;
  const weekLabel = week ? range(week) : '';
  return (
    <div className="min-h-screen">
      <TopNav view={view} setView={setView} data={data} week={week} setWeek={setWeek} running={running} onRun={run} onReset={reset} problems={problems} />
      <main className="mx-auto grid max-w-[1280px] gap-5 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {view === 'brief' && <Eyebrow>Friday Morning Brief{week ? ` · complete week ${weekLabel}` : ''}</Eyebrow>}
            <h1 className="mt-1 font-display text-[28px] font-bold leading-tight sm:text-[36px]">{view === 'brief' ? 'What developers are struggling with right now' : VIEWS.find(([k]) => k === view)[1]}</h1>
            <p className="mt-1 max-w-[80ch] text-muted">
              {loadError ? 'The brief could not be loaded.' : !data ? 'Loading your latest brief: fetching the most recent report from the database…'
                : data.totalThreads === 0 ? 'No report yet. Run the first brief to collect eight weeks of history.'
                : `${data.corpus[7]} threads analysed from ${SOURCES.length - failed.length} of ${SOURCES.length} communities · data collected ${data.lastRun ? ist(data.lastRun.startedAt) : '–'}${aiAt ? ` · AI summaries written ${ist(aiAt)}` : ''}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <button onClick={() => setView('system')} className="press inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 hover:border-line-strong">
              <span className={`h-2 w-2 rounded-full ${!checked ? 'bg-line-strong' : problems.length ? 'bg-orange' : 'bg-ok'}`} aria-hidden="true" />{!checked ? 'Checking sources…' : problems.length ? problems[0] : 'All sources and services working'}
            </button>
            <span className="text-muted">{data?.lastRun ? `Last run ${ist(data.lastRun.startedAt)}` : data ? 'No runs yet' : ''}</span>
          </div>
        </div>

        {running && <RunTracker step={step} note={stepNote} />}
        {!running && data?.unlabelled > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-ctl border border-warn/60 bg-warn-soft px-4 py-2.5 text-[13px]">
            <span>{data.unlabelled} threads are still waiting for Gemini to label them, so counts may be low.</span>
            <Btn size="sm" kind="secondary" onClick={continueLabelling}>Finish labelling</Btn>
          </div>
        )}
        {loadError && (
          <div className="card flex flex-wrap items-center justify-between gap-3 border-warn/60 p-4 text-[13.5px]">
            <span><b>The brief couldn't load.</b> {loadError}</span>
            <Btn size="sm" onClick={() => loadBrief(week)}>Try again</Btn>
          </div>
        )}
        {!data && !loadError && <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="card h-[220px] animate-pulse" />)}</div>}

        {empty && view !== 'watchlist' && view !== 'system' && <FirstRun onRun={run} running={running} />}

        {data && !empty && view === 'brief' && (<>
          <ExecSummary rows={topPool} data={data} failed={failed} />
          <KeyFindings rows={topPool} onEvidence={focusRow} />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <TopCalls rows={topPool} mode={mode} setMode={setMode} shortIds={shortIds} addShort={addShort} openDraft={(ids) => setDraft({ ids })} focusRow={focusRow} onSummarize={summarize} summarizing={summarizing} />
            <Shortlist items={short.items} titles={titles} viewer={viewer} setViewer={setViewer} act={shortAct} busy={shortBusy} openDraft={(ids, pack) => setDraft({ ids, pack })} />
          </div>
          <Hero top={heroTop} data={{ ...data, pains: base.map((r) => ({ ...r.p, s: r.p.s })) }} failed={failed} weekLabel={weekLabel} onEvidence={focusRow} />
          <section className="grid gap-2">
            <Eyebrow>Evidence base for this week</Eyebrow>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Threads checked', data.corpus[7].toLocaleString('en-IN'), data.corpus[6] ? `${data.corpus[7] - data.corpus[6] >= 0 ? '+' : ''}${data.corpus[7] - data.corpus[6]} vs last week` : 'this week'],
                ['Real pain threads', data.counts.pain.toLocaleString('en-IN'), data.counts.rules ? `${data.counts.rules} labelled by keyword rules` : 'kept after Gemini filtering'],
                ['Filtered as noise', data.counts.noise.toLocaleString('en-IN'), 'how-to questions, user error'],
                ['Communities covered', `${SOURCES.length - failed.length} of ${SOURCES.length}`, failed.length ? `${failed.map((f) => SOURCE_NAMES[f]).join(', ')} unavailable` : 'all responded'],
              ].map(([l, v, n]) => (
                <div key={l} className="rounded-ctl border border-line bg-surface p-3.5"><div className="text-[12px] text-muted">{l}</div><div className="mt-0.5 font-display text-[22px] font-semibold leading-tight tnum">{v}</div><div className="text-[11.5px] text-faint">{n}</div></div>
              ))}
            </div>
            <p className="text-[11.5px] text-faint">How we count: a thread is one discussion, counted once however many comments it has; cross-posts are merged. Weeks run Friday to Thursday (IST) and only complete weeks are compared.</p>
          </section>
        </>)}

        {data && !empty && view === 'trends' && (<>
          <TrendChart rows={topPool} weeks={data.weeks} />
          <Leaderboard rows={rows} total={data.pains.length} failed={failed} extraIfLooser={extraIfLooser} mode={mode} setMode={setMode} cat={cat} setCat={setCat} srcSel={srcSel} toggleSrc={toggleSrc} sort={sort} setSort={setSort} cmp={cmp} setCmp={setCmp} open={open} setOpen={setOpen} clearFilters={clearFilters} shortIds={shortIds} addShort={addShort} openDraft={(ids) => setDraft({ ids })} dismiss={dismiss} hiddenCount={dismissed.length} showHidden={showHidden} setShowHidden={setShowHidden} weeks={data.weeks} />
        </>)}

        {view === 'watchlist' && <Watchlist terms={terms} termsError={termsError} reload={loadTerms} toast={toast} candidates={data?.candidates} />}
        {view === 'system' && <SystemView data={data} healthInfo={healthInfo} />}

        <footer className="flex flex-wrap items-center justify-between gap-2 pb-6 pt-2 font-mono text-[11px] text-faint">
          <span>Labels by Gemini Flash · counts by Neon Postgres · live sources: Hacker News, Stack Overflow, GitHub Issues, Reddit</span>
          <span>Pulse for Sumit's sprint planning</span>
        </footer>
      </main>
      {draft && week && <DraftPanel draft={draft} week={week} onClose={() => setDraft(null)} toast={toast} />}
      {toastMsg && (
        <div className="rise fixed left-1/2 z-40 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-ctl border border-line-strong bg-surface-2 px-4 py-2.5 text-[13px] text-ink shadow-[var(--shadow-float)]" style={{ bottom: 'calc(16px + env(safe-area-inset-bottom,0px))' }} role="status">
          {toastMsg}{undo && <button onClick={() => { undo(); setToastMsg(null); }} className="font-medium text-orange-ink underline underline-offset-2">Undo</button>}
        </div>
      )}
    </div>
  );
}
