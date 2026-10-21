import { all, first, run, nowIso, cryptoId, audit } from '../db.js';
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
export async function findOrCreateEntity(kind: EntityKind, name: string): Promise<Entity> {
  const norm = normalize(name);
  const existing = await first(`SELECT * FROM entities WHERE kind = ? AND normalized = ?`, kind, norm);
  if (existing) return rowToEntity(existing);

  const now = nowIso();
  const id = cryptoId('ent');
  await run(
    `INSERT INTO entities (id, kind, name, normalized, aliases, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, '[]', NULL, ?, ?)`,
    id,
    kind,
    name.trim(),
    norm,
    now,
    now,
  );
  await audit('entity.create', 'entity', id, `${kind}:${name}`);
  return { id, kind, name: name.trim(), normalized: norm, aliases: [], created_at: now, updated_at: now };
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

export async function linkEntity(memoryId: string, entityId: string): Promise<void> {
  await run(`INSERT OR IGNORE INTO memory_entities (memory_id, entity_id) VALUES (?, ?)`, memoryId, entityId);
}

export async function entitiesForMemory(memoryId: string): Promise<Entity[]> {
  const rows = await all(
    `SELECT e.* FROM entities e
     JOIN memory_entities me ON me.entity_id = e.id
     WHERE me.memory_id = ? ORDER BY e.kind, e.name`,
    memoryId,
  );
  return rows.map(rowToEntity);
}

/** Entities for many memories in one query (avoids N+1 round trips to D1). */
async function entitiesForMemories(ids: string[]): Promise<Map<string, Entity[]>> {
  const out = new Map<string, Entity[]>();
  if (!ids.length) return out;
  const rows = await all(
    `SELECT me.memory_id AS mid, e.* FROM entities e
     JOIN memory_entities me ON me.entity_id = e.id
     WHERE me.memory_id IN (${ids.map(() => '?').join(',')})
     ORDER BY e.kind, e.name`,
    ...ids,
  );
  for (const r of rows) {
    const list = out.get(r.mid) ?? [];
    list.push(rowToEntity(r));
    out.set(r.mid, list);
  }
  return out;
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

export async function createMemory(input: CreateMemoryInput): Promise<Memory> {
  const now = nowIso();
  const id = cryptoId('mem');

  await run(
    `INSERT INTO memories (
      id, title, summary, original_transcript, source_type, confidence, speaker,
      memory_date_text, memory_date_start, date_precision, emotions, themes, tags,
      status, visibility, provenance, consent_state, conversation_id, embedding,
      created_by, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
  await addRecollection(id, 'general', input.original_transcript, input.confidence);

  // Link entities (dedup inside findOrCreateEntity).
  for (const e of input.entities ?? []) {
    if (!e.name?.trim()) continue;
    const ent = await findOrCreateEntity(e.kind, e.name);
    await linkEntity(id, ent.id);
  }

  // Auto-relate to memories sharing an entity.
  await autoRelateByEntities(id);

  await audit('memory.create', 'memory', id, input.title);
  return (await getMemory(id))!;
}

export async function addRecollection(
  memoryId: string,
  field: string,
  text: string,
  confidence: Confidence,
): Promise<MemoryRecollection> {
  const now = nowIso();
  const id = cryptoId('rec');
  await run(
    `INSERT INTO memory_recollections (id, memory_id, field, text, confidence, created_at)
     VALUES (?,?,?,?,?,?)`,
    id,
    memoryId,
    field,
    text,
    confidence,
    now,
  );
  return { id, memory_id: memoryId, field, text, confidence, created_at: now };
}

export async function linkMemories(from: string, to: string, relation = 'related'): Promise<void> {
  if (from === to) return;
  const exists = await first(`SELECT 1 AS x FROM memory_links WHERE from_memory = ? AND to_memory = ?`, from, to);
  if (exists) return;
  await run(
    `INSERT INTO memory_links (id, from_memory, to_memory, relation, created_at) VALUES (?,?,?,?,?)`,
    cryptoId('lnk'),
    from,
    to,
    relation,
    nowIso(),
  );
}

async function autoRelateByEntities(memoryId: string): Promise<void> {
  const related = await all(
    `SELECT DISTINCT me2.memory_id AS mid
     FROM memory_entities me1
     JOIN memory_entities me2 ON me2.entity_id = me1.entity_id
     WHERE me1.memory_id = ? AND me2.memory_id != ?`,
    memoryId,
    memoryId,
  );
  for (const r of related) {
    await linkMemories(memoryId, r.mid, 'shares a person/place');
    await linkMemories(r.mid, memoryId, 'shares a person/place');
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

export async function getMemory(id: string): Promise<Memory | null> {
  const r = await first(`SELECT * FROM memories WHERE id = ?`, id);
  if (!r) return null;
  const mem = rowToMemory(r);
  const [entities, recollections, artifacts, related] = await Promise.all([
    entitiesForMemory(id),
    all<MemoryRecollection>(
      `SELECT * FROM memory_recollections WHERE memory_id = ? ORDER BY created_at`,
      id,
    ),
    all(`SELECT * FROM artifacts WHERE memory_id = ? ORDER BY created_at`, id),
    all(
      `SELECT m.id, m.title, l.relation FROM memory_links l
       JOIN memories m ON m.id = l.to_memory
       WHERE l.from_memory = ? LIMIT 12`,
      id,
    ),
  ]);
  mem.entities = entities;
  mem.recollections = recollections;
  mem.artifacts = artifacts.map((a: any) => ({ ...a, is_ai_generated: !!a.is_ai_generated })) as Artifact[];
  mem.related = related.map((x: any) => ({ id: x.id, title: x.title, relation: x.relation }));
  return mem;
}

export interface ListFilter {
  visibility?: Visibility[];
  status?: Memory['status'][];
  limit?: number;
}

export async function listMemories(filter: ListFilter = {}): Promise<Memory[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.visibility?.length) {
    clauses.push(`visibility IN (${filter.visibility.map(() => '?').join(',')})`);
    params.push(...filter.visibility);
  }
  if (filter.status?.length) {
    clauses.push(`status IN (${filter.status.map(() => '?').join(',')})`);
    params.push(...filter.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await all(
    `SELECT * FROM memories ${where} ORDER BY created_at DESC LIMIT ?`,
    ...params,
    filter.limit ?? 200,
  );
  const memories = rows.map(rowToMemory);
  const ents = await entitiesForMemories(memories.map((m) => m.id));
  for (const m of memories) m.entities = ents.get(m.id) ?? [];
  return memories;
}

/** Cosine-similarity semantic search over stored embeddings. */
export async function semanticSearch(
  queryEmbedding: number[],
  limit = 5,
): Promise<{ memory: Memory; score: number }[]> {
  const rows = await all(`SELECT * FROM memories WHERE embedding IS NOT NULL AND status != 'archived'`);
  return rows
    .map((r) => {
      const emb = J.parse<number[]>(r.embedding, []);
      return { memory: rowToMemory(r), score: cosine(queryEmbedding, emb) };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function updateMemoryEmbedding(id: string, embedding: number[]): Promise<void> {
  await run(`UPDATE memories SET embedding = ?, updated_at = ? WHERE id = ?`, JSON.stringify(embedding), nowIso(), id);
}

export async function deleteMemory(id: string): Promise<void> {
  await run(`DELETE FROM memories WHERE id = ?`, id);
  await audit('memory.delete', 'memory', id);
}

export async function setVisibility(id: string, visibility: Visibility): Promise<void> {
  await run(`UPDATE memories SET visibility = ?, updated_at = ? WHERE id = ?`, visibility, nowIso(), id);
  await audit('memory.visibility', 'memory', id, visibility);
}

// ---------- stats for the Vault ----------
export async function vaultStats() {
  const r = await first(
    `SELECT
       (SELECT COUNT(*) FROM memories WHERE status != 'archived') AS memories,
       (SELECT COUNT(*) FROM entities WHERE kind = 'person') AS people,
       (SELECT COUNT(*) FROM entities WHERE kind = 'place') AS places,
       (SELECT COUNT(*) FROM entities WHERE kind = 'recipe') AS recipes,
       (SELECT COUNT(*) FROM memories WHERE status = 'unfinished') AS unfinished,
       (SELECT COUNT(*) FROM artifacts) AS artifacts,
       (SELECT COUNT(*) FROM artifacts WHERE kind = 'audio') AS audio,
       (SELECT COUNT(*) FROM photos WHERE status = 'published') AS photos`,
  );
  return r as {
    memories: number;
    people: number;
    places: number;
    recipes: number;
    unfinished: number;
    artifacts: number;
    audio: number;
    photos: number;
  };
}
