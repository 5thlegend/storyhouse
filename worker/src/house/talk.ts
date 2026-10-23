// "Talk with me" on her iPad: a hands-free conversation with her companion.
// Her words come in as audio, Whisper writes them down, and the companion
// answers out loud. The companion knows today's date, who is visiting, and
// who's who in her family (from the Studio), so it can talk about her real
// life without inventing anything.

import { first, run } from '../db.js';
import { getToday, listPeople } from './album.js';

export const DEFAULT_HER_NAME = 'Grandma';

export async function getHerName(): Promise<string> {
  const r = await first<{ value: string }>(`SELECT value FROM settings WHERE key = 'her_name'`);
  return r?.value?.trim() || DEFAULT_HER_NAME;
}

export async function setHerName(name: string): Promise<void> {
  await run(
    `INSERT INTO settings (key, value) VALUES ('her_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    name.trim().slice(0, 60),
  );
}

/**
 * Whisper sometimes "hears" stock phrases in room noise. If that's all we got,
 * treat it as nothing said rather than answering a ghost. ("Thank you" stays:
 * she says it.)
 */
const GHOST_PHRASES =
  /^(thank you for watching|thanks for watching|you|um+|uh+|hmm+|\.+|subtitles by.*|please subscribe.*)[.!?]*$/i;

export function cleanHeard(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return GHOST_PHRASES.test(t) ? '' : t;
}

const SPOKEN_STYLE = `YOU ARE SPEAKING OUT LOUD on her iPad, in a warm, friendly woman's voice, like a kind friend who has dropped by for tea.
- Reply in 1 to 3 short, simple sentences (under 50 words). One idea at a time.
- Plain spoken words only: no lists, no emoji, no headings, no stage directions, no parentheses.
- Her words were written down by speech recognition and may have small mistakes or missing words. Answer what she most likely meant. If you truly can't tell, warmly ask her to tell you a little more. Never correct her or point out a mistake.
- Vary how you answer: sometimes reflect a detail she gave back to her, sometimes share a warm thought. Don't end every reply with a question, and don't keep saying "I'd love to hear more".
- If she trails off or says only a word or two, gently pick up the thread or say something kind; don't fire questions at her.
- If an earlier reply of yours is marked as cut short, she started talking while you spoke. Answer what she said now; don't repeat what you were saying unless she asks.
- If she seems confused, worried, or asks where someone is, be calm and reassuring. Use ONLY the facts below; never guess where a person is, and never say someone has died unless the facts say so. Say her family loves her and, when it fits, mention the next visitor listed below.
- She may ask the day or date. Tell her simply and kindly, every time, as if for the first time.
- You can't see outside or know the weather. If she asks, say so lightly and turn it back to her ("I can't see out the window from here. How does it look to you?").
- Never talk about "saving", "archives" or "data". Talk like a friend.`;

/** Today's facts and her family, written for the companion. Local date/time come from her iPad. */
export async function houseContext(local: { date: string; time?: string; weekday?: string }): Promise<string> {
  const [name, today, people] = await Promise.all([getHerName(), getToday(local.date), listPeople()]);
  const when = [local.weekday, prettyDate(local.date), local.time ? `around ${local.time}` : null].filter(Boolean).join(', ');
  const lines = [
    SPOKEN_STYLE,
    '',
    'ABOUT TODAY AND HER FAMILY (set by her family; true):',
    `- Call her "${name}".`,
    `- Right now it is ${when}.`,
    today.visitors ? `- Visiting today: ${today.visitors}.` : '- No visitors are written down for today.',
    today.note ? `- Today's note from her family: ${today.note}` : null,
    people.length
      ? `- People in her family photos, by the names she uses: ${people
          .slice(0, 30)
          .map((p) => (p.relation ? `${p.name} (${p.relation})` : p.name))
          .join('; ')}.`
      : null,
    '- These facts are for answering her; do not recite them unprompted.',
  ];
  return lines.filter((l) => l !== null).join('\n');
}

function prettyDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[m - 1]} ${d}, ${y}`;
}
