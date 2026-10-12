'use client';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { CATS, REL, SOURCES, SOURCE_NAMES, MODES, stats, priority, suggest, ambiguity, guessCat } from '../lib/painpoints';
import { FlowChart } from './visuals';
import { SRC, CAT_STYLE, TREND, healthTone, Glyph, PanelLabel, StatusDot, Tabs, Capsule, ThinDonut, Ring, DotMeter, Spark, Segments, Tile, Scatter, Sankey, Heatmap } from './instruments';

/* ── constants ── */
const PEOPLE = { sumit: { name: 'Sumit', role: 'PM · decides' }, neha: { name: 'Neha', role: 'Eng lead' }, kabir: { name: 'Kabir', role: 'Sales lead' } };
const SERIES_COLORS = ['#F4A53F', '#F0767A', '#8E98FF', '#C9CDF5'];
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
const ago = (ts) => { const h = (Date.now() - new Date(ts).getTime()) / 36e5; return h < 1 ? `${Math.max(1, Math.round(h * 60))}m ago` : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`; };
const sum = (a) => a.reduce((x, y) => x + y, 0);
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
/* next scheduled run: Friday 06:00 IST = Friday 00:30 UTC */
function nextRun(now = new Date()) {
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 30));
  t.setUTCDate(t.getUTCDate() + ((5 - t.getUTCDay() + 7) % 7));
  if (t <= now) t.setUTCDate(t.getUTCDate() + 7);
  const ms = t - now; const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5);
  return { at: t, left: `${d}d ${h}h`, frac: 1 - ms / (7 * 864e5) };
}

/* ── atoms ── */
const TrendPill = ({ label }) => { const t = TREND[label]; return <span className="inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[11px] font-medium" style={{ background: t.soft, color: t.ink }}><span aria-hidden="true" className="text-[8px]">{t.glyph}</span>{t.word}</span>; };
const FewVoices = ({ n }) => <span className="inline-flex h-6 items-center rounded-full border border-dashed border-warn/60 px-2.5 text-[11px] text-warn" title={`${n} developer(s). Not enough to call a trend.`}>Too few voices</span>;
/* topic pill: glyph + label in the topic colour on a 12% fill, fixed width, never truncated */
const TopicPill = ({ cat, compact }) => { const t = CAT_STYLE[cat] || CAT_STYLE.flow; return <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11px] font-medium ${compact ? '' : 'min-w-[148px]'}`} style={{ color: t.c2, background: `color-mix(in srgb, ${t.c} 16%, transparent)` }}><Glyph kind={t.glyph} color={t.c2} size={10} />{CATS[cat]}</span>; };
const SrcDot = ({ s, size = 8 }) => <i className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: `linear-gradient(135deg, ${SRC[s].c}, ${SRC[s].c2})` }} aria-hidden="true" />;
function RelTag({ rel }) {
  const cls = rel === 'core' ? 'border-ink/50 text-ink' : rel === 'adjacent' ? 'border-line-strong text-muted' : 'border-line text-faint';
  return <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[10.5px] ${cls}`}>{(REL[rel] || REL.adjacent).label}</span>;
}
/* buttons: primary = gradient filled pill · ghost = outline pill · danger = red outline that fills on hover */
function Btn({ children, onClick, kind = 'ghost', disabled, title, type = 'button', size = 'md' }) {
  const k = kind === 'primary' ? 'bg-[linear-gradient(90deg,#A31B20,#DF7E0A)] text-white font-semibold'
    : kind === 'secondary' ? 'border-[1.5px] border-ok/60 bg-ok-soft text-ok'
    : kind === 'blue' ? 'bg-[linear-gradient(90deg,#0A1686,#4A57E6)] text-white font-semibold'
    : kind === 'danger' ? 'border-[1.5px] border-alert/60 text-alert-ink hover:bg-alert hover:text-[#0A0A14]'
    : 'border-[1.5px] border-line-strong text-ink hover:border-muted';
  const s = size === 'sm' ? 'h-7 px-3 text-[11.5px]' : size === 'lg' ? 'h-11 px-5 text-[13.5px]' : 'h-9 px-4 text-[12.5px]';
  return <button type={type} title={title} disabled={disabled} onClick={onClick} className={`press inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium ${s} ${k} disabled:cursor-not-allowed disabled:opacity-40`}>{children}</button>;
}
const Def = ({ t, d }) => <div><dt className="inline font-medium text-ink">{t}: </dt><dd className="inline text-muted">{d}</dd></div>;
const Eyebrow = ({ children }) => <div className="font-mono text-[11px] uppercase tracking-[.12em] text-muted">{children}</div>;
const Logo = () => (
  <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
    <rect width="32" height="32" rx="9.5" fill="#A31B20" />
    <path d="M5 18h5l3-7 4 12 3-8 2 3h5" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Orbs = ({ colors = ['#A31B20', '#0A1686'] }) => (
  <div className="orbs" aria-hidden="true">
    <i style={{ width: 420, height: 420, left: '-6%', top: -260, background: colors[0] }} />
    {colors[1] && <i style={{ width: 360, height: 360, right: '4%', top: -220, background: colors[1] }} />}
  </div>
);
const seg = (on) => `press h-7 whitespace-nowrap rounded-full px-3 text-[11.5px] ${on ? 'bg-surface-2 text-ink ring-1 ring-line-strong' : 'text-muted hover:text-ink'}`;
const chip = (on) => `press inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-3 text-[11.5px] ${on ? 'border-ink/70 bg-surface-2 text-ink' : 'border-line text-muted hover:text-ink'}`;

/* every section: numbered label above, content in the card below */
const Panel = ({ n, title, right, children, className = '', body = 'p-6' }) => (
  <section className={`grid min-w-0 content-start gap-3 ${className}`}>
    <PanelLabel n={n} right={right}>{title}</PanelLabel>
    <div className={`card min-w-0 ${body}`}>{children}</div>
  </section>
);

/* platforms: the four we read, plus the ones not connected yet */
const PLATFORM_NAMES = { ...SOURCE_NAMES, discord: 'Discord', x: 'X (Twitter)' };
const OFF_WHY = {
  reddit: 'Needs a Reddit API app: add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in Vercel',
  discord: 'Needs a Discord bot added to each server you want to read',
  x: 'Needs a paid X API plan',
};
function platformStates(data, healthInfo) {
  const st = data?.lastRun?.stats?.sources || {};
  const failed = data?.lastRun?.stats?.failedSources || [];
  const out = SOURCES.map((s) => {
    const off = s === 'reddit' && (st.reddit?.connected === false || (healthInfo?.reddit && !healthInfo.reddit.connected && !(st.reddit?.ok > 0)));
    const state = off ? 'off' : failed.includes(s) ? 'down' : st[s] ? 'live' : 'idle';
    return { id: s, name: PLATFORM_NAMES[s], state, why: off ? OFF_WHY[s] : state === 'down' ? `Did not respond in the last run (${st[s]?.error || 'error'})` : st[s] ? `${st[s].fetched} threads fetched in the last run` : 'Not run yet' };
  });
  return [...out, { id: 'discord', name: 'Discord', state: 'off', why: OFF_WHY.discord }, { id: 'x', name: 'X (Twitter)', state: 'off', why: OFF_WHY.x }];
}
const P_STATE = { live: { c: 'var(--ok)', w: 'live' }, down: { c: 'var(--alert)', w: 'not responding' }, off: { c: 'var(--faint)', w: 'not connected' }, idle: { c: 'var(--faint)', w: 'not run yet' } };
function PlatformStrip({ platforms }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]" aria-label="Platforms">
      <span className="font-mono text-[10.5px] uppercase tracking-[.12em] text-faint">Platforms</span>
      {platforms.map((p) => (
        <span key={p.id} className="inline-flex items-center gap-1.5" title={p.why}>
          <i className="h-2 w-2 rounded-full" style={p.state === 'off' || p.state === 'idle' ? { border: '1.5px solid var(--faint)' } : { background: P_STATE[p.state].c }} aria-hidden="true" />
          <span className={p.state === 'live' ? 'text-ink' : p.state === 'down' ? 'text-alert-ink' : 'text-faint'}>{p.name}</span>
          {p.state !== 'live' && <span className="text-faint">· {P_STATE[p.state].w}</span>}
        </span>
      ))}
    </div>
  );
}

/* ── navigation ── */
function TopNav({ view, setView, data, week, setWeek, running, onRun, onReset, problems, checked }) {
  const weekOpts = data ? [...data.weeks].reverse().slice(0, 4) : [];
  const status = !checked ? { c: 'var(--faint)', w: 'Checking' } : problems.length ? { c: 'var(--alert)', w: `${problems.length} issue${problems.length > 1 ? 's' : ''}` } : { c: 'var(--ok)', w: 'Live' };
  return (
    <header className="relative z-20 border-b border-line bg-bg/80 backdrop-blur-md sm:sticky" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div className="leading-tight"><div className="text-[15px] font-semibold">Pulse</div><div className="font-mono text-[10px] uppercase tracking-[.12em] text-faint">Developer community brief</div></div>
        </div>
        <nav aria-label="Sections" className="order-3 flex w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1 sm:order-none sm:w-auto">
          {VIEWS.map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} aria-current={view === k ? 'page' : undefined}
              className={`press h-8 whitespace-nowrap rounded-full px-4 text-[12.5px] font-medium ${view === k ? 'bg-surface-2 text-ink ring-1 ring-line-strong' : 'text-muted hover:text-ink'}`}>
              {l}{k === 'system' && problems.length > 0 && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-alert align-middle" aria-label="needs attention" />}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button onClick={() => setView('system')} className="press inline-flex h-9 items-center rounded-full border border-line bg-surface px-3" title={problems.length ? problems.join(' · ') : 'All sources and services working'}>
            <StatusDot color={status.c} word={status.w} live={checked && !problems.length} />
          </button>
          {weekOpts.length > 0 && (
            <>
              <label htmlFor="week" className="sr-only">Brief week</label>
              <select id="week" value={week || ''} onChange={(e) => setWeek(e.target.value)} className="h-9 rounded-full border-[1.5px] border-line-strong bg-transparent px-3.5 font-mono text-[11.5px] text-ink">
                {weekOpts.map((w, i) => <option key={w} value={w} className="bg-surface">{range(w)}{w === data.latest && i === 0 ? ' · latest' : ''}</option>)}
              </select>
            </>
          )}
          <Btn onClick={onReset} title="Clears filters and returns to the latest brief. Topics, keywords, votes and hidden items are kept.">Reset filters</Btn>
          <Btn kind="primary" onClick={onRun} disabled={running}>
            {running ? <><span className="spin inline-block h-3 w-3 rounded-full border-2 border-[#0A0A14]/30 border-t-[#0A0A14]" aria-hidden="true" />Running</> : 'Run brief now'}
          </Btn>
        </div>
      </div>
    </header>
  );
}

/* ── agent status card while a run is in progress ── */
function RunTracker({ step, note }) {
  return (
    <section className="card rise grid gap-4 p-5 md:grid-cols-[280px_1fr]" aria-live="polite" aria-label="Run progress">
      <div className="grid content-start gap-2">
        <PanelLabel>Agent status</PanelLabel>
        <StatusDot color="var(--alert)" word={step >= 4 ? 'Done' : 'Thinking…'} live={step < 4} />
        <div className="font-mono text-[12px] text-muted">step {Math.min(step + 1, 4)}/4 · sources {SOURCES.length} · model gemini flash</div>
        {note && <div className="font-mono text-[11.5px] text-ink">{note}</div>}
      </div>
      <ol className="grid gap-2 sm:grid-cols-4">
        {STEPS.map(([k, d], i) => (
          <li key={k} className={`rounded-[12px] border p-3 ${i === step ? 'border-alert/50' : 'border-line'} bg-surface-2`}>
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.1em]">
              <span className={`h-1.5 w-1.5 rounded-full ${i < step ? 'bg-ok' : i === step ? 'dot-live bg-alert text-alert' : 'bg-track'}`} aria-hidden="true" />
              <span className={i <= step ? 'text-ink' : 'text-faint'}>{String(i + 1).padStart(2, '0')} {k}</span>
            </div>
            <div className="mt-1 text-[11.5px] text-muted">{d}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ── evidence helpers ── */
const diffText = (st) => { const d = st.cur - st.prev; return `${d > 0 ? '+' : ''}${d} vs last week (${st.prev} → ${st.cur})`; };
function confidence(p, st) {
  if (st.cur === 0) return { label: 'No data', c: 'var(--steady)', why: 'No threads this week.' };
  if (p.voices >= 8 && p.communities >= 2) return { label: 'High confidence', c: 'var(--ok)', why: `${p.voices} developers across ${p.communities} communities.` };
  if (p.voices >= 3) return { label: 'Medium confidence', c: 'var(--cool)', why: `${p.voices} developers${p.communities < 2 ? ', one community only' : ` across ${p.communities} communities`}.` };
  return { label: 'Low confidence', c: 'var(--warn)', why: `Only ${p.voices} developer${p.voices === 1 ? '' : 's'} this week. Treat as an early signal.` };
}
const AiTag = ({ children }) => <span className="inline-flex h-5 items-center rounded-full border border-line-strong px-2 font-mono text-[9.5px] uppercase tracking-[.08em] text-muted">✦ {children}</span>;
const Layer = ({ k, tag, children }) => (
  <div className="grid gap-1">
    <div className="flex flex-wrap items-center gap-1.5"><span className="font-mono text-[10px] uppercase tracking-[.12em] text-faint">{k}</span>{tag && <AiTag>{tag}</AiTag>}</div>
    <div className="text-[12.5px] leading-relaxed text-ink">{children}</div>
  </div>
);

/* ── key findings (deterministic, from counts) ── */
function findings(rows) {
  const live = rows.filter((r) => r.st.cur > 0);
  const used = new Set();
  const pick = (list) => { const r = list.find((x) => !used.has(x.p.id)) || null; if (r) used.add(r.p.id); return r; };
  const loud = pick([...live].sort((a, b) => b.st.cur - a.st.cur));
  const rising = pick([...live].filter((r) => r.p.voices >= 2 && r.st.cur - r.st.prev > 0).sort((a, b) => b.st.z - a.st.z));
  const unsolved = pick([...live].filter((r) => r.st.cur >= 2).sort((a, b) => b.p.unresolved - a.p.unresolved || b.st.cur - a.st.cur));
  const fresh = pick([...live].filter((r) => r.st.mean === 0).sort((a, b) => b.st.cur - a.st.cur));
  return { loud, rising, unsolved, fresh };
}

/* ── KPI tile row: four numbers, each with a plain-language title ── */
function KpiRow({ rows, data }) {
  const c7 = data.corpus[7], c6 = data.corpus[6];
  const rising = rows.filter((r) => r.st.label === 'Spike' || r.st.label === 'Climbing');
  const spikes = rows.filter((r) => r.st.label === 'Spike').length;
  const curTot = sum(rows.map((r) => r.st.cur));
  const unsolved = curTot ? Math.round(sum(rows.map((r) => r.p.unresolved * r.st.cur)) / curTot) : 0;
  const share = c7 ? Math.round((data.counts.pain / c7) * 100) : 0;
  const d = c7 - c6;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile label="Threads read this week" value={c7.toLocaleString('en-IN')} unit="threads" tint="var(--cool)"
        delta={c6 ? { t: `${d >= 0 ? '+' : ''}${d} vs last week`, c: 'var(--muted)' } : null}
        note="Every discussion that mentioned a tracked keyword."
        viz={<Spark values={data.corpus} color="var(--cool)" w={220} h={30} />} />
      <Tile label="Genuine complaints" value={data.counts.pain} unit={`of ${c7}`} tint="var(--brand-orange)"
        note={`${share}% describe a real problem. The rest were how-to questions or off-topic.`}
        viz={<Capsule value={share} max={100} c="#DF7E0A" c2="#F4A53F" h={14} label={`${share}% of threads are genuine complaints`} />} />
      <Tile label="Problems getting worse" value={rising.length} unit={`of ${rows.length} tracked`} tint="var(--alert)"
        note={rising.length ? `${spikes} spiking well above normal, ${rising.length - spikes} climbing.` : 'Nothing is above its usual level this week.'}
        viz={<Segments n={rising.length} of={rows.length} color="var(--alert)" />} />
      <Tile label="Still unsolved" value={unsolved} unit="%" tint="#F0767A"
        note="Share of complaints with no accepted answer, fix or closed issue."
        viz={<Capsule value={unsolved} max={100} c="#A31B20" c2="#F0767A" h={14} label={`${unsolved}% of complaints unsolved`} />} />
    </div>
  );
}

function ExecSummary({ rows, data, failed, onEvidence }) {
  const f = findings(rows);
  const total = data.counts.pain;
  const parts = [];
  if (!total) parts.push('No genuine complaints were found this week.');
  else parts.push(`${total} of ${data.corpus[7]} threads this week are genuine complaints.`);
  if (f.loud) parts.push(`The biggest is "${f.loud.p.title}" with ${f.loud.st.cur} threads (${f.loud.st.prev} last week).`);
  if (f.rising && f.rising !== f.loud) parts.push(`"${f.rising.p.title}" is growing fastest.`);
  const caveats = [];
  if (failed.length) caveats.push(`${failed.map((x) => SOURCE_NAMES[x]).join(', ')} did not respond, so it is left out of every week`);
  if (total && total < 15) caveats.push('volumes are small, so treat changes as early signals');
  const facts = [
    ['Biggest', f.loud, (r) => `${r.st.cur} threads · ${r.p.voices} people`],
    ['Growing fastest', f.rising, (r) => `${r.st.prev} → ${r.st.cur} threads`],
    ['Least solved', f.unsolved, (r) => `${r.p.unresolved}% have no fix`],
    ['New this week', f.fresh, (r) => `${r.st.cur} threads, none before`],
  ];
  return (
    <Panel n={1} title="This week in brief" body="grid gap-5 p-6">
      <p className="max-w-[90ch] text-[15px] leading-relaxed">{parts.join(' ')}</p>
      {caveats.length > 0 && <StatusDot color="var(--warn)" word={`Note: ${caveats.join('; ')}`} />}
      <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2 xl:grid-cols-4">
        {facts.map(([k, r, m]) => (
          <div key={k} className="grid min-w-0 content-start gap-1.5">
            <div className="font-mono text-[10.5px] uppercase tracking-[.12em] text-faint">{k}</div>
            {r ? (<>
              <button onClick={() => onEvidence(r.p.id)} className="text-left text-[13.5px] font-semibold leading-snug hover:underline">{r.p.title}</button>
              <div className="font-mono text-[11.5px] text-muted">{m(r)}</div>
            </>) : <div className="text-[12.5px] text-faint">Nothing qualifies this week.</div>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ── act on these first: numbers → what developers say → next step ── */
function TopCalls({ rows, mode, setMode, shortItems, addShort, openDraft, focusRow, onSummarize, summarizing }) {
  const top = rows.filter((r) => r.p.rel !== 'outside' && r.st.cur >= MODES[mode].min && r.p.voices >= 2)
    .sort((a, b) => priority(b.p.rel, b.p.unresolved, b.st) - priority(a.p.rel, a.p.unresolved, a.st)).slice(0, 3);
  return (
    <section className="grid min-w-0 content-start gap-3">
      <PanelLabel n={4} right={<span className="hidden text-[11.5px] text-faint sm:inline">Ranked by size, growth, how unsolved, and fit with our product</span>}>Act on these first</PanelLabel>
      {top.length === 0 && (
        <div className="card p-5 text-[13px] text-muted">Nothing meets the "{MODES[mode].label}" evidence level this week.{' '}
          {mode !== 'exploratory' && <button onClick={() => setMode('exploratory')} className="text-link underline underline-offset-2">Show early signals</button>}
        </div>
      )}
      <div className="grid gap-4">
        {top.map(({ p, st }, i) => {
          const sl = shortItems.find((x) => x.id === p.id);
          const votes = sl ? Object.values(sl.votes || {}) : [];
          const c = confidence(p, st);
          const ins = p.insight;
          const t = TREND[st.label];
          return (
            <article key={p.id} className="card lift rise grid min-w-0 gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]" style={{ animationDelay: `${i * 70}ms`, boxShadow: `inset 3px 0 0 ${t.c}` }}>
              {/* left: what happened */}
              <div className="grid content-start gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[22px] font-semibold leading-none text-faint">{String(i + 1).padStart(2, '0')}</span>
                  <TrendPill label={st.label} />
                  <TopicPill cat={p.cat} compact />
                </div>
                <h3 className="text-[17px] font-semibold leading-snug">{p.title}</h3>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="flex items-baseline gap-1.5"><b className="font-mono text-[40px] font-semibold leading-none">{st.cur}</b><span className="text-[12px] text-faint">threads this week</span></div>
                    <div className="mt-1 font-mono text-[12px]" style={{ color: t.ink }}>{st.cur - st.prev > 0 ? '+' : ''}{st.cur - st.prev} vs last week ({st.prev})</div>
                  </div>
                  <Spark values={p.s} color={t.c} w={120} h={40} />
                </div>
                <div className="grid grid-cols-3 border-t border-line pt-2 text-[11px]">
                  {[['People', p.voices], ['Platforms', p.communities], ['Unsolved', `${p.unresolved}%`]].map(([k, v], j) => <div key={k} className={j ? 'border-l border-line pl-3' : ''}><div className="text-faint">{k}</div><div className="font-mono text-[13px] text-ink">{v}</div></div>)}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span title={c.why}><StatusDot color={c.c} word={c.label} /></span>
                  {sl && <span className="font-mono text-[11px] text-muted">Team vote 👍 {votes.filter((v) => v === 'up').length} · 👎 {votes.filter((v) => v === 'down').length}{sl.decision === 'in' ? ' · in sprint' : sl.decision === 'later' ? ' · parked' : ''}</span>}
                </div>
              </div>
              {/* right: what developers say (AI) */}
              <div className="grid content-start gap-3 rounded-[12px] border border-line bg-surface-2 p-4">
                {ins ? (<>
                  <AiTag>Gemini summary of {ins.threads_used} threads</AiTag>
                  {[['Developers say', ins.summary], ['Missing today', ins.gap], ['Try next', ins.next_step]].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="grid gap-0.5 border-l-2 border-line-strong pl-3">
                      <div className="font-mono text-[10px] uppercase tracking-[.12em] text-faint">{k}</div>
                      <div className="text-[13px] leading-relaxed text-ink">{v}</div>
                    </div>
                  ))}
                </>) : (
                  <div className="text-[12.5px] text-muted">No summary yet. <button disabled={summarizing} onClick={onSummarize} className="text-link underline underline-offset-2 disabled:opacity-50">{summarizing ? 'Writing…' : 'Summarise the threads'}</button></div>
                )}
                <details className="text-[12px]">
                  <summary className="cursor-pointer text-muted">Team notes <span className="text-faint">(written by us, not from this week's data)</span></summary>
                  <dl className="mt-1.5 grid gap-1"><Def t="Hits hardest" d={p.suits} /><Def t="Less relevant for" d={p.notFor} /><Def t="Our angle" d={p.angle} /></dl>
                </details>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Btn size="sm" kind={sl ? 'secondary' : 'primary'} onClick={() => addShort(p.id)} disabled={!!sl}>{sl ? 'In team vote ✓' : 'Put to team vote'}</Btn>
                  <Btn size="sm" onClick={() => openDraft([p.id])}>Draft sprint brief</Btn>
                  <Btn size="sm" onClick={() => focusRow(p.id)}>Read the threads</Btn>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ── team vote: everyone sees the tally; Sumit makes the call ── */
function Shortlist({ items, titles, viewer, setViewer, act, openDraft, busy }) {
  const isOrg = viewer === 'sumit';
  const tally = (x) => { const v = Object.values(x.votes || {}); return { up: v.filter((y) => y === 'up').length, down: v.filter((y) => y === 'down').length }; };
  const ranked = [...items].sort((a, b) => (tally(b).up - tally(b).down) - (tally(a).up - tally(a).down));
  const fav = ranked.find((x) => tally(x).up - tally(x).down > 0);
  const inSprint = items.filter((x) => x.decision === 'in');
  const awaiting = items.filter((x) => !x.decision).length;
  return (
    <Panel n={5} title="Team vote" body="grid content-start gap-4 p-5">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['In sprint', inSprint.length, 'var(--ok)'], ['Awaiting Sumit', awaiting, 'var(--warn)'], ['Parked', items.filter((x) => x.decision === 'later').length, 'var(--faint)']].map(([k, v, c]) => (
          <div key={k} className="rounded-[12px] border border-line bg-surface-2 py-2"><div className="font-mono text-[24px] font-semibold leading-none" style={{ color: v ? c : 'var(--faint)' }}>{v}</div><div className="mt-1 text-[10.5px] text-faint">{k}</div></div>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[12px] text-muted">Voting as
        <select value={viewer} onChange={(e) => setViewer(e.target.value)} className="h-8 rounded-full border-[1.5px] border-line-strong bg-transparent px-3 text-[12px] text-ink">
          {Object.entries(PEOPLE).map(([k, v]) => <option key={k} value={k} className="bg-surface">{v.name} ({v.role})</option>)}
        </select>
      </label>
      {items.length === 0 && <p className="rounded-[12px] border border-dashed border-line p-3 text-[12.5px] text-muted">Nothing up for a vote yet. Use "Put to team vote" on any problem.</p>}
      <ul className="grid gap-2">
        {ranked.map((x) => {
          const { up, down } = tally(x); const mine = x.votes?.[viewer];
          const waiting = Object.keys(PEOPLE).filter((k) => !x.votes?.[k]).map((k) => PEOPLE[k].name);
          const status = x.decision === 'in' ? { w: 'In sprint', c: 'var(--ok)' } : x.decision === 'later' ? { w: 'Parked', c: 'var(--faint)' } : { w: 'Awaiting Sumit', c: 'var(--warn)' };
          return (
            <li key={x.id} className={`grid gap-2 rounded-[12px] border bg-surface-2 p-3 ${x.decision === 'later' ? 'opacity-70' : ''}`} style={{ borderColor: x.decision === 'in' ? 'var(--ok)' : 'var(--line)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-[13px] font-medium leading-snug">{titles[x.id] || x.id}{fav?.id === x.id && <span className="ml-1.5 align-middle font-mono text-[10px] uppercase tracking-[.08em] text-warn">team favourite</span>}</div>
                {isOrg && <button disabled={busy} onClick={() => act({ op: 'remove', id: x.id }, 'Removed from the vote')} className="press rounded-full px-1.5 text-[12px] text-muted hover:text-ink" aria-label={`Remove ${titles[x.id]} from the vote`}>✕</button>}
              </div>
              {/* tally, visible to everyone */}
              <div className="flex items-center gap-2">
                <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-track" aria-label={`${up} for, ${down} against`}>
                  <i style={{ width: `${(up / 3) * 100}%`, background: 'var(--ok)' }} /><i style={{ width: `${(down / 3) * 100}%`, background: 'var(--alert)' }} />
                </div>
                <span className="font-mono text-[11px] text-muted">👍 {up} · 👎 {down}</span>
              </div>
              <div className="flex flex-wrap gap-1 text-[11px]">
                {Object.keys(PEOPLE).map((k) => <span key={k} className={`rounded-full border px-2 py-[1px] ${x.votes?.[k] ? 'border-line-strong text-ink' : 'border-dashed border-line text-faint'}`}>{PEOPLE[k].name} {x.votes?.[k] === 'up' ? '👍' : x.votes?.[k] === 'down' ? '👎' : '·'}</span>)}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {['up', 'down'].map((v) => (
                  <button key={v} disabled={busy} onClick={() => act({ op: 'vote', id: x.id, voter: viewer, vote: mine === v ? null : v })} aria-pressed={mine === v} aria-label={v === 'up' ? 'Vote for' : 'Vote against'}
                    className={`press h-7 rounded-full border-[1.5px] px-2.5 text-[12.5px] ${mine === v ? 'border-ink/70 bg-surface' : 'border-line'}`}>{v === 'up' ? '👍' : '👎'}</button>
                ))}
                <StatusDot color={status.c} word={status.w} />
                {!x.decision && waiting.length > 0 && <span className="text-[11px] text-faint">waiting on {waiting.join(', ')}</span>}
              </div>
              {isOrg && (
                <div className="flex flex-wrap gap-2 border-t border-line pt-2">
                  <Btn size="sm" disabled={busy} kind={x.decision === 'in' ? 'secondary' : 'ghost'} onClick={() => act({ op: 'decide', id: x.id, voter: 'sumit', decision: x.decision === 'in' ? null : 'in' })}>{x.decision === 'in' ? 'In sprint ✓' : 'Put in sprint'}</Btn>
                  <Btn size="sm" disabled={busy} onClick={() => act({ op: 'decide', id: x.id, voter: 'sumit', decision: x.decision === 'later' ? null : 'later' })}>{x.decision === 'later' ? 'Parked' : 'Park'}</Btn>
                  <Btn size="sm" onClick={() => openDraft([x.id])}>Sprint brief</Btn>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {isOrg ? (inSprint.length > 0
        ? <Btn kind="primary" onClick={() => openDraft(inSprint.map((x) => x.id), true)}>Open Monday pack ({inSprint.length})</Btn>
        : items.length > 0 && <p className="text-[12px] text-muted">Votes guide your call. Put at least one item in the sprint to build the Monday pack.</p>)
        : <p className="text-[12px] text-muted">Sumit sees the same tally and makes the final call.</p>}
    </Panel>
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
    <div className="fixed inset-0 z-30 flex justify-end bg-black/60 backdrop-blur-[2px]" onClick={onClose}>
      <div className="rise flex h-full w-full max-w-[620px] flex-col gap-4 overflow-y-auto border-l border-line bg-surface p-6" style={{ paddingTop: 'calc(24px + env(safe-area-inset-top,0px))' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Sprint brief draft">
        <div className="flex items-center justify-between gap-2">
          <div><PanelLabel>{draft.pack ? 'Monday pack' : 'Sprint brief'}</PanelLabel><h2 className="mt-1 text-[20px] font-semibold">{draft.pack ? 'Monday sprint pack' : 'Sprint brief draft'}</h2></div>
          <Btn size="sm" onClick={onClose}>Close</Btn>
        </div>
        {state.loading ? (
          <div className="grid gap-2" aria-live="polite">
            <StatusDot color="var(--alert)" word="Thinking… Gemini Flash is writing from this week's numbers" live />
            {[90, 70, 82, 60, 76].map((w, i) => <div key={i} className="h-3 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />)}
          </div>
        ) : state.error ? (
          <p className="rounded-[12px] border border-alert/50 bg-alert-soft p-3 text-[13px]">Couldn't build the draft: {state.error}</p>
        ) : (<>
          <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            <AiTag>{state.usedAI ? 'AI draft' : 'Template draft'}</AiTag>
            {state.usedAI ? 'Written by Gemini Flash using only the counts and links shown. Check it before sharing.' : `Gemini was unavailable${state.aiError ? ` (${state.aiError.slice(0, 80)})` : ''}, so this uses the standard template.`} Nothing is sent automatically.
          </p>
          <label htmlFor="brief-text" className="sr-only">Sprint brief text</label>
          <textarea id="brief-text" ref={ref} defaultValue={header + state.text} key={draft.ids.join() + week} className="min-h-[440px] w-full flex-1 rounded-[12px] border border-line bg-sunk p-4 font-mono text-[12.5px] leading-relaxed text-ink" />
          <div className="flex gap-2"><Btn kind="primary" onClick={copy}>Copy</Btn><Btn onClick={onClose}>Done</Btn></div>
        </>)}
      </div>
    </div>
  );
}

/* ── overview instruments ── */
function LoudestBars({ rows, onPick }) {
  const live = [...rows].filter((r) => r.st.cur > 0).sort((a, b) => b.st.cur - a.st.cur).slice(0, 7);
  const max = Math.max(4, ...live.map((r) => r.st.cur));
  return (
    <Panel n={2} title="Most talked-about problems" right={<span className="font-mono text-[10.5px] text-faint">threads this week</span>} body="grid content-start gap-4 p-6">
      {live.length ? (<>
        <ul className="grid gap-3">
          {live.map((r, i) => { const t = CAT_STYLE[r.p.cat]; const d = r.st.cur - r.st.prev; return (
            <li key={r.p.id} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => onPick(r.p.id)} className="flex min-w-0 items-center gap-2 text-left text-[13px] hover:underline"><Glyph kind={t.glyph} color={t.c2} size={11} /><span className="truncate">{r.p.title}</span></button>
                <span className="shrink-0 font-mono text-[11px]" style={{ color: TREND[r.st.label].ink }}>{TREND[r.st.label].glyph} {d > 0 ? '+' : ''}{d}</span>
              </div>
              <Capsule value={r.st.cur} max={max} c={t.c} c2={t.c2} delay={i * 60} label={`${r.p.title}: ${r.st.cur} threads`} />
            </li>
          ); })}
        </ul>
        <div className="flex flex-wrap gap-3 border-t border-line pt-3">{Object.keys(CATS).map((c) => <span key={c} className="inline-flex items-center gap-1.5 text-[11px] text-muted"><Glyph kind={CAT_STYLE[c].glyph} color={CAT_STYLE[c].c2} size={10} />{CATS[c]}</span>)}</div>
      </>) : <p className="text-[13px] text-muted">No complaints this week yet.</p>}
    </Panel>
  );
}

function ActScatter({ rows, onPick }) {
  const pts = rows.filter((r) => r.st.cur > 0 || r.st.mean > 0).map((r) => ({ id: r.p.id, label: r.p.title, x: r.st.cur, y: Math.max(-3, Math.min(5, r.st.z)), c: CAT_STYLE[r.p.cat].c2 }));
  const xm = Math.max(4, ...pts.map((q) => q.x));
  const hot = pts.filter((p) => p.y >= 1 && p.x >= Math.round(Math.ceil(xm * 1.12) / 2)).length;
  return (
    <Panel n={3} title="Spiking vs. normal" right={<span className="font-mono text-[10.5px] text-faint">click a dot</span>} body="grid content-start gap-3 p-6">
      <div className="flex flex-wrap items-baseline gap-2"><span className="font-mono text-[36px] font-semibold leading-none" style={{ color: hot ? 'var(--alert-ink)' : undefined }}>{hot}</span><span className="text-[13px] text-muted">{hot === 1 ? 'problem is' : 'problems are'} both big and unusual</span></div>
      <p className="text-[12px] text-faint">Further right = more threads. Higher = further above its usual weekly level.</p>
      {pts.length ? <Scatter points={pts} xLabel="Threads this week" yLabel="Above normal" onPick={onPick} /> : <p className="text-[13px] text-muted">No complaints in the last five weeks.</p>}
    </Panel>
  );
}

function TopicRings({ rows }) {
  const tot = sum(rows.map((r) => r.st.cur));
  const by = Object.keys(CATS).map((c) => ({ c, v: sum(rows.filter((r) => r.p.cat === c).map((r) => r.st.cur)) }));
  return (
    <Panel n={6} title="By topic" body="grid content-start gap-4 p-6">
      {tot ? (
        <div className="grid grid-cols-2 gap-4">
          {by.map(({ c, v }) => (
            <div key={c} className="grid justify-items-center gap-1">
              <Ring value={Math.round((v / tot) * 100)} c={CAT_STYLE[c].c} c2={CAT_STYLE[c].c2} size={84} stroke={10} />
              <span className="inline-flex items-center gap-1.5 text-center text-[11.5px] text-muted"><Glyph kind={CAT_STYLE[c].glyph} color={CAT_STYLE[c].c2} size={10} />{CATS[c]}</span>
              <span className="font-mono text-[10.5px] text-faint">{v} threads</span>
            </div>
          ))}
        </div>
      ) : <p className="text-[13px] text-muted">No complaints this week yet.</p>}
    </Panel>
  );
}

/* who is talking about what: one stacked bar per topic, split by platform */
function TalkMap({ rows, failed, platforms }) {
  const srcs = SOURCES.filter((s) => !failed.includes(s) && platforms.find((p) => p.id === s)?.state !== 'off');
  const data = Object.keys(CATS).map((c) => {
    const mine = rows.filter((r) => r.p.cat === c);
    const parts = srcs.map((s) => ({ s, v: sum(mine.map((r) => r.p.bySource[s]?.[7] || 0)) }));
    const spiking = mine.filter((r) => r.st.label === 'Spike' || r.st.label === 'Climbing').length;
    return { c, parts, total: sum(parts.map((x) => x.v)), spiking };
  }).sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <Panel n={8} title="Who is talking about what" right={<span className="font-mono text-[10.5px] text-faint">threads this week, by platform</span>} body="grid content-start gap-4 p-6">
      <ul className="grid gap-4">
        {data.map((d) => (
          <li key={d.c} className="grid gap-1.5 sm:grid-cols-[200px_1fr_120px] sm:items-center sm:gap-4">
            <span className="flex items-center gap-2 text-[13px]"><Glyph kind={CAT_STYLE[d.c].glyph} color={CAT_STYLE[d.c].c2} />{CATS[d.c]}</span>
            <div className="flex h-5 overflow-hidden rounded-full bg-track" role="img" aria-label={`${CATS[d.c]}: ${d.parts.map((x) => `${SOURCE_NAMES[x.s]} ${x.v}`).join(', ')}`}>
              {d.parts.filter((x) => x.v).map((x) => (
                <i key={x.s} className="grow-in block h-full first:rounded-l-full last:rounded-r-full" title={`${SOURCE_NAMES[x.s]}: ${x.v}`} style={{ width: `${(x.v / max) * 100}%`, background: `linear-gradient(90deg, ${SRC[x.s].c}, ${SRC[x.s].c2})`, boxShadow: 'inset -2px 0 0 var(--surface)' }} />
              ))}
            </div>
            <span className="flex items-baseline justify-between gap-2 sm:justify-end"><b className="font-mono text-[15px]">{d.total}</b>{d.spiking > 0 && <span className="font-mono text-[10.5px] text-alert-ink">▲ {d.spiking} rising</span>}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-4 border-t border-line pt-3">{srcs.map((s) => <span key={s} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted"><SrcDot s={s} />{SOURCE_NAMES[s]}</span>)}</div>
    </Panel>
  );
}

function SourceMix({ rows, failed, platforms }) {
  const [span, setSpan] = useState('week');
  const idx = span === 'week' ? [7] : span === '4w' ? [4, 5, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
  const state = (s) => platforms.find((p) => p.id === s)?.state;
  const parts = SOURCES.map((s) => ({ id: s, label: SOURCE_NAMES[s], c: SRC[s].c, c2: SRC[s].c2, value: failed.includes(s) || state(s) === 'off' ? 0 : sum(rows.map((r) => sum(idx.map((i) => r.p.bySource[s]?.[i] || 0)))) }));
  const total = sum(parts.map((p) => p.value));
  return (
    <Panel n={7} title="By platform" body="grid content-start gap-4 p-6">
      <Tabs value={span} onChange={setSpan} label="Time span" options={[['week', 'Week'], ['4w', '4 weeks'], ['8w', '8 weeks']]} />
      <div className="grid items-center justify-items-center gap-4 sm:grid-cols-[auto_1fr] sm:justify-items-start">
        <ThinDonut parts={parts} total={total} size={156} centerLabel="complaints" />
        <ul className="grid w-full gap-2">
          {platforms.map((p) => { const part = parts.find((x) => x.id === p.id); return (
            <li key={p.id} className="flex items-center justify-between gap-2 text-[12.5px]" title={p.why}>
              <span className="flex min-w-0 items-center gap-2">{p.state === 'live' ? <SrcDot s={p.id} /> : <i className="h-2 w-2 rounded-full border-[1.5px] border-faint" />}<span className={p.state === 'live' ? '' : 'text-faint'}>{p.name}</span></span>
              <span className={`font-mono text-[12px] ${p.state === 'down' ? 'text-alert-ink' : p.state === 'live' ? 'text-ink' : 'text-faint'}`}>{p.state === 'live' ? part.value : P_STATE[p.state].w}</span>
            </li>
          ); })}
        </ul>
      </div>
    </Panel>
  );
}

/* ── connections: one gauge component and one threshold scale everywhere ── */
function connRows(data, healthInfo) {
  const lr = data?.lastRun; const hist = healthInfo?.history || [];
  const plats = platformStates(data, healthInfo);
  const avg = (vals) => { const v = vals.filter((x) => x != null); return v.length ? Math.round(sum(v) / v.length) : null; };
  const nr = nextRun();
  const rows = SOURCES.map((s) => {
    const series = hist.map((h) => h.sources?.[s] ?? null);
    const st = lr?.stats?.sources?.[s];
    const off = plats.find((x) => x.id === s)?.state === 'off';
    if (off) return { id: s, src: s, off: true, name: SOURCE_NAMES[s], tile: SRC[s], health: null, series: [], cadence: '—', err: null, meta: OFF_WHY[s] };
    return { id: s, src: s, name: SOURCE_NAMES[s], tile: SRC[s], health: avg(series), series, cadence: 'FRI 06:00 IST + MANUAL', next: nr, err: st && !st.ok && st.failed ? st.error || 'not responding' : null, meta: st ? `${st.fetched} fetched last run` : 'not run yet' };
  });
  rows.push({ id: 'discord', off: true, name: 'Discord', tile: { c: '#4A57E6', c2: '#8E98FF', abbr: 'DC' }, health: null, series: [], cadence: '—', err: null, meta: OFF_WHY.discord });
  rows.push({ id: 'x', off: true, name: 'X (Twitter)', tile: { c: '#B4B4C6', c2: '#F2F2F7', abbr: 'X' }, health: null, series: [], cadence: '—', err: null, meta: OFF_WHY.x });
  const gSeries = hist.map((h) => h.gemini);
  const gem = lr?.stats?.gemini;
  rows.push({ id: 'gemini', name: 'Gemini Flash', tile: { c: '#8E98FF', c2: '#C9CDF5', abbr: 'GM' }, health: avg(gSeries) ?? (healthInfo?.gemini?.configured ? null : 0), series: gSeries, cadence: 'EACH RUN', err: gem && !gem.ok ? gem.error : !healthInfo?.gemini?.configured && healthInfo ? 'API key missing' : null, meta: gem?.model || 'labels + summaries' });
  rows.push({ id: 'neon', name: 'Neon Postgres', tile: { c: '#34D399', c2: '#5EEAD4', abbr: 'DB' }, health: healthInfo ? (healthInfo.db?.ok ? 100 : 0) : null, series: [], cadence: 'ALWAYS ON', err: healthInfo && !healthInfo.db?.ok ? healthInfo.db?.error : null, meta: healthInfo?.db?.ok ? `${healthInfo.db.activeTerms} active terms` : 'checking…' });
  const cron = data?.lastCron;
  rows.push({ id: 'cron', name: 'Vercel Cron', tile: { c: '#F2F2F7', c2: '#A3A3B8', abbr: 'VC' }, health: cron ? (cron.status === 'ok' ? 100 : cron.status === 'partial' ? 75 : 40) : null, series: [], cadence: 'FRI 06:00 IST', next: nr, err: null, meta: cron ? `last ${ist(cron.started_at)}` : 'first run this Friday' });
  return rows;
}
const ConnTile = ({ t }) => <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] font-mono text-[11px] font-semibold text-[#0A0A14]" style={{ background: `linear-gradient(135deg, ${t.c}, ${t.c2})` }}>{t.abbr}</span>;
function Connections({ data, healthInfo, compact, srcSel, toggleSrc, n = 10 }) {
  const rows = connRows(data, healthInfo);
  const down = data?.lastRun?.stats?.failedSources || [];
  const overall = (() => { const v = rows.filter((r) => !r.off).map((r) => r.health).filter((x) => x != null); return v.length ? Math.round(sum(v) / v.length) : null; })();
  return (
    <Panel n={n} title="Connections" right={<StatusDot color={healthTone(overall).c} word={healthTone(overall).word} live={overall >= 85} />} body="grid content-start gap-4 p-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <thead><tr className="font-mono text-[10px] uppercase tracking-[.1em] text-faint">
            <th className="pb-2 font-normal">Service</th><th className="pb-2 font-normal">Health</th>{!compact && <th className="pb-2 font-normal">Last 14 runs</th>}<th className="pb-2 font-normal">Cadence</th>{!compact && <th className="pb-2 text-right font-normal">In brief</th>}
          </tr></thead>
          <tbody>
            {rows.map((r) => { const t = healthTone(r.health); const isDown = r.src && (down.includes(r.src) || r.off); const on = r.src ? srcSel?.includes(r.src) && !isDown : null; return (
              <tr key={r.id} className="border-t border-line">
                <td className="py-3 pr-3"><div className="flex items-center gap-3"><ConnTile t={r.tile} /><div className="min-w-0"><div className="text-[13px] font-medium">{r.name}</div>{r.err ? <div className="max-w-[260px] truncate text-[11px] text-alert-ink" title={r.err}>{r.err}</div> : <div className="max-w-[300px] text-[11px] text-faint">{r.meta}</div>}</div></div></td>
                <td className="py-3 pr-3">{r.off ? <StatusDot color="var(--faint)" word="Not connected" /> : <div className="flex items-center gap-2"><Ring value={r.health} ticked size={52} stroke={8} label={null} /><StatusDot color={t.ink} word={t.word} /></div>}</td>
                {!compact && <td className="py-3 pr-3">{r.off ? null : r.series.length ? <Spark values={r.series} color={t.c} w={110} h={26} /> : <span className="font-mono text-[10.5px] text-faint">live check</span>}</td>}
                <td className="py-3 pr-3"><div className="font-mono text-[10.5px] text-muted">{r.cadence}</div>{r.next && <div className="mt-1 grid w-[120px] gap-1"><Capsule value={Math.round(r.next.frac * 100)} max={100} c="#0A1686" c2="#8E98FF" h={6} label={`next run in ${r.next.left}`} /><span className="font-mono text-[10px] text-faint">next in {r.next.left}</span></div>}</td>
                {!compact && <td className="py-3 text-right">{r.src && !r.off ? (
                  <button role="switch" aria-checked={on} disabled={isDown} title={isDown ? `${r.name} did not respond in the last run, so it is left out` : undefined} aria-label={`Include ${r.name} in the brief`} onClick={() => toggleSrc(r.src)} className={`relative inline-flex h-6 w-11 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'bg-[linear-gradient(90deg,#1E8F6B,#46C59A)]' : 'bg-track'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-ink transition-[left] ${on ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>) : <span className="font-mono text-[10.5px] text-faint">—</span>}</td>}
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      <p className="font-mono text-[10.5px] text-faint">Health = share of requests answered over the last 14 runs · ≥85 stable · 60–84 degraded · &lt;60 down{!compact ? ' · switches include or leave out a platform in this view' : ''}</p>
    </Panel>
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
    <Panel n={1} title="Eight-week view" right={<span className="hidden text-[11.5px] text-faint sm:inline">Pick up to 4 · hover a week for exact counts</span>} body="grid min-w-0 gap-4 p-6">
      <h2 className="text-[20px] font-semibold">How the conversation is moving</h2>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pain points shown on chart">
        {ranked.map((r) => { const on = ids.includes(r.p.id); const i = ids.indexOf(r.p.id); return (
          <button key={r.p.id} onClick={() => toggle(r.p.id)} aria-pressed={on} className={chip(on)}>
            <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: on ? SERIES_COLORS[i % 4] : 'var(--track)' }} />{r.p.title}
          </button>
        ); })}
      </div>
      {series.length ? <FlowChart series={series} labels={weeks.map(d8)} /> : <p className="py-10 text-center text-muted">Pick a pain point above to plot it.</p>}
    </Panel>
  );
}

