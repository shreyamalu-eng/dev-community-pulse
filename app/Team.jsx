'use client';
// Team: what each of the 15 people watches, the problems they care about, and their view. Everyone sees every profile;
// each person edits their own.
import React, { useState } from 'react';
import { TEAM, GROUPS } from '../lib/team';
import { CAT_STYLE, TREND, Glyph, PanelLabel } from './instruments';
import { Btn, chip, ago } from './atoms';
import { Avatar } from './Discussion';

function Editor({ p, onSave, onCancel }) {
  const [focus, setFocus] = useState(p.focus || '');
  const [view, setView] = useState(p.view || '');
  const [kw, setKw] = useState((p.keywords || []).join(', '));
  const [busy, setBusy] = useState(false);
  const save = async (e) => { e.preventDefault(); setBusy(true); try { if (await onSave({ person: p.id, focus, view, keywords: kw.split(',').map((x) => x.trim()).filter(Boolean) })) onCancel(); } finally { setBusy(false); } };
  const field = 'w-full rounded-[10px] border border-line bg-sunk px-2.5 py-1.5 text-[12.5px] text-ink focus:border-line-strong';
  return (
    <form onSubmit={save} className="grid gap-2">
      <label className="grid gap-1 text-[11px] text-faint">What I focus on<input className={field} value={focus} maxLength={200} onChange={(e) => setFocus(e.target.value)} /></label>
      <label className="grid gap-1 text-[11px] text-faint">My view<textarea className={field} rows={3} value={view} maxLength={600} onChange={(e) => setView(e.target.value)} /></label>
      <label className="grid gap-1 text-[11px] text-faint">My keywords (comma separated, up to 8)<input className={field} value={kw} onChange={(e) => setKw(e.target.value)} /></label>
      <div className="flex gap-2"><Btn size="sm" kind="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn><Btn size="sm" onClick={onCancel}>Cancel</Btn></div>
    </form>
  );
}

