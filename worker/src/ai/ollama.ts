import { config } from '../config.js';
import type { ChatTurn, ExtractedMemory, NoveltyAssessment } from '../types.js';
import type { AIProvider, RetrievedContext } from './types.js';
import { EXTRACTION_SYSTEM, NOVELTY_SYSTEM } from './prompts.js';
import {
  buildCompanionMessages,
  normalizeExtraction,
  parseJsonObject,
  type ChatMessage,
} from './shared.js';

/**
 * The original fully-local path: Gemma 3 through Ollama on the family's own
 * machine. Used with `wrangler dev` (AI_PROVIDER=ollama) for a 100% offline setup.
 */
export class OllamaProvider implements AIProvider {
  get name() {
    return `ollama:${config().ollamaModel}`;
  }

  async isAvailable(): Promise<boolean> {
    const { ollamaBaseUrl, ollamaModel } = config();
    try {
      const res = await fetch(`${ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return false;
      const data = (await res.json()) as { models?: { name: string }[] };
      const names = (data.models ?? []).map((m) => m.name);
      return names.some((n) => n === ollamaModel || n.startsWith(ollamaModel.split(':')[0]));
    } catch {
      return false;
    }
  }

  private async chat(
    messages: ChatMessage[],
    opts: { json?: boolean; temperature?: number; numPredict?: number } = {},
  ): Promise<string> {
    const { ollamaBaseUrl, ollamaModel } = config();
    const res = await fetch(`${ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        messages,
        stream: false,
        keep_alive: '2h',
        ...(opts.json ? { format: 'json' } : {}),
        options: {
          temperature: opts.temperature ?? 0.7,
          ...(opts.numPredict ? { num_predict: opts.numPredict } : {}),
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Ollama chat failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? '';
  }

  async converse(
    history: ChatTurn[],
    context: RetrievedContext,
    noveltyHint?: string | null,
  ): Promise<string> {
    const messages = buildCompanionMessages(history, context, noveltyHint);
    return (await this.chat(messages, { temperature: 0.2, numPredict: 220 })).trim();
  }

  async *converseStream(
    history: ChatTurn[],
    context: RetrievedContext,
    noveltyHint?: string | null,
  ): AsyncGenerator<string> {
    const { ollamaBaseUrl, ollamaModel } = config();
    const res = await fetch(`${ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        messages: buildCompanionMessages(history, context, noveltyHint),
        stream: true,
        keep_alive: '2h',
        options: { temperature: 0.2, num_predict: 220 },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok || !res.body) throw new Error(`Ollama stream failed: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const j = JSON.parse(line);
          const piece = j.message?.content;
          if (piece) yield piece;
          if (j.done) return;
        } catch {
          /* ignore partial line */
        }
      }
    }
  }

  async extractMemory(transcript: string): Promise<ExtractedMemory> {
    const out = await this.chat(
      [
        { role: 'system', content: EXTRACTION_SYSTEM },
        { role: 'user', content: transcript },
      ],
      { json: true, temperature: 0.1 },
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
      { json: true, temperature: 0.4 },
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
    const { ollamaBaseUrl, ollamaEmbedModel } = config();
    const res = await fetch(`${ollamaBaseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ollamaEmbedModel, prompt: text, keep_alive: '2h' }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`Ollama embeddings failed: ${res.status}`);
    const data = (await res.json()) as { embedding?: number[] };
    return data.embedding ?? [];
  }
}
