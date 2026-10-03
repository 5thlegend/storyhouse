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
}
