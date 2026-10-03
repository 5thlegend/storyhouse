import { getDb, nowIso, cryptoId, audit } from '../db/index.js';
import { getProvider } from '../ai/index.js';
import { createMemory, addRecollection } from '../memory/store.js';
import { generateMemoryArt } from '../art.js';
import { MARGARET } from './margaret.js';

function memoryCount(): number {
  return (getDb().prepare(`SELECT COUNT(*) c FROM memories`).get() as any).c as number;
}

/** Seed the fictional Margaret archive if the vault is empty. Safe to call on boot. */
export async function ensureSeed(): Promise<void> {
  if (memoryCount() > 0) return;
  console.log('  🌱 Seeding fictional "Margaret" demo archive…');
  await seedMargaret();
  console.log('  ✅ Seed complete.');
}

export async function seedMargaret(): Promise<void> {
  const { provider, status } = await getProvider();
  if (!status.openModelOnline) {
    console.warn(
      '  ⚠️  Open model is OFFLINE during seed — memory embeddings will be low-quality\n' +
        '      fallback vectors and semantic search will not work well. Start Ollama and\n' +
        '      re-run `npm run seed` once it is up for real embeddings.',
    );
  }

  for (const s of MARGARET) {
    let embedding: number[] | null = null;
    try {
      embedding = await provider.embed(`${s.title}. ${s.summary} ${s.transcript}`);
    } catch {
      embedding = null;
    }

    const mem = createMemory({
      title: s.title,
      summary: s.summary,
      original_transcript: s.transcript,
      source_type: 'GRANDMA_DIRECT',
      confidence: 'DIRECT',
      speaker: 'Margaret',
      memory_date_text: s.date_text,
      memory_date_start: s.date_start,
      date_precision: s.date_precision,
      emotions: s.emotions,
      themes: s.themes,
      status: s.status ?? 'saved',
      visibility: 'FAMILY',
      provenance: 'Fictional demo memory, spoken by "Margaret".',
      embedding,
      entities: s.entities,
    });

    // Immutable extra recollections (e.g. the conflicting Maple Street date).
    for (const r of s.extraRecollections ?? []) {
      addRecollection(mem.id, r.field, r.text, r.confidence);
    }

    // Visual memory → memory art artifact (clearly labeled interpretation).
    if (s.makeArt && s.visual_scene) {
      const art = await generateMemoryArt({ title: s.title, scene: s.visual_scene });
      getDb()
        .prepare(
          `INSERT INTO artifacts (id, memory_id, kind, label, is_ai_generated, url, prompt, provider, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run(cryptoId('art'), mem.id, 'image', art.label, 1, art.url, art.prompt, art.provider, nowIso());
    }
  }

  // A sample family question (architecture demo).
  getDb()
    .prepare(
      `INSERT INTO questions (id, asked_by, question, about_person, status, created_at)
       VALUES (?,?,?,?,?,?)`,
    )
    .run(
      cryptoId('q'),
      'Granddaughter',
      'What was your mother like when you were five?',
      'Mother',
      'open',
      nowIso(),
    );

  audit('seed.margaret', undefined, undefined, `${MARGARET.length} memories`);
}

// CLI: `npm run seed` — reseed from scratch.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('run.ts')) {
  const db = getDb();
  console.log('Resetting and reseeding demo archive…');
  db.exec(`DELETE FROM artifacts; DELETE FROM memory_links; DELETE FROM memory_entities;
           DELETE FROM memory_recollections; DELETE FROM memories; DELETE FROM entities;
           DELETE FROM questions; DELETE FROM asked_questions;`);
  seedMargaret()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
