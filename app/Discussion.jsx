'use client';
// Team discussion under a problem in the vote: comments, one level of replies, anyone on the team can post.
import React, { useState } from 'react';
import { TEAM_BY_ID, initials } from '../lib/team';
import { ago } from './atoms';

const HUES = ['#F4A53F', '#F0767A', '#8E98FF', '#5EEAD4', '#C9CDF5', '#DF7E0A', '#46C59A', '#E58FD0'];
const hue = (id) => HUES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

export function Avatar({ id, size = 24 }) {
  const p = TEAM_BY_ID[id] || { name: id };
  return <span className="grid shrink-0 place-items-center rounded-full font-mono font-semibold text-[#0A0A14]" style={{ width: size, height: size, fontSize: size * 0.4, background: hue(id) }} title={p.name} aria-hidden="true">{initials(p.name)}</span>;
}

function Composer({ placeholder, onSend, busy, autoFocus, onCancel, viewer }) {
  const [text, setText] = useState('');
  const send = async (e) => { e.preventDefault(); const t = text.trim(); if (t.length < 2) return; if (await onSend(t)) setText(''); };
  return (
    <form onSubmit={send} className="flex items-start gap-2">
      <Avatar id={viewer} size={22} />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <label className="sr-only" htmlFor={`c-${placeholder}`}>{placeholder}</label>
        <textarea id={`c-${placeholder}`} value={text} autoFocus={autoFocus} onChange={(e) => setText(e.target.value)} rows={text.length > 80 ? 3 : 1} maxLength={1200} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(e); if (e.key === 'Escape' && onCancel) onCancel(); }}
          className="w-full resize-y rounded-[10px] border border-line bg-sunk px-2.5 py-1.5 text-[12px] leading-relaxed text-ink placeholder:text-faint focus:border-line-strong" />
        {text.trim().length > 0 && (
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy} className="press h-6 rounded-full bg-[linear-gradient(90deg,#A31B20,#DF7E0A)] px-3 text-[11px] font-semibold text-white disabled:opacity-50">{busy ? 'Posting…' : 'Post'}</button>
            {onCancel && <button type="button" onClick={onCancel} className="text-[11px] text-muted hover:text-ink">Cancel</button>}
            <span className="ml-auto font-mono text-[10px] text-faint">⌘/Ctrl + Enter</span>
          </div>
        )}
      </div>
    </form>
  );
}

function Comment({ c, viewer, onReply, onDelete, reply }) {
  const p = TEAM_BY_ID[c.author] || { name: c.author, role: '' };
  return (
    <div className={`flex gap-2 ${reply ? 'ml-7' : ''}`}>
      <Avatar id={c.author} size={reply ? 20 : 24} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-[11px]">
          <b className="font-medium text-ink">{p.name}</b><span className="text-faint">{p.role}</span><span className="text-faint">· {ago(c.at)}</span>
          {c.sample && <span className="rounded-full border border-dashed border-line px-1.5 font-mono text-[9px] uppercase tracking-[.08em] text-faint" title="Sample comment added so the discussion is not empty. Replies are real.">sample</span>}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ink">{c.body}</p>
        <div className="mt-0.5 flex gap-3 text-[11px]">
          {!reply && <button onClick={onReply} className="text-muted hover:text-ink">Reply</button>}
          {c.author === viewer && <button onClick={onDelete} className="text-faint hover:text-alert-ink">Delete</button>}
        </div>
      </div>
    </div>
  );
}

export default function Discussion({ pid, list, viewer, onPost, onDelete }) {
  const [open, setOpen] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const top = list.filter((c) => !c.parent);
  const repliesOf = (id) => list.filter((c) => c.parent === id);
  const people = [...new Set(list.map((c) => c.author))];
  const post = async (body, parent) => { setBusy(true); try { const ok = await onPost({ id: pid, body, parent }); if (ok) setReplyTo(null); return ok; } finally { setBusy(false); } };
  return (
    <div className="grid gap-2 border-t border-line pt-2">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-2 text-left text-[11.5px] text-muted hover:text-ink">
        <span aria-hidden="true">💬</span>
        <span>{list.length ? `${list.length} comment${list.length > 1 ? 's' : ''}` : 'Add a comment'}</span>
        {people.length > 0 && <span className="flex -space-x-1.5">{people.slice(0, 5).map((a) => <span key={a} className="rounded-full ring-2 ring-surface-2"><Avatar id={a} size={16} /></span>)}</span>}
        <span className="ml-auto font-mono text-[10px]">{open ? 'hide' : 'open'}</span>
      </button>
      {open && (
        <div className="grid gap-3">
          {top.map((c) => (
            <div key={c.id} className="grid gap-2">
              <Comment c={c} viewer={viewer} onReply={() => setReplyTo(replyTo === c.id ? null : c.id)} onDelete={() => onDelete(c.id)} />
              {repliesOf(c.id).map((r) => <Comment key={r.id} c={r} viewer={viewer} reply onDelete={() => onDelete(r.id)} />)}
              {replyTo === c.id && <div className="ml-7"><Composer viewer={viewer} autoFocus busy={busy} placeholder={`Reply to ${TEAM_BY_ID[c.author]?.name || 'comment'}`} onSend={(t) => post(t, c.id)} onCancel={() => setReplyTo(null)} /></div>}
            </div>
          ))}
          <Composer viewer={viewer} busy={busy} placeholder={top.length ? 'Add a review or comment' : 'Start the discussion'} onSend={(t) => post(t, null)} />
        </div>
      )}
    </div>
  );
}
