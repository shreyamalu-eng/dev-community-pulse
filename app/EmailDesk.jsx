'use client';
// Friday email desk on the Team page: see exactly what goes out, edit it, add more, send it now.
import React, { useEffect, useRef, useState } from 'react';
import { PanelLabel, StatusDot } from './instruments';
import { api, Btn, chip, seg, ago } from './atoms';
import { TEAM_BY_ID } from '../lib/team';

const field = 'w-full rounded-[10px] border border-line bg-sunk px-3 py-2 text-[12.5px] text-ink placeholder:text-faint focus:border-line-strong';
const Label = ({ children, hint }) => <span className="flex items-baseline justify-between gap-2 font-mono text-[10px] uppercase tracking-[.1em] text-faint">{children}{hint && <span className="normal-case tracking-normal">{hint}</span>}</span>;

export default function EmailDesk({ viewer, week, pains = [], toast }) {
  const [desk, setDesk] = useState(null);
  const [opts, setOpts] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(null);
  const timer = useRef(null);
  const who = TEAM_BY_ID[viewer]?.name || viewer;

  const load = async () => {
    try { const d = await api(`email-desk${week ? `?week=${week}` : ''}`); setDesk(d); setOpts(d.opts); setPreview(d); setError(null); }
    catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, [week]); // eslint-disable-line react-hooks/exhaustive-deps

  // live preview: re-render the email a moment after each edit
  const edit = (patch) => {
    const next = { ...opts, ...patch }; setOpts(next); setConfirm(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => { try { setPreview(await api('email-preview', { week, opts: next, by: viewer })); } catch {} }, 450);
  };
  const dirty = desk && opts && JSON.stringify(opts) !== JSON.stringify(desk.saved.opts);
  const save = async () => {
    setBusy('save');
    try { await api('email-settings', { opts, by: viewer }); await load(); toast('Saved. Every Friday email now uses these settings.'); }
    catch (e) { toast(e.message); } finally { setBusy(''); }
  };
  const reset = () => { if (desk) edit(desk.saved.opts); };
  const send = async () => {
    setBusy('send'); setConfirm(false);
    try {
      const r = await api('email', { week, opts, by: viewer });
      toast(r.sent ? `Sent to ${r.to.length} recipient${r.to.length > 1 ? 's' : ''}: "${r.subject}"` : `Not sent: ${r.reason || r.error}`);
      await load();
    } catch (e) { toast(`Not sent: ${e.message}`); } finally { setBusy(''); }
  };

  const recipients = desk ? [...new Set([...(desk.to || []), ...((opts?.cc) || [])])] : [];
  return (
    <section className="grid gap-3" id="email-desk">
      <PanelLabel n={3} right={desk && <StatusDot color={desk.configured ? 'var(--ok)' : 'var(--warn)'} word={desk.configured ? 'Email on · Resend' : desk.hasKey ? 'Add BRIEF_EMAIL in Vercel' : 'Add RESEND_API_KEY in Vercel'} />}>Friday email</PanelLabel>
      <div className="card grid gap-5 p-5 sm:p-6">
        <p className="max-w-[90ch] text-[13px] text-muted">This is the email Resend sends every Friday at about 06:30 IST. Check it here, change the wording, add more data, save it as the Friday default, or send it now. You are editing as <b className="text-ink">{who}</b>.</p>
        {error && <p className="rounded-[10px] border border-alert/50 bg-alert-soft p-3 text-[12.5px]">Could not load the email: {error} <button onClick={load} className="text-link underline">Try again</button></p>}
        {!desk && !error && <div className="h-40 animate-pulse rounded-[12px] bg-surface-2" />}
        {desk && opts && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            {/* editor */}
            <div className="grid content-start gap-4">
              <label className="grid gap-1.5"><Label hint={opts.subject ? '' : 'automatic'}>Subject</Label>
                <input className={field} value={opts.subject} maxLength={160} placeholder={preview?.autoSubject || desk.autoSubject} onChange={(e) => edit({ subject: e.target.value })} /></label>
              <div className="grid gap-1.5"><Label>Goes to</Label>
                <div className="flex flex-wrap gap-1.5">{recipients.length ? recipients.map((r) => <span key={r} className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[11px] text-muted">{r}</span>) : <span className="text-[12px] text-warn">No recipients yet. Add BRIEF_EMAIL in Vercel or add people below.</span>}</div>
              </div>
              <label className="grid gap-1.5"><Label hint="comma separated, up to 10">Also send to</Label>
                <input className={field} defaultValue={opts.cc.join(', ')} key={desk.saved.updatedAt || 'cc'} placeholder="name@company.com" onBlur={(e) => edit({ cc: e.target.value.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean) })} /></label>
              <label className="grid gap-1.5"><Label>Opening note</Label>
                <textarea className={field} rows={3} maxLength={1200} value={opts.intro} placeholder="e.g. Big week for review bots. Sumit wants a decision by Monday." onChange={(e) => edit({ intro: e.target.value })} /></label>

              <div className="grid gap-2"><Label>What to include</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] text-muted">Top problems</span>
                  <div className="flex rounded-full border border-line p-[3px]">{[3, 5, 8, 10].map((n) => <button key={n} onClick={() => edit({ top: n })} aria-pressed={opts.top === n} className={seg(opts.top === n)}>{n}</button>)}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[['ai', 'AI summaries'], ['links', 'Thread links'], ['vote', 'Team vote results']].map(([k, l]) => <button key={k} onClick={() => edit({ [k]: !opts[k] })} aria-pressed={opts[k]} className={chip(opts[k])}>{opts[k] ? '✓ ' : ''}{l}</button>)}
                </div>
              </div>

              <div className="grid gap-2"><Label hint="added under “Also worth a look”">Add more problems</Label>
                <div className="flex flex-wrap gap-1.5">
                  {pains.map((p) => { const on = opts.extras.includes(p.id); return <button key={p.id} onClick={() => edit({ extras: on ? opts.extras.filter((x) => x !== p.id) : [...opts.extras, p.id] })} aria-pressed={on} className={chip(on)}>{on ? '+ ' : ''}{p.title}</button>; })}
                </div>
              </div>

              <div className="grid gap-1.5"><Label>Extra section</Label>
                <input className={field} value={opts.noteTitle} maxLength={80} onChange={(e) => edit({ noteTitle: e.target.value })} placeholder="Section title" />
                <textarea className={field} rows={4} maxLength={3000} value={opts.note} placeholder="Anything else: customer quotes, sprint decision, links, numbers from other tools…" onChange={(e) => edit({ note: e.target.value })} />
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                <Btn kind="primary" disabled={!!busy || !dirty} onClick={save} title="Every Friday email will use these settings">{busy === 'save' ? 'Saving…' : 'Save as Friday default'}</Btn>
                {!confirm
                  ? <Btn kind="blue" disabled={!!busy || !desk.configured} onClick={() => setConfirm(true)} title={desk.configured ? 'Send this version now' : 'Set up email in Vercel first'}>{busy === 'send' ? 'Sending…' : 'Send now'}</Btn>
                  : <span className="flex items-center gap-2 rounded-full border border-line-strong px-3 py-1 text-[12px]">Send to {recipients.length} recipient{recipients.length === 1 ? '' : 's'}? <button onClick={send} className="font-semibold text-link underline">Yes, send</button><button onClick={() => setConfirm(false)} className="text-muted">Cancel</button></span>}
                {dirty && <button onClick={reset} className="text-[12px] text-muted underline underline-offset-2">Undo unsaved changes</button>}
              </div>
              <p className="text-[11px] text-faint">{desk.saved.updatedAt ? `Friday default last changed by ${TEAM_BY_ID[desk.saved.updatedBy]?.name || desk.saved.updatedBy} ${ago(desk.saved.updatedAt)}.` : 'Using the standard Friday email.'} With Resend's free test sender, emails only reach the account owner's address until a domain is verified.</p>
            </div>

            {/* preview */}
            <div className="grid min-w-0 content-start gap-2">
              <Label hint={`week of ${preview?.week || desk.week}`}>Preview</Label>
              <div className="overflow-hidden rounded-[12px] border border-line bg-white">
                <div className="border-b border-[#e2dfd8] px-4 py-2 font-[system-ui] text-[12px] text-[#575b70]"><b className="text-[#15172a]">Subject:</b> {preview?.subject}</div>
                <iframe title="Email preview" srcDoc={preview?.html || ''} className="block h-[560px] w-full bg-white" sandbox="" />
              </div>
            </div>
          </div>
        )}

        {desk?.history?.length > 0 && (
          <div className="grid gap-2 border-t border-line pt-4">
            <Label>Sent so far</Label>
            <ul className="grid gap-1">
              {desk.history.map((h) => (
                <li key={h.id} className="grid gap-x-3 text-[12px] sm:grid-cols-[150px_minmax(0,1fr)_auto]">
                  <span className="font-mono text-[11px] text-faint">{new Date(h.sent_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                  <span className="truncate" title={h.subject || ''}>{h.subject || `Brief for week of ${h.week}`}<span className="text-faint"> · {h.channel === 'manual' ? `sent by ${h.sent_by || 'hand'}` : 'scheduled'}</span></span>
                  <span className={h.status === 'sent' ? 'text-ok' : 'text-alert-ink'} title={h.status === 'sent' ? h.recipients : h.detail}>{h.status === 'sent' ? `sent · ${(h.recipients || '').split(',').filter(Boolean).length}` : 'failed'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
