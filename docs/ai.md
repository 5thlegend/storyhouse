# The AI layer

## Models

| Job | Default (`AI_PROVIDER=anthropic`) | Open-weight (`workers-ai`) | Fully local (`ollama`) |
| --- | --- | --- | --- |
| Conversation & extraction | Claude Haiku 5.5, Gemma 4 as fallback | `@cf/google/gemma-4-26b-a4b-it` | `gemma3:4b` |
| Embeddings (memory search) | `@cf/google/embeddinggemma-300m` | `@cf/google/embeddinggemma-300m` | `nomic-embed-text` |
| Memory art | `@cf/black-forest-labs/flux-1-schnell` | `@cf/black-forest-labs/flux-1-schnell` | labeled SVG interpretation card |

### Claude (default)
Conversation and memory structuring run on **Claude Haiku 5.5** (`ANTHROPIC_MODEL`) through the
family's own Anthropic API key (`ANTHROPIC_API_KEY` secret). Chosen for warmth and instruction
following at low cost. Details that matter in `worker/src/ai/claude.ts`:
- `effort: "low"` keeps her replies quick; no `temperature` (Haiku 5.5 rejects it).
- Memory extraction uses **structured outputs** (a JSON schema), so a story is never lost to
  malformed JSON.
- **Automatic fallback** (`worker/src/ai/fallback.ts`): if Claude errors, is rate-limited, or declines,
  the same request goes to Gemma 4. A streamed reply only falls back before its first word. Each saved
  memory's provenance names the model that actually structured it.
- **Embeddings never switch**: memory search always uses EmbeddingGemma, so every saved memory stays
  searchable whichever model is talking.
- Without the `ANTHROPIC_API_KEY` secret, `anthropic` quietly runs on Gemma 4.

### Gemma (open-weight)
Gemma 3 is deprecated on Workers AI, so the hosted path uses **Gemma 4 26B-A4B**: a
mixture-of-experts model with ~4B active parameters, so it answers about as fast as a 4B model
(about 3 seconds per turn in testing) with the quality of a much larger one.

**Thinking is switched off.** Gemma 4 reasons before answering by default; on the companion's short
token budget the reasoning alone can use everything up and leave her with an empty reply. The
Worker passes `chat_template_kwargs: { enable_thinking: false }` (see `worker/src/ai/workersai.ts`).

## Why Gemma
Open weights make the only ethical architecture for private family memories possible: family-owned
processing, offline operation, near-zero running cost, and the freedom to swap or fine-tune. See the
README's "Why Gemma / why open innovation matters."

## Provider abstraction
```ts
interface AIProvider {
  isAvailable(): Promise<boolean>;
  converse(history, retrievedContext, noveltyHint?): Promise<string>;
  converseStream?(history, retrievedContext, noveltyHint?): AsyncGenerator<string>;
  extractMemory(transcript): Promise<ExtractedMemory>;
  assessNovelty(input): Promise<NoveltyAssessment>;
  embed(text): Promise<number[]>;
}
```
- `WorkersAIProvider` — Gemma 4 + EmbeddingGemma through the Workers AI binding.
- `OllamaProvider` — Gemma 3 on a local machine (`AI_PROVIDER=ollama`).
- `MockProvider` — honest offline fallback; the app still opens and the Vault still works, and the
  UI shows the AI is offline. It is **not** a fake-intelligence `if/else` pretending to be the model.

Embeddings from different models aren't comparable, so switching embedding models means
re-embedding (re-seed the demo, or re-run consolidation for real memories).

## Prompts (the honesty rails)
- **Companion:** warm, not human, not a doctor, grounded only in retrieved memories, says "you told
  me…", one gentle follow-up, never shames repetition, encourages family — and **never asks "Do you
  remember…?"** (for someone with memory loss that is a quiz she can fail; it invites with "Tell me
  about…" instead).
- **Extraction:** returns strict JSON; never fabricates fields; unknown = null; never invents date
  precision (enforced again in code — a bare year is never an "exact" date).
- **Novelty:** avoids repeating questions; prefers a new angle on a known memory.

## How to replace the model
Change `AI_MODEL` / `EMBED_MODEL` in `worker/wrangler.jsonc` (or `OLLAMA_MODEL` / `OLLAMA_EMBED_MODEL`
for local), or set `AI_PROVIDER=mock`. For on-device mobile, a MediaPipe `GemmaEdgeProvider`
implements the same interface (see `docs/hardware.md`).
