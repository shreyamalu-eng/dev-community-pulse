'use client';
/* Pulse report: a printable PDF of the brief for whatever period is on screen.
   Built in the browser from the numbers already loaded, so it always matches the page. */
import { CATS, REL, SOURCES, SOURCE_NAMES, priority, trendWords } from '../lib/painpoints';

const LIBS = [
  ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'],
  ['https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'],
];
function loadOne(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = res; s.onerror = () => { s.remove(); rej(new Error('load failed')); };
    document.head.appendChild(s);
  });
}
async function loadPdfTools() {
  if (window.jspdf?.jsPDF?.API?.autoTable) return window.jspdf.jsPDF;
  for (const urls of LIBS) {
    if (urls === LIBS[1] && window.jspdf?.jsPDF?.API?.autoTable) break;
    let ok = false;
    for (const u of urls) { try { await loadOne(u); ok = true; break; } catch {} }
    if (!ok) throw new Error('The PDF tool could not load. Check your internet connection and try again.');
  }
  return window.jspdf.jsPDF;
}

// The built-in PDF fonts only know Latin characters, so swap the few symbols the site uses.
const MAP = { '×': 'x', '–': '-', '—': '-', '→': '->', '←': '<-', '·': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...', '≥': '>=', '≤': '<=', '✦': '*', '▲': '^', '▼': 'v', '■': '-', '•': '-', ' ': ' ' };
const clean = (s) => String(s ?? '').replace(/[×–—→←·“”‘’…≥≤✦▲▼■• ]/g, (c) => MAP[c]).replace(/👍/g, 'up').replace(/👎/g, 'down').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');

const C = { ink: [21, 23, 42], muted: [87, 91, 112], faint: [138, 141, 158], line: [226, 223, 216], soft: [247, 245, 241], red: [163, 27, 32], orange: [223, 126, 10], blue: [10, 22, 134], green: [15, 122, 87] };
const TREND_WORD = { Spike: 'Unusual spike', Climbing: 'Climbing', Steady: 'Steady', Cooling: 'Cooling' };
const TREND_COL = { Spike: C.red, Climbing: C.orange, Steady: C.faint, Cooling: C.blue };
const SRC_COL = { hackernews: [244, 165, 63], stackoverflow: [142, 152, 255], github: [120, 128, 170], reddit: [240, 118, 122] };
const sum = (a) => a.reduce((x, y) => x + y, 0);

function confidence(p, st, W) {
  if (st.cur === 0) return 'No data';
  if (p.voices >= 8 && p.communities >= 2) return 'High';
  if (p.voices >= 3) return 'Medium';
  return 'Low';
}

/**
 * ctx: { data, rows, W, labels, platforms, failed, short, titles, filters, findings, appUrl }
 * rows: [{ p: {...pain, s: series after platform filter}, st: stats }] — the same rows the page shows
 */
export async function downloadReport(ctx) {
  const jsPDF = await loadPdfTools();
  const { data, rows, W, labels, platforms, failed, short, titles, filters, findings: f, appUrl } = ctx;
  const per = data.period || { grain: 'week', label: '', unit: 'week' };
  const L = data.weeks.length - 1;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), M = 44, CW = PW - M * 2;
  let y = M;

  const text = (s, x, yy, o = {}) => { doc.text(clean(s), x, yy, o); };
  const font = (size, style = 'normal', color = C.ink) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color); };
  const need = (h) => { if (y + h > PH - 56) { doc.addPage(); y = M; } };
  const para = (s, size = 10.5, color = C.ink, style = 'normal', width = CW, x = M, lh = 1.42) => {
    font(size, style, color);
    const lines = doc.splitTextToSize(clean(s), width);
    for (const ln of lines) { need(size * lh); text(ln, x, y + size); y += size * lh; }
  };
  const section = (n, title, sub) => {
    need(60); y += 14;
    font(8.5, 'bold', C.faint); text(`${String(n).padStart(2, '0')}  -  ${title.toUpperCase()}`, M, y);
    y += 6; doc.setDrawColor(...C.line); doc.setLineWidth(0.8); doc.line(M, y, M + CW, y); y += 8;
    if (sub) { para(sub, 9, C.muted); y += 2; }
  };

  // ── cover block ──
  const kind = per.grain === 'month' ? 'Monthly report' : per.grain === 'custom' ? 'Custom-range report' : 'Weekly report';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d8 = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
  const periodLabel = per.grain === 'week' && per.from && per.to ? `Fri ${d8(per.from)} - Thu ${d8(per.to)} ${per.to.slice(0, 4)}` : per.label;
  doc.setFillColor(...C.red); doc.rect(0, 0, PW, 6, 'F');
  doc.setFillColor(...C.orange); doc.rect(PW * 0.62, 0, PW * 0.22, 6, 'F');
  doc.setFillColor(...C.blue); doc.rect(PW * 0.84, 0, PW * 0.16, 6, 'F');
  font(9, 'bold', C.red); text('DEVELOPER COMMUNITY PULSE', M, y + 8);
  font(9, 'normal', C.faint); text(kind.toUpperCase(), PW - M, y + 8, { align: 'right' });
  y += 34; font(24, 'bold'); text('What developers are struggling with', M, y);
  y += 22; font(13, 'normal', C.muted); text(periodLabel + (per.complete === false ? ' (so far)' : ''), M, y);
  y += 20;
  const live = platforms.filter((p) => p.state === 'live').map((p) => p.name);
  const off = platforms.filter((p) => p.state !== 'live').map((p) => p.name);
  const gen = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  const collected = data.lastRun ? new Date(data.lastRun.startedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '-';
  font(9, 'normal', C.muted);
  text(`Generated ${gen} IST  -  data collected ${collected} IST  -  platforms read: ${live.join(', ') || 'none'}${off.length ? `  -  not included: ${off.join(', ')}` : ''}`, M, y, { maxWidth: CW });
  if (filters?.length) { y += 13; text(`Filters applied: ${filters.join('; ')}`, M, y, { maxWidth: CW }); }
  y += 18;

  // ── 01 headline numbers ──
  section(1, 'Headline numbers');
  const c7 = data.corpus[L], c6 = data.corpus[L - 1] ?? 0;
  const rising = rows.filter((r) => r.st.label === 'Spike' || r.st.label === 'Climbing');
  const spikes = rows.filter((r) => r.st.label === 'Spike').length;
  const curTot = sum(rows.map((r) => r.st.cur));
  const unsolved = curTot ? Math.round(sum(rows.map((r) => r.p.unresolved * r.st.cur)) / curTot) : 0;
  const share = c7 ? Math.round((data.counts.pain / c7) * 100) : 0;
  const tiles = [
    [`Threads read ${W.this}`, c7.toLocaleString('en-IN'), c6 ? `${c7 - c6 >= 0 ? '+' : ''}${c7 - c6} vs ${W.last}` : 'every thread that mentioned a tracked keyword', C.blue],
    ['Genuine complaints', String(data.counts.pain), `${share}% of threads; the rest were how-to or off-topic`, C.orange],
    ['Problems getting worse', String(rising.length), rising.length ? `${spikes} spiking well above normal, ${rising.length - spikes} climbing` : `nothing above its usual level ${W.this}`, C.red],
    ['Still unsolved', `${unsolved}%`, 'of complaints have no accepted fix', C.green],
  ];
  const tw = (CW - 3 * 10) / 4, th = 78;
  need(th + 6);
  tiles.forEach(([l, v, n, col], i) => {
    const x = M + i * (tw + 10);
    doc.setFillColor(...C.soft); doc.setDrawColor(...C.line); doc.roundedRect(x, y, tw, th, 6, 6, 'FD');
    doc.setFillColor(...col); doc.rect(x, y + 10, 3, th - 20, 'F');
    font(8.5, 'bold', C.muted); text(l, x + 11, y + 16, { maxWidth: tw - 16 });
    font(20, 'bold'); text(v, x + 11, y + 42);
    font(7.8, 'normal', C.muted); doc.text(doc.splitTextToSize(clean(n), tw - 18).slice(0, 2), x + 11, y + 56);
  });
  y += th + 6;

  // ── 02 in brief ──
  section(2, `${W.This} in brief`);
  const parts = [];
  if (!data.counts.pain) parts.push(`No genuine complaints were found ${W.this}.`);
  else parts.push(`${data.counts.pain} of ${c7} threads ${W.this} are genuine complaints.`);
  if (f?.loud) parts.push(`The biggest is "${f.loud.p.title}" with ${f.loud.st.cur} threads (${f.loud.st.prev} ${W.last}).`);
  if (f?.rising && f.rising !== f.loud) parts.push(`"${f.rising.p.title}" is growing fastest.`);
  para(parts.join(' '), 11);
  y += 4;
  const facts = [['Biggest', f?.loud, (r) => `${r.st.cur} threads - ${r.p.voices} people`], ['Growing fastest', f?.rising, (r) => `${r.st.prev} -> ${r.st.cur} threads`], ['Least solved', f?.unsolved, (r) => `${r.p.unresolved}% have no fix`], [`New ${W.this}`, f?.fresh, (r) => `${r.st.cur} threads, none before`]];
  doc.autoTable({
    startY: y, margin: { left: M, right: M }, theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: { top: 4, bottom: 4, left: 0, right: 8 }, textColor: C.ink },
    columnStyles: { 0: { cellWidth: 110, fontStyle: 'bold', textColor: C.muted }, 2: { textColor: C.muted } },
    body: facts.map(([k, r, d]) => [clean(k), clean(r ? r.p.title : `Nothing qualifies ${W.this}`), clean(r ? d(r) : '')]),
  });
  y = doc.lastAutoTable.finalY + 6;
  const caveats = [];
  if (failed.length) caveats.push(`${failed.map((x) => SOURCE_NAMES[x]).join(', ')} did not respond, so it is left out of ${W.every}`);
  if (data.counts.pain && data.counts.pain < 15) caveats.push('volumes are small, so treat changes as early signals');
  if (data.counts.rules) caveats.push(`${data.counts.rules} threads were labelled by keyword rules because Gemini was unavailable`);
  if (caveats.length) para(`Note: ${caveats.join('; ')}.`, 9, C.orange);

  // ── 03 ranked problems ──
  const ranked = [...rows].filter((r) => r.st.cur > 0 || r.st.mean > 0)
    .sort((a, b) => priority(b.p.rel, b.p.unresolved, b.st) - priority(a.p.rel, a.p.unresolved, a.st) || b.st.cur - a.st.cur);
  section(3, 'Problems ranked by what to act on', `Ranked by relevance to our product x share unsolved x how far above normal x volume. "vs ${W.last}" compares with the previous ${W.u === 'period' ? 'equal-length period' : W.u}.`);
  doc.autoTable({
    startY: y, margin: { left: M, right: M },
    head: [['#', 'Problem', 'Topic', 'Threads', `vs ${W.last}`, 'Signal', 'Unsolved', 'Devs', 'Confidence']],
    body: ranked.map((r, i) => {
      const d = r.st.cur - r.st.prev;
      return [i + 1, clean(r.p.title), clean(CATS[r.p.cat] || ''), r.st.cur, `${d > 0 ? '+' : ''}${d}`, TREND_WORD[r.st.label], `${r.p.unresolved}%`, r.p.voices, confidence(r.p, r.st, W)];
    }),
    styles: { font: 'helvetica', fontSize: 8.6, cellPadding: 4, textColor: C.ink, lineColor: C.line, lineWidth: 0.5 },
    headStyles: { fillColor: C.ink, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: C.soft },
    columnStyles: { 0: { cellWidth: 20, halign: 'right' }, 1: { cellWidth: 170 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
    didParseCell: (h) => { if (h.section === 'body' && h.column.index === 5) { const k = Object.keys(TREND_WORD).find((x) => TREND_WORD[x] === h.cell.raw); if (k) { h.cell.styles.textColor = TREND_COL[k]; h.cell.styles.fontStyle = 'bold'; } } },
  });
  y = doc.lastAutoTable.finalY + 4;
  if (!ranked.length) para(`No complaints ${W.this}.`, 10, C.muted);

  // ── 04 top problems in detail ──
  const top = ranked.filter((r) => r.st.cur > 0).slice(0, 5);
  if (top.length) {
    section(4, 'Top problems in detail', 'Numbers come from the database. Lines marked AI are Gemini summaries of the linked threads; check the threads before acting.');
    top.forEach((r, i) => {
      const p = r.p, st = r.st;
      need(150);
      font(12.5, 'bold'); text(`${i + 1}. ${p.title}`, M, y + 12); y += 18;
      font(8.8, 'normal', C.muted);
      text(`${CATS[p.cat] || ''}  -  ${REL[p.rel]?.label || ''}  -  ${p.voices} developers  -  ${p.communities} platform${p.communities === 1 ? '' : 's'}  -  ${p.unresolved}% unsolved  -  confidence: ${confidence(p, st, W)}`, M, y + 8, { maxWidth: CW });
      y += 18;
      // mini chart: threads per bucket
      const ch = 54, cwid = 230, bw = cwid / p.s.length, max = Math.max(1, ...p.s);
      const x0 = M, y0 = y;
      p.s.forEach((v, j) => {
        const h = Math.max(v ? 2 : 0.6, (v / max) * (ch - 14));
        doc.setFillColor(...(j === L ? TREND_COL[st.label] || C.red : [205, 208, 220]));
        doc.rect(x0 + j * bw + 2, y0 + ch - 12 - h, bw - 4, h, 'F');
        font(6.4, 'normal', C.faint); text(String(labels[j] || '').split(' ')[0] + (String(labels[j] || '').split(' ')[1] ? ' ' + String(labels[j]).split(' ')[1].slice(0, 3) : ''), x0 + j * bw + bw / 2, y0 + ch - 3, { align: 'center' });
        if (j === L) { font(7.5, 'bold'); text(String(v), x0 + j * bw + bw / 2, y0 + ch - 14 - h, { align: 'center' }); }
      });
      // numbers beside chart
      const nx = M + cwid + 18;
      font(9, 'normal', C.ink);
      const lines = [
        `${st.cur} threads ${W.this} (${st.prev} ${W.last}), ${trendWords(st, W.u)}.`,
        `Normal level: ${st.mean.toFixed(1)} per ${W.u}  -  signal: ${TREND_WORD[st.label]}.`,
        `By platform: ${SOURCES.map((s) => [s, p.bySource?.[s]?.[L] || 0]).filter(([, v]) => v).map(([s, v]) => `${SOURCE_NAMES[s]} ${v}`).join(', ') || 'none'}.`,
      ];
      let ly = y0 + 10;
      for (const l of lines) { for (const w of doc.splitTextToSize(clean(l), CW - cwid - 18)) { text(w, nx, ly); ly += 12; } }
      y = Math.max(y0 + ch, ly) + 6;
      if (p.insight) {
        const ins = [['Developers say (AI)', p.insight.summary], ['Missing today (AI)', p.insight.gap], ['Try next (AI)', p.insight.next_step]].filter(([, v]) => v);
        for (const [k, v] of ins) {
          font(8.6, 'bold', C.muted); need(14); text(k, M, y + 9);
          const before = y; y -= 0; const savedX = M + 108;
          font(9.2, 'normal', C.ink);
          const ws = doc.splitTextToSize(clean(v), CW - 108);
          ws.forEach((w, j) => { if (j) need(12); text(w, savedX, y + 9); y += 12.5; });
          if (y === before) y += 12.5;
          y += 2;
        }
      } else { para(`No AI summary yet for this ${W.u === 'period' ? 'period' : W.u}. Use "Summarise the threads" on the site to add one.`, 8.6, C.faint); }
      const ev = (p.evidence || []).slice(0, 3);
      if (ev.length) {
        font(8.6, 'bold', C.muted); need(14); text('Threads', M, y + 9);
        ev.forEach((e) => {
          need(14);
          font(8.8, 'normal', C.blue);
          const t = clean(`${e.title}`).slice(0, 95) + (e.title?.length > 95 ? '...' : '');
          doc.textWithLink(t, M + 108, y + 9, { url: e.url });
          font(7.8, 'normal', C.faint); text(`${SOURCE_NAMES[e.platform] || e.platform}`, PW - M, y + 9, { align: 'right' });
          y += 12.5;
          if (e.quote) { font(8.2, 'italic', C.muted); const q = doc.splitTextToSize(clean(`"${e.quote}"`), CW - 120).slice(0, 2); q.forEach((w) => { need(11); text(w, M + 114, y + 8); y += 10.5; }); y += 2; }
        });
      }
      y += 6; doc.setDrawColor(...C.line); doc.setLineWidth(0.5); if (i < top.length - 1) doc.line(M, y, M + CW, y); y += 8;
    });
  }

  // ── 05 activity over time ──
  const act = ranked.filter((r) => sum(r.p.s) > 0).slice(0, 10);
  if (act.length) {
    section(5, `Activity over the last ${labels.length} ${W.us}`, `Unique threads per ${W.u} for each problem; the last column is ${W.this}.`);
    doc.autoTable({
      startY: y, margin: { left: M, right: M },
      head: [['Problem', ...labels.map((l) => clean(l))]],
      body: act.map((r) => [clean(r.p.title), ...r.p.s]),
      styles: { font: 'helvetica', fontSize: 7.8, cellPadding: 3, textColor: C.ink, lineColor: C.line, lineWidth: 0.5, halign: 'right' },
      headStyles: { fillColor: C.ink, textColor: [255, 255, 255], fontSize: 7.4, halign: 'right' },
      columnStyles: { 0: { halign: 'left', cellWidth: 170 } },
      didParseCell: (h) => {
        if (h.section === 'head' && h.column.index === 0) h.cell.styles.halign = 'left';
        if (h.section === 'body' && h.column.index > 0) { const v = Number(h.cell.raw) || 0; const mx = Math.max(1, ...act.flatMap((r) => r.p.s)); const a = v / mx; if (v) h.cell.styles.fillColor = [Math.round(255 - a * 32), Math.round(255 - a * 100), Math.round(255 - a * 120)]; if (h.column.index === labels.length) h.cell.styles.fontStyle = 'bold'; }
      },
    });
    y = doc.lastAutoTable.finalY + 4;
  }

  // ── 06 by platform ──
  section(6, 'By platform', `Genuine complaints ${W.this}, split by where they were posted.`);
  const plat = SOURCES.map((s) => ({ s, v: sum(rows.map((r) => r.p.bySource?.[s]?.[L] || 0)) }));
  const ptot = sum(plat.map((x) => x.v));
  doc.autoTable({
    startY: y, margin: { left: M, right: M + CW * 0.35 },
    head: [['Platform', 'Status', 'Complaints', 'Share']],
    body: platforms.map((p) => { const v = plat.find((x) => x.s === p.id)?.v || 0; return [clean(p.name), p.state === 'live' ? 'read' : p.state === 'down' ? 'not responding' : 'not connected', p.state === 'live' ? v : '-', p.state === 'live' && ptot ? `${Math.round((v / ptot) * 100)}%` : '-']; }),
    styles: { font: 'helvetica', fontSize: 8.8, cellPadding: 4, textColor: C.ink, lineColor: C.line, lineWidth: 0.5 },
    headStyles: { fillColor: C.ink, textColor: [255, 255, 255], fontSize: 8 },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
    didParseCell: (h) => { if (h.section === 'body' && h.column.index === 0) { const id = platforms[h.row.index]?.id; if (SRC_COL[id]) h.cell.styles.textColor = C.ink; } if (h.section === 'body' && h.column.index === 1 && h.cell.raw !== 'read') h.cell.styles.textColor = C.faint; },
  });
  y = doc.lastAutoTable.finalY + 4;

  // ── 07 team vote ──
  const items = short?.items || [];
  section(7, 'Team vote', per.grain === 'week' ? 'Problems put to the vote for this Friday brief, and Sumit\'s decision.' : `Votes belong to the Friday brief${short?.week ? ` for the week of ${short.week}` : ''}; shown here for reference.`);
  if (items.length) {
    const tally = (x) => { const v = Object.values(x.votes || {}); return [v.filter((y) => y === 'up').length, v.filter((y) => y === 'down').length]; };
    doc.autoTable({
      startY: y, margin: { left: M, right: M },
      head: [['Problem', 'Votes for', 'Votes against', 'Decision']],
      body: items.map((x) => { const [u, d] = tally(x); return [clean(titles[x.id] || x.id), u, d, x.decision === 'in' ? 'In sprint' : x.decision === 'later' ? 'Parked' : 'Awaiting Sumit']; }),
      styles: { font: 'helvetica', fontSize: 8.8, cellPadding: 4, textColor: C.ink, lineColor: C.line, lineWidth: 0.5 },
      headStyles: { fillColor: C.ink, textColor: [255, 255, 255], fontSize: 8 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      didParseCell: (h) => { if (h.section === 'body' && h.column.index === 3) { h.cell.styles.fontStyle = 'bold'; h.cell.styles.textColor = h.cell.raw === 'In sprint' ? C.green : h.cell.raw === 'Parked' ? C.faint : C.orange; } },
    });
    y = doc.lastAutoTable.finalY + 4;
  } else para('Nothing has been put to the vote yet.', 9.5, C.muted);

  // ── 08 how we counted ──
  section(8, 'How we counted');
  const how = [
    'A thread is one discussion, counted once however many comments it has; cross-posts are merged.',
    `Threads read: ${c7.toLocaleString('en-IN')}. Genuine complaints: ${data.counts.pain}. Filtered out (how-to questions, user errors, off-topic): ${data.counts.noise}.`,
    'Gemini labels each thread (complaint or not, which of the 10 problems, solved or not). Every number in this report is counted by the database, not by AI.',
    `"Normal" is the average of the ${Math.min(4, L)} ${W.us} before this one. "Unusual spike" means ${W.this} is well above normal, beyond the usual ${W.u}-to-${W.u} wobble.`,
    per.grain === 'month' ? 'Months are calendar months in IST.' : per.grain === 'custom' ? 'A custom range is compared with equal-length periods just before it.' : 'Weeks run Friday to Thursday (IST); only complete weeks are compared.',
    `A platform that does not respond is left out of ${W.every}, so comparisons stay fair.`,
  ];
  how.forEach((h) => { font(9.4, 'normal'); const ws = doc.splitTextToSize(clean(h), CW - 14); need(ws.length * 13); doc.setFillColor(...C.red); doc.circle(M + 3, y + 6, 1.6, 'F'); ws.forEach((w) => { text(w, M + 12, y + 9); y += 13; }); y += 2; });
  if (appUrl) { y += 6; font(9, 'normal', C.blue); need(14); doc.textWithLink(clean(`Open the live brief: ${appUrl}`), M, y + 9, { url: appUrl }); }

  // ── footer on every page ──
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.line); doc.setLineWidth(0.5); doc.line(M, PH - 34, PW - M, PH - 34);
    font(7.8, 'normal', C.faint);
    text(`Pulse ${kind.toLowerCase()} - ${periodLabel}`, M, PH - 22);
    text(`Page ${i} of ${n}`, PW - M, PH - 22, { align: 'right' });
  }

  const slug = per.grain === 'month' ? per.key.slice(2) : per.grain === 'custom' ? `${per.from}_to_${per.to}` : `week-${data.week}`;
  const name = `pulse-report-${slug}.pdf`;
  doc.save(name);
  return { name, pages: n };
}
