import type { ChatTurn, ExtractedMemory, NoveltyAssessment } from '../types.js';

export interface RetrievedContext {
  // Memories surfaced for grounding. The model must treat these as the ONLY
  // factual personal context, and say "Grandma told me..." not "it is true...".
  memories: {
    title: string;
    summary: string;
    grandmas_words: string;
    when: string | null;
    confidence: string;
  }[];
}

export interface AIProvider {
  readonly name: string;

  /** Is the underlying model reachable right now? */
  isAvailable(): Promise<boolean>;

  /**
   * Produce Storyhouse's spoken reply as the warm companion, grounded ONLY in
   * the retrieved memories. Honors the companion system prompt.
   */
  converse(
    history: ChatTurn[],
    context: RetrievedContext,
    noveltyHint?: string | null,
  ): Promise<string>;

  /** Optional streaming variant — yields reply text chunks as they are generated. */
  converseStream?(
    history: ChatTurn[],
    context: RetrievedContext,
    noveltyHint?: string | null,
  ): AsyncGenerator<string>;

  /** Turn a passage of Grandma's words into a structured, provenance-safe memory. */
  extractMemory(transcript: string): Promise<ExtractedMemory>;

  /** Decide whether a topic is already covered and suggest a fresh angle. */
  assessNovelty(input: {
    currentTopic: string;
    priorQuestions: string[];
    knownFacts: string[];
    unexploredAreas: string[];
  }): Promise<NoveltyAssessment>;

  /** Vector embedding for semantic memory search. */
  embed(text: string): Promise<number[]>;
}
