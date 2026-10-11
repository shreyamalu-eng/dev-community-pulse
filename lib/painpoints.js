// Shared by the server and the dashboard. No server-only imports here.

export const CATS = {
  auto: 'Review automation',
  ci: 'CI/CD automation',
  culture: 'Review culture',
  flow: 'Developer workflow',
};

export const REL = {
  core: { label: 'Core to our product', w: 1 },
  adjacent: { label: 'Adjacent', w: 0.6 },
  outside: { label: 'Outside our product', w: 0.2 },
};

export const SOURCES = ['hackernews', 'stackoverflow', 'github', 'reddit'];
export const SOURCE_NAMES = {
  hackernews: 'Hacker News',
  stackoverflow: 'Stack Overflow',
  github: 'GitHub Issues',
  reddit: 'Reddit',
};

export const MODES = {
  strict: { label: 'Strict', min: 8, hint: '8+ threads' },
  balanced: { label: 'Balanced', min: 4, hint: '4+ threads' },
  exploratory: { label: 'Early signals', min: 1, hint: '1+ thread' },
};

// Product notes per pain point. Titles and categories live in Neon (pain_point_taxonomy).
// `rules` is the keyword fallback used only when Gemini is unavailable.
export const META = {
  pp_fp_noise: {
    rel: 'core',
    suits: 'Teams of 20–200 engineers with blocking static analysis on every PR.',
    notFor: 'Solo developers and teams without CI gates.',
    angle: 'Our reviewer can rank findings by likely impact and hide repeat noise per repo.',
    next: 'Prototype a "noise budget": cap visible findings per PR at 5, ranked by severity, and log what was hidden.',
    metric: 'Share of findings marked "not useful" drops below 20% for pilot teams.',
    tried: 'Suppression files, warn-only mode, switching analyzers.',
    rules: ['false positive', 'noisy (linter|analy)', 'suppress(ion)? (warning|file)', 'static analysis'],
  },
  pp_ai_nits: {
    rel: 'core',
    suits: 'Teams that tried an AI reviewer in the last 6 months.',
    notFor: 'Teams that have not adopted any review bot yet.',
    angle: 'This is the "devs will mute another bot" objection. Fewer, higher-confidence comments is our pitch.',
    next: 'Add a default "max 3 comments per PR" mode and a one-click "too noisy" feedback button.',
    metric: 'Bot mute rate in pilot repos stays under 10% after 4 weeks.',
    tried: 'Muting the bot, raising its threshold, uninstalling it.',
    rules: ['ai (code )?review', 'review bot', '(copilot|llm|gpt).{0,20}review', 'nitpick'],
  },
  pp_flaky: {
    rel: 'adjacent',
    suits: 'Teams with large integration test suites and required checks.',
    notFor: 'Small repos with fast unit tests only.',
    angle: 'Adjacent: we could flag when a PR touches a known-flaky test, but we should not build a test runner.',
    next: 'Surface a "touches flaky test" note in review comments using CI history.',
    metric: 'Reviewers act on the note in more than half of flagged PRs.',
    tried: 'Retry plugins and quarantine lists.',
    rules: ['flak(y|iness)', 'intermittent(ly)? fail', 're-?run (the )?(ci|tests?)'],
  },
  pp_slow_ci: {
    rel: 'adjacent',
    suits: 'Monorepos and teams with heavy end-to-end suites.',
    notFor: 'Teams with pipelines under 10 minutes.',
    angle: 'Adjacent: our review can start before CI finishes, so reviewers are not waiting.',
    next: 'Post the automated review before CI completes and mark it "pending CI".',
    metric: 'Median time to first review falls on repos with 20+ minute CI.',
    tried: 'Caching, test sharding, bigger runners.',
    rules: ['slow (ci|pipeline|build)', '(ci|pipeline|build) (is|takes|taking) .{0,20}(slow|minutes|hours)'],
  },
  pp_actions_cost: {
    rel: 'outside',
    suits: 'Teams paying for hosted CI minutes.',
    notFor: 'Teams on self-hosted runners.',
    angle: 'Outside our product. Tracked for context only.',
    next: 'No product action. Keep watching.',
    metric: 'n/a',
    tried: 'Self-hosted runners and cache tuning.',
    rules: ['runner (cost|minutes|price)', 'actions cache', 'cache (miss|restore)', 'ci (cost|bill)'],
  },
  pp_secrets: {
    rel: 'outside',
    suits: 'Teams deploying from CI to cloud accounts.',
    notFor: 'Teams without deploy steps in CI.',
    angle: 'Outside our product.',
    next: 'No product action.',
    metric: 'n/a',
    tried: 'OIDC federation, secret managers.',
    rules: ['secret(s)? (in|management|leak)', 'ci secret', 'oidc'],
  },
  pp_wait: {
    rel: 'core',
    suits: 'Growing teams (15–80 engineers) without review rotations.',
    notFor: 'Pairs or teams that review synchronously.',
    angle: 'An instant first-pass review shortens the wait for a human.',
    next: 'Add "suggested reviewer" based on file ownership and current load.',
    metric: 'Time to first human review drops 30% in pilot teams.',
    tried: 'Review rotations and chat reminders.',
    rules: ['waiting (for|on) (a )?review', 'review (latency|bottleneck|queue)', 'prs? (sit|wait)', 'time to (first )?review'],
  },
  pp_rubber: {
    rel: 'core',
    suits: 'Fast-moving product teams shipping daily.',
    notFor: 'Regulated teams with mandatory two-person review.',
    angle: 'We can flag big PRs and suggest how to split them.',
    next: 'Warn on PRs over 400 changed lines with a proposed split by module.',
    metric: 'Share of 400+ line PRs falls month over month.',
    tried: 'PR size limits written in contributing docs.',
    rules: ['rubber.?stamp', '\\blgtm\\b', '(large|huge|big|massive) (pr|pull request)s?'],
  },
  pp_monorepo: {
    rel: 'core',
    suits: 'Companies with a monorepo and 5+ owning teams.',
    notFor: 'Single-service repos.',
    angle: 'An "impact summary" at the top of each PR is a clear differentiator.',
    next: 'Generate a per-PR impact summary: services touched, owners, risk.',
    metric: 'Reviewers rate the summary useful on 70%+ of monorepo PRs.',
    tried: 'More CODEOWNERS rules.',
    rules: ['monorepo', 'codeowners'],
  },
  pp_stacked: {
    rel: 'adjacent',
    suits: 'Senior engineers splitting large features.',
    notFor: 'Teams that squash-merge small PRs.',
    angle: 'Adjacent: review each PR in a stack with context from the ones below it.',
    next: 'Detect stacked PRs and review them as a set.',
    metric: 'Repeat comments across a stack drop by half.',
    tried: 'Third-party stacking tools.',
    rules: ['stacked (prs?|pull requests|diffs)', 'stack of prs'],
  },
};

