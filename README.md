# 🏠 Storyhouse

### A home for the stories that make us who we are.

Storyhouse is a **local-first, voice-first AI companion and family memory archive**. It listens to an elderly loved one tell the stories of their life, remembers them, connects them across the decades, and preserves them in a structured, family-owned **Memory Vault** — all powered by an **open-weight Gemma model running locally**, so the most private memories a family has never leave the device.

> _She spent 80 years collecting stories._
> _We built somewhere for them to live._

---

## The person I built it for

I built Storyhouse for **my grandmother**, who is in her eighties and living with early Alzheimer's.

The hardest part isn't only the memories she may lose. It's realizing how many stories she is carrying _right now_ — about her mother's Sunday peach pies, the dance where she met my grandfather, the old blue Chevrolet — and how few of them have ever been written down. She has fewer people to tell them to than she used to.

I didn't want to build another chatbot. I wanted to build **somewhere her stories could live** — and a companion patient enough to help her tell them.

**What Storyhouse is not:** it is not an Alzheimer's treatment, not a medical device, not a replacement for family, and never a fake relative. It is a companion and a memory-preservation system. It always encourages real human connection.

---

## What it does — the core loop

1. **Listen.** Grandma talks naturally (voice-first; large, obvious controls; a visible privacy state).
2. **Converse.** Gemma responds warmly, grounded _only_ in what she has actually said.
3. **Remember.** Meaningful stories become structured **Memory Objects** — with people, places, dates, and emotions — not raw transcripts.
4. **Connect.** Memories link into a graph (the blue Chevrolet → Harold → teaching their son to drive).
5. **Discover.** It finds unexplored corners of her life without interrogating or repeating itself.
6. **Preserve.** Everything is exportable, forever, in a format the family owns.
7. **Create.** Vividly visual memories can become labeled AI "visual interpretations" (never fake photos).

---

## Demo

- **Live demo (fictional data):** _[deploy URL here]_ — runs in **Demo Mode** with a fictional person, "Margaret," so no real family memories are ever exposed publicly.
- **Video walkthrough:** _[video link here]_

The deployed demo seeds a complete fictional life (10 memories, people, places, a recipe, an unfinished story, a visual memory, and a deliberately **conflicting date** to show how Storyhouse preserves both recollections rather than choosing one).

---

## Open-source AI at the core

Storyhouse's intelligence is **[Gemma 3](https://ai.google.dev/gemma)** (open-weight, 4B), served **locally via [Ollama](https://ollama.com/)**. Gemma does the real work:

- conversational responses as the companion
- **memory extraction** (turning her words into structured JSON: title, people, places, dates, emotions, themes)
- entity extraction and novelty reasoning
- retrieval synthesis (answering "what did I tell you about Grandpa's car?")

Semantic memory search uses the open **`nomic-embed-text`** embedding model, also local. Every model sits behind a **provider abstraction** (`AIProvider`, `SpeechProvider`, `ImageProvider`, …) so it can be swapped without touching application logic.

```
AIProvider
  ├── OllamaProvider   (Gemma — the open-source core)
  └── MockProvider     (honest offline fallback: the app still opens & the Vault still works)
```

### Why Gemma / why open innovation matters here

These are a dying woman's most intimate memories. **Open-weight, local AI is not a nice-to-have here — it is the only ethically correct architecture.**

- 🔒 **Private by construction.** Her stories are processed on the device and stored in a local SQLite vault. Nothing is sent to anyone's server. A closed API would mean uploading her life to a company.
- ✈️ **Works offline.** No internet required — it runs on a laptop (and, in the roadmap, on her own phone).
- 💸 **Free to run, forever.** No per-token bill for a grandchild to keep a grandparent's stories alive.
- 🔧 **Swappable & fine-tunable.** We own the weights. We can change models, or fine-tune on the family's own voice, because nothing is locked behind a vendor.
- 🧭 **Honest.** Because we control the pipeline, we can _prove_ what leaves the device (nothing) — not just promise it.

A closed API could have produced the conversation. It could **not** have produced the _ownership_.

---

## How memory works (not a prompt stuffed with history)

Storyhouse never dumps the whole archive into the model. It uses **controlled retrieval**:

```
her words → embedding → semantic search over the vault
          → top relevant memories → assembled context → Gemma → grounded reply
```

Principles baked into the data model and prompts:

- **Immutable originals.** Her exact words are stored once and never overwritten. If she later revises a date, we store a _second recollection_ — the system can say _"your archive has two recollections about that year,"_ and never silently picks one.
- **Provenance on everything.** Each fact is tagged `DIRECT` (her words), `APPROXIMATE` (she estimated), `FAMILY_REPORTED`, `DERIVED` (AI inference), or `GENERATED` (AI art). The UI shows it. The AI is told to say _"you told me…"_, never _"it is true that…"_.
- **Never invent precision.** If she says "1944," we keep the year — we don't fabricate a day.
- **Consent.** Conversation is distinct from permanent memory; a story is kept only when offered and accepted.

