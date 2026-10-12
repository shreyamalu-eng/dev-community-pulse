'use client';
import React, { useId, useMemo, useState } from 'react';

/* ── semantic colour maps: every colour on screen comes from here ── */
export const SRC = {
  hackernews: { c: 'var(--src-hn)', c2: 'var(--src-hn-2)', ink: 'var(--src-hn)', abbr: 'HN' },
  stackoverflow: { c: 'var(--src-so)', c2: 'var(--src-so-2)', ink: 'var(--src-so-2)', abbr: 'SO' },
  github: { c: 'var(--src-gh)', c2: 'var(--src-gh-2)', ink: 'var(--src-gh-2)', abbr: 'GH' },
  reddit: { c: 'var(--src-rd)', c2: 'var(--src-rd-2)', ink: 'var(--src-rd-2)', abbr: 'RD' },
};
export const CAT_STYLE = {
  auto: { c: 'var(--cat-auto)', c2: 'var(--cat-auto-2)', glyph: 'dots' },
  ci: { c: 'var(--cat-ci)', c2: 'var(--cat-ci-2)', glyph: 'bars' },
  culture: { c: 'var(--cat-culture)', c2: 'var(--cat-culture-2)', glyph: 'quote' },
  flow: { c: 'var(--cat-flow)', c2: 'var(--cat-flow-2)', glyph: 'half' },
};
export const TREND = {
  Spike: { c: 'var(--alert)', ink: 'var(--alert-ink)', soft: 'var(--alert-soft)', word: 'Unusual spike', glyph: '▲▲' },
  Climbing: { c: 'var(--warn)', ink: 'var(--warn)', soft: 'var(--warn-soft)', word: 'Climbing', glyph: '▲' },
  Steady: { c: 'var(--steady)', ink: 'var(--steady)', soft: 'var(--steady-soft)', word: 'Steady', glyph: '■' },
  Cooling: { c: 'var(--cool)', ink: 'var(--cool)', soft: 'var(--cool-soft)', word: 'Cooling', glyph: '▼' },
};
/* one threshold scale for every health reading */
export const healthTone = (v) => (v == null ? { c: 'var(--track)', word: 'NO DATA', ink: 'var(--faint)' } : v >= 85 ? { c: 'var(--ok)', word: 'STABLE', ink: 'var(--ok)' } : v >= 60 ? { c: 'var(--warn)', word: 'DEGRADED', ink: 'var(--warn)' } : { c: 'var(--alert)', word: 'DOWN', ink: 'var(--alert-ink)' });
const mono = { fontFamily: 'var(--font-mono), ui-monospace, monospace', fontVariantNumeric: 'tabular-nums' };

