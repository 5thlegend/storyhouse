import type { EntityKind, Confidence, DatePrecision } from '../types.js';

export interface SeedMemory {
  title: string;
  transcript: string; // "Margaret's" own words (fictional)
  summary: string;
  date_text: string | null;
  date_start: string | null;
  date_precision: DatePrecision;
  entities: { kind: EntityKind; name: string }[];
  emotions: string[];
  themes: string[];
  status?: 'saved' | 'unfinished';
  visual_scene?: string;
  makeArt?: boolean;
  // Additional immutable recollections (e.g. a revised, conflicting date).
  extraRecollections?: { field: string; text: string; confidence: Confidence }[];
}

// A warm, fictional life — "Margaret Ellison" — rich enough to prove the system.
export const MARGARET: SeedMemory[] = [
  {
    title: 'Sunday peach pies with her mother',
    transcript:
      "When I was a little girl, my mother made a peach pie every single Sunday. The whole kitchen would smell of warm peaches and cinnamon. She let me pinch the edges of the crust, and I always ate more filling than ended up in the pie.",
    summary: 'Margaret recalls her mother baking peach pie every Sunday in her childhood kitchen.',
    date_text: 'when I was a little girl',
    date_start: '1946',
    date_precision: 'approximate',
    entities: [
      { kind: 'person', name: 'Mother' },
      { kind: 'recipe', name: 'Peach Pie' },
      { kind: 'place', name: 'Childhood Kitchen' },
    ],
    emotions: ['warmth', 'nostalgia'],
    themes: ['childhood', 'food', 'family'],
  },
  {
    title: 'The dance where she met Harold',
    transcript:
      "I met Harold at a dance at the Grange hall. He had the worst dancing you ever saw, but the kindest eyes. I think it was 1952. He stepped on my shoes twice and apologized three times.",
    summary: 'Margaret met her future husband Harold at a Grange hall dance, around 1952.',
    date_text: 'I think it was 1952',
    date_start: '1952',
    date_precision: 'approximate',
    entities: [
      { kind: 'person', name: 'Harold' },
      { kind: 'place', name: 'Grange Hall' },
      { kind: 'event', name: 'The Dance' },
    ],
    emotions: ['love', 'joy'],
    themes: ['love', 'youth'],
  },
  {
    title: 'The old blue Chevrolet',
    transcript:
      "Harold bought an old blue Chevrolet, our first family car. It rattled something awful and the heater never worked, but we drove it everywhere. We took it all the way to my mother's house one summer with the windows down the whole way.",
    summary: "The family's first car, a blue Chevrolet Harold bought; used for a summer trip to Margaret's mother.",
    date_text: 'our first family car',
    date_start: '1958',
    date_precision: 'approximate',
    entities: [
      { kind: 'vehicle', name: 'Blue Chevrolet' },
      { kind: 'person', name: 'Harold' },
      { kind: 'person', name: 'Mother' },
      { kind: 'event', name: 'Summer Trip' },
    ],
    emotions: ['fondness'],
    themes: ['family', 'travel'],
  },
  {
    title: 'Moving to the house on Maple Street',
    transcript:
      "We moved into the house on Maple Street when the children were small. It had a crooked porch step that Harold kept meaning to fix. I believe it was 1957.",
    summary: 'The family moved to their home on Maple Street while the children were young.',
    date_text: 'I believe it was 1957',
    date_start: '1957',
    date_precision: 'approximate',
    entities: [
      { kind: 'home', name: 'Maple Street House' },
      { kind: 'person', name: 'Harold' },
    ],
    emotions: ['belonging'],
    themes: ['home', 'family'],
    // A later, conflicting recollection — the system preserves BOTH, never chooses.
    extraRecollections: [
      {
        field: 'memory_date',
        text: "Actually, now I wonder if it was 1958 — the year after the baby came.",
        confidence: 'APPROXIMATE',
      },
    ],
  },
  {
    title: 'A night at the restaurant',
    transcript:
      "When I worked at the restaurant on Third Street, there was this one night — it was pouring rain and the power went out, and the cook did something I'll never forget...",
    summary: 'Margaret began a story about a memorable rainy night at the restaurant where she worked, but did not finish it.',
    date_text: 'when I worked at the restaurant',
    date_start: '1950',
    date_precision: 'decade',
    entities: [
      { kind: 'job', name: 'Restaurant on Third Street' },
      { kind: 'place', name: 'Third Street' },
    ],
    emotions: ['suspense'],
    themes: ['work', 'youth'],
    status: 'unfinished',
  },
  {
    title: 'Teaching their son to drive',
    transcript:
      "We taught our son to drive in that same blue Chevrolet. He ground the gears so badly Harold had to get out and walk around the block to calm down. But our boy learned, eventually, in the church parking lot on Sunday afternoons.",
    summary: "Margaret and Harold taught their son to drive in the blue Chevrolet; lessons happened in a church parking lot.",
    date_text: 'later, when our son was a teenager',
    date_start: '1969',
    date_precision: 'approximate',
    entities: [
      { kind: 'vehicle', name: 'Blue Chevrolet' },
      { kind: 'person', name: 'Harold' },
      { kind: 'person', name: 'Son' },
      { kind: 'place', name: 'Church Parking Lot' },
    ],
    emotions: ['humor', 'pride'],
    themes: ['family', 'parenting'],
  },
  {
    title: 'Christmas Eve soup',
    transcript:
      "Every Christmas Eve I made a big pot of oyster soup, the way my mother did. The children hated it and I made it anyway, every year, because it made the house feel like Christmas.",
    summary: 'A Christmas Eve tradition of making oyster soup, carried on from her mother.',
    date_text: 'every Christmas Eve',
    date_start: null,
    date_precision: 'unknown',
    entities: [
      { kind: 'tradition', name: 'Christmas Eve Soup' },
      { kind: 'recipe', name: 'Oyster Soup' },
      { kind: 'person', name: 'Mother' },
    ],
    emotions: ['warmth', 'belonging'],
    themes: ['traditions', 'food', 'holidays'],
  },
  {
    title: 'The orange tree in the backyard',
    transcript:
      "We had this enormous orange tree in the backyard. In the afternoons the light would come through the leaves all gold, and the children would sit underneath it and I'd bring out lemonade. It felt like the whole world was that backyard.",
    summary: 'A beloved orange tree in the backyard where the children played in golden afternoon light.',
    date_text: 'in those years on Maple Street',
    date_start: '1960',
    date_precision: 'decade',
    entities: [
      { kind: 'place', name: 'Backyard' },
      { kind: 'object', name: 'Orange Tree' },
    ],
    emotions: ['peace', 'joy'],
    themes: ['home', 'children'],
    visual_scene:
      'An enormous orange tree in a backyard, golden afternoon light coming through the leaves, children sitting underneath in the warm glow',
    makeArt: true,
  },
  {
    title: 'Her first job at the telephone exchange',
    transcript:
      "My very first job was at the telephone exchange. I wore headphones bigger than my head and connected calls all day. You heard everyone's business but you learned to never repeat a word of it.",
    summary: "Margaret's first job was as a switchboard operator at the telephone exchange.",
    date_text: 'my very first job',
    date_start: '1949',
    date_precision: 'approximate',
    entities: [
      { kind: 'job', name: 'Telephone Exchange' },
    ],
    emotions: ['pride'],
    themes: ['work', 'youth'],
  },
  {
    title: "Her father's advice",
    transcript:
      "My father used to say, 'Margaret, you can always make more money, but you can't make more time.' I didn't understand it when I was young. I understand it now.",
    summary: "A piece of life advice from Margaret's father about the value of time over money.",
    date_text: null,
    date_start: null,
    date_precision: 'unknown',
    entities: [{ kind: 'person', name: 'Father' }],
    emotions: ['reflection'],
    themes: ['lessons', 'legacy'],
  },
];
