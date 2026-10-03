import { getDb, nowIso, cryptoId, audit } from '../db/index.js';
import type {
  Memory,
  Entity,
  EntityKind,
  Artifact,
  MemoryRecollection,
  Confidence,
  SourceType,
  Visibility,
  DatePrecision,
} from '../types.js';

// ---------- helpers ----------
const J = {
  parse<T>(s: unknown, fallback: T): T {
    try {
      return s ? (JSON.parse(String(s)) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  str: (v: unknown): string => JSON.stringify(v ?? []),
};

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// ---------- entities ----------
export function findOrCreateEntity(kind: EntityKind, name: string): Entity {
  const db = getDb();
  const norm = normalize(name);
  const existing = db
    .prepare(`SELECT * FROM entities WHERE kind = ? AND normalized = ?`)
    .get(kind, norm) as any;
  if (existing) return rowToEntity(existing);

  const now = nowIso();
  const id = cryptoId('ent');
  db.prepare(
    `INSERT INTO entities (id, kind, name, normalized, aliases, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, '[]', NULL, ?, ?)`,
  ).run(id, kind, name.trim(), norm, now, now);
  audit('entity.create', 'entity', id, `${kind}:${name}`);
  return {
    id,
    kind,
    name: name.trim(),
    normalized: norm,
    aliases: [],
    created_at: now,
    updated_at: now,
  };
}

function rowToEntity(r: any): Entity {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    normalized: r.normalized,
    aliases: J.parse<string[]>(r.aliases, []),
    notes: r.notes ?? undefined,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function linkEntity(memoryId: string, entityId: string): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO memory_entities (memory_id, entity_id) VALUES (?, ?)`,
    )
    .run(memoryId, entityId);
}

export function entitiesForMemory(memoryId: string): Entity[] {
  const rows = getDb()
    .prepare(
      `SELECT e.* FROM entities e
       JOIN memory_entities me ON me.entity_id = e.id
       WHERE me.memory_id = ? ORDER BY e.kind, e.name`,
    )
    .all(memoryId) as any[];
  return rows.map(rowToEntity);
}

// ---------- memories ----------
export interface CreateMemoryInput {
  title: string;
  summary: string;
  original_transcript: string;
  source_type: SourceType;
  confidence: Confidence;
  speaker?: string;
  memory_date_text?: string | null;
  memory_date_start?: string | null;
  date_precision?: DatePrecision;
  emotions?: string[];
  themes?: string[];
  tags?: string[];
  status?: Memory['status'];
  visibility?: Visibility;
  provenance?: string;
  consent_state?: Memory['consent_state'];
  conversation_id?: string | null;
  embedding?: number[] | null;
  entities?: { kind: EntityKind; name: string }[];
}

export function createMemory(input: CreateMemoryInput): Memory {
  const db = getDb();
  const now = nowIso();
  const id = cryptoId('mem');

  db.prepare(
    `INSERT INTO memories (
      id, title, summary, original_transcript, source_type, confidence, speaker,
      memory_date_text, memory_date_start, date_precision, emotions, themes, tags,
      status, visibility, provenance, consent_state, conversation_id, embedding,
      created_by, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    input.title,
    input.summary,
    input.original_transcript,
    input.source_type,
    input.confidence,
    input.speaker ?? 'Grandma',
    input.memory_date_text ?? null,
    input.memory_date_start ?? null,
    input.date_precision ?? 'unknown',
    J.str(input.emotions ?? []),
    J.str(input.themes ?? []),
    J.str(input.tags ?? []),
    input.status ?? 'saved',
    input.visibility ?? 'FAMILY',
    input.provenance ?? '',
    input.consent_state ?? 'granted',
    input.conversation_id ?? null,
    input.embedding ? JSON.stringify(input.embedding) : null,
    'owner',
    now,
    now,
  );

  // First recollection = the immutable original.
  addRecollection(id, 'general', input.original_transcript, input.confidence);

  // Link entities (dedup inside findOrCreateEntity).
  for (const e of input.entities ?? []) {
    if (!e.name?.trim()) continue;
    const ent = findOrCreateEntity(e.kind, e.name);
    linkEntity(id, ent.id);
  }

  // Auto-relate to memories sharing an entity.
  autoRelateByEntities(id);

  audit('memory.create', 'memory', id, input.title);
  return getMemory(id)!;
}

export function addRecollection(
  memoryId: string,
  field: string,
  text: string,
  confidence: Confidence,
): MemoryRecollection {
  const now = nowIso();
  const id = cryptoId('rec');
  getDb()
    .prepare(
      `INSERT INTO memory_recollections (id, memory_id, field, text, confidence, created_at)
       VALUES (?,?,?,?,?,?)`,
    )
    .run(id, memoryId, field, text, confidence, now);
  return { id, memory_id: memoryId, field, text, confidence, created_at: now };
}

export function linkMemories(from: string, to: string, relation = 'related'): void {
  if (from === to) return;
  const db = getDb();
  const exists = db
    .prepare(`SELECT 1 FROM memory_links WHERE from_memory = ? AND to_memory = ?`)
    .get(from, to);
  if (exists) return;
  db.prepare(
    `INSERT INTO memory_links (id, from_memory, to_memory, relation, created_at)
     VALUES (?,?,?,?,?)`,
  ).run(cryptoId('lnk'), from, to, relation, nowIso());
}

function autoRelateByEntities(memoryId: string): void {
  const db = getDb();
  const related = db
    .prepare(
      `SELECT DISTINCT me2.memory_id AS mid
       FROM memory_entities me1
       JOIN memory_entities me2 ON me2.entity_id = me1.entity_id
       WHERE me1.memory_id = ? AND me2.memory_id != ?`,
    )
    .all(memoryId, memoryId) as any[];
  for (const r of related) {
    linkMemories(memoryId, r.mid, 'shares a person/place');
    linkMemories(r.mid, memoryId, 'shares a person/place');
  }
}

function rowToMemory(r: any): Memory {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    original_transcript: r.original_transcript,
    source_type: r.source_type,
    confidence: r.confidence,
    speaker: r.speaker,
    memory_date_text: r.memory_date_text,
    memory_date_start: r.memory_date_start,
    date_precision: r.date_precision,
    emotions: J.parse<string[]>(r.emotions, []),
    themes: J.parse<string[]>(r.themes, []),
    tags: J.parse<string[]>(r.tags, []),
    status: r.status,
    visibility: r.visibility,
    provenance: r.provenance,
    consent_state: r.consent_state,
    conversation_id: r.conversation_id,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function getMemory(id: string): Memory | null {
  const db = getDb();
  const r = db.prepare(`SELECT * FROM memories WHERE id = ?`).get(id) as any;
  if (!r) return null;
  const mem = rowToMemory(r);
  mem.entities = entitiesForMemory(id);
  mem.recollections = db
    .prepare(`SELECT * FROM memory_recollections WHERE memory_id = ? ORDER BY created_at`)
    .all(id) as MemoryRecollection[];
  mem.artifacts = db
    .prepare(`SELECT * FROM artifacts WHERE memory_id = ? ORDER BY created_at`)
    .all(id)
    .map((a: any) => ({ ...a, is_ai_generated: !!a.is_ai_generated })) as Artifact[];
  mem.related = (
    db
      .prepare(
        `SELECT m.id, m.title, l.relation FROM memory_links l
         JOIN memories m ON m.id = l.to_memory
         WHERE l.from_memory = ? LIMIT 12`,
      )
      .all(id) as any[]
  ).map((x) => ({ id: x.id, title: x.title, relation: x.relation }));
  return mem;
}

export interface ListFilter {
  visibility?: Visibility[];
  status?: Memory['status'][];
  limit?: number;
}

export function listMemories(filter: ListFilter = {}): Memory[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: any[] = [];
  if (filter.visibility?.length) {
    clauses.push(`visibility IN (${filter.visibility.map(() => '?').join(',')})`);
    params.push(...filter.visibility);
  }
  if (filter.status?.length) {
    clauses.push(`status IN (${filter.status.map(() => '?').join(',')})`);
    params.push(...filter.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT * FROM memories ${where} ORDER BY created_at DESC LIMIT ?`,
    )
    .all(...params, filter.limit ?? 200) as any[];
  return rows.map((r) => {
    const m = rowToMemory(r);
    m.entities = entitiesForMemory(m.id);
    return m;
  });
}

/** Cosine-similarity semantic search over stored embeddings. */
export function semanticSearch(
  queryEmbedding: number[],
  limit = 5,
): { memory: Memory; score: number }[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM memories WHERE embedding IS NOT NULL AND status != 'archived'`)
    .all() as any[];
  const scored = rows
    .map((r) => {
      const emb = J.parse<number[]>(r.embedding, []);
      return { memory: rowToMemory(r), score: cosine(queryEmbedding, emb) };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored;
}

export function updateMemoryEmbedding(id: string, embedding: number[]): void {
  getDb()
    .prepare(`UPDATE memories SET embedding = ?, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(embedding), nowIso(), id);
}

export function deleteMemory(id: string): void {
  getDb().prepare(`DELETE FROM memories WHERE id = ?`).run(id);
  audit('memory.delete', 'memory', id);
}

export function setVisibility(id: string, visibility: Visibility): void {
  getDb()
    .prepare(`UPDATE memories SET visibility = ?, updated_at = ? WHERE id = ?`)
    .run(visibility, nowIso(), id);
  audit('memory.visibility', 'memory', id, visibility);
}

// ---------- stats for the Vault ----------
export function vaultStats() {
  const db = getDb();
  const count = (sql: string, ...p: any[]) =>
    (db.prepare(sql).get(...p) as any).c as number;
  return {
    memories: count(`SELECT COUNT(*) c FROM memories WHERE status != 'archived'`),
    people: count(`SELECT COUNT(*) c FROM entities WHERE kind = 'person'`),
    places: count(`SELECT COUNT(*) c FROM entities WHERE kind = 'place'`),
    recipes: count(`SELECT COUNT(*) c FROM entities WHERE kind = 'recipe'`),
    unfinished: count(`SELECT COUNT(*) c FROM memories WHERE status = 'unfinished'`),
    artifacts: count(`SELECT COUNT(*) c FROM artifacts`),
    audio: count(`SELECT COUNT(*) c FROM artifacts WHERE kind = 'audio'`),
  };
}