function Person({ p, me, rowsById, termFound, W, onSave, focusRow }) {
  const [edit, setEdit] = useState(false);
  const issues = (p.pains || []).map((id) => rowsById[id]).filter(Boolean);
  return (
    <article className={`card grid content-start gap-3 p-5 ${me ? 'ring-1 ring-line-strong' : ''}`}>
      <header className="flex items-start gap-3">
        <Avatar id={p.id} size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5"><h3 className="text-[15px] font-semibold">{p.name}</h3>{me && <span className="rounded-full bg-surface-2 px-2 font-mono text-[9.5px] uppercase tracking-[.08em] text-ink">you</span>}{p.decides ? <span className="rounded-full border border-warn/60 px-2 font-mono text-[9.5px] uppercase tracking-[.08em] text-warn">decides</span> : p.voter ? <span className="rounded-full border border-line-strong px-2 font-mono text-[9.5px] uppercase tracking-[.08em] text-muted">votes</span> : null}</div>
          <div className="text-[12px] text-muted">{p.role} · {GROUPS[p.group]}</div>
        </div>
        {me && !edit && <button onClick={() => setEdit(true)} className="text-[11.5px] text-link underline underline-offset-2">Edit</button>}
      </header>
      {edit ? <Editor p={p} onSave={onSave} onCancel={() => setEdit(false)} /> : (<>
        {p.focus && <p className="text-[12px] text-muted"><span className="text-ink">Focus: </span>{p.focus}</p>}
        <blockquote className="border-l-2 border-line-strong pl-3 text-[13px] leading-relaxed text-ink">"{p.view}"</blockquote>
        <div className="grid gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[.1em] text-faint">Primary keywords</span>
          <div className="flex flex-wrap gap-1.5">
            {(p.keywords || []).map((k) => { const f = termFound(k); return (
              <span key={k} title={f == null ? 'Not on the watchlist yet: add it on Topics & keywords' : `${f} threads in the last 4 weeks`} className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] ${f == null ? 'border-dashed border-line text-faint' : 'border-line-strong text-ink'}`}>
                {k}{f != null && <b className="font-mono text-[10px] font-medium text-muted">{f}</b>}
              </span>
            ); })}
          </div>
        </div>
        {issues.length > 0 && (
          <div className="grid gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[.1em] text-faint">Issues they track · {W.this}</span>
            {issues.map((r) => { const t = TREND[r.st.label]; return (
              <button key={r.p.id} onClick={() => focusRow(r.p.id)} className="flex items-center justify-between gap-2 rounded-[8px] px-1 py-0.5 text-left text-[12px] hover:bg-surface-2">
                <span className="flex min-w-0 items-center gap-1.5"><Glyph kind={CAT_STYLE[r.p.cat].glyph} color={CAT_STYLE[r.p.cat].c2} size={10} /><span className="truncate">{r.p.title}</span></span>
                <span className="shrink-0 font-mono text-[11px]" style={{ color: t.ink }}>{t.glyph} {r.st.cur}</span>
              </button>
            ); })}
          </div>
        )}
        <div className="text-[10.5px] text-faint">{p.updatedAt ? `Updated by ${p.name} ${ago(p.updatedAt)}` : 'Starting profile · edit it when you pick yourself above'}</div>
      </>)}
    </article>
  );
}

export default function Team({ people, rows, terms, viewer, setViewer, onSave, W, focusRow }) {
  const [group, setGroup] = useState('all');
  const [q, setQ] = useState('');
  const list = people?.length ? people : TEAM;
  const rowsById = Object.fromEntries(rows.map((r) => [r.p.id, r]));
  const found = Object.fromEntries((terms || []).filter((t) => t.kind === 'include').map((t) => [t.term.toLowerCase(), t.found]));
  const termFound = (k) => (k.toLowerCase() in found ? found[k.toLowerCase()] : null);
  const needle = q.trim().toLowerCase();
  const shown = list.filter((p) => (group === 'all' || p.group === group) && (!needle || [p.name, p.role, p.focus, p.view, ...(p.keywords || []), ...(p.pains || []).map((id) => rowsById[id]?.p.title || '')].join(' ').toLowerCase().includes(needle)));

  // team attention vs community volume: where the team is looking compared with where developers are complaining
  const att = rows.filter((r) => r.st.cur > 0 || list.some((p) => (p.pains || []).includes(r.p.id))).map((r) => {
    const who = list.filter((p) => (p.pains || []).includes(r.p.id));
    return { r, who };
  }).sort((a, b) => b.r.st.cur - a.r.st.cur);
  const vols = att.map((x) => x.r.st.cur).sort((a, b) => a - b);
  const median = vols.length ? vols[Math.floor(vols.length / 2)] : 0;
  const verdict = ({ r, who }) => (r.st.cur >= Math.max(median, 1) && who.length <= 1 ? { w: 'Blind spot', c: 'var(--alert-ink)', why: 'Developers talk about it a lot, but almost nobody on the team tracks it' }
    : who.length >= 4 && r.st.cur < Math.max(median, 1) ? { w: 'Over-watched', c: 'var(--warn)', why: 'Many of us track it, but developers raise it less than most' }
    : { w: 'Covered', c: 'var(--ok)', why: 'Team attention roughly matches community volume' });
  const missing = [...new Set(list.flatMap((p) => p.keywords || []))].filter((k) => termFound(k) == null);

  return (
    <div className="grid gap-4">
      <section className="card grid gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[80ch] text-[14px] leading-relaxed">{list.length} people, one view of the problem space: what each person watches, the issues they track and how they see them. Sumit decides, Neha and Kabir vote, and everyone can comment on the team vote.</p>
          <label className="flex items-center gap-2 text-[12px] text-muted">You are
            <select value={viewer} onChange={(e) => setViewer(e.target.value)} className="h-8 rounded-full border-[1.5px] border-line-strong bg-transparent px-3 text-[12px] text-ink">
              {list.map((p) => <option key={p.id} value={p.id} className="bg-surface">{p.name} ({p.role})</option>)}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[['People', list.length], ['Vote', list.filter((p) => p.voter).length], ['Keywords watched', new Set(list.flatMap((p) => (p.keywords || []).map((k) => k.toLowerCase()))).size], ['Blind spots', att.filter((x) => verdict(x).w === 'Blind spot').length]].map(([k, v]) => (
            <div key={k} className="rounded-[12px] border border-line bg-surface-2 px-3 py-2"><div className="font-mono text-[10px] uppercase tracking-[.1em] text-faint">{k}</div><div className="font-mono text-[24px] font-semibold">{v}</div></div>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <PanelLabel n={1} right={<span className="hidden text-[11.5px] text-faint sm:inline">threads {W.this} vs. teammates tracking each problem</span>}>Team attention vs. community volume</PanelLabel>
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-[12.5px]">
            <thead><tr className="bg-surface-2 font-mono text-[10px] uppercase tracking-[.1em] text-faint"><th className="px-5 py-2.5 font-normal">Problem</th><th className="px-2 py-2.5 text-right font-normal">Threads</th><th className="px-2 py-2.5 font-normal">Who tracks it</th><th className="px-5 py-2.5 font-normal">Verdict</th></tr></thead>
            <tbody>
              {att.map((x) => { const v = verdict(x); return (
                <tr key={x.r.p.id} className="border-t border-line">
                  <td className="px-5 py-2"><button onClick={() => focusRow(x.r.p.id)} className="flex items-center gap-1.5 text-left hover:underline"><Glyph kind={CAT_STYLE[x.r.p.cat].glyph} color={CAT_STYLE[x.r.p.cat].c2} size={10} />{x.r.p.title}</button></td>
                  <td className="px-2 py-2 text-right font-mono">{x.r.st.cur}</td>
                  <td className="px-2 py-2"><span className="flex items-center gap-2"><span className="flex -space-x-1.5">{x.who.slice(0, 7).map((p) => <span key={p.id} className="rounded-full ring-2 ring-surface"><Avatar id={p.id} size={20} /></span>)}</span><span className="text-[11px] text-faint">{x.who.length ? x.who.map((p) => p.name).join(', ') : 'nobody'}</span></span></td>
                  <td className="px-5 py-2" title={v.why}><span className="font-mono text-[11px]" style={{ color: v.c }}>{v.w}</span></td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
        {missing.length > 0 && <p className="text-[11.5px] text-faint">Keywords the team cares about that the watchlist does not track yet: {missing.join(', ')}.</p>}
      </section>

      <section className="grid gap-3">
        <PanelLabel n={2}>Perspectives</PanelLabel>
        <div className="flex flex-wrap items-center gap-2">
          {[['all', 'Everyone'], ...Object.entries(GROUPS)].map(([k, l]) => <button key={k} onClick={() => setGroup(k)} aria-pressed={group === k} className={chip(group === k)}>{l} <span className="font-mono opacity-60">{k === 'all' ? list.length : list.filter((p) => p.group === k).length}</span></button>)}
          <label className="sr-only" htmlFor="team-q">Search the team</label>
          <input id="team-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a keyword, problem or name" className="ml-auto h-8 w-full rounded-full border-[1.5px] border-line bg-transparent px-3.5 text-[12px] text-ink placeholder:text-faint sm:w-[280px]" />
        </div>
        {shown.length === 0 && <div className="card p-6 text-center text-[13px] text-muted">Nobody matches "{q}".</div>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => <Person key={p.id} p={p} me={p.id === viewer} rowsById={rowsById} termFound={termFound} W={W} onSave={onSave} focusRow={focusRow} />)}
        </div>
      </section>
    </div>
  );
}
