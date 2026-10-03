# Architecture

Storyhouse is a two-part app with a hard separation between **AI processing** and **memory storage** — a deliberate choice so the family's data never depends on any AI vendor.

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React + Vite + Tailwind)                           │
│  Living Room · Library · Gallery · Timeline · Vault          │
│  Voice in/out via Web Speech API                             │
└───────────────┬─────────────────────────────────────────────┘
                │ REST (/api)
┌───────────────▼─────────────────────────────────────────────┐
│  Node + Express server                                       │
│                                                              │
│  routes → memory/pipeline ──► AIProvider (abstraction)       │
│                  │                 ├── OllamaProvider ──► Ollama ──► Gemma 3 (local)
│                  │                 └── MockProvider (offline fallback)
│                  ▼                                           │
│          memory/store  ──►  node:sqlite  (the Memory Vault)  │
│          (entities, links, cosine vector search, provenance) │
└──────────────────────────────────────────────────────────────┘
```

## Request flows

**Conversation (`POST /conversations/:id/messages`)**
1. Save her message.
2. Embed it → cosine search over stored memory embeddings → top matches (threshold-filtered).
3. Assemble a controlled context block (never the whole vault).
4. `provider.converse(history, context)` → grounded reply. Save it.

**Consolidation (`POST /conversations/:id/consolidate`)**
1. `provider.extractMemory(text)` → structured JSON.
2. Create immutable original recollection + dedup/link entities + auto-relate by shared entities.
3. Compute + store an embedding for future retrieval.

## Key decisions

- **`node:sqlite`** (built into Node 20+/24) instead of `better-sqlite3` → zero native build on Windows.
- **Embeddings as JSON columns + JS cosine** → a dependency-free local vector store, right-sized for a personal archive.
- **Provider abstraction** everywhere → the open model is the core, and nothing is coupled to a vendor API.
- **`keep_alive` + boot warmup** → both models stay resident on small-VRAM GPUs (tested on a 6 GB RTX 4050).
