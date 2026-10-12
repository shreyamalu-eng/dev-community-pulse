'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';

/* Calendar for picking what the brief covers: one report week (Fri–Thu, IST), one calendar month,
   or any custom range. Days are tinted by how many threads were collected, so gaps in history show. */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const add = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addM = (ym, n) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
const dow = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
const d8 = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const span = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5) + 1;
const fri = (iso) => add(iso, -((dow(iso) - 5 + 7) % 7));
const monthLabel = (ym) => `${MONTH_FULL[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`;

export function periodButtonLabel(p) {
  if (!p) return 'Pick a period';
  if (p.grain === 'month') return p.label;
  if (p.grain === 'custom') return p.label;
  return `Fri ${d8(p.from)} – Thu ${d8(p.to)}`;
}

/* one month of days; firstDow 5 = rows start on Friday (report weeks), 1 = Monday */
function MonthGrid({ ym, firstDow, days, max, isDisabled, rowMode, selected, inRange, onDay, onRow, hoverRow, setHoverRow }) {
  const first = `${ym}-01`;
  const start = add(first, -((dow(first) - firstDow + 7) % 7));
  const rows = [];
  for (let r = 0; r < 6; r++) {
    const cells = Array.from({ length: 7 }, (_, i) => add(start, r * 7 + i));
    if (r > 0 && cells[0].slice(0, 7) !== ym && cells[0] > first) break;
    rows.push(cells);
  }
  const heads = Array.from({ length: 7 }, (_, i) => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][(firstDow + i) % 7]);
  return (
    <div className="grid gap-1" role="grid" aria-label={monthLabel(ym)}>
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_44px] gap-1 font-mono text-[10px] text-faint" role="row">
        {heads.map((h, i) => <span key={i} className="text-center" role="columnheader">{h}</span>)}
        <span className="text-right" role="columnheader">{rowMode ? 'threads' : ''}</span>
      </div>
      {rows.map((cells) => {
        const rowKey = cells[0];
        const rowOff = rowMode && isDisabled(rowKey);
        const rowSel = rowMode && selected === rowKey;
        const rowHot = rowMode && hoverRow === rowKey && !rowOff;
        const total = cells.reduce((a, d) => a + (days[d] || 0), 0);
        const Row = rowMode ? 'button' : 'div';
        return (
          <Row key={rowKey} type={rowMode ? 'button' : undefined} disabled={rowMode ? rowOff : undefined}
            onClick={rowMode ? () => onRow(rowKey) : undefined}
            onMouseEnter={rowMode ? () => setHoverRow(rowKey) : undefined} onMouseLeave={rowMode ? () => setHoverRow(null) : undefined}
            aria-pressed={rowMode ? rowSel : undefined}
            aria-label={rowMode ? `Week Fri ${d8(cells[0])} to Thu ${d8(cells[6])}, ${total} threads` : undefined}
            className={`grid grid-cols-[repeat(7,minmax(0,1fr))_44px] items-center gap-1 rounded-[10px] ${rowMode ? `press px-0 text-left ${rowSel ? 'bg-[var(--brand-red)] text-white' : rowHot ? 'bg-surface-2 ring-1 ring-line-strong' : ''} disabled:cursor-not-allowed disabled:opacity-35` : ''}`}>
            {cells.map((d) => {
              const out = d.slice(0, 7) !== ym;
              const off = isDisabled(d);
              const v = days[d] || 0;
              const heat = !off && v ? Math.round(18 + 62 * Math.min(1, v / Math.max(1, max))) : 0;
              const sel = !rowMode && (selected?.[0] === d || selected?.[1] === d);
              const mid = !rowMode && inRange?.(d);
              const Cell = rowMode ? 'span' : 'button';
              return (
                <Cell key={d} type={rowMode ? undefined : 'button'} disabled={rowMode ? undefined : off} onClick={rowMode ? undefined : () => onDay(d)}
                  title={off ? 'No data for this day' : `${d8(d)} · ${v} thread${v === 1 ? '' : 's'}`}
                  aria-label={rowMode ? undefined : `${d8(d)}${off ? ', unavailable' : `, ${v} threads`}`}
                  className={`relative grid h-8 place-items-center rounded-[8px] font-mono text-[11.5px] ${out ? 'opacity-40' : ''} ${rowMode ? '' : `press ${sel ? 'bg-[var(--brand-red)] text-white' : mid ? 'bg-[color-mix(in_srgb,var(--brand-red)_28%,transparent)] text-ink' : 'hover:ring-1 hover:ring-line-strong'} disabled:cursor-not-allowed disabled:opacity-30`}`}>
                  {heat > 0 && !sel && !(rowMode && rowSel) && <i className="absolute inset-x-[30%] bottom-[3px] h-[3px] rounded-full" style={{ background: `color-mix(in srgb, var(--brand-orange) ${heat}%, transparent)` }} aria-hidden="true" />}
                  {+d.slice(8)}
                </Cell>
              );
            })}
            <span className={`text-right font-mono text-[10.5px] ${rowSel ? 'text-white' : 'text-muted'}`}>{rowMode ? (rowOff ? '' : total) : ''}</span>
          </Row>
        );
      })}
    </div>
  );
}

