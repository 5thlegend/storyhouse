// The original Storyhouse rooms (Living Room, Library, Gallery, Timeline,
// Vault), ported from the Express server. The Family Studio has full access;
// the read-only Family View may only GET; her iPad doesn't use these yet.

import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { config } from '../config.js';
import { run, nowIso, cryptoId, audit } from '../db.js';
import { getProvider } from '../ai/index.js';
import { startConversation, endConversation, respond, respondStream, consolidate } from '../memory/pipeline.js';
import {
  listMemories,
  getMemory,
  createMemory,
  deleteMemory,
  setVisibility,
  semanticSearch,
  vaultStats,
} from '../memory/store.js';
import { generateMemoryArt } from '../art.js';
import { buildStorybookPdf } from '../pdf.js';
import type { HonoEnv, Role } from '../auth.js';
import type { Visibility } from '../types.js';

export const memories = new Hono<HonoEnv>();

const roomsGate: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const role = c.get('role');
  if (role === 'studio') return next();
  if (role === 'family' && c.req.method === 'GET') return next();
  if (role === 'none') return c.json({ error: 'Please unlock Storyhouse first.' }, 401);
  return c.json({ error: 'Family View is read-only. The Living Room and editing stay private.' }, 403);
};
memories.use('*', roomsGate);

// Family (and any demo) only ever see FAMILY/PUBLIC memories — never PRIVATE.
function visibilityFilter(role: Role): Visibility[] | undefined {
  return config().demoMode || role === 'family' ? ['FAMILY', 'PUBLIC'] : undefined;
}

// ---------- conversations ----------
memories.post('/conversations', async (c) => c.json({ id: await startConversation() }));

const messageSchema = z.object({ text: z.string().min(1).max(8000) });
memories.post('/conversations/:id/messages', async (c) => {
  const { text } = messageSchema.parse(await c.req.json());
  return c.json(await respond(c.req.param('id'), text));
});

// Streaming reply (Server-Sent Events) — tokens appear as Gemma generates them.
memories.post('/conversations/:id/messages/stream', async (c) => {
  let text: string;
  try {
    text = messageSchema.parse(await c.req.json()).text;
  } catch {
    return c.json({ error: 'Invalid message.' }, 400);
  }
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const id = c.req.param('id');
  c.executionCtx.waitUntil(
    (async () => {
      try {
        for await (const ev of respondStream(id, text)) {
          await writer.write(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
        }
      } catch (err) {
        console.error('[stream error]', (err as any)?.message ?? err);
        await writer.write(enc.encode(`data: ${JSON.stringify({ type: 'error' })}\n\n`));
      } finally {
        await writer.close();
      }
    })(),
  );
  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
  });
});

memories.post('/conversations/:id/end', async (c) => {
  await endConversation(c.req.param('id'));
  return c.json({ ok: true });
});

// Explicit consent-driven save of a passage into the Memory Vault.
const consolidateSchema = z.object({ text: z.string().min(1).max(8000), force: z.boolean().optional() });
memories.post('/conversations/:id/consolidate', async (c) => {
  const { text, force } = consolidateSchema.parse(await c.req.json());
  const mem = await consolidate(text, { conversationId: c.req.param('id'), force });
  if (!mem) return c.json({ saved: false, reason: 'No distinct memory detected in that passage.' });
  return c.json({ saved: true, memory: mem });
});

// ---------- memories ----------
memories.get('/memories', async (c) =>
  c.json({
    memories: await listMemories({ visibility: visibilityFilter(c.get('role')), status: ['saved', 'unfinished'] }),
  }),
);

memories.get('/memories/:id', async (c) => {
  const mem = await getMemory(c.req.param('id'));
  const vis = visibilityFilter(c.get('role'));
  if (!mem || (vis && !vis.includes(mem.visibility))) return c.json({ error: 'Memory not found.' }, 404);
  return c.json({ memory: mem });
});

