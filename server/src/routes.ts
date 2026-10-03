import { Router } from 'express';
import { z } from 'zod';
import { config } from './config.js';
import { getDb, nowIso, cryptoId, audit } from './db/index.js';
import { getProvider } from './ai/index.js';
import {
  startConversation,
  endConversation,
  respond,
  respondStream,
  consolidate,
} from './memory/pipeline.js';
import {
  listMemories,
  getMemory,
  createMemory,
  deleteMemory,
  setVisibility,
  semanticSearch,
  vaultStats,
} from './memory/store.js';
import { generateMemoryArt } from './art.js';
import type { Visibility } from './types.js';

export const api = Router();

// In demo mode, only FAMILY/PUBLIC memories are exposed (no PRIVATE leakage).
function visibilityFilter(): Visibility[] | undefined {
  return config.demoMode ? ['FAMILY', 'PUBLIC'] : undefined;
}

function wrap(handler: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any) => {
    handler(req, res).catch((err) => {
      console.error('[api error]', err?.message ?? err);
      res
        .status(500)
        .json({ error: 'Something went wrong on our end. Your stored memories are safe.' });
    });
  };
}

// ---------- health / status ----------
api.get(
  '/health',
  wrap(async (_req, res) => {
    const { status } = await getProvider();
    res.json({ ok: true, demoMode: config.demoMode, ai: status });
  }),
);

// Warm the models into VRAM (called by the client on load so the first real
// turn isn't a cold start). Returns immediately; warming continues server-side.
api.post(
  '/warmup',
  wrap(async (_req, res) => {
    const { provider, status } = await getProvider();
    if (status.openModelOnline && 'warmup' in provider) {
      void (provider as any).warmup().catch(() => {});
    }
    res.json({ warming: status.openModelOnline });
  }),
);

// ---------- conversations ----------
api.post(
  '/conversations',
  wrap(async (_req, res) => {
    const id = startConversation();
    res.json({ id });
  }),
);

const messageSchema = z.object({ text: z.string().min(1).max(8000) });
api.post(
  '/conversations/:id/messages',
  wrap(async (req, res) => {
    const { text } = messageSchema.parse(req.body);
    const result = await respond(req.params.id, text);
    res.json(result);
  }),
);

