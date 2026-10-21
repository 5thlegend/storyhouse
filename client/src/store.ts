import { create } from 'zustand';
import type { Health, Role, Session } from './types';

export type PresenceState =
  | 'idle'
  | 'available'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'saving'
  | 'private';

export type StudioMode = 'studio' | 'storyhouse' | 'preview';

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

  // Who is at the door (from /api/session). 'studio' = the family member running
  // the Family Studio; 'grandma' = her paired iPad; 'family' = read-only viewer.
  session: Session | null;
  role: Role;
  setSession: (s: Session | null) => void;

  // Inside the Studio: the Studio itself, the original Storyhouse rooms, or a
  // preview of exactly what her iPad shows.
  studioMode: StudioMode;
  setStudioMode: (m: StudioMode) => void;

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

  session: null,
  role: 'none',
  setSession: (session) => set({ session, role: session?.role ?? 'none' }),

  studioMode: 'studio',
  setStudioMode: (studioMode) => set({ studioMode }),

  selectedMemoryId: null,
  openMemory: (selectedMemoryId) => set({ selectedMemoryId }),
}));
