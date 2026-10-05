import { config } from '../config.js';
import type { ChatTurn, ExtractedMemory, NoveltyAssessment } from '../types.js';
import type { AIProvider, RetrievedContext } from './types.js';
import { COMPANION_SYSTEM, EXTRACTION_SYSTEM, NOVELTY_SYSTEM } from './prompts.js';

type OllamaRole = 'system' | 'user' | 'assistant';
interface OllamaMessage {
  role: OllamaRole;
  content: string;
}

function mapRole(role: ChatTurn['role']): OllamaRole {
  if (role === 'grandma') return 'user';
  if (role === 'storyhouse') return 'assistant';
  return 'system';
}

function buildContextBlock(ctx: RetrievedContext): string {
  if (!ctx.memories.length) {
    return (
      'RETRIEVED MEMORIES: NONE.\n' +
      'Her archive has nothing about what she just said. You do NOT know about this topic. ' +
      'Do NOT invent, describe, or guess any people, places, trips, dates or details. ' +
      "Gently tell her you don't have that one saved yet, and warmly invite her to tell you about it."
    );
  }
  const lines = ctx.memories.map((m, i) => {
    const when = m.when ? ` (${m.when})` : '';
    return `${i + 1}. ${m.title}${when} [${m.confidence}]\n   Grandma's words: "${m.grandmas_words}"\n   Summary: ${m.summary}`;
  });
  return `RETRIEVED MEMORIES (the ONLY factual personal context you may use):\n${lines.join('\n')}`;
}

/** Pull the first JSON object out of a model response, tolerating code fences/prose. */
function parseJsonObject(raw: string): any {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object in model output');
  return JSON.parse(s.slice(start, end + 1));
}

export class OllamaProvider implements AIProvider {
  readonly name = `ollama:${config.aiModel}`;

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${config.ollamaBaseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { models?: { name: string }[] };
      const names = (data.models ?? []).map((m) => m.name);
      // Match "gemma3:4b" against "gemma3:4b" (ollama appends nothing extra here).
      return names.some((n) => n === config.aiModel || n.startsWith(config.aiModel.split(':')[0]));
    } catch {
      return false;
    }
  }

  private async chat(
    messages: OllamaMessage[],
    opts: { json?: boolean; temperature?: number; timeoutMs?: number; numPredict?: number } = {},
  ): Promise<string> {
    const res = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.aiModel,
        messages,
        stream: false,
        keep_alive: '2h', // keep the model resident so turns stay fast (esp. on small VRAM)
        ...(opts.json ? { format: 'json' } : {}),
        options: {
          temperature: opts.temperature ?? 0.7,
          ...(opts.numPredict ? { num_predict: opts.numPredict } : {}),
        },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
    });
    if (!res.ok) throw new Error(`Ollama chat failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? '';
  }

  private buildCompanionMessages(
    history: ChatTurn[],
    context: RetrievedContext,
    noveltyHint?: string | null,
  ): OllamaMessage[] {
    const system =
      COMPANION_SYSTEM +
      '\n\n' +
      buildContextBlock(context) +
      (noveltyHint
        ? `\n\nGENTLE DIRECTION (optional, only if it fits naturally): ${noveltyHint}`
        : '');
    return [
      { role: 'system', content: system },
      ...history.map((t) => ({ role: mapRole(t.role), content: t.text })),
    ];
  }

  async converse(
    history: ChatTurn[],
    context: RetrievedContext,
    noveltyHint?: string | null,
  ): Promise<string> {
    const messages = this.buildCompanionMessages(history, context, noveltyHint);
    // Cap length — the companion is meant to be brief, and shorter = faster.
    const reply = await this.chat(messages, { temperature: 0.2, numPredict: 220 });
    return reply.trim();
  }

  /** Streaming companion reply — yields text chunks as the model generates them. */
  async *converseStream(
    history: ChatTurn[],
    context: RetrievedContext,
    noveltyHint?: string | null,
  ): AsyncGenerator<string> {
    const messages = this.buildCompanionMessages(history, context, noveltyHint);
    const res = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.aiModel,
        messages,
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
    const j = parseJsonObject(out);
    return normalizeExtraction(j);
  }

  async assessNovelty(input: {
    currentTopic: string;
    priorQuestions: string[];
    knownFacts: string[];
    unexploredAreas: string[];
  }): Promise<NoveltyAssessment> {
    const user = JSON.stringify(input);
    const out = await this.chat(
      [
        { role: 'system', content: NOVELTY_SYSTEM },
        { role: 'user', content: user },
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

  /** Pre-load both models into VRAM so the first real turn isn't a cold start. */
  async warmup(): Promise<void> {
    await Promise.allSettled([
      this.embed('warmup'),
      this.chat([{ role: 'user', content: 'hi' }], { temperature: 0, timeoutMs: 120_000 }),
    ]);
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${config.ollamaBaseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.embedModel, prompt: text, keep_alive: '2h' }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`Ollama embeddings failed: ${res.status}`);
    const data = (await res.json()) as { embedding?: number[] };
    return data.embedding ?? [];
  }
}

export function normalizeExtraction(j: any): ExtractedMemory {
  const arr = (v: any): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

  // Honesty rail (§8): never invent date precision. If the model returned a
  // full date like 1944-01-01 but she only said a year, downgrade to 'year'.
  let datePrecision = j.date_precision ?? 'unknown';
  let dateStart: string | null = j.memory_date_start ?? null;
  const dateText: string = j.memory_date_text ?? '';
  const monthNamed = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(dateText);
  if (dateStart && /^\d{4}-01-01$/.test(dateStart) && !monthNamed) {
    dateStart = dateStart.slice(0, 4); // keep just the year
    if (datePrecision === 'exact') datePrecision = 'year';
  }

  return {
    is_memory_worth_keeping: Boolean(j.is_memory_worth_keeping),
    title: j.title ?? null,
    summary: j.summary ?? null,
    people: arr(j.people),
    places: arr(j.places),
    events: arr(j.events),
    objects: arr(j.objects),
    recipes: arr(j.recipes),
    memory_date_text: j.memory_date_text ?? null,
    memory_date_start: dateStart,
    date_precision: datePrecision,
    emotions: arr(j.emotions),
    themes: arr(j.themes),
    is_unfinished: Boolean(j.is_unfinished),
    is_legacy_message: Boolean(j.is_legacy_message),
    visual_scene: j.visual_scene ?? null,
  };
}
