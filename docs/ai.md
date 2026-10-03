# The AI layer

## Model
- **Conversation & reasoning:** `gemma3:4b` — Google **Gemma 3**, open-weight, Gemma Terms of Use. Run locally via **Ollama** (no cloud).
- **Embeddings:** `nomic-embed-text` — open embedding model, local.
- **Inference:** fully local. Nothing is sent to any external API by default.

## Why Gemma
Open weights make the only ethical architecture for private family memories possible: on-device processing, offline operation, zero running cost, and the freedom to swap or fine-tune. See the README's "Why Gemma / why open innovation matters."

## Provider abstraction
```ts
interface AIProvider {
  isAvailable(): Promise<boolean>;
  converse(history, retrievedContext, noveltyHint?): Promise<string>;
  extractMemory(transcript): Promise<ExtractedMemory>;
  assessNovelty(input): Promise<NoveltyAssessment>;
  embed(text): Promise<number[]>;
}
```
- `OllamaProvider` — the real open-model implementation.
- `MockProvider` — honest offline fallback; the app still opens and the Vault still works, and the UI shows the AI is offline. It is **not** a fake-intelligence `if/else` pretending to be the model.

## Prompts (the honesty rails)
- **Companion:** warm, not human, not a doctor, grounded only in retrieved memories, says "you told me…", one gentle follow-up, never shames repetition, encourages family.
- **Extraction:** returns strict JSON; never fabricates fields; unknown = null; never invents date precision (enforced again in code).
- **Novelty:** avoids repeating questions; prefers a new angle on a known memory.

## How to replace the model
Change `AI_MODEL` (e.g. `gemma2:2b` for lower VRAM, `gemma3:4b` for quality) or set `AI_PROVIDER=mock`. For on-device mobile, a MediaPipe `GemmaEdgeProvider` implements the same interface (see `docs/hardware.md`).

## Performance notes
First turn after idle loads the model into VRAM (slower); `keep_alive` + a boot warmup keep both models resident. Tested on a 6 GB RTX 4050: ~2–4 s warm turns at ~23 tok/s for `gemma3:4b`.