---

## Privacy

- Memories are stored **locally** and are **never used to train any model**.
- The microphone **only listens when tapped** — there is no silent, always-on recording. The privacy state is always visible, with a prominent mute.
- AI-generated images are **always labeled** as interpretations, never shown as historical photographs.
- The family can **export the entire archive** (JSON or a Markdown storybook) at any time. The vault is never locked away from them.
- The public demo runs on **fictional data only**.

---

## Running locally

**Prerequisites:** [Node.js 20+](https://nodejs.org) and [Ollama](https://ollama.com).

```bash
# 1. Pull the open models (once)
ollama pull gemma3:4b
ollama pull nomic-embed-text

# 2. Install
npm install

# 3. Configure (optional — sensible defaults work out of the box)
cp .env.example .env

# 4. Run (starts API + web client together)
npm run dev
```

Then open **http://localhost:5173**. The server seeds the fictional "Margaret" demo archive on first run.

> **Note on Windows:** Storyhouse uses Node's built-in `node:sqlite` (via `--experimental-sqlite`), so there is **no native build step** — no Visual Studio / node-gyp required.

---

## Environment variables

See [`.env.example`](./.env.example). Highlights:

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_PROVIDER` | `ollama` | `ollama` (local, open) or `mock` (offline fallback) |
| `AI_MODEL` | `gemma3:4b` | the open-weight conversational model |
| `EMBED_MODEL` | `nomic-embed-text` | open embedding model for memory search |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | local inference endpoint |
| `DEMO_MODE` | `true` | seed fictional data + show the demo banner (**keep ON for any public deploy**) |
| `DATABASE_PATH` | `./data/storyhouse.db` | the local Memory Vault (git-ignored) |

No API keys are required to run the core product.

---

## Project structure

```
storyhouse/
├─ server/                 # Node + TypeScript API (Express)
│  └─ src/
│     ├─ ai/               # provider abstraction: Ollama/Gemma + mock, prompts
│     ├─ db/               # node:sqlite Memory Vault + schema
│     ├─ memory/           # store (entities, links, vector search) + pipeline
│     ├─ seed/             # fictional "Margaret" demo data
│     ├─ art.ts            # memory-art (labeled visual interpretations)
│     └─ routes.ts         # REST API
├─ client/                 # React + TypeScript + Vite + Tailwind
│  └─ src/
│     ├─ components/       # Living Room, Library, Detail, Gallery, Timeline, Vault
│     ├─ hooks/useSpeech   # Web Speech API (voice in/out)
│     └─ store.ts          # app + presence/privacy state
└─ docs/                   # architecture, memory model, privacy, AI, deployment, hardware
```

---

## Roadmap: on-device, on her phone

The strongest version of Storyhouse runs **entirely on the device she already uses**. **Gemma 3n** is purpose-built for on-device mobile inference (text _and_ audio) via **Google AI Edge / MediaPipe** — so the same open model family that powers this web MVP can run **fully offline on an Android phone**, with the Vault living on the phone itself. This web app is Phase 1; the native on-device companion is Phase 2, and the provider abstraction is already shaped for it.

A future physical "Storyhouse" device (Raspberry Pi / microphone / speaker / a real hardware privacy switch) is documented in [`docs/hardware.md`](./docs/hardware.md).

---

## Limitations (honest)

- First conversation turn after idle is slower while the model loads into VRAM; turns are fast once warm.
- Voice input uses the browser's Web Speech API (quality varies by browser); ElevenLabs / Whisper adapters are scaffolded for later.
- Memory "art" is a labeled stylized interpretation card in this build; a real open image model slots in behind the same `ImageProvider`.
- Novelty/curiosity engines are present but intentionally light in the MVP.

---

## Hacktoberfest 2026 — Build for a Friend

A brand-new project built during the challenge window for the **[Hacktoberfest Weekend Challenge: Build for a Friend](https://dev.to/challenges/hacktoberfest-weekend-2026-10-01)**. Open-source AI (Gemma, local inference) is genuinely at the core of how it works.

**Partner categories:** this project claims a category _only_ where the technology is genuinely used. Gemma (open-weight model) is integral. Other partner integrations are included only if actually implemented — see [`docs/hackathon.md`](./docs/hackathon.md).

---

## License

Code: **MIT** (see [`LICENSE`](./LICENSE)). **Memory data is user-owned and is never part of this repository.**

## Acknowledgments

For my grandmother — and for everyone's. Built by **Next Realm Interactive**.