export default function PeriodPicker({ period, cal, loadCal, onApply, history, onLoadHistory, historyBusy }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(period?.grain || 'week');
  const [ym, setYm] = useState(null);
  const [range, setRange] = useState([null, null]);
  const [hoverRow, setHoverRow] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTab(period?.grain || 'week');
    setYm((period?.to || cal?.latestWeek || new Date().toISOString()).slice(0, 7));
    setRange(period?.grain === 'custom' ? [period.from, period.to] : [null, null]);
    if (!cal) loadCal();
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey); document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = cal?.days || {};
  const hStart = cal?.historyStart || '2000-01-01';
  const firstData = cal?.firstData || cal?.today || hStart;
  const earliest = firstData > hStart ? firstData : hStart;
  const today = cal?.today || new Date().toISOString().slice(0, 10);
  const latestWeek = cal?.latestWeek || today;
  const lastMonth = cal?.lastMonth || today.slice(0, 7);
  const maxDay = useMemo(() => Math.max(1, ...Object.values(days)), [days]);
  const minYm = earliest.slice(0, 7);
  const maxYm = today.slice(0, 7);
  const months = useMemo(() => { const out = []; for (let m = lastMonth; m >= minYm; m = addM(m, -1)) out.push(m); return out; }, [lastMonth, minYm]);
  const monthTotal = (m) => Object.entries(days).filter(([d]) => d.startsWith(m)).reduce((a, [, v]) => a + v, 0);
  const maxMonth = Math.max(1, ...months.map(monthTotal));

  const pickWeek = (w) => { onApply({ grain: 'week', week: w }); setOpen(false); };
  const pickMonth = (m) => { onApply({ grain: 'month', month: m }); setOpen(false); };
  const pickDay = (d) => {
    const [a, b] = range;
    if (!a || b) setRange([d, null]);
    else setRange(d < a ? [d, a] : [a, d]);
  };
  const applyRange = () => { if (range[0]) { onApply({ grain: 'custom', from: range[0], to: range[1] || range[0] }); setOpen(false); } };
  const preset = (n, unit) => {
    const to = add(latestWeek, 6);
    const from = unit === 'w' ? add(latestWeek, -7 * (n - 1)) : `${addM(to.slice(0, 7), -(n - 1))}-01`;
    setRange([from < earliest ? earliest : from, to]);
  };
  const weekOff = (w) => w < fri(earliest) || w > latestWeek;
  const dayOff = (d) => d < earliest || d > today;
  const selWeek = period?.grain === 'week' ? period.from : null;
  const gridYm = ym || maxYm;
  const canPrev = gridYm > minYm, canNext = gridYm < maxYm;
  const nav = (
    <div className="flex items-center justify-between">
      <button type="button" onClick={() => canPrev && setYm(addM(gridYm, -1))} disabled={!canPrev} className="press grid h-8 w-8 place-items-center rounded-full border border-line text-muted hover:text-ink disabled:opacity-30" aria-label="Previous month">‹</button>
      <div className="text-[13.5px] font-medium">{monthLabel(gridYm)}</div>
      <button type="button" onClick={() => canNext && setYm(addM(gridYm, 1))} disabled={!canNext} className="press grid h-8 w-8 place-items-center rounded-full border border-line text-muted hover:text-ink disabled:opacity-30" aria-label="Next month">›</button>
    </div>
  );
  const tabs = [['week', 'Weekly'], ['month', 'Monthly'], ['custom', 'Custom range']];
  const label = periodButtonLabel(period);
  const grainWord = { week: 'Week', month: 'Month', custom: 'Range' }[period?.grain || 'week'];
  const hist = history || cal?.history;

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog"
        className="press inline-flex h-9 items-center gap-2 rounded-full border-[1.5px] border-line-strong bg-transparent pl-3 pr-3.5 text-ink hover:border-ink/50">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M1.5 6.5h13M5 1v3M11 1v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
        <span className="font-mono text-[10px] uppercase tracking-[.1em] text-faint">{grainWord}</span>
        <span className="font-mono text-[11.5px]">{label}</span>
        <span className="text-faint" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Pick the period for the brief"
          className="rise fixed inset-x-4 top-20 z-50 grid max-h-[calc(100vh-96px)] gap-4 overflow-y-auto rounded-[18px] border border-line-strong bg-surface p-4 shadow-[var(--shadow-float)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[380px]">
          <div className="flex rounded-full border border-line p-[3px]" role="tablist" aria-label="Report type">
            {tabs.map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`press h-8 flex-1 whitespace-nowrap rounded-full px-3 text-[12px] ${tab === k ? 'bg-surface-2 text-ink ring-1 ring-line-strong' : 'text-muted hover:text-ink'}`}>{l}</button>
            ))}
          </div>

          {!cal && <div className="grid h-[260px] place-items-center text-[12.5px] text-muted">Loading calendar…</div>}

          {cal && tab === 'week' && (
            <div className="grid gap-3">
              {nav}
              <MonthGrid ym={gridYm} firstDow={5} days={days} max={maxDay} isDisabled={weekOff} rowMode selected={selWeek} onRow={pickWeek} hoverRow={hoverRow} setHoverRow={setHoverRow} />
              <p className="text-[11.5px] text-faint">Each row is one report week, Friday to Thursday (IST). The week in progress opens once it is complete.</p>
            </div>
          )}

          {cal && tab === 'month' && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {months.map((m) => {
                  const t = monthTotal(m);
                  const partial = `${m}-01` < earliest;
                  const sel = period?.grain === 'month' && period.key === `m:${m}`;
                  return (
                    <button key={m} type="button" onClick={() => pickMonth(m)} aria-pressed={sel}
                      className={`press grid gap-1.5 rounded-[12px] border p-3 text-left ${sel ? 'border-[var(--brand-red)] bg-[color-mix(in_srgb,var(--brand-red)_22%,transparent)]' : 'border-line hover:border-line-strong'}`}>
                      <span className="text-[13px] font-medium">{MON[+m.slice(5) - 1]} {m.slice(0, 4)}</span>
                      <span className="font-mono text-[11px] text-muted">{t.toLocaleString('en-IN')} threads{partial ? ' · partial' : ''}</span>
                      <span className="h-[3px] rounded-full bg-track"><span className="block h-full rounded-full" style={{ width: `${Math.round((t / maxMonth) * 100)}%`, background: 'var(--brand-orange)' }} /></span>
                    </button>
                  );
                })}
                <div className="grid gap-1.5 rounded-[12px] border border-dashed border-line p-3 text-left opacity-50" title="Opens when the month ends">
                  <span className="text-[13px] font-medium">{MON[+today.slice(5, 7) - 1]} {today.slice(0, 4)}</span>
                  <span className="font-mono text-[11px] text-faint">in progress</span>
                </div>
              </div>
              <p className="text-[11.5px] text-faint">Calendar months (IST), each compared with the five months before it.</p>
            </div>
          )}

          {cal && tab === 'custom' && (
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-1.5">
                {[['Last 4 weeks', 4, 'w'], ['Last 8 weeks', 8, 'w'], ['Last 3 months', 3, 'm'], ['Last 6 months', 6, 'm']].map(([l, n, u]) => (
                  <button key={l} type="button" onClick={() => preset(n, u)} className="press h-7 rounded-full border border-line px-3 text-[11.5px] text-muted hover:text-ink">{l}</button>
                ))}
              </div>
              {nav}
              <MonthGrid ym={gridYm} firstDow={1} days={days} max={maxDay} isDisabled={dayOff} selected={range} onDay={pickDay}
                inRange={(d) => range[0] && range[1] && d > range[0] && d < range[1]} />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <span className="font-mono text-[11.5px] text-muted">
                  {range[0] ? `${d8(range[0])} → ${range[1] ? d8(range[1]) : 'pick an end date'}${range[1] ? ` · ${span(range[0], range[1])} days` : ''}` : 'Pick a start date'}
                </span>
                <button type="button" onClick={applyRange} disabled={!range[0]} className="press h-8 rounded-full bg-[var(--brand-red)] px-4 text-[12px] font-medium text-white disabled:opacity-40">Show range</button>
              </div>
              <p className="text-[11.5px] text-faint">The range is compared with equal-length periods just before it, as far back as history goes.</p>
            </div>
          )}

          {cal && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[11.5px]">
              <span className="text-muted">History from <span className="font-mono text-ink">{d8(earliest)} {earliest.slice(0, 4)}</span>{hist && hist.remaining > 0 ? <span className="text-faint"> · {hist.filled}/{hist.slices} older blocks loaded</span> : null}</span>
              {hist && hist.remaining > 0 && (
                <button type="button" onClick={() => { setOpen(false); onLoadHistory(); }} disabled={historyBusy} className="press h-7 rounded-full border border-line-strong px-3 text-[11.5px] text-ink disabled:opacity-40">
                  {historyBusy ? 'Loading history…' : 'Load 6 months of history'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