const createSchema = z.object({
  title: z.string().min(1),
  original_transcript: z.string().min(1),
  summary: z.string().optional(),
  memory_date_text: z.string().nullable().optional(),
  speaker: z.string().optional(),
});
memories.post('/memories', async (c) => {
  const input = createSchema.parse(await c.req.json());
  const { provider } = await getProvider();
  let embedding: number[] | null = null;
  try {
    embedding = await provider.embed(`${input.title}. ${input.original_transcript}`);
  } catch {
    /* best effort */
  }
  const mem = await createMemory({
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
  return c.json({ memory: mem });
});

const patchSchema = z.object({ visibility: z.enum(['PRIVATE', 'FAMILY', 'SPECIFIC_PERSON', 'PUBLIC']) });
memories.patch('/memories/:id', async (c) => {
  const { visibility } = patchSchema.parse(await c.req.json());
  await setVisibility(c.req.param('id'), visibility);
  return c.json({ ok: true });
});

memories.delete('/memories/:id', async (c) => {
  await deleteMemory(c.req.param('id'));
  return c.json({ ok: true });
});

// Memory art — always explicitly labeled as an interpretation, never a photo.
memories.post('/memories/:id/art', async (c) => {
  const mem = await getMemory(c.req.param('id'));
  if (!mem) return c.json({ error: 'Memory not found.' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { scene?: string };
  const scene = body.scene || mem.summary || mem.title;
  const art = await generateMemoryArt({ title: mem.title, scene });
  const id = cryptoId('art');
  await run(
    `INSERT INTO artifacts (id, memory_id, kind, label, is_ai_generated, url, prompt, provider, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    id,
    mem.id,
    'image',
    art.label,
    1,
    art.url,
    art.prompt,
    art.provider,
    nowIso(),
  );
  await audit('artifact.create', 'memory', mem.id, 'memory-art');
  return c.json({ artifact: { id, memory_id: mem.id, kind: 'image', ...art } });
});

// ---------- timeline ----------
memories.get('/timeline', async (c) => {
  const list = await listMemories({ visibility: visibilityFilter(c.get('role')), status: ['saved', 'unfinished'] });
  const buckets: Record<string, { id: string; title: string; when: string | null }[]> = {};
  for (const m of list) {
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
  return c.json({ decades: order.map((d) => ({ decade: d, memories: buckets[d] })) });
});

// ---------- search ----------
memories.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.json({ results: [] });
  const { provider } = await getProvider();
  let results: { id: string; title: string; summary: string; score: number }[] = [];
  try {
    const emb = await provider.embed(q);
    const vis = visibilityFilter(c.get('role'));
    results = (await semanticSearch(emb, 8))
      .filter((h) => !vis || vis.includes(h.memory.visibility))
      .map((h) => ({
        id: h.memory.id,
        title: h.memory.title,
        summary: h.memory.summary,
        score: Math.round(h.score * 100) / 100,
      }));
  } catch {
    /* fall through to empty */
  }
  return c.json({ results, query: q });
});

// ---------- vault stats + export ----------
memories.get('/vault', async (c) => c.json({ stats: await vaultStats(), demoMode: config().demoMode }));

async function fullMemories(role: Role) {
  const list = await listMemories({ visibility: visibilityFilter(role) });
  return (await Promise.all(list.map((m) => getMemory(m.id)))).filter(Boolean) as NonNullable<
    Awaited<ReturnType<typeof getMemory>>
  >[];
}

// GET too: the Vault's download link is a plain <a href>.
memories.on(['GET', 'POST'], '/export', async (c) => {
  const mems = await fullMemories(c.get('role'));
  const archive = {
    storyhouse_archive_version: 1,
    exported_at: nowIso(),
    note: 'This archive is user-owned. Memories belong to the family, not to any AI provider.',
    demo_mode: config().demoMode,
    memories: mems,
  };
  await audit('archive.export', undefined, undefined, `${mems.length} memories`);
  return new Response(JSON.stringify(archive, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="storyhouse-archive.json"',
    },
  });
});

// PDF storybook export — her words + embedded memory art, family-owned.
memories.get('/export/pdf', async (c) => {
  const mems = await fullMemories(c.get('role'));
  const speaker = mems.find((m) => m.speaker)?.speaker || 'Our Family';
  await audit('archive.export_pdf', undefined, undefined, `${mems.length} memories`);
  const bytes = await buildStorybookPdf({
    title: `The Stories of ${speaker}`,
    subtitle: 'A home for the stories that make us who we are.',
    memories: mems,
  });
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="storyhouse-storybook.pdf"',
    },
  });
});

// Markdown export (human-readable storybook preview).
memories.get('/export/markdown', async (c) => {
  const list = await listMemories({ visibility: visibilityFilter(c.get('role')) });
  let md = `# Storyhouse Archive\n\n_Exported ${nowIso()}_\n\n`;
  for (const m of list) {
    md += `## ${m.title}\n\n`;
    if (m.memory_date_text) md += `*${m.memory_date_text}*\n\n`;
    md += `> ${m.original_transcript}\n\n`;
    if (m.summary) md += `${m.summary}\n\n`;
    md += `— provenance: ${m.provenance} (${m.confidence})\n\n---\n\n`;
  }
  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown',
      'Content-Disposition': 'attachment; filename="storyhouse-archive.md"',
    },
  });
});
