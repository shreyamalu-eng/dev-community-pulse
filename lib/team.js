// The 15-person team behind Pulse. Shared by the server and the dashboard.
// Starting text for each profile; anyone can update their own focus and view on the Team page (saved in Neon `team_notes`).
// Only Sumit, Neha and Kabir vote; everyone can comment.

export const GROUPS = { product: 'Product', eng: 'Engineering', gtm: 'Go-to-market' };

export const TEAM = [
  { id: 'sumit', name: 'Sumit', role: 'Product manager', group: 'product', voter: true, decides: true,
    keywords: ['AI code review', 'false positive', 'waiting for review'], pains: ['pp_ai_nits', 'pp_fp_noise', 'pp_wait'],
    focus: 'Picking the one problem we put in next sprint.',
    view: 'Volume alone is not enough. I want problems that are growing, still unsolved, and sit inside what our reviewer can fix.' },
  { id: 'neha', name: 'Neha', role: 'Engineering lead', group: 'eng', voter: true,
    keywords: ['static analysis', 'false positive', 'large PR'], pains: ['pp_fp_noise', 'pp_rubber'],
    focus: 'Keeping our own review comments precise enough that teams do not mute us.',
    view: 'Every noisy finding costs trust. Ranking and hiding repeat noise is cheaper for us to build than any new detector.' },
  { id: 'kabir', name: 'Kabir', role: 'Sales lead', group: 'gtm', voter: true,
    keywords: ['AI code review', 'review bot', 'merge queue'], pains: ['pp_ai_nits', 'pp_wait'],
    focus: 'The objections prospects raise on calls.',
    view: 'The objection I hear most is that the team already muted one review bot. If we can show fewer, better comments, deals move faster.' },
  { id: 'aarav', name: 'Aarav', role: 'Backend engineer, review engine', group: 'eng',
    keywords: ['static analysis', 'suppress warning', 'monorepo'], pains: ['pp_fp_noise', 'pp_monorepo'],
    focus: 'How the engine reads diffs in very large repos.',
    view: 'Monorepo diffs hide what a change really touches. Better impact mapping would cut both noise and missed issues.' },
  { id: 'ishita', name: 'Ishita', role: 'ML engineer, comment ranking', group: 'eng',
    keywords: ['AI code review', 'false positive'], pains: ['pp_ai_nits', 'pp_fp_noise'],
    focus: 'Which comments developers act on and which they dismiss.',
    view: 'Developers forgive a missed issue more easily than five nitpicks. Precision first, coverage second.' },
  { id: 'rohan', name: 'Rohan', role: 'Frontend engineer', group: 'eng',
    keywords: ['stacked PRs', 'large PR'], pains: ['pp_stacked', 'pp_rubber'],
    focus: 'How review comments show up inside the pull request.',
    view: 'Large PRs get skimmed because nobody can see where to start. A short "read this first" summary would help reviewers.' },
  { id: 'meera', name: 'Meera', role: 'Developer relations', group: 'gtm',
    keywords: ['LGTM', 'rubber stamp', 'reviewer fatigue'], pains: ['pp_rubber', 'pp_wait'],
    focus: 'What developers say about review culture in public.',
    view: 'Review fatigue comes up in every community I follow. People want help, not another tool that adds to the queue.' },
  { id: 'vikram', name: 'Vikram', role: 'Platform and CI engineer', group: 'eng',
    keywords: ['flaky test', 'slow pipeline', 'runner cost'], pains: ['pp_flaky', 'pp_slow_ci', 'pp_actions_cost'],
    focus: 'Our own CI and how the reviewer fits into customer pipelines.',
    view: 'Flaky tests are the loudest problem but they are not ours to fix. We can flag a PR that touches a known-flaky test.' },
  { id: 'ananya', name: 'Ananya', role: 'Product designer', group: 'product',
    keywords: ['waiting for review', 'large PR'], pains: ['pp_wait', 'pp_rubber'],
    focus: 'Making the review experience calmer and easier to scan.',
    view: 'The waiting is the pain, not the review itself. An instant first pass makes the wait feel productive.' },
  { id: 'dev', name: 'Dev', role: 'Customer success', group: 'gtm',
    keywords: ['review bot', 'false positive'], pains: ['pp_ai_nits', 'pp_fp_noise'],
    focus: 'Why pilot teams turn the reviewer off.',
    view: 'Pilot teams that switch a reviewer off usually say "too many comments". That lines up with what the community is saying.' },
  { id: 'priya', name: 'Priya', role: 'QA and test engineer', group: 'eng',
    keywords: ['flaky test', 'test coverage'], pains: ['pp_flaky'],
    focus: 'Test reliability, ours and our customers\'.',
    view: 'Flaky tests teach teams to ignore red builds, and then they ignore review bots too. The two problems feed each other.' },
  { id: 'arjun', name: 'Arjun', role: 'Security engineer', group: 'eng',
    keywords: ['CI secrets', 'CodeQL', 'Dependabot'], pains: ['pp_secrets', 'pp_fp_noise'],
    focus: 'Security findings inside code review.',
    view: 'Security scanners have the worst false-positive reputation. If we triage their findings well, that is a clear wedge.' },
  { id: 'zoya', name: 'Zoya', role: 'Data analyst', group: 'product',
    keywords: ['time to review', 'review latency'], pains: ['pp_wait', 'pp_slow_ci'],
    focus: 'Checking that Pulse numbers match what we see in pilot data.',
    view: 'Small weekly counts swing a lot. I read the monthly view and the 4-week normal before calling anything a trend.' },
  { id: 'karan', name: 'Karan', role: 'Solutions engineer, enterprise', group: 'gtm',
    keywords: ['monorepo', 'CODEOWNERS', 'merge queue'], pains: ['pp_monorepo', 'pp_stacked'],
    focus: 'Rollouts at companies with 500+ engineers.',
    view: 'Enterprise buyers ask about CODEOWNERS and merge queues first. Monorepo support decides the deal.' },
  { id: 'tara', name: 'Tara', role: 'Content and marketing', group: 'gtm',
    keywords: ['AI code review', 'LGTM'], pains: ['pp_ai_nits', 'pp_rubber'],
    focus: 'Turning community pain into posts and launch messages.',
    view: 'The best-performing posts quote real developer frustration. Pulse gives me sourced quotes I can link to.' },
];

export const TEAM_BY_ID = Object.fromEntries(TEAM.map((p) => [p.id, p]));
export const VOTERS = TEAM.filter((p) => p.voter).map((p) => p.id);
export const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// Sample discussion for a problem put to the vote, so the thread is not empty on day one. Marked as sample in the UI.
export function sampleChat(meta = {}, title = 'this problem') {
  const tried = (meta.tried || 'the usual workarounds').replace(/\.$/, '').toLowerCase();
  const next = (meta.next || 'a small prototype').replace(/\.$/, '');
  return [
    { key: 'a', author: 'neha', body: `We have seen "${title}" in our own repos. Teams already tried ${tried}, and the threads say it did not stick. If we take this, I would scope it to: ${next.charAt(0).toLowerCase() + next.slice(1)}.` },
    { key: 'b', parent: 'a', author: 'sumit', body: 'Agreed on the scope. What would we need to drop from the current sprint to fit it?' },
    { key: 'c', parent: 'a', author: 'aarav', body: 'About a week for a first version behind a flag. We can reuse the ranking we already have.' },
    { key: 'd', author: 'kabir', body: 'Two prospects raised this on calls this month. A short demo of it would help in the next round of pilots.' },
    { key: 'e', parent: 'd', author: 'dev', body: 'Same from a pilot team last week. Happy to share the call notes.' },
  ];
}
