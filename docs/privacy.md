# Privacy

Storyhouse's default principle is **minimize data** and **keep it in the family's hands**.

## Where the data lives
- **Hosted (recommended for her iPad):** in the family's **own Cloudflare account** — D1 for the
  Memory Vault and album details, R2 for photos, voice messages and art. Not in a third-party app's
  account, and not with an AI company.
- **Fully local:** run the Worker with `wrangler dev` and `AI_PROVIDER=ollama`; data, media and AI
  then stay on that machine.

## What reaches an AI model
- The conversation model and embeddings are **open-weight models** (Gemma 4 + EmbeddingGemma on
  Workers AI, or Gemma 3 + nomic-embed locally). Only the text needed for one request is sent:
  her message, a few retrieved memories, or a passage to structure.
- Memory art sends only the scene description to the open Flux.1 model.
- Photos and family voice recordings are **never** sent to a model.
- Memory data is **never used to train any model**. No analytics. No tracking.

## Who can see what
- **Nobody without a key.** A stranger who finds the URL sees only the lock screen; every API and
  media request is checked on the server.
- **Her iPad** sees only what the family has **published**. Drafts never reach her.
- **Family View** (optional passcode) is read-only; memories marked PRIVATE are never shown.
- Guessing is slowed down (10 failed passcodes or pairing codes per 15 minutes per IP).

## Photos
- Photos are resized and **re-encoded in the uploader's browser**, which strips all metadata —
  including the GPS location phones embed — before anything is uploaded.
- Media is served with `Cache-Control: private`, so shared caches never keep a copy. Her iPad keeps
  a local copy so photos still open when the Wi-Fi drops.

## Voices and honesty
- Every voice message names who recorded it, and she is told ("A message from Ellie").
- **Storyhouse never imitates or synthesizes a relative's voice.** When no recording exists, it reads
  aloud in its own, clearly synthetic voice ("This is Ellie, your granddaughter").
- AI-made art always carries a visible label: "Art made with AI by …". It can't be published without
  saying who made it.

## Microphone
- Listens **only when tapped**. No silent, always-on recording. A prominent **mute** is always there.

## Family rights
- Export the entire archive any time (JSON, Markdown, or a PDF storybook). Delete memories and photos.
  The archive is never locked away from the family.

## Demos
- Demo mode seeds **fictional data only** ("Margaret" and an illustrated, fictional family).
  The real deployment runs with `DEMO_MODE=false`.
