import { all, first, run, nowIso, cryptoId, audit } from '../db.js';
import { getProvider } from '../ai/index.js';
import type { AIProvider, RetrievedContext } from '../ai/index.js';
import type { ChatTurn, EntityKind, ExtractedMemory, Memory } from '../types.js';
import { createMemory, semanticSearch, getMemory, type CreateMemoryInput } from './store.js';

// ---------- conversation storage ----------
export async function startConversation(speaker = 'Grandma'): Promise<string> {
  const id = cryptoId('conv');
  await run(`INSERT INTO conversations (id, speaker, started_at) VALUES (?,?,?)`, id, speaker, nowIso());
  return id;
}

export async function endConversation(id: string): Promise<void> {
  await run(`UPDATE conversations SET ended_at = ? WHERE id = ?`, nowIso(), id);
}

async function saveMessage(conversationId: string, role: ChatTurn['role'], text: string): Promise<void> {
  await run(
    `INSERT INTO conversation_messages (id, conversation_id, role, text, created_at) VALUES (?,?,?,?,?)`,
    cryptoId('msg'),
    conversationId,
    role,
    text,
    nowIso(),
  );
}

async function recentHistory(conversationId: string, limit = 8): Promise<ChatTurn[]> {
  const rows = await all(
    `SELECT role, text FROM conversation_messages
     WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?`,
    conversationId,
    limit,
  );
  return rows.reverse().map((r) => ({ role: r.role, text: r.text }));
}

type Used = { id: string; title: string; score: number }[];

// Retrieve relevant memories semantically (controlled context — never dump all).
async function retrieve(provider: AIProvider, text: string): Promise<{ used: Used; context: RetrievedContext }> {
  const context: RetrievedContext = { memories: [] };
  let used: Used = [];
  try {
    const qEmb = await provider.embed(text);
    const hits = (await semanticSearch(qEmb, 3)).filter((h) => h.score > RELEVANCE_THRESHOLD);
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
  return { used, context };
}

// Tuned on nomic-embed-text; EmbeddingGemma scores sit in a similar band.
const RELEVANCE_THRESHOLD = 0.62;

// ---------- the core loop: respond ----------
export interface RespondResult {
  reply: string;
  usedMemories: Used;
  openModelOnline: boolean;
  provider: string;
}

export async function respond(conversationId: string, grandmaText: string): Promise<RespondResult> {
  await saveMessage(conversationId, 'grandma', grandmaText);
  const { provider, status } = await getProvider();
  const { used, context } = await retrieve(provider, grandmaText);
  const history = await recentHistory(conversationId);
  const reply = await provider.converse(history, context);
  await saveMessage(conversationId, 'storyhouse', reply);
  return { reply, usedMemories: used, openModelOnline: status.openModelOnline, provider: status.active };
}

// ---------- streaming variant of respond ----------
export type StreamEvent =
  | { type: 'meta'; usedMemories: Used; openModelOnline: boolean }
  | { type: 'token'; text: string }
  | { type: 'done' }
  | { type: 'error' };

export async function* respondStream(
  conversationId: string,
  grandmaText: string,
  opts: { house?: string; historyLimit?: number } = {},
): AsyncGenerator<StreamEvent> {
  await saveMessage(conversationId, 'grandma', grandmaText);
  const { provider, status } = await getProvider();
  const { used, context } = await retrieve(provider, grandmaText);
  context.house = opts.house;

  yield { type: 'meta', usedMemories: used, openModelOnline: status.openModelOnline };

  const history = await recentHistory(conversationId, opts.historyLimit);
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
    await saveMessage(conversationId, 'storyhouse', full.trim());
    yield { type: 'done' };
  } catch {
    yield { type: 'error' };
  }
}

/**
 * She started talking before the reply finished. Keep only what she actually
 * heard, so the companion never thinks it said something she missed.
 */
export async function trimLastReply(conversationId: string, heard: string): Promise<void> {
  const last = await first<{ id: string; role: string }>(
    `SELECT id, role FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1`,
    conversationId,
  );
  if (last?.role !== 'storyhouse') return;
  const text = heard.trim();
  await run(
    `UPDATE conversation_messages SET text = ? WHERE id = ?`,
    text ? `${text} [she started talking here, so the rest went unsaid]` : '[she started talking right away]',
    last.id,
  );
}

/** Everything she said in one conversation, in order (what "keep this story" saves). */
export async function herWords(conversationId: string): Promise<string> {
  const rows = await all<{ text: string }>(
    `SELECT text FROM conversation_messages WHERE conversation_id = ? AND role = 'grandma' ORDER BY created_at`,
    conversationId,
  );
  return rows.map((r) => r.text.trim()).filter(Boolean).join(' ');
}

// ---------- consolidation: turn words into a structured memory ----------
const ENTITY_FIELDS: { field: keyof ExtractedMemory; kind: EntityKind }[] = [
  { field: 'people', kind: 'person' },
  { field: 'places', kind: 'place' },
  { field: 'events', kind: 'event' },
  { field: 'objects', kind: 'object' },
  { field: 'recipes', kind: 'recipe' },
];

export async function consolidate(
  text: string,
  opts: { conversationId?: string | null; speaker?: string; force?: boolean } = {},
): Promise<Memory | null> {
  const { provider, status } = await getProvider();
  const ex = await provider.extractMemory(text);

  if (!ex.is_memory_worth_keeping && !opts.force) return null;

  const entities: { kind: EntityKind; name: string }[] = [];
  for (const { field, kind } of ENTITY_FIELDS) {
    for (const name of ex[field] as string[]) {
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
    // Name the model that actually structured it (Claude, or Gemma if it fell back).
    provenance: status.openModelOnline
      ? `Spoken by ${opts.speaker ?? 'Grandma'}; structured by AI (${'lastModel' in provider ? provider.lastModel : status.model}).`
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

  const mem = await createMemory(input);
  if (ex.is_legacy_message) await audit('memory.legacy_detected', 'memory', mem.id);
  return getMemory(mem.id);
}
