import { create } from 'zustand';
import type { Health } from './types';

export type PresenceState =
  | 'idle'
  | 'available'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'saving'
  | 'private';

export type View = 'living-room' | 'library' | 'gallery' | 'timeline' | 'vault' | 'about';

interface AppState {
  view: View;
  setView: (v: View) => void;

  health: Health | null;
  setHealth: (h: Health | null) => void;

  presence: PresenceState;
  setPresence: (p: PresenceState) => void;

  muted: boolean; // privacy: microphone muted
  setMuted: (m: boolean) => void;

  selectedMemoryId: string | null;
  openMemory: (id: string | null) => void;
}

export const useApp = create<AppState>((set) => ({
  view: 'living-room',
  setView: (view) => set({ view, selectedMemoryId: null }),

  health: null,
  setHealth: (health) => set({ health }),

  presence: 'available',
  setPresence: (presence) => set({ presence }),

  muted: false,
  setMuted: (muted) => set({ muted }),

  selectedMemoryId: null,
  openMemory: (selectedMemoryId) => set({ selectedMemoryId }),
}));
