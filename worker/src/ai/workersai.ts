import { config, env } from '../config.js';
import type { ChatTurn, ExtractedMemory, NoveltyAssessment } from '../types.js';
import type { AIProvider, RetrievedContext } from './types.js';
import { EXTRACTION_SYSTEM, NOVELTY_SYSTEM } from './prompts.js';
import {
  buildCompanionMessages,
  normalizeExtraction,
  parseJsonObject,
  stripThinking,
  type ChatMessage,
} from './shared.js';

// Workers AI models answer in either the classic `{ response }` shape or the
// Chat Completions `{ choices }` shape depending on the model; accept both.
function textFrom(out: any): string {
  if (typeof out === 'string') return out;
  if (typeof out?.response === 'string') return out.response;
  if (out?.response && typeof out.response === 'object') return JSON.stringify(out.response);
  const msg = out?.choices?.[0]?.message;
  if (typeof msg?.content === 'string') return msg.content;
  return '';
}

// Gemma 4 thinks before answering by default; on a 300-token budget the
// reasoning alone can use it all up and leave her with an empty reply. The
// companion's job is short and warm, so thinking stays off.
const NO_THINKING = { chat_template_kwargs: { enable_thinking: false } };

function deltaFrom(ev: any): string {
  if (typeof ev?.response === 'string') return ev.response;
  const d = ev?.choices?.[0]?.delta;
  return typeof d?.content === 'string' ? d.content : '';
}

/**
 * Open-weight models (Gemma 4 + EmbeddingGemma) running on the family's own
 * Cloudflare account through the Workers AI binding. No third-party AI vendor.
 */
export class WorkersAIProvider implements AIProvider {
  get name() {
    return `workers-ai:${config().aiModel}`;
  }

  async isAvailable(): Promise<boolean> {
    return !!env.AI;
  }

  private async chat(
    messages: ChatMessage[],
    opts: { temperature?: number; maxTokens?: number } = {},
  ): Promise<string> {
    const out = await env.AI.run(config().aiModel as any, {
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 1024,
      ...NO_THINKING,
    } as any);
    return stripThinking(textFrom(out));
  }

  /** JSON from Gemma by instruction (no schema guarantee), parsed tolerantly. */
  async json(system: string, user: string): Promise<any> {
    const out = await this.chat(
      [
        { role: 'system', content: `${system}\n\nReturn ONLY one valid JSON object, no prose.` },
        { role: 'user', content: user },
      ],
      { temperature: 0.1, maxTokens: 3000 },
    );
    return parseJsonObject(out);
  }

  /** Same, with an image (Gemma 4 can read pictures, e.g. a recipe card). */
  async jsonWithImage(system: string, user: string, image: { base64: string; mime: string }): Promise<any> {
    const out = await env.AI.run(config().aiModel as any, {
      messages: [
        { role: 'system', content: `${system}\n\nReturn ONLY one valid JSON object, no prose.` },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.base64}` } },
            { type: 'text', text: user },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 3000,
      ...NO_THINKING,
    } as any);
    return parseJsonObject(stripThinking(textFrom(out)));
  }

  async converse(
    history: ChatTurn[],
    context: RetrievedContext,
    noveltyHint?: string | null,
  ): Promise<string> {
    const messages = buildCompanionMessages(history, context, noveltyHint);
    return this.chat(messages, { temperature: 0.2, maxTokens: 300 });
  }

  async *converseStream(
    history: ChatTurn[],
    context: RetrievedContext,
    noveltyHint?: string | null,
  ): AsyncGenerator<string> {
    const messages = buildCompanionMessages(history, context, noveltyHint);
    const stream = (await env.AI.run(config().aiModel as any, {
      messages,
      temperature: 0.2,
      max_tokens: 300,
      stream: true,
      ...NO_THINKING,
    } as any)) as unknown as ReadableStream<Uint8Array>;

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    // Hold back anything inside <think>…</think> so reasoning never reaches her.
    let thinking = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') return;
        let piece = '';
        try {
          piece = deltaFrom(JSON.parse(payload));
        } catch {
          continue;
        }
        if (!piece) continue;
        if (piece.includes('<think>')) thinking = true;
        if (thinking) {
          if (piece.includes('</think>')) {
            thinking = false;
            piece = piece.split('</think>').pop() ?? '';
          } else continue;
        }
        if (piece) yield piece;
      }
    }
  }

  async extractMemory(transcript: string): Promise<ExtractedMemory> {
    const out = await this.chat(
      [
        { role: 'system', content: EXTRACTION_SYSTEM },
        { role: 'user', content: transcript },
      ],
      { temperature: 0.1 },
    );
    return normalizeExtraction(parseJsonObject(out));
  }

  async assessNovelty(input: {
    currentTopic: string;
    priorQuestions: string[];
    knownFacts: string[];
    unexploredAreas: string[];
  }): Promise<NoveltyAssessment> {
    const out = await this.chat(
      [
        { role: 'system', content: NOVELTY_SYSTEM },
        { role: 'user', content: JSON.stringify(input) },
      ],
      { temperature: 0.4 },
    );
    const j = parseJsonObject(out);
    return {
      already_covered: Boolean(j.already_covered),
      unexplored_angle: j.unexplored_angle ?? null,
      recommended_followup: j.recommended_followup ?? null,
      reason: String(j.reason ?? ''),
    };
  }

  async embed(text: string): Promise<number[]> {
    const out = (await env.AI.run(config().embedModel as any, { text: [text] } as any)) as any;
    return (out?.data?.[0] as number[]) ?? [];
  }
}
