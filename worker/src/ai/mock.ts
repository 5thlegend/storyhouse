import type { ChatTurn, ExtractedMemory, NoveltyAssessment } from '../types.js';
import type { AIProvider, RetrievedContext } from './types.js';

// A HONEST fallback — not fake intelligence pretending to be the model.
// When the open model is unavailable, the app still opens, the Memory Library
// still works, and conversation degrades to simple, truthful acknowledgements.
// The UI clearly shows that the AI core is offline in this mode.
export class MockProvider implements AIProvider {
  readonly name = 'mock (AI offline — graceful fallback)';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async converse(history: ChatTurn[], context: RetrievedContext): Promise<string> {
    const last = [...history].reverse().find((t) => t.role === 'grandma')?.text ?? '';
    const ref = context.memories[0];
    if (ref) {
      return `I'm listening, and I'm keeping that with everything else you've shared — like when you told me about ${ref.title.toLowerCase()}. (The conversation model is offline right now, so I can only listen simply and save what you say. Your stories are safe.)`;
    }
    if (last.trim().length > 0) {
      return `I hear you, and I'm keeping that safe. (The conversation model is offline right now, so I can only listen simply and save what you say.)`;
    }
    return `I'm here with you. (The conversation model is offline right now — I'll still keep whatever you'd like to share.)`;
  }

  async *converseStream(
    history: ChatTurn[],
    context: RetrievedContext,
  ): AsyncGenerator<string> {
    const full = await this.converse(history, context);
    // Emit in small chunks so the UI still animates.
    for (const word of full.split(/(\s+)/)) yield word;
  }

  async extractMemory(transcript: string): Promise<ExtractedMemory> {
    const words = transcript.trim().split(/\s+/);
    const worthKeeping = words.length >= 8; // conservative heuristic only
    // Pull likely proper nouns (capitalized, not sentence-start) as weak candidates.
    const people = Array.from(
      new Set(
        (transcript.match(/(?<=\s)[A-Z][a-z]+/g) ?? []).filter(
          (w) => !['I', 'The', 'And', 'But', 'She', 'He', 'They', 'We'].includes(w),
        ),
      ),
    ).slice(0, 4);
    return {
      is_memory_worth_keeping: worthKeeping,
      title: worthKeeping ? transcript.slice(0, 48).replace(/\s+\S*$/, '') + '…' : null,
      summary: worthKeeping
        ? 'Captured while the AI core was offline — summary pending reprocessing.'
        : null,
      people,
      places: [],
      events: [],
      objects: [],
      recipes: [],
      memory_date_text: null,
      memory_date_start: null,
      date_precision: 'unknown',
      emotions: [],
      themes: [],
      is_unfinished: /\.\.\.$|…$/.test(transcript.trim()),
      is_legacy_message: /\b(want|hope)\b.*\b(grandchild|family|know)\b/i.test(transcript),
      visual_scene: null,
    };
  }

  async assessNovelty(): Promise<NoveltyAssessment> {
    return {
      already_covered: false,
      unexplored_angle: null,
      recommended_followup: null,
      reason: 'novelty engine idle (AI offline)',
    };
  }

  async embed(text: string): Promise<number[]> {
    // Deterministic lightweight bag-of-chars vector so semantic search degrades
    // instead of crashing. Clearly NOT a real embedding.
    const dim = 64;
    const v = new Array(dim).fill(0);
    for (let i = 0; i < text.length; i++) {
      v[text.charCodeAt(i) % dim] += 1;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }
}