function ActivityHeatmap({ rows, weeks, onPick }) {
  const list = [...rows].sort((a, b) => sum(b.p.s) - sum(a.p.s));
  return (
    <Panel n={2} title="Activity · 8 weeks" right={<span className="hidden font-mono text-[10.5px] text-faint sm:inline">colour = topic · intensity = threads</span>} body="grid min-w-0 gap-4 p-6">
      <Heatmap rows={list.map((r) => ({ id: r.p.id, label: r.p.title, values: r.p.s, c: CAT_STYLE[r.p.cat].c, glyph: CAT_STYLE[r.p.cat].glyph }))} cols={weeks.map(d8)} onPick={onPick} />
    </Panel>
  );
}

function Detail({ p, st, inList, addShort, openDraft, dismiss, weeks }) {
  const max = Math.max(...p.s, 1);
  return (
    <div className="grid gap-6 bg-sunk px-5 py-5 md:grid-cols-[1.3fr_1fr]">
      <div className="grid min-w-0 content-start gap-4">
        {p.insight && (
          <div className="grid gap-3 rounded-[12px] border border-line bg-surface p-4">
            <Layer k="What developers say" tag={`AI · ${p.insight.threads_used} threads`}>{p.insight.summary}</Layer>
            {p.insight.gap && <Layer k="Gap they describe" tag="AI">{p.insight.gap}</Layer>}
            <Layer k="Worth investigating" tag="AI suggestion">{p.insight.next_step}</Layer>
          </div>
        )}
        <div>
          <Eyebrow>Source threads</Eyebrow>
          {p.evidence.length === 0 ? <p className="mt-2 text-[13px] text-muted">No threads for this pain point in the last four weeks.</p> : (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {p.evidence.map((e) => (
                <li key={e.url} className="grid content-start gap-1 rounded-[12px] border border-line bg-surface p-3 text-[12.5px]">
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink hover:underline">{e.title} ↗</a>
                  {e.quote && <div className="line-clamp-2 text-muted">"{e.quote}"</div>}
                  <span className="mt-1 inline-flex items-center gap-1.5 font-mono text-[10.5px] text-faint"><SrcDot s={e.platform} size={7} />{SOURCE_NAMES[e.platform]} · {d8(e.week)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <dl className="grid gap-1 text-[12.5px]">
          <dt className="font-mono text-[10px] uppercase tracking-[.12em] text-faint">Team notes (not from this week's data)</dt>
          <Def t="Hits hardest" d={p.suits} />
          <Def t="Less relevant for" d={p.notFor} />
          <Def t="Our angle" d={p.angle} />
        </dl>
        <div className="flex flex-wrap gap-2">
          <Btn size="sm" kind={inList ? 'secondary' : 'primary'} disabled={inList} onClick={() => addShort(p.id)}>{inList ? 'In team vote ✓' : 'Put to team vote'}</Btn>
          <Btn size="sm" onClick={() => openDraft([p.id])}>Draft sprint brief</Btn>
          <Btn size="sm" kind="danger" onClick={() => dismiss(p.id)}>Not our problem, hide</Btn>
        </div>
      </div>
      <div className="grid min-w-0 content-start gap-4">
        <div>
          <Eyebrow>Unique threads per week</Eyebrow>
          <div className="mt-3 grid h-[96px] grid-cols-8 items-end gap-2">
            {p.s.map((v, i) => (
              <div key={i} className="flex h-full flex-col items-center justify-end gap-1">
                <span className="font-mono text-[10px] text-muted">{v}</span>
                <div className="relative mx-auto w-3 flex-1 overflow-hidden rounded-full bg-track"><div className="absolute inset-x-0 bottom-0 rounded-full" style={{ height: `${(v / max) * 100}%`, background: i === 7 ? `linear-gradient(0deg, ${CAT_STYLE[p.cat].c}, ${CAT_STYLE[p.cat].c2})` : 'var(--line-strong)', transition: 'height .5s var(--ease)' }} /></div>
              </div>))}
          </div>
          <div className="mt-1 grid grid-cols-8 gap-2">{weeks.map((w) => <span key={w} className="text-center font-mono text-[9px] text-faint">{d8(w)}</span>)}</div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
          <dt className="text-muted">Normal (4-week avg)</dt><dd className="text-right font-mono">{st.mean.toFixed(1)}</dd>
          <dt className="text-muted">This week vs normal</dt><dd className="text-right font-mono">{st.mean ? `${st.ratio.toFixed(2)}×` : 'new'}</dd>
          <dt className="text-muted" title="How unusual this week is. 2 or more is very unlikely to be random wobble.">Unusualness score ⓘ</dt><dd className="text-right font-mono">{st.z.toFixed(2)}</dd>
          <dt className="text-muted">Different developers</dt><dd className="text-right font-mono">{p.voices}</dd>
        </dl>
        <div className="grid grid-cols-4 gap-3 border-t border-line pt-3">
          {SOURCES.map((s) => (
            <div key={s} className="min-w-0"><div className="truncate font-mono text-[9.5px] uppercase tracking-[.08em] text-faint">{SRC[s].abbr} · {SOURCE_NAMES[s].split(' ')[0]}</div><div className="font-mono text-[18px] font-semibold">{p.bySource[s]?.[7] || 0}</div><div className="mt-1 h-[3px] rounded-full" style={{ background: `linear-gradient(90deg, ${SRC[s].c}, ${SRC[s].c2})` }} /></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Leaderboard(props) {
  const { rows, total, failed, platforms = [], extraIfLooser, mode, setMode, cat, setCat, srcSel, toggleSrc, sort, setSort, cmp, setCmp, open, setOpen, clearFilters, shortIds, addShort, openDraft, dismiss, hiddenCount, showHidden, setShowHidden, weeks } = props;
  const filtersOn = cat !== 'all' || srcSel.length !== SOURCES.length || mode !== 'balanced';
  const maxCur = Math.max(4, ...rows.map((r) => r.st.cur));
  return (
    <section id="board" className="grid min-w-0 gap-3">
      <PanelLabel n={3}>All tracked problems · {rows.length} of {total}</PanelLabel>
      <div className="card min-w-0 overflow-hidden">
      <div className="grid gap-4 border-b border-line px-6 py-5">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex rounded-full border border-line p-[3px]" role="group" aria-label="Compare this week against">
            {[['wow', 'vs last week'], ['base', 'vs 4-week normal']].map(([k, l]) => <button key={k} onClick={() => setCmp(k)} aria-pressed={cmp === k} className={seg(cmp === k)}>{l}</button>)}
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[120px_1fr] lg:items-center">
          <span className="font-mono text-[10.5px] uppercase tracking-[.1em] text-faint">Evidence</span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap rounded-full border border-line p-[3px]" role="group" aria-label="Evidence level">
              {Object.entries(MODES).map(([k, m]) => <button key={k} onClick={() => setMode(k)} aria-pressed={mode === k} className={seg(mode === k)}>{m.label} <span className="font-mono opacity-70">· {m.hint}</span></button>)}
            </div>
            {extraIfLooser > 0 && <button onClick={() => setMode('exploratory')} className="text-[12px] text-link underline underline-offset-2">+{extraIfLooser} more qualify with Early signals</button>}
          </div>
          <span className="font-mono text-[10.5px] uppercase tracking-[.1em] text-faint">Topic</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Topic">
            <button aria-pressed={cat === 'all'} onClick={() => setCat('all')} className={chip(cat === 'all')}>All</button>
            {Object.entries(CATS).map(([k, l]) => { const on = cat === k; const t = CAT_STYLE[k]; return (
              <button key={k} aria-pressed={on} onClick={() => setCat(k)} className="press inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-3 text-[11.5px]"
                style={{ borderColor: on ? t.c : 'var(--line)', color: on ? t.c2 : 'var(--muted)', background: on ? `color-mix(in srgb, ${t.c} 16%, transparent)` : 'transparent' }}><Glyph kind={t.glyph} color={t.c2} size={10} />{l}</button>
            ); })}
          </div>
          <span className="font-mono text-[10.5px] uppercase tracking-[.1em] text-faint">Sources</span>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sources">
            {SOURCES.map((s) => { const pl = platforms.find((x) => x.id === s); const off = pl?.state === 'off'; const down = failed.includes(s); const on = srcSel.includes(s) && !down && !off; return (
              <button key={s} disabled={down || off} aria-pressed={on} onClick={() => toggleSrc(s)} title={pl?.why}
                className={down ? 'inline-flex h-7 cursor-not-allowed items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-alert/60 px-3 text-[11.5px] text-alert-ink' : off ? 'inline-flex h-7 cursor-not-allowed items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-line px-3 text-[11.5px] text-faint' : `${chip(on)} ${on ? '' : 'line-through'}`}><SrcDot s={s} size={7} />{SOURCE_NAMES[s]}{down ? ' · not responding' : off ? ' · not connected' : ''}</button>
            ); })}
            <label htmlFor="sort" className="sr-only">Sort by</label>
            <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)} className="ml-auto h-8 rounded-full border-[1.5px] border-line-strong bg-transparent px-3.5 text-[11.5px] text-ink">
              <option className="bg-surface" value="priority">Sort: what to act on</option>
              <option className="bg-surface" value="cur">Sort: most threads</option>
              <option className="bg-surface" value="change">Sort: biggest change</option>
              <option className="bg-surface" value="unres">Sort: least solved</option>
            </select>
          </div>
        </div>
        {filtersOn && (
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-muted">Showing {rows.length} of {total}:</span>
            {mode !== 'balanced' && <span className="rounded-full border border-line px-2">{MODES[mode].label}</span>}
            {cat !== 'all' && <span className="rounded-full border border-line px-2">{CATS[cat]}</span>}
            {srcSel.length !== SOURCES.length && <span className="rounded-full border border-line px-2">{srcSel.length ? srcSel.map((s) => SOURCE_NAMES[s]).join(' + ') : 'No sources'}</span>}
            <button onClick={clearFilters} className="text-link underline underline-offset-2">Clear filters</button>
          </div>
        )}
        {failed.length > 0 && (
          <StatusDot color="var(--alert)" word={`${failed.map((f) => SOURCE_NAMES[f]).join(', ')} did not respond, so it is left out of every week`} />
        )}
      </div>
      {rows.length === 0 ? (
        <div className="px-6 py-10 text-center text-muted">
          {srcSel.length === 0 ? 'Pick at least one platform to see problems.' : 'No problem matches these filters.'} <button onClick={clearFilters} className="text-link underline underline-offset-2">Clear filters</button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="bg-surface-2 font-mono text-[10px] uppercase tracking-[.1em] text-faint">
                <th className="w-10 px-5 py-2.5 font-normal">#</th>
                <th className="px-2 py-2.5 font-normal">Pain point</th>
                <th className="px-2 py-2.5 font-normal">Topic</th>
                <th className="px-2 py-2.5 text-right font-normal">Threads</th>
                <th className="px-2 py-2.5 text-right font-normal">{cmp === 'wow' ? 'vs last week' : 'vs normal'}</th>
                <th className="px-2 py-2.5 font-normal">8 weeks</th>
                <th className="px-2 py-2.5 font-normal">Signal</th>
                <th className="px-5 py-2.5 text-right font-normal">Unsolved</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, st }, i) => {
                const t = TREND[st.label]; const isOpen = open === p.id;
                const delta = cmp === 'wow' ? st.wow : st.mean > 0 ? Math.round((st.ratio - 1) * 100) : null;
                const sym = delta == null ? '' : delta > 0 ? '▲' : delta < 0 ? '▼' : '■';
                return (
                  <React.Fragment key={p.id}>
                    <tr id={`row-${p.id}`} className={`h-14 cursor-pointer border-t border-line transition-colors hover:bg-surface-2 ${isOpen ? 'bg-surface-2' : ''}`} style={isOpen ? { boxShadow: `inset 3px 0 0 ${t.c}` } : undefined} onClick={() => setOpen(isOpen ? null : p.id)}>
                      <td className="px-5 py-3 align-middle font-mono text-[11px] text-faint">{String(i + 1).padStart(2, '0')}</td>
                      <td className="min-w-0 px-2 py-3 align-middle">
                        <button onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? null : p.id); }} aria-expanded={isOpen} className="text-left text-[13px] font-medium hover:underline">{p.title}</button>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-faint"><RelTag rel={p.rel} /><span className="font-mono">{p.voices} dev · {p.communities} comm</span>{shortIds.includes(p.id) && <StatusDot color="var(--ok)" word="In team vote" />}</div>
                      </td>
                      <td className="px-2 py-3 align-middle"><TopicPill cat={p.cat} /></td>
                      <td className="px-2 py-3 text-right align-middle">
                        <div className="ml-auto grid w-24 justify-items-end gap-1">
                          <span className="font-mono text-[16px] font-semibold">{st.cur}</span>
                          <div className="h-1 w-full overflow-hidden rounded-full bg-track"><div className="ml-auto h-full rounded-full" style={{ width: `${(st.cur / maxCur) * 100}%`, background: `linear-gradient(90deg, ${CAT_STYLE[p.cat].c}, ${CAT_STYLE[p.cat].c2})` }} /></div>
                          <span className="font-mono text-[10px] text-faint">{cmp === 'wow' ? `was ${st.prev}` : `normal ${st.mean.toFixed(1)}`}</span>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-right align-middle font-mono text-[12.5px]" style={{ color: t.ink }}>
                        {cmp === 'wow' ? `${sym || (st.cur - st.prev > 0 ? '▲' : st.cur - st.prev < 0 ? '▼' : '■')} ${st.cur - st.prev > 0 ? '+' : ''}${st.cur - st.prev}` : (delta == null ? (st.cur > 0 ? 'new' : '–') : `${sym} ${delta > 0 ? '+' : ''}${delta}%`)}
                        {cmp === 'wow' && <div className="text-[10.5px] opacity-80">{delta == null ? (st.cur > 0 ? 'new' : '') : `${delta > 0 ? '+' : ''}${delta}%`}</div>}
                      </td>
                      <td className="px-2 py-3 align-middle"><Spark values={p.s} color={t.c} /></td>
                      <td className="px-2 py-3 align-middle">
                        {p.voices < 2 && st.cur > 0 ? <FewVoices n={p.voices} /> : <TrendPill label={st.label} />}
                        {st.label === 'Steady' && p.voices >= 2 && Math.abs(delta || 0) >= 30 && <div className="mt-1 text-[10.5px] text-faint">Big % on small numbers</div>}
                      </td>
                      <td className="px-5 py-3 text-right align-middle">
                        <div className="ml-auto grid w-20 justify-items-end gap-1">
                          <span className="font-mono text-[12.5px]" style={{ color: p.unresolved >= 70 ? 'var(--alert-ink)' : undefined }}>{p.unresolved}%</span>
                          <div className="h-1 w-full overflow-hidden rounded-full bg-track"><div className="h-full rounded-full" style={{ width: `${p.unresolved}%`, background: p.unresolved >= 70 ? 'var(--alert)' : 'var(--steady)' }} /></div>
                        </div>
                      </td>
                    </tr>
                    {isOpen && <tr><td colSpan={8} className="border-t border-line p-0"><Detail p={p} st={st} weeks={weeks} inList={shortIds.includes(p.id)} addShort={addShort} openDraft={openDraft} dismiss={dismiss} /></td></tr>}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-6 py-3 text-[11.5px] text-faint">
        <span>Threads are unique threads per week across sources. "Signal" compares this week with the 4-week normal, so a big % change on small numbers stays Steady.</span>
        {hiddenCount > 0 && <button onClick={() => setShowHidden(!showHidden)} className="text-link underline underline-offset-2">{showHidden ? 'Hide dismissed' : `${hiddenCount} dismissed · show`}</button>}
      </div>
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
  const incl = terms.filter((x) => x.kind === 'include'), excl = terms.filter((x) => x.kind === 'exclude');
  return (
    <section className="grid min-w-0 gap-3">
      <PanelLabel n={1}>What Pulse listens for</PanelLabel>
      <div className="card min-w-0 overflow-hidden">
      <div className="grid gap-4 border-b border-line px-6 py-5 md:grid-cols-[1fr_auto] md:items-end">
        <div className="grid gap-2"><h2 className="text-[20px] font-semibold">Topics & keywords</h2><span className="text-[12px] text-faint">Saved in Neon · used by every run · no code changes needed</span></div>
        <div className="flex gap-6">
          {[['tracked', incl.length], ['excluded', excl.length], ['new', terms.filter((x) => x.fresh).length]].map(([k, v]) => <div key={k}><div className="font-mono text-[28px] font-semibold leading-none">{v}</div><div className="font-mono text-[10px] uppercase tracking-[.1em] text-faint">{k}</div></div>)}
        </div>
      </div>
      <form onSubmit={submit} className="grid gap-2 px-6 py-5">
        <label htmlFor="term" className="text-[13px] font-medium">Add a term to track or exclude</label>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-full border border-line p-[3px]" role="group" aria-label="Track or exclude">
            {[['include', 'Track'], ['exclude', 'Exclude']].map(([k, l]) => <button type="button" key={k} onClick={() => { setKind(k); setPending(null); }} aria-pressed={kind === k} className={`${seg(kind === k)} ${kind === k && k === 'exclude' ? '!text-alert-ink' : ''}`}>{l}</button>)}
          </div>
          <input id="term" value={val} onChange={(e) => onChange(e.target.value)} placeholder={kind === 'include' ? 'e.g. merge queue, review latency' : 'e.g. job listing, sales pipeline'} className="h-9 min-w-0 flex-1 rounded-full border border-line bg-surface-2 px-4 text-[13px] text-ink placeholder:text-faint" autoComplete="off" maxLength={60} />
          <label htmlFor="termcat" className="sr-only">Topic</label>
          <select id="termcat" value={cat} onChange={(e) => { setCat(e.target.value); setCatTouched(true); }} className="h-9 rounded-full border-[1.5px] border-line-strong bg-transparent px-3.5 text-[12px] text-ink">
            {Object.entries(CATS).map(([k, l]) => <option key={k} value={k} className="bg-surface">{l}</option>)}
          </select>
          <Btn type="submit" kind="primary" disabled={busy}>{busy ? 'Saving…' : 'Add'}</Btn>
        </div>
        {pending && (
          <div className="rise grid gap-2 rounded-[12px] border border-warn/50 bg-warn-soft p-3 text-[13px]" role="alert">
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
                    <label key={e} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px]">
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
        <div className="border-t border-line px-6 py-5 text-[13px] text-alert-ink">The watchlist couldn't load: {termsError}</div>
      ) : (
        <div className="grid gap-4 border-t border-line px-6 py-5 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(CATS).map(([ck, cl]) => { const t = CAT_STYLE[ck]; const mine = terms.filter((x) => x.category_id === ck); return (
            <div key={ck} className="grid min-w-0 content-start gap-3 rounded-[12px] border border-line bg-surface-2 p-4">
              <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-[12.5px] font-medium" style={{ color: t.c2 }}><Glyph kind={t.glyph} color={t.c2} />{cl}</span><span className="font-mono text-[11px] text-faint">{mine.filter((x) => x.kind === 'include').length}</span></div>
              <div className="flex flex-wrap gap-1.5">
                {mine.map((x) => (
                  <span key={x.id} className={`inline-flex h-7 items-center gap-1 rounded-full border-[1.5px] px-2.5 text-[11.5px] ${x.kind === 'include' ? 'border-line bg-surface' : 'border-dashed border-alert/50 text-alert-ink'}`} style={x.fresh ? { borderColor: 'var(--warn)' } : undefined}>
                    <button onClick={() => flip(x)} title={x.kind === 'include' ? 'Click to exclude instead' : 'Click to track instead'}>{x.kind === 'exclude' ? '− ' : ''}{x.term}</button>
                    {x.kind === 'include' && !x.fresh && <span className="font-mono text-[10px] text-faint" title="Threads matching this term in the last 4 weeks">{x.found}</span>}
                    {x.fresh && <span className="font-mono text-[9.5px] uppercase text-warn">new</span>}
                    <button onClick={() => remove(x)} aria-label={`Remove ${x.term}`} className="text-faint hover:text-ink">×</button>
                  </span>
                ))}
              </div>
              {terms.length > 0 && !mine.some((x) => x.kind === 'include') && <p className="text-[12px] text-warn">No terms tracked here, so this topic will show zero threads.</p>}
            </div>
          ); })}
        </div>
      )}
      {candidates?.length > 0 && (
        <div className="border-t border-line px-6 py-4 text-[12.5px]">
          <div className="font-medium">New problems Gemini found that fit none of your tracked ones (last 4 weeks)</div>
          <ul className="mt-2 flex flex-wrap gap-2">{candidates.map((c) => <li key={c.label}><a className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line px-3 text-link hover:border-line-strong" href={c.url} target="_blank" rel="noopener noreferrer">{c.label} <span className="font-mono text-faint">{c.n}</span></a></li>)}</ul>
        </div>
      )}
      <p className="border-t border-line px-6 py-3 text-[11.5px] text-faint">The number on each term is how many threads it matched in the last 4 weeks. Terms marked new (amber outline) are searched across all 8 weeks on the next run, so adding a term never shows up as a fake spike. Dashed red terms with − are excluded; click any term to switch. Removing a term stops new matches but keeps past threads.</p>
      </div>
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
  const tone = !info ? null : info.error || (last && last.status !== 'sent') ? 'var(--alert)' : info.configured ? 'var(--ok)' : 'var(--warn)';
  return (
    <Panel n={3} title="Delivery" right={tone && <StatusDot color={tone} word={info?.configured ? 'Email on' : 'Email off'} />} body="grid content-start gap-3 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-[13px]">
          <div className="font-medium">Email delivery</div>
          <div className={info && !info.configured ? 'text-warn' : 'text-muted'}>{status}</div>
          {last && <div className="font-mono text-[11px] text-faint">Last email: week of {last.week} · {last.channel === 'manual' ? 'sent by hand' : 'scheduled'} · {last.status === 'sent' ? `sent ${ist(last.sent_at)}` : `failed (${(last.detail || '').slice(0, 80)})`}</div>}
          <div className="font-mono text-[11px] text-faint">Last scheduled email: {info?.lastScheduled ? `week of ${info.lastScheduled.week} · ${info.lastScheduled.status} ${ist(info.lastScheduled.sent_at)}` : 'none yet'}</div>
        </div>
        <Btn onClick={send} disabled={state.busy || !info?.configured} title={info?.configured ? 'Email the brief for the week you are viewing' : 'Set up email in Vercel first'}>
          {state.busy ? 'Sending…' : 'Email this brief now'}
        </Btn>
      </div>
      {state.msg && !state.busy && <p role="status" className={`text-[12px] ${state.bad ? 'text-warn' : 'text-ok'}`}>{state.msg}</p>}
    </Panel>
  );
}

/* ── system view ── */
function SystemView({ data, healthInfo, srcSel, toggleSrc }) {
  const lr = data?.lastRun; const gem = lr?.stats?.gemini;
  const [auth, setAuth] = useState(null);
  useEffect(() => { api('auth').then(setAuth).catch(() => setAuth(null)); }, []);
  const stages = [
    ['Fetch', `${lr?.stats?.fetched ?? '–'} threads fetched`, !(lr?.stats?.failedSources || []).length],
    ['Label', gem ? (gem.ok ? `Gemini (${gem.model})` : 'keyword rules (Gemini down)') : 'not run yet', gem ? gem.ok : null],
    ['Count', `${data?.totalThreads ?? '–'} threads stored in Neon`, healthInfo ? !!healthInfo.db?.ok : null],
    ['Brief', lr ? `last run ${ist(lr.startedAt)}` : 'no runs yet', lr ? lr.status !== 'running' : null],
  ];
  const stale = lr && Date.now() - new Date(lr.startedAt).getTime() > 8 * 864e5;
  return (
    <div className="grid gap-4">
      <Panel n={1} title="How a brief gets made" right={lr && <StatusDot color={stale ? 'var(--alert)' : 'var(--ok)'} word={`Refreshed ${ago(lr.startedAt)}`} />} body="grid gap-4 p-6">
        <ol className="grid gap-3 sm:grid-cols-4">
          {stages.map(([k, d, ok], i) => (
            <li key={k} className="rounded-[12px] border border-line bg-surface-2 p-4">
              <div className="flex items-center justify-between gap-2"><span className="font-mono text-[11px] uppercase tracking-[.1em] text-ink">{String(i + 1).padStart(2, '0')} {k}</span><span className="h-1.5 w-1.5 rounded-full" style={{ background: ok === null ? 'var(--track)' : ok ? 'var(--ok)' : 'var(--alert)' }} aria-label={ok === null ? 'not run' : ok ? 'ok' : 'problem'} /></div>
              <div className="mt-1.5 text-[12px] text-muted">{d}</div>
            </li>
          ))}
        </ol>
      </Panel>
      <Connections data={data} healthInfo={healthInfo} srcSel={srcSel} toggleSrc={toggleSrc} n={2} />
      <div className="grid gap-4 lg:grid-cols-2">
        <EmailDelivery week={data?.week} />
        <Panel n={4} title="Schedule" body="grid content-start gap-3 p-6 text-[13px]">
          {[['Scheduled run', `Fridays 06:00 IST · last: ${data?.lastCron ? `${ist(data.lastCron.started_at)} (${data.lastCron.status})` : 'not yet (first one this Friday)'}`], ['Next run', `in ${nextRun().left}`], ['Daily health check', 'emails an alert if the database or Gemini fails'], ['Schedule endpoint', auth ? (auth.cronSecret ? 'locked: only Vercel Cron can start it' : 'OPEN: set CRON_SECRET in Vercel') : 'checking…']].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-line pb-2 last:border-0"><span>{k}</span><span className="text-right font-mono text-[11.5px] text-muted">{v}</span></div>
          ))}
        </Panel>
      </div>
      <Panel n={5} title="How to read the brief" body="px-6 py-4 text-[13px]">
        <dl className="grid gap-1.5 md:grid-cols-2">
          <Def t="Thread" d="one discussion, counted once even if it has 300 comments or is cross-posted." />
          <Def t="Normal" d="the average of the four weeks before this one." />
          <Def t="Unusual spike / Climbing" d="this week is well above normal, beyond the usual week-to-week wobble." />
          <Def t="Steady" d="any change is within normal wobble, even if the % looks big." />
          <Def t="Unsolved" d="share of threads with no accepted answer, fix or closed issue." />
          <Def t="Genuine complaint" d="a thread describing a real problem. How-to questions and user errors are filtered out by Gemini before counting." />
          <Def t="Colours" d="platforms, topics, trend states and health each have their own colour; brand red only marks alerts, live states and rises." />
        </dl>
      </Panel>
    </div>
  );
}

/* ── first run ── */
function FirstRun({ onRun, running }) {
  return (
    <section className="card relative grid gap-4 overflow-hidden p-8">
      <Orbs colors={['#0A1686', '#DF7E0A']} />
      <div className="relative z-[1] grid max-w-[640px] gap-3">
        <PanelLabel>Welcome, Sumit</PanelLabel>
        <h2 className="text-[28px] font-semibold leading-tight">Your first Friday brief is one click away</h2>
        <p className="text-muted">Pulse pulls about eight weeks of threads from Hacker News, Stack Overflow, GitHub Issues and Reddit, so this week can be compared with what's normal. Gemini Flash then sorts real pain from debugging noise. It takes a few minutes; keep this tab open.</p>
        <div><Btn kind="primary" size="lg" onClick={onRun} disabled={running}>{running ? 'Running…' : 'Run the first brief'}</Btn></div>
      </div>
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
  const titles = Object.fromEntries((data?.pains || []).map((p) => [p.id, p.title]));
  const shortIds = short.items.map((x) => x.id);

  const checked = !!(data && healthInfo) || !!loadError;
  const platforms = platformStates(data, healthInfo);
  const problems = [];
  if (healthInfo && !healthInfo.db?.ok) problems.push('Database not reachable');
  if (failed.length) problems.push(`${failed.map((f) => SOURCE_NAMES[f]).join(', ')} not responding`);
  if (data?.lastRun?.stats?.gemini && !data.lastRun.stats.gemini.ok) problems.push('Gemini unavailable, keyword rules used');

  const shortAct = async (body, msg) => {
    setShortBusy(true);
    try { setShort(await api('shortlist', { ...body, week })); if (msg) toast(msg); } catch (e) { toast(e.message); } finally { setShortBusy(false); }
  };
  const addShort = (id) => shortAct({ op: 'add', id }, 'Put to team vote');
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
  const stale = data?.lastRun && Date.now() - new Date(data.lastRun.startedAt).getTime() > 8 * 864e5;
  return (
    <div className="relative z-[1] min-h-screen">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[460px] overflow-hidden" aria-hidden="true"><Orbs /></div>
      <TopNav view={view} setView={setView} data={data} week={week} setWeek={setWeek} running={running} onRun={run} onReset={reset} problems={problems} checked={checked} />
      <main className="mx-auto grid max-w-[1320px] gap-4 px-4 py-6 sm:px-6">
        <div className="relative flex flex-wrap items-end justify-between gap-3 py-2">
          <div className="relative z-[1] min-w-0">
            <Eyebrow>{view === 'brief' ? `Friday morning brief${week ? ` · complete week ${weekLabel}` : ''}` : `Pulse · ${VIEWS.find(([k]) => k === view)[1]}`}</Eyebrow>
            <h1 className="mt-2 text-[28px] font-semibold leading-tight sm:text-[34px]">{view === 'brief' ? 'What developers are struggling with right now' : VIEWS.find(([k]) => k === view)[1]}</h1>
            <p className="mt-2 max-w-[80ch] text-[13px] text-muted">
              {loadError ? 'The brief could not be loaded.' : !data ? 'Loading your latest brief: fetching the most recent report from the database…'
                : data.totalThreads === 0 ? 'No report yet. Run the first brief to collect eight weeks of history.'
                : <>{data.corpus[7]} threads read this week · collected <span className="font-mono">{data.lastRun ? ist(data.lastRun.startedAt) : '–'}</span>{data?.lastRun && <span className={stale ? 'text-alert-ink' : ''}> ({ago(data.lastRun.startedAt)})</span>}</>}
            </p>
            {data && !loadError && <div className="mt-3"><PlatformStrip platforms={platforms} /></div>}
          </div>
        </div>

        {running && <RunTracker step={step} note={stepNote} />}
        {!running && data?.unlabelled > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[16px] border border-warn/50 bg-warn-soft px-5 py-2.5 text-[13px]">
            <span>{data.unlabelled} threads are still waiting for Gemini to label them, so counts may be low.</span>
            <Btn size="sm" onClick={continueLabelling}>Finish labelling</Btn>
          </div>
        )}
        {loadError && (
          <div className="card flex flex-wrap items-center justify-between gap-3 p-5 text-[13px]">
            <span><StatusDot color="var(--alert)" word="Load failed" /> <span className="ml-2">{loadError}</span></span>
            <Btn size="sm" onClick={() => loadBrief(week)}>Try again</Btn>
          </div>
        )}
        {!data && !loadError && <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="card h-[170px] animate-pulse" />)}</div>}

        {empty && view !== 'watchlist' && view !== 'system' && <FirstRun onRun={run} running={running} />}

        {data && !empty && view === 'brief' && (<>
          <KpiRow rows={topPool} data={data} />
          <ExecSummary rows={topPool} data={data} failed={failed} onEvidence={focusRow} />
          <div className="grid gap-4 xl:grid-cols-2">
            <LoudestBars rows={topPool} onPick={focusRow} />
            <ActScatter rows={topPool} onPick={focusRow} />
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <TopCalls rows={topPool} mode={mode} setMode={setMode} shortItems={short.items} addShort={addShort} openDraft={(ids) => setDraft({ ids })} focusRow={focusRow} onSummarize={summarize} summarizing={summarizing} />
            <Shortlist items={short.items} titles={titles} viewer={viewer} setViewer={setViewer} act={shortAct} busy={shortBusy} openDraft={(ids, pack) => setDraft({ ids, pack })} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <TopicRings rows={topPool} />
            <SourceMix rows={topPool} failed={failed} platforms={platforms} />
          </div>
          <TalkMap rows={topPool} failed={failed} platforms={platforms} />
          <Panel n={9} title="How we counted" body="grid gap-4 p-6">
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              {[
                ['Threads read', data.corpus[7].toLocaleString('en-IN'), 'mentioned a tracked keyword', 'var(--cool)'],
                ['Genuine complaints', data.counts.pain.toLocaleString('en-IN'), data.counts.rules ? `${data.counts.rules} labelled by keyword rules` : 'labelled by Gemini Flash', 'var(--brand-orange)'],
                ['Filtered out', data.counts.noise.toLocaleString('en-IN'), 'how-to questions, user errors, off-topic', 'var(--steady)'],
                ['Platforms read', `${platforms.filter((x) => x.state === 'live').length}/${platforms.length}`, platforms.filter((x) => x.state !== 'live').map((x) => x.name).join(', ') + ' not included', 'var(--ok)'],
              ].map(([l, v, n, c]) => (
                <div key={l} className="grid gap-1"><div className="font-mono text-[10.5px] uppercase tracking-[.1em] text-faint">{l}</div><div className="font-mono text-[28px] font-semibold leading-none">{v}</div><div className="h-[3px] w-12 rounded-full" style={{ background: c }} /><div className="text-[11.5px] text-faint">{n}</div></div>
              ))}
            </div>
            <p className="text-[11.5px] text-faint">How we count: a thread is one discussion, counted once however many comments it has; cross-posts are merged. Weeks run Friday to Thursday (IST) and only complete weeks are compared.</p>
          </Panel>
        </>)}

        {data && !empty && view === 'trends' && (<>
          <TrendChart rows={topPool} weeks={data.weeks} />
          <ActivityHeatmap rows={topPool} weeks={data.weeks} onPick={focusRow} />
          <Leaderboard rows={rows} total={data.pains.length} failed={failed} extraIfLooser={extraIfLooser} mode={mode} setMode={setMode} cat={cat} setCat={setCat} srcSel={srcSel} toggleSrc={toggleSrc} sort={sort} setSort={setSort} cmp={cmp} setCmp={setCmp} open={open} setOpen={setOpen} clearFilters={clearFilters} platforms={platforms} shortIds={shortIds} addShort={addShort} openDraft={(ids) => setDraft({ ids })} dismiss={dismiss} hiddenCount={dismissed.length} showHidden={showHidden} setShowHidden={setShowHidden} weeks={data.weeks} />
        </>)}

        {view === 'watchlist' && <Watchlist terms={terms} termsError={termsError} reload={loadTerms} toast={toast} candidates={data?.candidates} />}
        {view === 'system' && <SystemView data={data} healthInfo={healthInfo} srcSel={srcSel} toggleSrc={toggleSrc} />}

        <footer className="flex flex-wrap items-center justify-between gap-2 pb-6 pt-2 font-mono text-[10.5px] uppercase tracking-[.08em] text-faint">
          <span>Labels by Gemini Flash · counts by Neon Postgres · platforms: {platforms.filter((x) => x.state === 'live').map((x) => x.name).join(', ') || 'none yet'}</span>
          <span>Pulse for Sumit's sprint planning</span>
        </footer>
      </main>
      {draft && week && <DraftPanel draft={draft} week={week} onClose={() => setDraft(null)} toast={toast} />}
      {toastMsg && (
        <div className="rise fixed left-1/2 z-40 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-full border border-line-strong bg-surface-2 px-5 py-2.5 text-[13px] text-ink shadow-[var(--shadow-float)]" style={{ bottom: 'calc(16px + env(safe-area-inset-bottom,0px))' }} role="status">
          {toastMsg}{undo && <button onClick={() => { undo(); setToastMsg(null); }} className="font-medium text-link underline underline-offset-2">Undo</button>}
        </div>
      )}
    </div>
  );
}
