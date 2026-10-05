import { getDb, nowIso, cryptoId, audit } from '../db/index.js';
import { getProvider } from '../ai/index.js';
import type { RetrievedContext } from '../ai/index.js';
import type { ChatTurn, EntityKind, Memory } from '../types.js';
import {
  createMemory,
  semanticSearch,
  getMemory,
  type CreateMemoryInput,
} from './store.js';

// ---------- conversation storage ----------
export function startConversation(speaker = 'Grandma'): string {
  const id = cryptoId('conv');
  getDb()
    .prepare(`INSERT INTO conversations (id, speaker, started_at) VALUES (?,?,?)`)
    .run(id, speaker, nowIso());
  return id;
}

export function endConversation(id: string): void {
  getDb().prepare(`UPDATE conversations SET ended_at = ? WHERE id = ?`).run(nowIso(), id);
}

function saveMessage(conversationId: string, role: ChatTurn['role'], text: string): void {
  getDb()
    .prepare(
      `INSERT INTO conversation_messages (id, conversation_id, role, text, created_at)
       VALUES (?,?,?,?,?)`,
    )
    .run(cryptoId('msg'), conversationId, role, text, nowIso());
}

function recentHistory(conversationId: string, limit = 8): ChatTurn[] {
  const rows = getDb()
    .prepare(
      `SELECT role, text FROM conversation_messages
       WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(conversationId, limit) as any[];
  return rows.reverse().map((r) => ({ role: r.role, text: r.text }));
}

// ---------- the core loop: respond ----------
export interface RespondResult {
  reply: string;
  usedMemories: { id: string; title: string; score: number }[];
  openModelOnline: boolean;
  provider: string;
}

export async function respond(
  conversationId: string,
  grandmaText: string,
): Promise<RespondResult> {
  saveMessage(conversationId, 'grandma', grandmaText);
  const { provider, status } = await getProvider();

  // Retrieve relevant memories semantically (controlled context — never dump all).
  let used: { id: string; title: string; score: number }[] = [];
  const context: RetrievedContext = { memories: [] };
  try {
    const qEmb = await provider.embed(grandmaText);
    const hits = semanticSearch(qEmb, 3).filter((h) => h.score > 0.62);
    used = hits.map((h) => ({ id: h.memory.id, title: h.memory.title, score: h.score }));
    context.memories = hits.map((h) => ({
      title: h.memory.title,
      summary: h.memory.summary,
      grandmas_words: h.memory.original_transcript.slice(0, 300),
      when: h.memory.memory_date_text,
      confidence: h.memory.confidence,
    }));
  } catch {
    // retrieval is best-effort; conversation continues without it
  }

  const history = recentHistory(conversationId);
  const reply = await provider.converse(history, context);
  saveMessage(conversationId, 'storyhouse', reply);

  return {
    reply,
    usedMemories: used,
    openModelOnline: status.openModelOnline,
    provider: status.active,
  };
}

// ---------- streaming variant of respond ----------
export type StreamEvent =
  | { type: 'meta'; usedMemories: { id: string; title: string; score: number }[]; openModelOnline: boolean }
  | { type: 'token'; text: string }
  | { type: 'done' }
  | { type: 'error' };

export async function* respondStream(
  conversationId: string,
  grandmaText: string,
): AsyncGenerator<StreamEvent> {
  saveMessage(conversationId, 'grandma', grandmaText);
  const { provider, status } = await getProvider();

  let used: { id: string; title: string; score: number }[] = [];
  const context: RetrievedContext = { memories: [] };
  try {
    const qEmb = await provider.embed(grandmaText);
    const hits = semanticSearch(qEmb, 3).filter((h) => h.score > 0.62);
    used = hits.map((h) => ({ id: h.memory.id, title: h.memory.title, score: h.score }));
    context.memories = hits.map((h) => ({
      title: h.memory.title,
      summary: h.memory.summary,
      grandmas_words: h.memory.original_transcript.slice(0, 300),
      when: h.memory.memory_date_text,
      confidence: h.memory.confidence,
    }));
  } catch {
    /* retrieval best-effort */
  }

  yield { type: 'meta', usedMemories: used, openModelOnline: status.openModelOnline };

  const history = recentHistory(conversationId);
  let full = '';
  try {
    if (provider.converseStream) {
      for await (const tok of provider.converseStream(history, context)) {
        full += tok;
        yield { type: 'token', text: tok };
      }
    } else {
      full = await provider.converse(history, context);
      yield { type: 'token', text: full };
    }
    saveMessage(conversationId, 'storyhouse', full.trim());
    yield { type: 'done' };
  } catch {
    yield { type: 'error' };
  }
}

// ---------- consolidation: turn words into a structured memory ----------
const ENTITY_FIELDS: { field: keyof ExtractedLike; kind: EntityKind }[] = [
  { field: 'people', kind: 'person' },
  { field: 'places', kind: 'place' },
  { field: 'events', kind: 'event' },
  { field: 'objects', kind: 'object' },
  { field: 'recipes', kind: 'recipe' },
];
type ExtractedLike = Awaited<ReturnType<Awaited<ReturnType<typeof getProvider>>['provider']['extractMemory']>>;

export async function consolidate(
  text: string,
  opts: { conversationId?: string | null; speaker?: string; force?: boolean } = {},
): Promise<Memory | null> {
  const { provider, status } = await getProvider();
  const ex = await provider.extractMemory(text);

  if (!ex.is_memory_worth_keeping && !opts.force) return null;

  const entities: { kind: EntityKind; name: string }[] = [];
  for (const { field, kind } of ENTITY_FIELDS) {
    for (const name of (ex as any)[field] as string[]) {
      if (name?.trim()) entities.push({ kind, name });
    }
  }

  // confidence of the source words = DIRECT (she said them); summary is DERIVED.
  const input: CreateMemoryInput = {
    title: ex.title?.trim() || text.slice(0, 48).replace(/\s+\S*$/, '') + '…',
    summary: ex.summary?.trim() || '',
    original_transcript: text,
    source_type: 'GRANDMA_DIRECT',
    confidence: 'DIRECT',
    speaker: opts.speaker ?? 'Grandma',
    memory_date_text: ex.memory_date_text,
    memory_date_start: ex.memory_date_start,
    date_precision: ex.date_precision,
    emotions: ex.emotions,
    themes: ex.themes,
    tags: [],
    status: ex.is_unfinished ? 'unfinished' : 'saved',
    visibility: 'FAMILY',
    provenance: status.openModelOnline
      ? `Spoken by ${opts.speaker ?? 'Grandma'}; structured by open model (${status.model}).`
      : `Spoken by ${opts.speaker ?? 'Grandma'}; captured while AI core offline.`,
    consent_state: 'granted',
    conversation_id: opts.conversationId ?? null,
    entities,
  };

  try {
    input.embedding = await provider.embed(`${input.title}. ${input.summary} ${text}`);
  } catch {
    input.embedding = null;
  }

  const mem = createMemory(input);

  // Record a legacy-message theme if detected.
  if (ex.is_legacy_message) audit('memory.legacy_detected', 'memory', mem.id);

  return getMemory(mem.id);
}
