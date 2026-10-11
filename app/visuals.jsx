'use client';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

function useWidth(fallback = 720) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const set = () => setW(Math.max(280, Math.round(el.clientWidth)));
    set();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  return [ref, w];
}

/* Smooth Catmull-Rom → cubic Bézier path through points */
function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const t = 0.18;
    // clamp control points between the two ends so the curve never overshoots (no dips below zero)
    const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
    const cl = (v) => Math.min(hi, Math.max(lo, v));
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, cl(p1[1] + (p2[1] - p0[1]) * t)];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, cl(p2[1] - (p3[1] - p1[1]) * t)];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
const niceMax = (m) => { if (m <= 4) return 4; const p = 10 ** Math.floor(Math.log10(m)); const n = m / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };

/* Flowing multi-series line chart with glow, hover read-out and a table fallback */
export function FlowChart({ series, labels, height = 260, unit = 'threads' }) {
  const uid = useId().replace(/:/g, '');
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const [wrap, W] = useWidth();
  const H = W < 500 ? Math.round(height * 0.8) : height, L = 34, R = 14, T = 16, B = 28;
  const mono = { fontFamily: 'var(--font-mono), ui-monospace, monospace' };
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const x = (i) => L + (i * (W - L - R)) / Math.max(1, labels.length - 1);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, max / 2, max].map((t) => Math.round(t));
  if (asTable) {
    return (
      <div className="grid gap-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[12.5px]">
            <thead><tr className="text-muted"><th className="py-1 pr-3 font-medium">Pain point</th>{labels.map((l) => <th key={l} className="py-1 px-1 text-right font-medium">{l}</th>)}</tr></thead>
            <tbody>{series.map((s) => (
              <tr key={s.id} className="border-t border-line"><td className="py-1.5 pr-3">{s.label}</td>{s.values.map((v, i) => <td key={i} className="px-1 text-right font-mono tnum">{v}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
        <button onClick={() => setAsTable(false)} className="justify-self-start text-[12px] text-blue-ink underline underline-offset-2">Show as chart</button>
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <div className="relative" ref={wrap}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={`Unique ${unit} per week: ${series.map((s) => `${s.label} ${s.values[s.values.length - 1]} this week`).join('; ')}`}>
          <defs>
            <filter id={`glow${uid}`} x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>
            {series.map((s) => (
              <linearGradient key={s.id} id={`fill${uid}${s.id}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.28" /><stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="3 5" />
              <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--faint)" style={mono}>{t}</text>
            </g>
          ))}
          {labels.map((l, i) => (
            (W >= 500 || i % 2 === 1 || i === labels.length - 1) && <text key={l} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={i === labels.length - 1 ? 'var(--ink)' : 'var(--faint)'} style={mono}>{l}</text>
          ))}
          {series.map((s, si) => {
            const pts = s.values.map((v, i) => [x(i), y(v)]);
            const d = smoothPath(pts);
            const area = `${d} L${x(s.values.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
            return (
              <g key={s.id}>
                {si === 0 && <path d={area} fill={`url(#fill${uid}${s.id})`} />}
                <path d={d} fill="none" stroke={s.color} strokeWidth="6" opacity="0.35" filter={`url(#glow${uid})`} />
                <path d={d} fill="none" stroke={s.color} strokeWidth={si === 0 ? 3 : 2.2} strokeLinecap="round" pathLength="1" className="draw" style={{ animationDelay: `${si * 120}ms` }} />
                <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4.5" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
              </g>
            );
          })}
          {hover != null && (
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--line-strong)" />
          )}
          {labels.map((l, i) => (
            <rect key={l} x={x(i) - (W - L - R) / (labels.length - 1) / 2} y={T} width={(W - L - R) / (labels.length - 1)} height={H - T - B} fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          ))}
        </svg>
        {hover != null && (
          <div className="pointer-events-none absolute top-2 rounded-ctl border border-line bg-surface-2 px-3 py-2 text-[12px] shadow-lg"
            style={{ left: `clamp(8px, calc(${(x(hover) / W) * 100}% - 90px), calc(100% - 190px))`, width: 180 }}>
            <div className="mb-1 font-mono text-[11px] text-muted">Week of {labels[hover]}</div>
            {series.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5"><i className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} /><span className="truncate">{s.short || s.label}</span></span><b className="font-mono tnum">{s.values[hover]}</b></div>
            ))}
          </div>
        )}
      </div>
      <button onClick={() => setAsTable(true)} className="justify-self-start text-[12px] text-blue-ink underline underline-offset-2">Show as table</button>
    </div>
  );
}

/* Tiny flowing line for cards */
export function MiniFlow({ values, color = 'var(--orange)', w = 220, h = 64 }) {
  const uid = useId().replace(/:/g, '');
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [6 + (i * (w - 12)) / Math.max(1, values.length - 1), h - 8 - (v / max) * (h - 18)]);
  const d = smoothPath(pts);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full" aria-hidden="true">
      <defs>
        <filter id={`mg${uid}`} x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="4" /></filter>
        <linearGradient id={`mf${uid}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".3" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient>
      </defs>
      <path d={`${d} L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z`} fill={`url(#mf${uid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="6" opacity=".35" filter={`url(#mg${uid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" pathLength="1" className="draw" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

/* Small inline sparkline for table rows */
export function Spark({ values, color, w = 96, h = 28 }) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [3 + (i * (w - 6)) / Math.max(1, values.length - 1), h - 3 - (v / max) * (h - 6)]);
  const d = smoothPath(pts);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <line x1="3" x2={w - 3} y1={h - 3} y2={h - 3} stroke="var(--line)" />
      <path d={`${d} L${pts[pts.length - 1][0]},${h - 3} L${pts[0][0]},${h - 3} Z`} fill={color} opacity=".12" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.6" fill={color} />
    </svg>
  );
}

/* Extruded (pseudo-3D) donut: share of this week's pain by topic */
export function Donut3D({ parts, total, size = 200 }) {
  const r = 70, c = 2 * Math.PI * r, sw = 34;
  const segs = useMemo(() => {
    let acc = 0;
    return parts.filter((p) => p.value > 0).map((p) => { const len = (p.value / (total || 1)) * c; const s = { ...p, len, off: acc }; acc += len; return s; });
  }, [parts, total, c]);
  const layer = (shade, key, z) => (
    <svg key={key} viewBox="0 0 200 200" width={size} height={size} className="absolute inset-0" style={{ transform: `translateZ(${z}px)`, filter: shade ? `brightness(${shade})` : undefined }} aria-hidden="true">
      <circle cx="100" cy="100" r={r} fill="none" stroke="var(--sunk)" strokeWidth={sw} />
      {segs.map((s) => (
        <circle key={s.id} cx="100" cy="100" r={r} fill="none" stroke={s.color} strokeWidth={sw}
          strokeDasharray={`${Math.max(0, s.len - 2)} ${c}`} strokeDashoffset={-s.off} transform="rotate(-90 100 100)" />
      ))}
    </svg>
  );
  const depth = 12;
  return (
    <div className="float relative" style={{ width: size, height: size * 0.72, perspective: 700 }}>
      <div className="absolute left-0 top-[-14%]" style={{ width: size, height: size, transformStyle: 'preserve-3d', transform: 'rotateX(58deg) rotateZ(-24deg)' }}>
        {Array.from({ length: depth }, (_, i) => layer(0.38 + (i / depth) * 0.25, `l${i}`, i * 1.6 - depth * 1.6))}
        {layer(null, 'top', 0)}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-[-8%] mx-auto h-5 w-3/4 rounded-full bg-black/40 blur-xl" aria-hidden="true" />
    </div>
  );
}

/* Original flat isometric illustration in brand colours: a report sheet rising from a laptop, server stacks, gears */
export function PulseIllustration({ className = '' }) {
  return (
    <svg viewBox="0 0 420 280" className={className} role="img" aria-label="Illustration: community threads flowing from servers into a weekly report">
      <defs>
        <linearGradient id="ill-sheet" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#E7E9F6" /></linearGradient>
        <linearGradient id="ill-screen" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#1B2AB8" /><stop offset="1" stopColor="#0A1686" /></linearGradient>
      </defs>
      {/* floor grid */}
      <g stroke="rgba(142,152,255,.25)" strokeWidth="1" fill="none">
        <path d="M30 220 L210 130 L390 220 L210 270 Z" />
        <path d="M75 197 L255 107 M120 175 L300 85" opacity=".5" />
      </g>
      {/* servers */}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${268 + i * 34} ${78 + i * 17})`}>
          <path d="M0 18 L26 4 L52 18 L26 32 Z" fill="#E9EBF7" />
          <path d="M0 18 L0 98 L26 112 L26 32 Z" fill="#C9CDEA" />
          <path d="M26 32 L26 112 L52 98 L52 18 Z" fill="url(#ill-screen)" />
          {[0, 1, 2, 3, 4, 5].map((r) => <path key={r} d={`M31 ${42 + r * 11} l16 -8`} stroke="#8E98FF" strokeWidth="2" strokeLinecap="round" opacity=".8" />)}
        </g>
      ))}
      {/* laptop */}
      <g transform="translate(70 120)">
        <path d="M0 70 L110 18 L190 58 L80 112 Z" fill="#DADDF0" />
        <path d="M20 66 L108 25 L170 56 L82 98 Z" fill="#C3C7E6" />
        <path d="M0 70 L0 -20 L110 -72 L110 18 Z" fill="url(#ill-screen)" />
      </g>
      {/* report sheet curling out of the screen */}
      <g className="float">
        <path d="M92 64 C120 20 170 10 210 18 L250 112 C210 104 170 112 140 150 Z" fill="url(#ill-sheet)" stroke="#D4D8EE" />
        <path d="M120 70 C140 52 160 60 176 46 C190 34 204 44 214 36" fill="none" stroke="#A31B20" strokeWidth="3" strokeLinecap="round" />
        <path d="M126 86 C146 74 164 82 180 70 C194 60 208 66 222 58" fill="none" stroke="#DF7E0A" strokeWidth="3" strokeLinecap="round" />
        <g fill="#0A1686" opacity=".85">
          <rect x="150" y="100" width="7" height="20" rx="2" transform="skewY(-14)" />
          <rect x="162" y="94" width="7" height="30" rx="2" transform="skewY(-14)" />
          <rect x="174" y="90" width="7" height="38" rx="2" transform="skewY(-14)" />
        </g>
      </g>
      {/* gears */}
      <g transform="translate(46 214)" fill="none" stroke="#F4A53F" strokeWidth="6">
        <circle r="16" /><circle r="5" fill="#F4A53F" stroke="none" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <path key={a} d="M0 -18 v-6" transform={`rotate(${a})`} strokeLinecap="round" />)}
      </g>
      <g transform="translate(82 236)" fill="none" stroke="#A31B20" strokeWidth="5">
        <circle r="10" />
        {[0, 60, 120, 180, 240, 300].map((a) => <path key={a} d="M0 -12 v-5" transform={`rotate(${a})`} strokeLinecap="round" />)}
      </g>
      {/* floating tiles */}
      {[[350, 236], [236, 248], [150, 262]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y} l14 -7 l14 7 l-14 7 Z`} fill="#E9EBF7" opacity=".9" />
      ))}
    </svg>
  );
}
