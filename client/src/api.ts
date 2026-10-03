import type { Health, Memory, RespondResult, VaultStats } from './types';

const BASE = '/api';

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => fetch(`${BASE}/health`).then(j<Health>),

  startConversation: () =>
    fetch(`${BASE}/conversations`, { method: 'POST' }).then(j<{ id: string }>),

  sendMessage: (conversationId: string, text: string) =>
    fetch(`${BASE}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).then(j<RespondResult>),

  consolidate: (conversationId: string, text: string, force = false) =>
    fetch(`${BASE}/conversations/${conversationId}/consolidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, force }),
    }).then(j<{ saved: boolean; memory?: Memory; reason?: string }>),

  endConversation: (conversationId: string) =>
    fetch(`${BASE}/conversations/${conversationId}/end`, { method: 'POST' }).then(j),

  listMemories: () => fetch(`${BASE}/memories`).then(j<{ memories: Memory[] }>),

  getMemory: (id: string) => fetch(`${BASE}/memories/${id}`).then(j<{ memory: Memory }>),

  makeArt: (id: string, scene?: string) =>
    fetch(`${BASE}/memories/${id}/art`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene }),
    }).then(j<{ artifact: any }>),

  setVisibility: (id: string, visibility: string) =>
    fetch(`${BASE}/memories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility }),
    }).then(j),

  deleteMemory: (id: string) =>
    fetch(`${BASE}/memories/${id}`, { method: 'DELETE' }).then(j),

  timeline: () =>
    fetch(`${BASE}/timeline`).then(
      j<{ decades: { decade: string; memories: { id: string; title: string; when: string | null }[] }[] }>,
    ),

  search: (q: string) =>
    fetch(`${BASE}/search?q=${encodeURIComponent(q)}`).then(
      j<{ results: { id: string; title: string; summary: string; score: number }[] }>,
    ),

  vault: () => fetch(`${BASE}/vault`).then(j<{ stats: VaultStats; demoMode: boolean }>),

  exportUrl: `${BASE}/export`,
  exportMarkdownUrl: `${BASE}/export/markdown`,
};
