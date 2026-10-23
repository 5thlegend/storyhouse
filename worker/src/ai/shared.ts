import type { ChatTurn, ExtractedMemory } from '../types.js';
import type { RetrievedContext } from './types.js';
import { COMPANION_SYSTEM } from './prompts.js';

export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

function mapRole(role: ChatTurn['role']): ChatRole {
  if (role === 'grandma') return 'user';
  if (role === 'storyhouse') return 'assistant';
  return 'system';
}

export function buildContextBlock(ctx: RetrievedContext): string {
  return memoriesBlock(ctx) + (ctx.house ? `\n\n${ctx.house}` : '');
}

function memoriesBlock(ctx: RetrievedContext): string {
  if (!ctx.memories.length) {
    return (
      'RETRIEVED MEMORIES: NONE.\n' +
      'Her archive has nothing about what she just said. You do NOT know about this topic. ' +
      'Do NOT invent, describe, or guess any people, places, trips, dates or details. ' +
      "If she asks you to recall something from her life, gently say you don't have that one yet, " +
      'and warmly invite her to tell you about it. For everyday chat (how she feels, her day, what ' +
      "she's cooking), just talk naturally and kindly; don't mention your archive at all."
    );
  }
  const lines = ctx.memories.map((m, i) => {
    const when = m.when ? ` (${m.when})` : '';
    return `${i + 1}. ${m.title}${when} [${m.confidence}]\n   Grandma's words: "${m.grandmas_words}"\n   Summary: ${m.summary}`;
  });
  return `RETRIEVED MEMORIES (the ONLY factual personal context you may use):\n${lines.join('\n')}`;
}

export function buildCompanionMessages(
  history: ChatTurn[],
  context: RetrievedContext,
  noveltyHint?: string | null,
): ChatMessage[] {
  const system =
    COMPANION_SYSTEM +
    '\n\n' +
    buildContextBlock(context) +
    (noveltyHint ? `\n\nGENTLE DIRECTION (optional, only if it fits naturally): ${noveltyHint}` : '');
  return [
    { role: 'system', content: system },
    ...history.map((t) => ({ role: mapRole(t.role), content: t.text })),
  ];
}

/** Drop any visible reasoning a thinking model emits before its answer. */
export function stripThinking(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*<\/think>/i, '').trim();
}

/** Pull the first JSON object out of a model response, tolerating code fences/prose. */
export function parseJsonObject(raw: string): any {
  let s = stripThinking(raw);
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object in model output');
  return JSON.parse(s.slice(start, end + 1));
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
  // A bare year ("In 1962") is never an exact date.
  if (dateStart && /^\d{4}$/.test(dateStart) && datePrecision === 'exact') datePrecision = 'year';

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