/* ── topic glyphs (category = one colour + one shape) ── */
export function Glyph({ kind, color = 'currentColor', size = 12 }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
      {kind === 'dots' && [2, 6, 10].flatMap((x) => [2, 6, 10].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" fill={color} />))}
      {kind === 'bars' && [[1, 8, 3], [4.5, 5, 6], [8, 1.5, 9.5]].map(([x, y, h]) => <rect key={x} x={x} y={y} width="2.6" height={h} rx="1" fill={color} />)}
      {kind === 'quote' && <path d="M1.5 10V6.5C1.5 4 2.7 2.6 5 2v1.6c-1 .4-1.5 1.1-1.6 2H5V10zm5.5 0V6.5C7 4 8.2 2.6 10.5 2v1.6c-1 .4-1.5 1.1-1.6 2h1.6V10z" fill={color} />}
      {kind === 'half' && <><path d="M1 6a5 5 0 0 1 10 0z" fill={color} /><path d="M3 11a3 3 0 0 1 6 0z" fill={color} opacity=".6" /></>}
      {kind === 'dash' && <rect x="2" y="5.2" width="8" height="1.6" rx=".8" fill={color} />}
    </svg>
  );
}

/* ── numbered panel label: `02 · BUYING MOMENT` ── */
export const PanelLabel = ({ n, children, right }) => (
  <div className="flex items-center justify-between gap-2">
    <div className="font-mono text-[11px] uppercase tracking-[.12em] text-muted">{n != null && <span className="text-faint">{String(n).padStart(2, '0')} · </span>}{children}</div>
    {right}
  </div>
);

/* ── status dot + word ── */
export const StatusDot = ({ color = 'var(--ok)', word, live, className = '' }) => (
  <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[.1em] ${className}`} style={{ color }}>
    <span className={`h-1.5 w-1.5 rounded-full ${live ? 'dot-live' : ''}`} style={{ background: color, color }} aria-hidden="true" />{word}
  </span>
);

/* ── underline tabs (Day · Week · Month pattern) ── */
export function Tabs({ value, onChange, options, label }) {
  return (
    <div className="flex gap-3 border-b border-line" role="tablist" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={`-mb-px border-b-2 pb-1.5 font-mono text-[11px] uppercase tracking-[.1em] transition-colors ${value === k ? 'border-ink text-ink' : 'border-transparent text-faint hover:text-muted'}`}>{l}</button>
      ))}
    </div>
  );
}

/* ── pill tooltip with pointer ── */
export const PillTip = ({ x, y, children }) => (
  <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full" style={{ left: x, top: typeof y === 'number' ? y - 8 : `calc(${y} - 8px)` }}>
    <div className="whitespace-nowrap rounded-full border border-line-strong bg-surface-2 px-3 py-1 text-[11.5px] shadow-[var(--shadow-float)]">{children}</div>
    <div className="mx-auto h-2 w-2 -translate-y-1 rotate-45 border-b border-r border-line-strong bg-surface-2" />
  </div>
);

/* ── gradient defs helper ── */
function Grad({ id, c, c2, vertical }) {
  return <linearGradient id={id} x1="0" y1={vertical ? '1' : '0'} x2={vertical ? '0' : '1'} y2="0"><stop offset="0" stopColor={c} /><stop offset="1" stopColor={c2 || c} /></linearGradient>;
}

/* ── capsule bar: track to max + gradient fill + value inside ── */
export function Capsule({ value, max, c, c2, h = 22, label, delay = 0 }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  const short = pct * 100 < 9;
  return (
    <div className="relative w-full overflow-hidden rounded-full bg-track" style={{ height: h }} role="img" aria-label={label || `${value} of ${max}`}>
      <div className="grow-in absolute inset-y-0 left-0 flex items-center justify-end rounded-full pr-2"
        style={{ width: short ? h : `${pct * 100}%`, minWidth: value > 0 ? h : 0, background: `linear-gradient(90deg, ${c}, ${c2 || c})`, animationDelay: `${delay}ms`, justifyContent: short ? 'center' : 'flex-end', paddingRight: short ? 0 : 8 }}>
        {value > 0 && h >= 14 && <span className="font-mono text-[11px] font-semibold text-[#0A0A14]" style={mono}>{value}</span>}
      </div>
      {value === 0 && h >= 14 && <span className="absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[11px] text-faint">0</span>}
    </div>
  );
}

/* ── thin donut: 10px ring, rounded caps, gaps, total in the centre ── */
export function ThinDonut({ parts, total, size = 168, centerLabel = 'threads' }) {
  const uid = useId().replace(/:/g, '');
  const [hover, setHover] = useState(null);
  const r = 70, sw = 10, C = 2 * Math.PI * r, gap = 7;
  const live = parts.filter((p) => p.value > 0);
  let acc = 0;
  const segs = live.map((p) => { const len = (p.value / (total || 1)) * C; const s = { ...p, len, off: acc }; acc += len; return s; });
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 180 180" width={size} height={size} role="img" aria-label={live.map((p) => `${p.label} ${p.value}`).join(', ')}>
        <defs>{segs.map((s) => <Grad key={s.id} id={`d${uid}${s.id}`} c={s.c} c2={s.c2} />)}</defs>
        <circle cx="90" cy="90" r={r} fill="none" stroke="var(--track)" strokeWidth={sw} />
        {segs.map((s, i) => (
          <circle key={s.id} cx="90" cy="90" r={r} fill="none" stroke={`url(#d${uid}${s.id})`} strokeWidth={hover === s.id ? sw + 3 : sw} strokeLinecap="round"
            strokeDasharray={`${Math.max(0.01, s.len - (segs.length > 1 ? gap : 0))} ${C}`} strokeDashoffset={-(s.off + (segs.length > 1 ? gap / 2 : 0))} transform="rotate(-90 90 90)"
            className="fade" style={{ animationDelay: `${i * 90}ms`, transition: 'stroke-width .2s' }}
            onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)} />
        ))}
        <text x="90" y="88" textAnchor="middle" fontSize="30" fontWeight="600" fill="var(--ink)" style={mono}>{total}</text>
        <text x="90" y="108" textAnchor="middle" fontSize="11" fill="var(--faint)" style={mono} letterSpacing="1.2">{centerLabel.toUpperCase()}</text>
      </svg>
      {hover && (() => { const s = segs.find((x) => x.id === hover); return s && <PillTip x={size / 2} y={10}><span className="text-muted">{s.label}</span> <b className="font-mono">{s.value}</b> <span className="font-mono text-faint">{Math.round((s.value / total) * 100)}%</span></PillTip>; })()}
    </div>
  );
}

