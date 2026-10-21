// Client-side view of the memory model (subset of the server types).

export interface Entity {
  id: string;
  kind: string;
  name: string;
}

export interface Artifact {
  id: string;
  memory_id: string;
  kind: 'image' | 'document' | 'audio';
  label: string;
  is_ai_generated: boolean;
  url: string;
  provider?: string | null;
}

export interface Recollection {
  id: string;
  field: string;
  text: string;
  confidence: string;
  created_at: string;
}

export interface Memory {
  id: string;
  title: string;
  summary: string;
  original_transcript: string;
  source_type: string;
  confidence: string;
  speaker: string;
  memory_date_text: string | null;
  memory_date_start: string | null;
  date_precision: string;
  emotions: string[];
  themes: string[];
  tags: string[];
  status: string;
  visibility: string;
  provenance: string;
  created_at: string;
  entities?: Entity[];
  recollections?: Recollection[];
  artifacts?: Artifact[];
  related?: { id: string; title: string; relation: string }[];
}

export interface AIStatus {
  active: string;
  openModelOnline: boolean;
  configuredProvider: string;
  model: string;
}

export interface Health {
  ok: boolean;
  demoMode: boolean;
  ai: AIStatus;
}

export interface RespondResult {
  reply: string;
  usedMemories: { id: string; title: string; score: number }[];
  openModelOnline: boolean;
  provider: string;
}

export interface VaultStats {
  memories: number;
  people: number;
  places: number;
  recipes: number;
  unfinished: number;
  artifacts: number;
  audio: number;
  photos: number;
}

// ---------- Grandma's House ----------

export type Role = 'none' | 'grandma' | 'studio' | 'family';

export interface Session {
  role: Role;
  demoMode: boolean;
  configured: boolean;
  familyViewEnabled: boolean;
}

export type PhotoKind = 'photo' | 'family_art' | 'ai_art';

export interface Face {
  id: string;
  person_id: string;
  name: string;
  relation: string | null;
  x: number;
  y: number;
  r: number;
  voice_url: string | null;
  voice_by: string | null;
}

export interface AlbumPhoto {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  kind: PhotoKind;
  caption: string;
  when_text: string | null;
  made_by: string | null;
  is_ai_generated: boolean;
  label: string | null;
  voice: { url: string; by: string | null } | null;
  faces: Face[];
  status: 'draft' | 'published';
  created_at: string;
  published_at: string | null;
  is_new: boolean;
}

export interface Person {
  id: string;
  name: string;
  relation: string | null;
  voice_url: string | null;
  voice_by: string | null;
  photo_count: number;
}

export interface TodayNote {
  date: string;
  visitors: string;
  note: string;
}

export interface Device {
  id: string;
  label: string;
  created_at: string;
  last_seen_at: string | null;
}