// Streaming reply (Server-Sent Events) — tokens appear as Gemma generates them.
api.post('/conversations/:id/messages/stream', (req, res) => {
  let text: string;
  try {
    text = messageSchema.parse(req.body).text;
  } catch {
    res.status(400).json({ error: 'Invalid message.' });
    return;
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  (res as any).flushHeaders?.();

  (async () => {
    try {
      for await (const ev of respondStream(req.params.id, text)) {
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      }
    } catch (err) {
      console.error('[stream error]', (err as any)?.message ?? err);
      res.write(`data: ${JSON.stringify({ type: 'error' })}\n\n`);
    } finally {
      res.end();
    }
  })();
});

api.post(
  '/conversations/:id/end',
  wrap(async (req, res) => {
    endConversation(req.params.id);
    res.json({ ok: true });
  }),
);

// Explicit consent-driven save of a passage into the Memory Vault.
const consolidateSchema = z.object({
  text: z.string().min(1).max(8000),
  force: z.boolean().optional(),
});
api.post(
  '/conversations/:id/consolidate',
  wrap(async (req, res) => {
    const { text, force } = consolidateSchema.parse(req.body);
    const mem = await consolidate(text, { conversationId: req.params.id, force });
    if (!mem) {
      res.json({ saved: false, reason: 'No distinct memory detected in that passage.' });
      return;
    }
    res.json({ saved: true, memory: mem });
  }),
);

// ---------- memories ----------
api.get(
  '/memories',
  wrap(async (_req, res) => {
    const memories = listMemories({
      visibility: visibilityFilter(),
      status: ['saved', 'unfinished'],
    });
    res.json({ memories });
  }),
);

api.get(
  '/memories/:id',
  wrap(async (req, res) => {
    const mem = getMemory(req.params.id);
    if (!mem) {
      res.status(404).json({ error: 'Memory not found.' });
      return;
    }
    res.json({ memory: mem });
  }),
);

const createSchema = z.object({
  title: z.string().min(1),
  original_transcript: z.string().min(1),
  summary: z.string().optional(),
  memory_date_text: z.string().nullable().optional(),
  speaker: z.string().optional(),
});
api.post(
  '/memories',
  wrap(async (req, res) => {
    const input = createSchema.parse(req.body);
    const { provider } = await getProvider();
    let embedding: number[] | null = null;
    try {
      embedding = await provider.embed(`${input.title}. ${input.original_transcript}`);
    } catch {
      /* best effort */
    }
    const mem = createMemory({
      title: input.title,
      summary: input.summary ?? '',
      original_transcript: input.original_transcript,
      source_type: 'USER_ENTERED',
      confidence: 'FAMILY_REPORTED',
      speaker: input.speaker ?? 'Family',
      memory_date_text: input.memory_date_text ?? null,
      provenance: 'Entered by family.',
      embedding,
    });
    res.json({ memory: mem });
  }),
);

const patchSchema = z.object({
  visibility: z.enum(['PRIVATE', 'FAMILY', 'SPECIFIC_PERSON', 'PUBLIC']),
});
api.patch(
  '/memories/:id',
  wrap(async (req, res) => {
    const { visibility } = patchSchema.parse(req.body);
    setVisibility(req.params.id, visibility);
    res.json({ ok: true });
  }),
);

api.delete(
  '/memories/:id',
  wrap(async (req, res) => {
    deleteMemory(req.params.id);
    res.json({ ok: true });
  }),
);

// Memory art — always explicitly labeled as an interpretation, never a photo.
api.post(
  '/memories/:id/art',
  wrap(async (req, res) => {
    const mem = getMemory(req.params.id);
    if (!mem) {
      res.status(404).json({ error: 'Memory not found.' });
      return;
    }
    const scene = (req.body?.scene as string) || mem.summary || mem.title;
    const art = await generateMemoryArt({ title: mem.title, scene });
    const id = cryptoId('art');
    getDb()
      .prepare(
        `INSERT INTO artifacts (id, memory_id, kind, label, is_ai_generated, url, prompt, provider, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(id, mem.id, 'image', art.label, 1, art.url, art.prompt, art.provider, nowIso());
    audit('artifact.create', 'memory', mem.id, 'memory-art');
    res.json({ artifact: { id, memory_id: mem.id, kind: 'image', ...art } });
  }),
);

// ---------- timeline ----------
api.get(
  '/timeline',
  wrap(async (_req, res) => {
    const memories = listMemories({ visibility: visibilityFilter(), status: ['saved', 'unfinished'] });
    const buckets: Record<string, { id: string; title: string; when: string | null }[]> = {};
    for (const m of memories) {
      let decade = 'Undated';
      const y = m.memory_date_start?.match(/\d{4}/)?.[0];
      if (y) decade = `${y.slice(0, 3)}0s`;
      (buckets[decade] ??= []).push({ id: m.id, title: m.title, when: m.memory_date_text });
    }
    const order = Object.keys(buckets).sort((a, b) => {
      if (a === 'Undated') return 1;
      if (b === 'Undated') return -1;
      return a.localeCompare(b);
    });
    res.json({ decades: order.map((d) => ({ decade: d, memories: buckets[d] })) });
  }),
);

// ---------- search ----------
api.get(
  '/search',
  wrap(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) {
      res.json({ results: [] });
      return;
    }
    const { provider } = await getProvider();
    let results: { id: string; title: string; summary: string; score: number }[] = [];
    try {
      const emb = await provider.embed(q);
      results = semanticSearch(emb, 8)
        .filter((h) => !config.demoMode || ['FAMILY', 'PUBLIC'].includes(h.memory.visibility))
        .map((h) => ({
          id: h.memory.id,
          title: h.memory.title,
          summary: h.memory.summary,
          score: Math.round(h.score * 100) / 100,
        }));
    } catch {
      /* fall through to empty */
    }
    res.json({ results, query: q });
  }),
);

// ---------- vault stats + export ----------
api.get(
  '/vault',
  wrap(async (_req, res) => {
    res.json({ stats: vaultStats(), demoMode: config.demoMode });
  }),
);

api.post(
  '/export',
  wrap(async (_req, res) => {
    const memories = listMemories({ visibility: visibilityFilter() }).map((m) => getMemory(m.id)!);
    const archive = {
      storyhouse_archive_version: 1,
      exported_at: nowIso(),
      note: 'This archive is user-owned. Memories belong to the family, not to any AI provider.',
      demo_mode: config.demoMode,
      memories,
    };
    audit('archive.export', undefined, undefined, `${memories.length} memories`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="storyhouse-archive.json"');
    res.send(JSON.stringify(archive, null, 2));
  }),
);

// Markdown export (human-readable storybook preview).
api.get(
  '/export/markdown',
  wrap(async (_req, res) => {
    const memories = listMemories({ visibility: visibilityFilter() });
    let md = `# Storyhouse Archive\n\n_Exported ${nowIso()}_\n\n`;
    for (const m of memories) {
      md += `## ${m.title}\n\n`;
      if (m.memory_date_text) md += `*${m.memory_date_text}*\n\n`;
      md += `> ${m.original_transcript}\n\n`;
      if (m.summary) md += `${m.summary}\n\n`;
      md += `— provenance: ${m.provenance} (${m.confidence})\n\n---\n\n`;
    }
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', 'attachment; filename="storyhouse-archive.md"');
    res.send(md);
  }),
);