/* ── ring gauge: gradient stroke, % in mono at centre. `ticked` = dotted health ring ── */
export function Ring({ value, c, c2, size = 72, stroke = 8, label, ticked, unit = '%', sub }) {
  const uid = useId().replace(/:/g, '');
  const v = value == null ? null : Math.max(0, Math.min(100, value));
  const r = 50 - stroke / 2 - 2, C = 2 * Math.PI * r;
  const tone = ticked ? healthTone(v) : null;
  const col = tone ? tone.c : c;
  return (
    <div className="grid justify-items-center gap-1">
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${label || ''} ${v == null ? 'no data' : `${v}${unit}`}`}>
        <defs><Grad id={`r${uid}`} c={col} c2={tone ? col : c2} /></defs>
        {ticked ? (
          Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * 2 * Math.PI - Math.PI / 2, on = v != null && i < Math.round((v / 100) * 24);
            return <circle key={i} cx={50 + r * Math.cos(a)} cy={50 + r * Math.sin(a)} r={stroke / 3.2} fill={on ? col : 'var(--track)'} className="fade" style={{ animationDelay: `${i * 18}ms` }} />;
          })
        ) : (<>
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
          {v > 0 && <circle cx="50" cy="50" r={r} fill="none" stroke={`url(#r${uid})`} strokeWidth={stroke} strokeLinecap="round" pathLength="1" strokeDasharray={`${v / 100} 1`} transform="rotate(-90 50 50)" className="fade" />}
        </>)}
        <text x="50" y="57" textAnchor="middle" fontSize={size < 60 ? 26 : 22} fontWeight="600" fill="var(--ink)" style={mono}>{v == null ? '–' : v}{size >= 60 && v != null && <tspan fontSize="12" fill="var(--faint)">{unit}</tspan>}</text>
      </svg>
      {label && <div className="text-center font-mono text-[10.5px] uppercase tracking-[.1em] text-muted">{label}</div>}
    </div>
  );
}

/* ── 4-segment dot meter ── */
export const DotMeter = ({ value }) => { const t = healthTone(value); const n = value == null ? 0 : Math.ceil(value / 25); return <span className="inline-flex gap-1" aria-label={`${value ?? 'no data'}%`}>{[0, 1, 2, 3].map((i) => <i key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: i < n ? t.c : 'var(--track)' }} />)}</span>; };

