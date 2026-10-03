# The memory model

A memory is **never** a raw chat transcript. It is a structured, provenance-tagged object.

## Core tables (SQLite)
- `memories` — title, summary (derived), `original_transcript` (immutable), source_type, **confidence**, date fields + `date_precision`, emotions/themes/tags (JSON), status, visibility, provenance, embedding.
- `memory_recollections` — append-only. A revised detail adds a row; originals are never overwritten.
- `entities` — people, places, events, objects, recipes, traditions, vehicles, homes, jobs… deduped by `(kind, normalized name)`.
- `memory_entities` — links memories ↔ entities.
- `memory_links` — the memory graph (auto-related by shared entities).
- `artifacts` — memory art etc., each with an explicit `label` and `is_ai_generated`.
- `questions` — family-submitted questions for later conversations.
- `audit_log`, `settings`.

## Provenance / confidence
`DIRECT` · `APPROXIMATE` · `FAMILY_REPORTED` · `DERIVED` · `GENERATED` · `UNKNOWN`.
The UI surfaces this on every card and detail view; the AI is told to speak accordingly.

## Immutability & conflicts
If she says "1957" and later "maybe 1958", **both** are stored as recollections. The detail view shows both; nothing is silently chosen. (See the seeded "Maple Street" memory.)

## Retrieval
`embed(query)` → cosine similarity over stored embeddings → threshold filter → top-K assembled into the model context. The whole vault is never dumped into the prompt.
