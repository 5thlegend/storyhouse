// ============================================================
// Storyhouse domain types — the Memory model.
// A memory is never a raw chat transcript; it is a structured,
// provenance-tagged object. AI inference is NEVER represented as
// something Grandma said.
// ============================================================

export type SourceType =
  | 'GRANDMA_DIRECT'
  | 'FAMILY_CONTRIBUTION'
  | 'PHOTO'
  | 'USER_ENTERED'
  | 'AI_DERIVED'
  | 'AI_GENERATED';

export type Confidence =
  | 'DIRECT' // she said it plainly
  | 'APPROXIMATE' // she estimated ("I think it was...")
  | 'FAMILY_REPORTED' // a relative told us
  | 'DERIVED' // the AI inferred it from context
  | 'GENERATED' // the AI created it (art, summary)
  | 'UNKNOWN';

export type Visibility = 'PRIVATE' | 'FAMILY' | 'SPECIFIC_PERSON' | 'PUBLIC';

export type DatePrecision = 'exact' | 'year' | 'decade' | 'approximate' | 'unknown';

export type EntityKind =
  | 'person'
  | 'place'
  | 'event'
  | 'object'
  | 'recipe'
  | 'tradition'
  | 'organization'
  | 'job'
  | 'school'
  | 'home'
  | 'vehicle';

export interface Entity {
  id: string;
  kind: EntityKind;
  name: string;
  normalized: string; // lowercased/trimmed for matching
  aliases: string[];
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface MemoryRecollection {
  // An immutable original statement. If Grandma later revises a detail,
  // we store a NEW recollection rather than overwriting this one.
  id: string;
  memory_id: string;
  field: string; // e.g. "memory_date" or "general"
  text: string;
  confidence: Confidence;
  created_at: string;
}

export interface Memory {
  id: string;
  title: string;
  summary: string; // AI-derived summary (clearly provenance = DERIVED)
  original_transcript: string; // Grandma's own words — immutable source
  source_type: SourceType;
  confidence: Confidence;
  speaker: string; // "Grandma" / family member name
  memory_date_text: string | null; // how she described the time, verbatim
  memory_date_start: string | null; // ISO or year, best-effort, never invented
  date_precision: DatePrecision;
  emotions: string[];
  themes: string[];
  tags: string[];
  status: 'candidate' | 'saved' | 'unfinished' | 'archived';
  visibility: Visibility;
  provenance: string; // human-readable: where this came from
  consent_state: 'pending' | 'granted' | 'declined';
  conversation_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;

  // Joined / expanded on read:
  entities?: Entity[];
  related?: { id: string; title: string; relation: string }[];
  recollections?: MemoryRecollection[];
  artifacts?: Artifact[];
}

export interface Artifact {
  id: string;
  memory_id: string;
  kind: 'image' | 'document' | 'audio';
  label: string; // ALWAYS explicit, e.g. "AI-generated visual interpretation"
  is_ai_generated: boolean;
  url: string;
  prompt: string | null;
  provider: string | null;
  created_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: 'grandma' | 'storyhouse' | 'system';
  text: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  speaker: string;
  started_at: string;
  ended_at: string | null;
  messages?: ConversationMessage[];
}

export interface FamilyQuestion {
  id: string;
  asked_by: string;
  question: string;
  about_person: string | null;
  status: 'open' | 'answered' | 'declined';
  answer_memory_id: string | null;
  created_at: string;
}

// ---- AI provider contract shapes ----

export interface ChatTurn {
  role: 'grandma' | 'storyhouse' | 'system';
  text: string;
}

export interface ExtractedMemory {
  is_memory_worth_keeping: boolean;
  title: string | null;
  summary: string | null;
  people: string[];
  places: string[];
  events: string[];
  objects: string[];
  recipes: string[];
  memory_date_text: string | null;
  memory_date_start: string | null;
  date_precision: DatePrecision;
  emotions: string[];
  themes: string[];
  is_unfinished: boolean;
  is_legacy_message: boolean;
  visual_scene: string | null; // a describable scene for optional memory art
}

export interface NoveltyAssessment {
  already_covered: boolean;
  unexplored_angle: string | null;
  recommended_followup: string | null;
  reason: string;
}
