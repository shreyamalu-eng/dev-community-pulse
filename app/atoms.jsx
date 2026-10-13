'use client';
// Small building blocks shared by every page of the dashboard.
import React from 'react';
import { CATS, REL } from '../lib/painpoints';
import { SRC, CAT_STYLE, TREND, Glyph, PanelLabel } from './instruments';

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const d8 = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
export const sum = (a) => a.reduce((x, y) => x + y, 0);
export async function api(path, body) {
  const r = await fetch(`/api/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const j = await r.json().catch(() => ({ error: `Server returned ${r.status}` }));
  if (!r.ok) throw Object.assign(new Error(j.error || `Request failed (${r.status})`), { status: r.status });
  return j;
}
export const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
export const TrendPill = ({ label }) => { const t = TREND[label]; return <span className="inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[11px] font-medium" style={{ background: t.soft, color: t.ink }}><span aria-hidden="true" className="text-[8px]">{t.glyph}</span>{t.word}</span>; };
export const FewVoices = ({ n }) => <span className="inline-flex h-6 items-center rounded-full border border-dashed border-warn/60 px-2.5 text-[11px] text-warn" title={`${n} developer(s). Not enough to call a trend.`}>Too few voices</span>;
/* topic pill: glyph + label in the topic colour on a 12% fill, fixed width, never truncated */
export const TopicPill = ({ cat, compact }) => { const t = CAT_STYLE[cat] || CAT_STYLE.flow; return <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11px] font-medium ${compact ? '' : 'min-w-[148px]'}`} style={{ color: t.c2, background: `color-mix(in srgb, ${t.c} 16%, transparent)` }}><Glyph kind={t.glyph} color={t.c2} size={10} />{CATS[cat]}</span>; };
export const SrcDot = ({ s, size = 8 }) => <i className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: `linear-gradient(135deg, ${SRC[s].c}, ${SRC[s].c2})` }} aria-hidden="true" />;
export function RelTag({ rel }) {
  const cls = rel === 'core' ? 'border-ink/50 text-ink' : rel === 'adjacent' ? 'border-line-strong text-muted' : 'border-line text-faint';
  return <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[10.5px] ${cls}`}>{(REL[rel] || REL.adjacent).label}</span>;
}
/* buttons: primary = gradient filled pill · ghost = outline pill · danger = red outline that fills on hover */
export function Btn({ children, onClick, kind = 'ghost', disabled, title, type = 'button', size = 'md' }) {
  const k = kind === 'primary' ? 'bg-[linear-gradient(90deg,#A31B20,#DF7E0A)] text-white font-semibold'
    : kind === 'secondary' ? 'border-[1.5px] border-ok/60 bg-ok-soft text-ok'
    : kind === 'blue' ? 'bg-[linear-gradient(90deg,#0A1686,#4A57E6)] text-white font-semibold'
    : kind === 'danger' ? 'border-[1.5px] border-alert/60 text-alert-ink hover:bg-alert hover:text-[#0A0A14]'
    : 'border-[1.5px] border-line-strong text-ink hover:border-muted';
  const s = size === 'sm' ? 'h-7 px-3 text-[11.5px]' : size === 'lg' ? 'h-11 px-5 text-[13.5px]' : 'h-9 px-4 text-[12.5px]';
  return <button type={type} title={title} disabled={disabled} onClick={onClick} className={`press inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium ${s} ${k} disabled:cursor-not-allowed disabled:opacity-40`}>{children}</button>;
}
export const Def = ({ t, d }) => <div><dt className="inline font-medium text-ink">{t}: </dt><dd className="inline text-muted">{d}</dd></div>;
export const Eyebrow = ({ children }) => <div className="font-mono text-[11px] uppercase tracking-[.12em] text-muted">{children}</div>;
export const seg = (on) => `press h-7 whitespace-nowrap rounded-full px-3 text-[11.5px] ${on ? 'bg-surface-2 text-ink ring-1 ring-line-strong' : 'text-muted hover:text-ink'}`;
export const chip = (on) => `press inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-3 text-[11.5px] ${on ? 'border-ink/70 bg-surface-2 text-ink' : 'border-line text-muted hover:text-ink'}`;
/* every section: numbered label above, content in the card below */
export const Panel = ({ n, title, right, children, className = '', body = 'p-6' }) => (
  <section className={`grid min-w-0 content-start gap-3 ${className}`}>
    <PanelLabel n={n} right={right}>{title}</PanelLabel>
    <div className={`card min-w-0 ${body}`}>{children}</div>
  </section>
);
export const AiTag = ({ children }) => <span className="inline-flex h-5 items-center rounded-full border border-line-strong px-2 font-mono text-[9.5px] uppercase tracking-[.08em] text-muted">✦ {children}</span>;
export const Layer = ({ k, tag, children }) => (
  <div className="grid gap-1">
    <div className="flex flex-wrap items-center gap-1.5"><span className="font-mono text-[10px] uppercase tracking-[.12em] text-faint">{k}</span>{tag && <AiTag>{tag}</AiTag>}</div>
    <div className="text-[12.5px] leading-relaxed text-ink">{children}</div>
  </div>
);
export const ago = (ts) => { const h = (Date.now() - new Date(ts).getTime()) / 36e5; return h < 1 ? `${Math.max(1, Math.round(h * 60))}m ago` : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`; };
