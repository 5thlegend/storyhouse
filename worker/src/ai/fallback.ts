import type { ChatTurn, ExtractedMemory, NoveltyAssessment } from '../types.js';
import type { AIProvider, RetrievedContext } from './types.js';

/**
 * Try the primary model; if it fails (outage, rate limit, refusal), answer with
 * the backup instead of showing an error. Made fresh per request, so `lastModel`
 * says which model actually did the work for provenance.
 */
export class FallbackProvider implements AIProvider {
  lastModel: string;

  constructor(
    private primary: AIProvider,
    private backup: AIProvider,
  ) {
    this.lastModel = primary.name;
  }

  get name() {
    return `${this.primary.name} (fallback: ${this.backup.name})`;
  }

  async isAvailable(): Promise<boolean> {
    return (await this.primary.isAvailable()) || this.backup.isAvailable();
  }

  private async withFallback<T>(label: string, run: (p: AIProvider) => Promise<T>): Promise<T> {
    try {
      const out = await run(this.primary);
      this.lastModel = this.primary.name;
      return out;
    } catch (err) {
      console.warn(`[ai] ${this.primary.name} failed on ${label}; using ${this.backup.name}:`, (err as any)?.message);
      this.lastModel = this.backup.name;
      return run(this.backup);
    }
  }

  converse(history: ChatTurn[], context: RetrievedContext, noveltyHint?: string | null): Promise<string> {
    return this.withFallback('converse', (p) => p.converse(history, context, noveltyHint));
  }

  async *converseStream(
    history: ChatTurn[],
    context: RetrievedContext,
    noveltyHint?: string | null,
  ): AsyncGenerator<string> {
    let sent = false;
    try {
      const source = this.primary.converseStream
        ? this.primary.converseStream(history, context, noveltyHint)
        : (async function* (p: AIProvider) {
            yield await p.converse(history, context, noveltyHint);
          })(this.primary);
      for await (const piece of source) {
        sent = true;
        yield piece;
      }
      this.lastModel = this.primary.name;
      return;
    } catch (err) {
      // Once words have reached her, switching voices mid-sentence would be
      // worse than stopping; the pipeline's error event handles that case.
      if (sent) throw err;
      console.warn(`[ai] ${this.primary.name} stream failed; using ${this.backup.name}:`, (err as any)?.message);
    }
    this.lastModel = this.backup.name;
    if (this.backup.converseStream) {
      yield* this.backup.converseStream(history, context, noveltyHint);
    } else {
      yield await this.backup.converse(history, context, noveltyHint);
    }
  }

  extractMemory(transcript: string): Promise<ExtractedMemory> {
    return this.withFallback('extractMemory', (p) => p.extractMemory(transcript));
  }

  assessNovelty(input: {
    currentTopic: string;
    priorQuestions: string[];
    knownFacts: string[];
    unexploredAreas: string[];
  }): Promise<NoveltyAssessment> {
    return this.withFallback('assessNovelty', (p) => p.assessNovelty(input));
  }

  /** Embeddings never switch models: mixing vector spaces would break search. */
  embed(text: string): Promise<number[]> {
    return this.backup.embed(text);
  }
}