export const DEFAULT_META = {
  rel: 'adjacent',
  suits: 'Not profiled yet.',
  notFor: 'Not profiled yet.',
  angle: 'Add product notes for this pain point.',
  next: 'Review the evidence threads before deciding.',
  metric: 'n/a',
  tried: 'Not profiled yet.',
  rules: [],
};

export const metaFor = (id) => META[id] || DEFAULT_META;

/* ── trend maths (deterministic; the AI never computes these) ── */
export function stats(series) {
  const end = series.length - 1;
  const cur = series[end] || 0;
  const prev = series[end - 1] || 0;
  const base = series.slice(Math.max(0, end - 4), end);
  const mean = base.length ? base.reduce((a, b) => a + b, 0) / base.length : 0;
  const z = (cur - mean) / Math.sqrt(Math.max(mean, 1));
  const ratio = mean > 0 ? cur / mean : cur > 0 ? cur : 0;
  const wow = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
  const label = z >= 1.96 ? 'Spike' : z >= 1 ? 'Climbing' : z <= -1 ? 'Cooling' : 'Steady';
  let streak = 0;
  for (let i = end; i > 0 && series[i] > series[i - 1]; i--) streak++;
  return { cur, prev, mean, z, ratio, wow, label, streak };
}

export function priority(rel, unresolved, st) {
  return (REL[rel] || REL.adjacent).w * (unresolved / 100) * Math.max(st.ratio, 0.5) * Math.sqrt(Math.max(st.cur, 0));
}

export function trendWords(st) {
  if (st.mean === 0 && st.cur > 0) return 'new this week';
  if (st.cur === 0) return 'none this week';
  const r = st.ratio >= 1 ? `${st.ratio.toFixed(1)}× its normal level` : `${Math.round((1 - st.ratio) * 100)}% below normal`;
  return r + (st.streak >= 2 ? `, up ${st.streak} weeks running` : '');
}

/* ── watchlist input checks: spelling + ambiguity ── */
export const VOCAB = ['flaky test', 'false positive', 'static analysis', 'code review', 'pull request', 'merge queue', 'monorepo', 'stacked PRs', 'CODEOWNERS', 'github actions', 'runner cost', 'slow pipeline', 'LGTM', 'rubber stamp', 'reviewer fatigue', 'AI code review', 'review bot', 'noisy linter', 'suppress warning', 'CI secrets', 'merge conflict', 'test coverage', 'pre-commit hook', 'SonarQube', 'CodeQL', 'Dependabot', 'time to review', 'review latency', 'linter', 'flaky', 'large PR', 'waiting for review'];

export const AMBIG = {
  pipeline: ['sales pipeline', 'data pipeline'],
  'false positive': ['covid test', 'ML model', 'fraud detection'],
  review: ['product review', 'performance review'],
  bot: ['trading bot', 'discord bot'],
  runner: ['marathon', 'running shoes'],
  merge: ['merger', 'acquisition'],
  cache: ['browser cache', 'cache clear'],
};

export function lev(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

export function suggest(term) {
  const t = term.trim().toLowerCase();
  if (!t || VOCAB.some((v) => v.toLowerCase() === t)) return null;
  let best = null, bd = 99;
  for (const v of VOCAB) { const d = lev(t, v); if (d < bd) { bd = d; best = v; } }
  const limit = t.length <= 5 ? 1 : 2;
  return bd > 0 && bd <= limit ? best : null;
}

export function ambiguity(term) {
  const t = term.trim().toLowerCase();
  const words = t.split(/\s+/);
  const key = Object.keys(AMBIG).find((k) => t === k || (words.length === 1 && words[0] === k));
  return key ? { key, excl: AMBIG[key] } : null;
}

export function guessCat(term) {
  const t = term.toLowerCase();
  if (/(lint|static|analy|false pos|bot|ai |sonar|codeql|suppress|nitpick)/.test(t)) return 'auto';
  if (/(\bci\b|pipeline|flaky|runner|action|build|cache|secret|deploy)/.test(t)) return 'ci';
  if (/(lgtm|rubber|reviewer|latency|wait|culture|approve|time to review|large pr)/.test(t)) return 'culture';
  if (/(monorepo|stack|merge|codeowner|branch|rebase)/.test(t)) return 'flow';
  return 'auto';
}
