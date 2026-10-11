-- Developer Community Pulse · Neon schema + seed (idempotent)

-- ── Config plane (edit these rows to change what is tracked; no deploy needed)
CREATE TABLE IF NOT EXISTS topic_categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS keywords (
  id serial PRIMARY KEY,
  category_id text NOT NULL REFERENCES topic_categories(id),
  term text NOT NULL,
  kind text NOT NULL DEFAULT 'include' CHECK (kind IN ('include','exclude')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, term, kind)
);

CREATE TABLE IF NOT EXISTS taxonomy_versions (
  version int PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pain_point_taxonomy (
  id text PRIMARY KEY,
  category_id text NOT NULL REFERENCES topic_categories(id),
  label text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','candidate','retired')),
  added_in_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sources (
  id serial PRIMARY KEY,
  platform text NOT NULL CHECK (platform IN ('reddit','hackernews','stackoverflow','github')),
  target text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (platform, target)
);

-- ── Time-series plane
CREATE TABLE IF NOT EXISTS threads (
  id text PRIMARY KEY,                 -- e.g. hn_41234567, so_78901234
  platform text NOT NULL,
  external_id text NOT NULL,
  url text NOT NULL,
  canonical_url text NOT NULL UNIQUE,
  title text NOT NULL,
  body text,
  author text,
  created_at timestamptz NOT NULL,
  week_start date NOT NULL,            -- Friday (IST) that opens the Fri–Thu window
  score int DEFAULT 0,
  comment_count int DEFAULT 0,
  accepted boolean DEFAULT false,
  content_hash text NOT NULL,
  matched_keywords text[] DEFAULT '{}',
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS threads_week_idx ON threads (week_start);
CREATE INDEX IF NOT EXISTS threads_hash_idx ON threads (content_hash);

CREATE TABLE IF NOT EXISTS classifications (
  thread_id text NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  taxonomy_ver int NOT NULL,
  prompt_ver text NOT NULL,
  model text NOT NULL,
  is_pain boolean NOT NULL,
  pain_point_id text,                  -- taxonomy id or 'CANDIDATE'
  candidate_label text,
  intent text CHECK (intent IN ('how_to','bug_report','vent','workaround','tool_request','comparison','other')),
  cause text CHECK (cause IN ('tooling','process','user_error','unknown')),
  resolved boolean,
  severity smallint CHECK (severity BETWEEN 1 AND 5),
  sarcasm boolean DEFAULT false,
  tools_mentioned jsonb DEFAULT '[]',
  evidence_quote text,
  classified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, taxonomy_ver, prompt_ver)
);
CREATE INDEX IF NOT EXISTS classifications_pp_idx ON classifications (pain_point_id);

CREATE TABLE IF NOT EXISTS weekly_rollups (
  week_start date NOT NULL,
  pain_point_id text NOT NULL,
  taxonomy_ver int NOT NULL,
  threads int NOT NULL,
  voices int NOT NULL,
  unresolved_rate numeric(5,4),
  engagement int,
  corpus_threads int,
  sealed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, pain_point_id, taxonomy_ver)
);

CREATE TABLE IF NOT EXISTS source_runs (
  id serial PRIMARY KEY,
  run_id text NOT NULL,
  platform text NOT NULL,
  target text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  fetched int DEFAULT 0,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','degraded','failed')),
  error text
);

CREATE TABLE IF NOT EXISTS briefs (
  week_start date PRIMARY KEY,
  taxonomy_ver int NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Seed
INSERT INTO taxonomy_versions (version, note) VALUES (1, 'Initial taxonomy')
ON CONFLICT DO NOTHING;

INSERT INTO topic_categories (id, name, description) VALUES
 ('auto',    'Review automation',  'Static analysis, linters and AI review bots'),
 ('ci',      'CI/CD automation',   'Pipelines, runners, flaky tests, CI cost'),
 ('culture', 'Review culture',     'How teams review code: speed, depth, ownership'),
 ('flow',    'Developer workflow', 'Branching, monorepos, stacked PRs, merge queues')
ON CONFLICT DO NOTHING;

INSERT INTO keywords (category_id, term, kind) VALUES
 ('auto','false positive','include'), ('auto','noisy linter','include'), ('auto','suppress warning','include'),
 ('auto','static analysis','include'), ('auto','AI code review','include'), ('auto','review bot','include'),
 ('auto','covid','exclude'), ('auto','ML model','exclude'), ('auto','precision recall','exclude'),
 ('ci','flaky test','include'), ('ci','slow pipeline','include'), ('ci','github actions cache','include'),
 ('ci','runner cost','include'), ('ci','CI secrets','include'),
 ('ci','certification','exclude'), ('ci','job listing','exclude'),
 ('culture','waiting for review','include'), ('culture','LGTM','include'), ('culture','rubber stamp','include'),
 ('culture','large PR','include'), ('culture','reviewer fatigue','include'),
 ('culture','code of conduct','exclude'),
 ('flow','stacked PRs','include'), ('flow','monorepo','include'), ('flow','CODEOWNERS','include'),
 ('flow','merge queue','include'),
 ('flow','monorepo vs polyrepo poll','exclude')
ON CONFLICT DO NOTHING;

INSERT INTO pain_point_taxonomy (id, category_id, label, description) VALUES
 ('pp_fp_noise',     'auto',    'Static analysis false positives drown real findings', 'Analyzer/linter noise leads teams to ignore or disable checks'),
 ('pp_ai_nits',      'auto',    'AI review bots post low-signal nitpicks',             'Automated reviewers produce volume over signal; bots get muted'),
 ('pp_flaky',        'ci',      'Flaky tests block merges and normalise retries',      'Non-deterministic tests gate merges; retry culture'),
 ('pp_slow_ci',      'ci',      'Slow pipelines break review flow',                    'Long CI times cause context switching and stale reviews'),
 ('pp_actions_cost', 'ci',      'CI caching and runner cost',                          'Cache misses, runner minutes and cost overruns'),
 ('pp_secrets',      'ci',      'Secrets handling in CI is brittle',                   'Credential management and rotation in pipelines'),
 ('pp_wait',         'culture', 'PRs wait days for a reviewer',                        'Slow time-to-first-review, unclear ownership'),
 ('pp_rubber',       'culture', 'Large PRs get rubber-stamped',                        'Big diffs approved without meaningful review'),
 ('pp_monorepo',     'flow',    'Monorepo PRs hide what they actually affect',         'Reviewers cannot see impact; CODEOWNERS over-notifies'),
 ('pp_stacked',      'flow',    'No native support for stacked PRs',                   'Dependent PR chains are painful to manage and rebase')
ON CONFLICT DO NOTHING;

INSERT INTO sources (platform, target) VALUES
 ('hackernews','search'),
 ('stackoverflow','continuous-integration'), ('stackoverflow','github-actions'), ('stackoverflow','code-review'),
 ('stackoverflow','static-analysis'), ('stackoverflow','gitlab-ci'),
 ('github','is:issue "false positive" in:title'), ('github','is:issue flaky in:title label:ci'),
 ('reddit','devops'), ('reddit','ExperiencedDevs'), ('reddit','programming'), ('reddit','github'), ('reddit','cicd')
ON CONFLICT DO NOTHING;