/* ── sparkline ── */
export function Spark({ values, color = 'var(--muted)', w = 96, h = 28, area = true }) {
  const uid = useId().replace(/:/g, '');
  const vals = values.map((v) => (v == null ? 0 : v));
  const max = Math.max(1, ...vals);
  const pts = vals.map((v, i) => [3 + (i * (w - 6)) / Math.max(1, vals.length - 1), h - 3 - (v / max) * (h - 8)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="block">
      <defs><linearGradient id={`s${uid}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {area && <path d={`${d} L${pts[pts.length - 1][0]},${h - 2} L${pts[0][0]},${h - 2} Z`} fill={`url(#s${uid})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill={color} />
    </svg>
  );
}

/* ── segmented bar (tile mini viz) ── */
export const Segments = ({ n, of, color }) => (
  <div className="flex gap-1" aria-hidden="true">{Array.from({ length: of }, (_, i) => <i key={i} className="h-2 flex-1 rounded-full" style={{ background: i < n ? color : 'var(--track)' }} />)}</div>
);

/* ── metric tile: label → hero number + unit → mini viz → footer stats ── */
export function Tile({ n, label, value, unit, tint, viz, foot = [], delta, title, note }) {
  return (
    <article className="card tile rise grid min-w-0 content-between gap-3 p-4" style={{ '--tint': tint }} title={title}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        <i className="h-1.5 w-1.5 rounded-full" style={{ background: tint }} aria-hidden="true" />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <span className="font-mono text-[34px] font-semibold leading-none tracking-tight text-ink sm:text-[40px]">{value}</span>
        {unit && <span className="text-[12px] text-faint">{unit}</span>}
        {delta && <span className="ml-auto font-mono text-[11px]" style={{ color: delta.c }}>{delta.t}</span>}
      </div>
      {note && <p className="-mt-1 text-[12px] leading-snug text-muted">{note}</p>}
      <div className="min-h-[14px]">{viz}</div>
      {foot.length > 0 && (
        <div className="grid border-t border-line pt-2" style={{ gridTemplateColumns: `repeat(${foot.length}, minmax(0,1fr))` }}>
          {foot.map(([k, v], i) => (
            <div key={k} className={`min-w-0 ${i ? 'border-l border-line pl-2' : ''}`}><div className="truncate text-[10.5px] text-faint">{k}</div><div className="font-mono text-[12px] text-ink">{v}</div></div>
          ))}
        </div>
      )}
    </article>
  );
}

/* ── scatter: volume × unusualness, top-right = act now ── */
export function Scatter({ points, xMax, yMin = -2, yMax = 3, xLabel, yLabel, onPick, h = 260 }) {
  const [hover, setHover] = useState(null);
  const W = 520, H = h, L = 40, R = 14, T = 14, B = 34;
  const xm = Math.max(4, Math.ceil((xMax || Math.max(1, ...points.map((p) => p.x))) * 1.12));
  const ylo = Math.min(yMin, ...points.map((p) => p.y)), yhi = Math.max(yMax, ...points.map((p) => p.y));
  const x = (v) => L + (v / xm) * (W - L - R), y = (v) => T + (1 - (v - ylo) / (yhi - ylo)) * (H - T - B);
  const midX = Math.round(xm / 2), midY = 1;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${yLabel} against ${xLabel}: ${points.map((p) => `${p.label} ${p.x}, ${p.y.toFixed(1)}`).join('; ')}`}>
        <rect x={x(midX)} y={T} width={x(xm) - x(midX)} height={y(midY) - T} fill="var(--alert-soft)" opacity=".5" rx="8" />
        <text x={x(midX) + 8} y={y(midY) - 8} fontSize="10.5" fill="var(--alert-ink)" style={mono} letterSpacing="1.4">ACT NOW</text>
        <text x={L + 8} y={H - B - 8} fontSize="10.5" fill="var(--faint)" style={mono} letterSpacing="1.4">BACKGROUND</text>
        <line x1={L} x2={W - R} y1={y(midY)} y2={y(midY)} stroke="var(--line)" strokeDasharray="3 5" />
        <line x1={x(midX)} x2={x(midX)} y1={T} y2={H - B} stroke="var(--line)" strokeDasharray="3 5" />
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--line-strong)" />
        <line x1={L} x2={L} y1={T} y2={H - B} stroke="var(--line-strong)" />
        {[0, Math.round(xm / 2), xm].map((t) => <text key={t} x={x(t)} y={H - B + 14} textAnchor="middle" fontSize="10" fill="var(--faint)" style={mono}>{t}</text>)}
        {[ylo, 0, 1, yhi].filter((v, i, a) => a.indexOf(v) === i).map((t) => <text key={t} x={L - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--faint)" style={mono}>{t.toFixed(0)}</text>)}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" fontSize="10.5" fill="var(--muted)" style={mono} letterSpacing="1">{xLabel.toUpperCase()}</text>
        <text x={12} y={(T + H - B) / 2} textAnchor="middle" fontSize="10.5" fill="var(--muted)" style={mono} letterSpacing="1" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>{yLabel.toUpperCase()}</text>
        {points.map((p, i) => (
          <g key={p.id} className="fade" style={{ animationDelay: `${i * 40}ms`, cursor: onPick ? 'pointer' : 'default' }} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onClick={() => onPick?.(p.id)}>
            <circle cx={x(p.x)} cy={y(p.y)} r={hover?.id === p.id ? 9 : 7} fill={p.c} fillOpacity=".25" stroke={p.c} strokeWidth="1.6" />
            <circle cx={x(p.x)} cy={y(p.y)} r="2.2" fill={p.c} />
          </g>
        ))}
      </svg>
      {hover && <PillTip x={`${(x(hover.x) / W) * 100}%`} y={`${(y(hover.y) / H) * 100}%`}><span className="text-ink">{hover.label}</span> <span className="font-mono text-faint">{hover.x} threads · z {hover.y.toFixed(1)}</span></PillTip>}
    </div>
  );
}

/* ── Sankey: three columns, ribbons coloured by their source at 35%; hover a node to trace it ── */
export function Sankey({ cols, links, h = 230, colLabels }) {
  const [hot, setHot] = useState(null);
  const W = 640, H = h, nodeW = 12, padY = 10;
  const layout = useMemo(() => {
    const pos = {};
    cols.forEach((col, ci) => {
      const tot = col.reduce((a, n) => a + n.value, 0) || 1;
      const avail = H - padY * (col.length - 1) - 24;
      let yy = 0;
      const x = ci === 0 ? 120 : ci === cols.length - 1 ? W - 150 : (W - 30) / 2;
      col.forEach((n) => { const hh = Math.max(4, (n.value / tot) * avail); pos[n.id] = { ...n, x, y: yy, h: hh, outY: yy, inY: yy }; yy += hh + padY; });
    });
    const paths = links.filter((l) => l.value > 0 && pos[l.from] && pos[l.to]).map((l) => {
      const a = pos[l.from], b = pos[l.to];
      const ha = (l.value / a.value) * a.h, hb = (l.value / b.value) * b.h;
      const y0 = a.outY + ha / 2, y1 = b.inY + hb / 2; a.outY += ha; b.inY += hb;
      const x0 = a.x + nodeW, x1 = b.x, mx = (x0 + x1) / 2;
      return { ...l, d: `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`, w: Math.max(1.5, Math.min(ha, hb)) };
    });
    return { pos, paths };
  }, [cols, links, H]);
  const touches = (p) => !hot || p.from === hot || p.to === hot || p.root === hot;
  return (
    <div className="grid gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={links.map((l) => `${l.from} to ${l.to}: ${l.value}`).join('; ')}>
        {layout.paths.map((p, i) => (
          <path key={i} d={p.d} fill="none" stroke={p.c} strokeWidth={p.w} strokeOpacity={hot ? (touches(p) ? 0.8 : 0.1) : 0.35} className="fade" style={{ transition: 'stroke-opacity .2s', animationDelay: `${i * 25}ms` }} />
        ))}
        {Object.values(layout.pos).map((n) => {
          const left = n.x < W / 3;
          return (
            <g key={n.id} onMouseEnter={() => setHot(n.id)} onMouseLeave={() => setHot(null)} style={{ cursor: 'default' }}>
              <rect x={n.x} y={n.y} width={nodeW} height={n.h} rx="4" fill={n.c} opacity={hot && hot !== n.id ? 0.5 : 1} />
              <text x={left ? n.x - 8 : n.x + nodeW + 8} y={n.y + n.h / 2 + 4} textAnchor={left ? 'end' : 'start'} fontSize="11.5" fill="var(--ink)" stroke="var(--surface)" strokeWidth="4" paintOrder="stroke" strokeLinejoin="round">
                {n.label} <tspan fill="var(--faint)" style={mono}>{n.value}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
      {colLabels && <div className="grid grid-cols-3 font-mono text-[10.5px] uppercase tracking-[.1em] text-faint"><span>{colLabels[0]}</span><span className="text-center">{colLabels[1]}</span><span className="text-right">{colLabels[2]}</span></div>}
    </div>
  );
}

/* ── heatmap: rows × weeks, five intensity steps of the row's colour ── */
export function Heatmap({ rows, cols, onPick }) {
  const max = Math.max(1, ...rows.flatMap((r) => r.values));
  const step = (v) => (v <= 0 ? 0 : Math.min(5, Math.ceil((v / max) * 5)));
  const op = [0, 0.22, 0.4, 0.6, 0.8, 1];
  const [tip, setTip] = useState(null);
  return (
    <div className="relative overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: '4px' }}>
        <thead><tr><th className="sr-only">Pain point</th>{cols.map((c, i) => <th key={c} className={`w-[52px] text-center font-mono text-[10px] font-normal ${i === cols.length - 1 ? 'text-ink' : 'text-faint'}`}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="max-w-[320px] pr-4 text-left text-[12px] font-normal">
                <button onClick={() => onPick?.(r.id)} className="flex min-w-0 items-center gap-1.5 text-left text-ink hover:underline"><Glyph kind={r.glyph} color={r.c} size={10} /><span className="truncate">{r.label}</span></button>
              </th>
              {r.values.map((v, i) => (
                <td key={i} className="p-0" onMouseEnter={(e) => setTip({ r, v, i, x: e.currentTarget.offsetLeft + e.currentTarget.offsetWidth / 2, y: e.currentTarget.offsetTop })} onMouseLeave={() => setTip(null)}>
                  <div className="mx-auto h-4 w-4 rounded-[4px]" style={{ background: step(v) ? r.c : 'var(--track)', opacity: step(v) ? op[step(v)] : 1 }} aria-label={`${r.label}, week of ${cols[i]}: ${v} threads`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {tip && <PillTip x={tip.x} y={tip.y}><span className="text-muted">{cols[tip.i]}</span> <b className="font-mono">{tip.v}</b> <span className="text-faint">threads</span></PillTip>}
      <div className="mt-2 flex items-center justify-end gap-1.5 font-mono text-[10px] text-faint">fewer {op.slice(1).map((o, i) => <i key={i} className="h-2.5 w-2.5 rounded-[3px] bg-muted" style={{ opacity: o }} />)} more</div>
    </div>
  );
}
