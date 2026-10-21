# Architecture

Storyhouse keeps a hard separation between **AI processing** and **memory storage**, so the
family's data never depends on any AI vendor. Since v0.2 ("Grandma's House") it runs as one
Cloudflare Worker in the family's own account, so her iPad can reach it any time, while staying
runnable fully offline with Ollama.

```
 Her iPad (Home Screen app)        Family Studio (any browser)      Family View (read-only)
 Today card · Family Photos        upload · tag faces · record      Library · Timeline · Vault
            │                                  │                                │
            └───────────────┬──────────────────┴────────────────────────────────┘
                            │  HTTPS — every /api and /media request passes the gate
┌───────────────────────────▼──────────────────────────────────────────────────────────┐
│  Cloudflare Worker (Hono)                     worker/src                               │
│                                                                                       │
│  auth.ts  ─ resolves who is at the door: studio · grandma (paired iPad) · family · none │
│  routes/house.ts    session, her album + Today, the Studio API                         │
│  routes/memories.ts the original rooms: conversation, memories, timeline, exports      │
│  routes/media.ts    R2 photos/voices/art (range requests for iPad audio)               │
│                                                                                       │
│  memory/pipeline ──► AIProvider (abstraction)                                          │
│         │               ├── WorkersAIProvider ──► Gemma 4 · EmbeddingGemma (open)     │
│         │               ├── OllamaProvider ────► Gemma 3 on a local machine (open)    │
│         │               └── MockProvider (honest offline fallback)                     │
│         ▼                                                                              │
│  D1 (SQLite): Memory Vault + people, photos, faces, devices, Today notes               │
│  R2: photos · family voice recordings · memory art                                     │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

## Request flows

**Conversation (`POST /api/conversations/:id/messages[/stream]`)**
1. Save her message.
2. Embed it → cosine search over stored memory embeddings → top matches above a threshold.
3. Assemble a controlled context block (never the whole vault).
4. `provider.converse(history, context)` → grounded reply (streamed as SSE). Save it.

**Consolidation (`POST /api/conversations/:id/consolidate`)**
1. `provider.extractMemory(text)` → structured JSON (date precision is re-checked in code).
2. Immutable original recollection + dedup/link entities + auto-relate by shared entities.
3. Embedding stored for future retrieval.

**Publishing to her iPad**
1. Studio uploads a photo (resized and stripped of metadata in the browser) → R2 + a `draft` row.
2. Family tags faces, writes a caption, records a voice message (who recorded it is required).
3. **Publish** flips the row to `published`; art can't be published without saying who made it.
4. Her iPad refreshes the album when opened and every 10 minutes; a service worker keeps her photos
   available offline.

## Key decisions

- **One Worker, three doors.** A single deploy serves the iPad app, the Studio, and the API. The gate
  is server-side: the lock screen is the only thing that renders without a key.
- **D1 is SQLite**, so the original schema ported unchanged (`worker/migrations/0001_memory_vault.sql`).
- **Embeddings as JSON columns + JS cosine** — still right-sized for one family's archive.
- **Provider abstraction everywhere** — Gemma 4 on Workers AI in the cloud, Gemma 3 via Ollama
  locally, an honest mock offline. Nothing is coupled to a vendor API.
- **Device pairing, not a password, for her.** A one-time code creates a revocable device token
  (only its SHA-256 is stored). She never sees a login screen.
- **The legacy server** (`server/`, Express + `node:sqlite`) is kept as the hackathon version.
