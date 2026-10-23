import Anthropic from '@anthropic-ai/sdk';
import { config, env } from '../config.js';
import type { ChatTurn, ExtractedMemory, NoveltyAssessment } from '../types.js';
import type { AIProvider, RetrievedContext } from './types.js';
import { COMPANION_SYSTEM, EXTRACTION_SYSTEM, NOVELTY_SYSTEM } from './prompts.js';
import { buildContextBlock, normalizeExtraction } from './shared.js';
import { WorkersAIProvider } from './workersai.js';

// Claude Sonnet 5.5 notes (see the Anthropic migration guide):
// - no temperature/top_p/top_k and no prefill; never send thinking
//   {type: "disabled"} (a 400 on Sonnet 5.5) — thinking stays adaptive, and
//   `effort: low` keeps it short so her replies start quickly;
// - read content blocks by type and leave max_tokens room for thinking;
// - safety refusals have no server-side fallback, so a refusal is thrown and the
//   FallbackProvider hands the turn to Gemma instead.
// The model id comes from ANTHROPIC_MODEL, so Haiku 5.5 still works here too.

// Structured outputs support anyOf (not type arrays) for nullable fields.
const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;
const stringList = { type: 'array', items: { type: 'string' } } as const;

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    is_memory_worth_keeping: { type: 'boolean' },
    title: nullableString,
    summary: nullableString,
    people: stringList,
    places: stringList,
    events: stringList,
    objects: stringList,
    recipes: stringList,
    memory_date_text: nullableString,
    memory_date_start: nullableString,
    date_precision: { type: 'string', enum: ['exact', 'year', 'decade', 'approximate', 'unknown'] },
    emotions: stringList,
    themes: stringList,
    is_unfinished: { type: 'boolean' },
    is_legacy_message: { type: 'boolean' },
    visual_scene: nullableString,
  },
  required: [
    'is_memory_worth_keeping', 'title', 'summary', 'people', 'places', 'events', 'objects', 'recipes',
    'memory_date_text', 'memory_date_start', 'date_precision', 'emotions', 'themes', 'is_unfinished',
    'is_legacy_message', 'visual_scene',
  ],
};

const NOVELTY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    already_covered: { type: 'boolean' },
    unexplored_angle: nullableString,
    recommended_followup: nullableString,
    reason: { type: 'string' },
  },
  required: ['already_covered', 'unexplored_angle', 'recommended_followup', 'reason'],
};

export class ClaudeRefusalError extends Error {}

function toMessages(history: ChatTurn[]): Anthropic.MessageParam[] {
  // Storyhouse's own system notes stay out of the turn list; the API needs
  // user/assistant turns, starting with her.
  const turns = history.filter((t) => t.role !== 'system');
  const firstUser = turns.findIndex((t) => t.role === 'grandma');
  return turns.slice(Math.max(firstUser, 0)).map((t) => ({
    role: t.role === 'grandma' ? 'user' : 'assistant',
    content: t.text,
  }));
}

function textOf(message: Anthropic.Message): string {
  if (message.stop_reason === 'refusal') throw new ClaudeRefusalError('Claude declined this request.');
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/**
 * Claude (Sonnet 5.5 by default) for conversation and memory structuring, through the
 * family's own Anthropic API key. Embeddings stay on EmbeddingGemma (Workers
 * AI) so memory search keeps working with every memory already saved.
 */
export class ClaudeProvider implements AIProvider {
  private embedder = new WorkersAIProvider();
  private _client: Anthropic | null = null;

  get name() {
    return `claude:${config().anthropicModel}`;
  }

  private get client(): Anthropic {
    this._client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 });
    return this._client;
  }

  async isAvailable(): Promise<boolean> {
    return !!env.ANTHROPIC_API_KEY;
  }

  // The companion's character never changes, so it is cached; the memories and
  // today's facts follow it uncached.
  private system(context: RetrievedContext, noveltyHint?: string | null): Anthropic.TextBlockParam[] {
    return [
      { type: 'text', text: COMPANION_SYSTEM, cache_control: { type: 'ephemeral' } },
      {
        type: 'text',
        text:
          buildContextBlock(context) +
          (noveltyHint ? `\n\nGENTLE DIRECTION (optional, only if it fits naturally): ${noveltyHint}` : ''),
      },
    ];
  }

  async converse(history: ChatTurn[], context: RetrievedContext, noveltyHint?: string | null): Promise<string> {
    const message = await this.client.messages.create({
      model: config().anthropicModel,
      max_tokens: 2000,
      system: this.system(context, noveltyHint),
      messages: toMessages(history),
      output_config: { effort: 'low' },
    });
    return textOf(message);
  }

  async *converseStream(
    history: ChatTurn[],
    context: RetrievedContext,
    noveltyHint?: string | null,
  ): AsyncGenerator<string> {
    const stream = this.client.messages.stream({
      model: config().anthropicModel,
      max_tokens: 2000,
      system: this.system(context, noveltyHint),
      messages: toMessages(history),
      output_config: { effort: 'low' },
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') throw new ClaudeRefusalError('Claude declined this request.');
  }

  /** Schema-guaranteed JSON. An optional image (e.g. a recipe card photo) goes before the text. */
  async structured(
    system: string,
    user: string,
    schema: object,
    image?: { base64: string; mime: 'image/jpeg' | 'image/png' },
  ): Promise<any> {
    const content: Anthropic.ContentBlockParam[] = image
      ? [
          { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.base64 } },
          { type: 'text', text: user },
        ]
      : [{ type: 'text', text: user }];
    const message = await this.client.messages.create({
      model: config().anthropicModel,
      max_tokens: 8000,
      system,
      messages: [{ role: 'user', content }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    } as Anthropic.MessageCreateParamsNonStreaming);
    return JSON.parse(textOf(message));
  }

  async extractMemory(transcript: string): Promise<ExtractedMemory> {
    return normalizeExtraction(await this.structured(EXTRACTION_SYSTEM, transcript, EXTRACTION_SCHEMA));
  }

  async assessNovelty(input: {
    currentTopic: string;
    priorQuestions: string[];
    knownFacts: string[];
    unexploredAreas: string[];
  }): Promise<NoveltyAssessment> {
    const j = await this.structured(NOVELTY_SYSTEM, JSON.stringify(input), NOVELTY_SCHEMA);
    return {
      already_covered: Boolean(j.already_covered),
      unexplored_angle: j.unexplored_angle ?? null,
      recommended_followup: j.recommended_followup ?? null,
      reason: String(j.reason ?? ''),
    };
  }

  embed(text: string): Promise<number[]> {
    return this.embedder.embed(text);
  }
}
