# Privacy

Storyhouse's default principle is **minimize data** and **keep it on the device**.

## What leaves the device
- **By default: nothing.** Gemma and the embedding model run locally via Ollama. Conversations and memories are processed and stored on the machine.
- If an optional external voice/image provider is explicitly configured with a key, only the specific text/audio for that feature is sent to that provider, and it is disclosed in the UI and README. The **core conversational intelligence remains the open, local model** regardless.

## What is stored
- The local SQLite **Memory Vault** (`data/storyhouse.db`), git-ignored.
- No analytics. No tracking. Memory data is **never used to train any model**.

## Microphone
- Listens **only when tapped**. No silent, always-on recording.
- The privacy state is always visible; a prominent **mute** control is always available.

## AI honesty
- AI-generated images are always labeled as interpretations — never presented as real photographs.
- Every memory shows its provenance (her words vs. an estimate vs. an AI inference).

## Family rights
- Export the entire archive at any time (JSON or Markdown). Delete memories. The archive is never locked away from the family.

## Public demo
- Runs on **fictional data only** (`DEMO_MODE=true`) so no real family memory is ever exposed.
