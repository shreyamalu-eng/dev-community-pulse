'use client';
// Opportunities: the problems developers keep raising that existing tools don't seem to solve, in depth.
import React, { useState } from 'react';
import { SOURCES, SOURCE_NAMES, CATS, priority, trendWords } from '../lib/painpoints';
import { TEAM } from '../lib/team';
import { SRC, CAT_STYLE, TREND, Glyph, PanelLabel, StatusDot } from './instruments';
import { FlowChart } from './visuals';
import { d8, sum, Btn, TrendPill, TopicPill, RelTag, SrcDot, AiTag, Eyebrow } from './atoms';
import { Avatar } from './Discussion';

// an opportunity: inside or next to our product, real volume, and mostly unsolved
export function pickOpportunities(rows, n = 5) {
  return rows
    .filter((r) => r.p.rel !== 'outside' && sum(r.p.s) > 0)
    .map((r) => ({ ...r, score: priority(r.p.rel, Math.max(r.p.unresolved, 10), { ...r.st, cur: Math.max(r.st.cur, r.st.mean) }) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

function Stat({ k, v, note, tone }) {
  return (
    <div className="grid content-start gap-0.5 rounded-[12px] border border-line bg-surface-2 px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-[.1em] text-faint">{k}</span>
      <span className="font-mono text-[22px] font-semibold leading-tight" style={{ color: tone }}>{v}</span>
      {note && <span className="text-[11px] text-faint">{note}</span>}
    </div>
  );
}

function Opportunity({ r, i, W, labels, maxScore, vote, commentsN, watchers, addShort, openDraft, focusRow }) {
  const { p, st } = r;
  const t = TREND[st.label];
  const tot = sum(p.s);
  const activeBuckets = p.s.filter((v) => v > 0).length;
  const bySrc = SOURCES.map((s) => ({ s, now: p.bySource[s]?.[p.s.length - 1] || 0, all: sum(p.bySource[s] || []) })).filter((x) => x.all > 0);
  const srcMax = Math.max(1, ...bySrc.map((x) => x.all));
  const ins = p.insight;
  const solved = p.evidence.filter((e) => e.resolved).length;
  const [showAll, setShowAll] = useState(false);
  const ev = showAll ? p.evidence : p.evidence.slice(0, 4);
  const why = [];
  if (p.unresolved >= 60) why.push(`${p.unresolved}% of threads end without a fix`);
  if (st.label === 'Spike' || st.label === 'Climbing') why.push(`rising: ${trendWords(st, W.u)}`);
  if (activeBuckets >= Math.ceil(p.s.length * 0.75)) why.push(`raised in ${activeBuckets} of ${p.s.length} ${W.us}, so it is not a one-off`);
  if (p.communities >= 2) why.push(`seen on ${p.communities} platforms`);
  if (p.rel === 'core') why.push('sits inside what our reviewer does');
  return (
    <article id={`opp-${p.id}`} className="card grid min-w-0 gap-5 p-5 sm:p-6" style={{ boxShadow: `inset 3px 0 0 ${CAT_STYLE[p.cat].c}` }}>
      {/* 1 · headline */}
      <header className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
        <div className="grid min-w-0 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[26px] font-semibold leading-none text-faint">{String(i + 1).padStart(2, '0')}</span>
            <TopicPill cat={p.cat} compact /><RelTag rel={p.rel} />{p.voices < 2 && st.cur > 0 ? null : <TrendPill label={st.label} />}
            {vote && <StatusDot color={vote.decision === 'in' ? 'var(--ok)' : vote.decision === 'later' ? 'var(--faint)' : 'var(--warn)'} word={vote.decision === 'in' ? 'In sprint' : vote.decision === 'later' ? 'Parked' : `In team vote · 👍 ${vote.up} 👎 ${vote.down}`} />}
          </div>
          <h3 className="text-[20px] font-semibold leading-snug">{p.title}</h3>
          {why.length > 0 && <p className="text-[12.5px] text-muted"><span className="text-ink">Why it is here: </span>{why.join(' · ')}.</p>}
        </div>
        <div className="grid gap-1.5" title="Opportunity score: size × growth × unsolved share × fit with our product, relative to the top one">
          <div className="flex items-baseline justify-between"><span className="font-mono text-[10px] uppercase tracking-[.1em] text-faint">Opportunity score</span><b className="font-mono text-[15px]">{Math.round((r.score / maxScore) * 100)}</b></div>
          <div className="h-2 overflow-hidden rounded-full bg-track"><div className="h-full rounded-full" style={{ width: `${(r.score / maxScore) * 100}%`, background: 'linear-gradient(90deg,#A31B20,#DF7E0A)' }} /></div>
        </div>
      </header>

      {/* 2 · the numbers */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat k={`Threads ${W.this}`} v={st.cur} note={`${st.cur - st.prev >= 0 ? '+' : ''}${st.cur - st.prev} vs ${W.last}`} tone={t.ink} />
        <Stat k={`All ${p.s.length} ${W.us}`} v={tot} note={`active in ${activeBuckets} of ${p.s.length}`} />
        <Stat k="Vs normal" v={st.mean ? `${st.ratio.toFixed(1)}×` : 'new'} note={`normal ${st.mean.toFixed(1)} a ${W.u}`} />
        <Stat k="Unsolved" v={`${p.unresolved}%`} note="no fix or accepted answer" tone={p.unresolved >= 70 ? 'var(--alert-ink)' : undefined} />
        <Stat k="Developers" v={p.voices} note={`${W.this}, different people`} />
        <Stat k="Team" v={watchers.length} note={`watching · ${commentsN} comment${commentsN === 1 ? '' : 's'}`} />
      </div>

      {/* 3 · the gap and the trend */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-3 rounded-[12px] border border-line bg-surface-2 p-4">
          <div className="flex flex-wrap items-center gap-2"><Eyebrow>What existing tools miss</Eyebrow>{ins && <AiTag>Gemini · {ins.threads_used} threads</AiTag>}</div>
          {ins ? (<>
            <p className="text-[13.5px] leading-relaxed">{ins.summary}</p>
            {ins.gap && <div className="grid gap-0.5 border-l-2 border-alert/70 pl-3"><span className="font-mono text-[10px] uppercase tracking-[.1em] text-faint">The gap</span><span className="text-[13px] leading-relaxed">{ins.gap}</span></div>}
          </>) : <p className="text-[12.5px] text-muted">No AI summary for this period yet. Use "Summarise the threads" on the Brief page to add one.</p>}
          <div className="grid gap-0.5 border-l-2 border-line-strong pl-3"><span className="font-mono text-[10px] uppercase tracking-[.1em] text-faint">What teams already tried</span><span className="text-[12.5px] text-muted">{p.tried} {p.evidence.length > 0 && `In the threads below, ${solved} of ${p.evidence.length} found a fix.`}</span></div>
        </div>
        <div className="grid min-w-0 content-start gap-3">
          <FlowChart series={[{ id: p.id, label: p.title, short: p.title, values: p.s, color: CAT_STYLE[p.cat].c2 }]} labels={labels} height={170} prefix={W.u === 'week' ? 'Week of ' : ''} />
          {bySrc.length > 0 && (
            <div className="grid gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[.1em] text-faint">Where it is discussed · all {p.s.length} {W.us}</span>
              {bySrc.map((x) => (
                <div key={x.s} className="grid grid-cols-[120px_1fr_64px] items-center gap-2 text-[12px]">
                  <span className="inline-flex items-center gap-1.5"><SrcDot s={x.s} size={7} />{SOURCE_NAMES[x.s]}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-track"><div className="h-full rounded-full" style={{ width: `${(x.all / srcMax) * 100}%`, background: `linear-gradient(90deg, ${SRC[x.s].c}, ${SRC[x.s].c2})` }} /></div>
                  <span className="text-right font-mono text-[11px]">{x.all}<span className="text-faint"> · {x.now} now</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4 · the discussions */}
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-2"><Eyebrow>Discussions</Eyebrow><span className="font-mono text-[10.5px] text-faint">{p.evidence.length} linked · strongest quotes first</span></div>
        {p.evidence.length === 0 ? <p className="text-[12.5px] text-muted">No threads in the last four {W.us}.</p> : (
          <ul className="grid gap-2 md:grid-cols-2">
            {ev.map((e) => (
              <li key={e.url} className="grid content-start gap-1 rounded-[12px] border border-line bg-surface-2 p-3 text-[12.5px]">
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink hover:underline">{e.title} ↗</a>
                {e.quote && <div className="line-clamp-3 text-muted">"{e.quote}"</div>}
                <span className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[10.5px] text-faint"><span className="inline-flex items-center gap-1.5"><SrcDot s={e.platform} size={7} />{SOURCE_NAMES[e.platform]}</span><span>{d8(e.day || e.week)}</span><span style={{ color: e.resolved ? 'var(--ok)' : 'var(--alert-ink)' }}>{e.resolved ? 'fixed' : 'unsolved'}</span></span>
              </li>
            ))}
          </ul>
        )}
        {p.evidence.length > 4 && <button onClick={() => setShowAll(!showAll)} className="justify-self-start text-[12px] text-link underline underline-offset-2">{showAll ? 'Show fewer' : `Show all ${p.evidence.length}`}</button>}
      </div>

      {/* 5 · what we would do */}
      <div className="grid gap-4 border-t border-line pt-4 lg:grid-cols-3">
        <div className="grid content-start gap-1"><span className="font-mono text-[10px] uppercase tracking-[.1em] text-faint">Our angle</span><span className="text-[12.5px]">{p.angle}</span></div>
        <div className="grid content-start gap-1"><span className="font-mono text-[10px] uppercase tracking-[.1em] text-faint">First step</span><span className="text-[12.5px]">{p.next}</span><span className="text-[11.5px] text-faint">Success looks like: {p.metric}</span></div>
        <div className="grid content-start gap-1"><span className="font-mono text-[10px] uppercase tracking-[.1em] text-faint">Who feels it</span><span className="text-[12.5px]">{p.suits}</span><span className="text-[11.5px] text-faint">Less so: {p.notFor}</span></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11.5px] text-muted">
          {watchers.length > 0 && <><span className="flex -space-x-1.5">{watchers.slice(0, 6).map((w) => <span key={w.id} className="rounded-full ring-2 ring-surface"><Avatar id={w.id} size={20} /></span>)}</span><span>{watchers.map((w) => w.name).join(', ')} {watchers.length === 1 ? 'tracks' : 'track'} this</span></>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn size="sm" kind={vote ? 'secondary' : 'primary'} disabled={!!vote} onClick={() => addShort(p.id)}>{vote ? 'In team vote ✓' : 'Put to team vote'}</Btn>
          <Btn size="sm" onClick={() => openDraft([p.id])}>Draft sprint brief</Btn>
          <Btn size="sm" onClick={() => focusRow(p.id)}>Compare in Trends</Btn>
        </div>
      </div>
    </article>
  );
}

export default function Opportunities({ rows, total, W, labels, short, comments, people, candidates, addShort, openDraft, focusRow }) {
  const list = pickOpportunities(rows);
  const maxScore = Math.max(1e-9, ...list.map((r) => r.score));
  const team = people?.length ? people : TEAM;
  const tally = (id) => { const x = short.items.find((y) => y.id === id); if (!x) return null; const v = Object.values(x.votes || {}); return { decision: x.decision, up: v.filter((y) => y === 'up').length, down: v.filter((y) => y === 'down').length }; };
  const unsolvedAvg = list.length ? Math.round(sum(list.map((r) => r.p.unresolved)) / list.length) : 0;
  return (
    <div className="grid gap-4">
      <section className="card grid gap-4 p-6">
        <p className="max-w-[95ch] text-[14.5px] leading-relaxed">
          Problems developers keep raising that existing tools don't seem to solve. These are the top {list.length} of {total} tracked problems,
          ranked by how many threads they get, whether they are growing, how often they stay unsolved, and how close they sit to our product.
          Together they average <b>{unsolvedAvg}% unsolved</b>.
        </p>
        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {list.map((r, i) => (
            <li key={r.p.id}>
              <a href={`#opp-${r.p.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`opp-${r.p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                className="lift grid h-full content-start gap-1 rounded-[12px] border border-line bg-surface-2 p-3 hover:border-line-strong">
                <span className="flex items-center gap-2 font-mono text-[11px] text-faint">{String(i + 1).padStart(2, '0')}<Glyph kind={CAT_STYLE[r.p.cat].glyph} color={CAT_STYLE[r.p.cat].c2} size={10} />{CATS[r.p.cat]}</span>
                <span className="text-[13px] font-medium leading-snug">{r.p.title}</span>
                <span className="font-mono text-[11px] text-muted">{r.st.cur} {W.this} · {r.p.unresolved}% unsolved</span>
              </a>
            </li>
          ))}
        </ol>
      </section>
      {list.length === 0 && <div className="card p-6 text-[13px] text-muted">No problem inside our product area has threads in this period yet.</div>}
      {list.map((r, i) => (
        <Opportunity key={r.p.id} r={r} i={i} W={W} labels={labels} maxScore={maxScore} vote={tally(r.p.id)}
          commentsN={comments.filter((c) => c.pid === r.p.id).length}
          watchers={team.filter((m) => (m.pains || []).includes(r.p.id))}
          addShort={addShort} openDraft={openDraft} focusRow={focusRow} />
      ))}
      {candidates?.length > 0 && (
        <section className="grid gap-3">
          <PanelLabel right={<span className="text-[11.5px] text-faint">Gemini flagged these as real pain that fits none of our tracked problems</span>}>Emerging, not tracked yet</PanelLabel>
          <div className="card p-5">
            <ul className="grid gap-2 sm:grid-cols-2">
              {candidates.map((c) => (
                <li key={c.label} className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[12.5px]">
                  <span className="min-w-0 truncate">{c.label}</span>
                  <span className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-muted">{c.n} thread{c.n > 1 ? 's' : ''}{c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-link underline underline-offset-2">read ↗</a>}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] text-faint">Add a keyword on the Topics & keywords page to start tracking one of these.</p>
          </div>
        </section>
      )}
    </div>
  );
}
