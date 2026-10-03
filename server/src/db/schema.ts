// The Memory Vault schema. Relational, with provenance and immutability built in.
// Embeddings are stored as JSON float arrays (cosine similarity done in JS) —
// a lightweight, dependency-free local vector store that fits a personal archive.

export const SCHEMA_SQL = /* sql */ `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,
  speaker     TEXT NOT NULL DEFAULT 'Grandma',
  started_at  TEXT NOT NULL,
  ended_at    TEXT
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,            -- grandma | storyhouse | system
  text            TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msgs_conv ON conversation_messages(conversation_id);

CREATE TABLE IF NOT EXISTS memories (
  id                  TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  summary             TEXT NOT NULL,
  original_transcript TEXT NOT NULL,        -- immutable: Grandma's own words
  source_type         TEXT NOT NULL,
  confidence          TEXT NOT NULL,
  speaker             TEXT NOT NULL DEFAULT 'Grandma',
  memory_date_text    TEXT,
  memory_date_start   TEXT,
  date_precision      TEXT NOT NULL DEFAULT 'unknown',
  emotions            TEXT NOT NULL DEFAULT '[]',   -- JSON array
  themes              TEXT NOT NULL DEFAULT '[]',
  tags                TEXT NOT NULL DEFAULT '[]',
  status              TEXT NOT NULL DEFAULT 'saved', -- candidate | saved | unfinished | archived
  visibility          TEXT NOT NULL DEFAULT 'FAMILY',
  provenance          TEXT NOT NULL DEFAULT '',
  consent_state       TEXT NOT NULL DEFAULT 'granted',
  conversation_id     TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  embedding           TEXT,                 -- JSON float array for semantic search
  created_by          TEXT NOT NULL DEFAULT 'owner',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mem_date ON memories(memory_date_start);
CREATE INDEX IF NOT EXISTS idx_mem_status ON memories(status);
CREATE INDEX IF NOT EXISTS idx_mem_visibility ON memories(visibility);

-- Immutable recollections: when a detail is revised, we ADD a row; we never overwrite.
CREATE TABLE IF NOT EXISTS memory_recollections (
  id          TEXT PRIMARY KEY,
  memory_id   TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  field       TEXT NOT NULL,
  text        TEXT NOT NULL,
  confidence  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recoll_mem ON memory_recollections(memory_id);

CREATE TABLE IF NOT EXISTS entities (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  name        TEXT NOT NULL,
  normalized  TEXT NOT NULL,
  aliases     TEXT NOT NULL DEFAULT '[]',
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entity_norm ON entities(kind, normalized);

CREATE TABLE IF NOT EXISTS memory_entities (
  memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY (memory_id, entity_id)
);

CREATE TABLE IF NOT EXISTS memory_links (
  id          TEXT PRIMARY KEY,
  from_memory TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  to_memory   TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  relation    TEXT NOT NULL DEFAULT 'related',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_links_from ON memory_links(from_memory);

CREATE TABLE IF NOT EXISTS artifacts (
  id              TEXT PRIMARY KEY,
  memory_id       TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,            -- image | document | audio
  label           TEXT NOT NULL,            -- ALWAYS explicit provenance label
  is_ai_generated INTEGER NOT NULL DEFAULT 0,
  url             TEXT NOT NULL,
  prompt          TEXT,
  provider        TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artifacts_mem ON artifacts(memory_id);

CREATE TABLE IF NOT EXISTS questions (
  id              TEXT PRIMARY KEY,
  asked_by        TEXT NOT NULL,
  question        TEXT NOT NULL,
  about_person    TEXT,
  status          TEXT NOT NULL DEFAULT 'open',   -- open | answered | declined
  answer_memory_id TEXT REFERENCES memories(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL
);

-- Novelty engine memory: what we've already asked, so we don't repeat.
CREATE TABLE IF NOT EXISTS asked_questions (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  question        TEXT NOT NULL,
  topic           TEXT,
  produced_new_info INTEGER NOT NULL DEFAULT 0,
  declined        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  detail      TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
