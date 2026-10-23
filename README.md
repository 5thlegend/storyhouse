# 🏠 Storyhouse

### A home for the stories that make us who we are.

Storyhouse is a **local-first, voice-first AI companion and family memory archive**. It listens to an elderly loved one tell the stories of their life, remembers them, connects them across the decades, and preserves them in a structured, family-owned **Memory Vault** — all powered by **open-weight Gemma models** running in the family's own Cloudflare account (or entirely on one machine), so the most private memories a family has never go to an AI company.

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

## Grandma's House — her iPad, and a studio for the family

Her laptop can't come with her, but her iPad can. Storyhouse now runs in **the family's own
Cloudflare account** (Workers + D1 + R2 + open models on Workers AI) and installs on her iPad as a
Home Screen app. There are two sides to it:

- **On her iPad:** a calm home screen with a **Today card** (the day, the date, who's visiting) and
  **Family Photos**. One photo at a time, huge print, big arrows, Home always in the same corner.
  **Tap a face to hear who it is.** Family members' own recorded voices play with their photos
  ("Hi Grandma, it's me…"). There are no menus, no timers, no wrong taps, and nothing ever asks her
  "do you remember?".
- **Art Studio on her iPad**, three creative spaces: **Make a picture** (she *says* what she'd like
  to see, checks what was heard, and open Flux paints it), **Draw, and I'll paint it** (her finger
  drawing becomes a finished painting with the same subject and layout; both are kept), and
  **Color a picture**: pick a coloring page and color it. **Tap fills a whole shape**, so no
  precision is needed; dragging paints with a big brush, and Undo / Start over are always there. Pages
  come from the family (made ahead, e.g. on Higgsfield Unlimited, then imported) or are drawn on the
  spot by open Flux 2 klein from ideas built from her own memories. She never types a prompt. What she
  paints is saved as "Made by Grandma" for the family to see.
- **Kitchen on her iPad:** her recipe shelf. Each recipe offers "Tell me about it" (her own words,
  and her own recorded voice), "What I need" (big tick-off checklist) and "Let's cook it" (one step per
  screen, read aloud). Safety is set per recipe: **cook together** tells her to ask her helper for oven,
  stove, knife and hot steps; **on her own** keeps "the oven is on" on screen until the turn-off step.
  Every heated recipe ends with "Is the oven turned off?". She can tap **"Tell me how you make
  something"** and just talk: Whisper transcribes it and Claude drafts the recipe, leaving anything she
  didn't say blank. Family can also photograph her handwritten cards. A small set of classic **vegan**
  recipes (no meat, gelatin, alcohol or coffee) is available as drafts to approve.
- **The Family Studio** (passcode): upload photos and art (Higgsfield / Nano Banana / Flux pieces
  included), tag faces, write large-print captions, record voice messages, set today's visitors, and
  **publish to her iPad**. Drafts never reach her. AI art can't be published without saying who made
  it, and she always sees "Art made with AI by …".

Her iPad is paired once with a one-time code, so she never sees a login. Strangers who find the URL
see only a lock screen. Setup steps: [docs/deployment.md](./docs/deployment.md).

---

## Demo

- **Live demo (fictional data):** _[deploy URL here]_ — runs in **Demo Mode** with a fictional person, "Margaret," so no real family memories are ever exposed publicly.
- **Video walkthrough:** _[video link here]_

The deployed demo seeds a complete fictional life (10 memories, people, places, a recipe, an unfinished story, a visual memory, and a deliberately **conflicting date** to show how Storyhouse preserves both recollections rather than choosing one).

---

## Open-source AI at the core

Storyhouse's intelligence is **[Gemma](https://ai.google.dev/gemma)** (open-weight): **Gemma 4 26B-A4B on Workers AI** in the family's own Cloudflare account, or **Gemma 3 4B locally via [Ollama](https://ollama.com/)**. Gemma does the real work:

- conversational responses as the companion
- **memory extraction** (turning her words into structured JSON: title, people, places, dates, emotions, themes)
- entity extraction and novelty reasoning
- retrieval synthesis (answering "what did I tell you about Grandpa's car?")

Semantic memory search uses open embedding models (**EmbeddingGemma** hosted, **`nomic-embed-text`** locally). Every model sits behind a **provider abstraction** (`AIProvider`, `SpeechProvider`, `ImageProvider`, …) so it can be swapped without touching application logic.

```
AIProvider
  ├── WorkersAIProvider (Gemma 4 + EmbeddingGemma, family's Cloudflare account)
  ├── OllamaProvider   (Gemma 3 — fully local)
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

- Memories live in **the family's own Cloudflare account** (or entirely on one machine with Ollama) and are **never used to train any model**.
- Nothing is public: every photo, voice and memory is behind the Studio passcode, her paired iPad, or the read-only Family View passcode.
- Photos are stripped of location data in the browser before upload. Storyhouse **never imitates a relative's voice**.
- The microphone **only listens when tapped** — there is no silent, always-on recording. The privacy state is always visible, with a prominent mute.
- AI-generated images are **always labeled** as interpretations, never shown as historical photographs.
- The family can **export the entire archive** (JSON, Markdown, or a PDF storybook) at any time. The vault is never locked away from them.
- The public demo runs on **fictional data only**.

---

## Running locally

**Prerequisites:** [Node.js 20+](https://nodejs.org) and a free Cloudflare account (`npx wrangler login`).

```bash
npm install
npm run db:migrate:local                         # create the local D1 tables (once)
cp worker/.dev.vars.example worker/.dev.vars     # set local passcodes; DEMO_MODE=true
npm run dev                                      # Worker on :8787 + web app on :5173
```

Open **http://localhost:5173**, choose **Family Studio**, and enter your local `STUDIO_PASSCODE`. Demo mode
seeds the fictional "Margaret" archive and a small fictional album on first request.

- Workers AI runs remotely even in local dev. For a **fully offline** setup, set `AI_PROVIDER=ollama` in
  `worker/.dev.vars` and run Ollama with `gemma3:4b` + `nomic-embed-text`.
- The original hackathon server (Express + `node:sqlite`) is still in `server/`: `npm run dev:legacy`.
- **Deploying to your own account:** see [docs/deployment.md](./docs/deployment.md).

---

## Configuration

Vars live in [`worker/wrangler.jsonc`](./worker/wrangler.jsonc); secrets are set with `wrangler secret put`
(or `worker/.dev.vars` locally).

| Name | Default | Purpose |
| --- | --- | --- |
| `AI_PROVIDER` | `anthropic` | `anthropic` (Claude, Gemma 4 fallback), `workers-ai` (open models only), `ollama` (local), or `mock` |
| `ANTHROPIC_MODEL` | `claude-haiku-5-5` | Claude model for conversation and memory structuring |
| `AI_MODEL` | `@cf/google/gemma-4-26b-a4b-it` | open-weight conversational model |
| `EMBED_MODEL` | `@cf/google/embeddinggemma-300m` | open embedding model for memory search |
| `IMAGE_MODEL` | `@cf/black-forest-labs/flux-1-schnell` | open image model for labeled memory art |
| `DEMO_MODE` | `false` (deployed) | seed fictional data + show the demo banner |
| `STUDIO_PASSCODE` | — (secret) | the Family Studio passcode. Without it nobody can get in |
| `SESSION_SECRET` | — (secret) | signs session cookies |
| `FAMILY_PASSCODE` | — (secret, optional) | read-only Family View |
| `ANTHROPIC_API_KEY` | — (secret) | your Anthropic key. Without it, Gemma 4 runs |

---

## Project structure

```
storyhouse/
├─ worker/                 # Cloudflare Worker (Hono) — the API, the gate, D1 + R2 + Workers AI
│  ├─ migrations/          # D1 schema: Memory Vault + album, people, devices, Today
│  └─ src/
│     ├─ auth.ts           # studio / paired iPad / family / none — server-side gate
│     ├─ ai/               # providers: Workers AI (Gemma 4), Ollama (Gemma 3), mock; prompts
│     ├─ house/album.ts    # photos, faces, people, voices, Today card
│     ├─ memory/           # store (entities, links, vector search) + pipeline
│     └─ routes/           # house (iPad + Studio), memories (original rooms), media (R2)
├─ server/                 # the original hackathon API (Express + node:sqlite), kept as-is
│  └─ src/
│     ├─ ai/               # provider abstraction: Ollama/Gemma + mock, prompts
│     ├─ db/               # node:sqlite Memory Vault + schema
│     ├─ memory/           # store (entities, links, vector search) + pipeline
│     ├─ seed/             # fictional "Margaret" demo data
│     ├─ art.ts            # memory-art (labeled visual interpretations)
│     └─ routes.ts         # REST API
├─ client/                 # React + TypeScript + Vite + Tailwind
│  └─ src/
│     ├─ house/            # her iPad: home, Today card, photo album
│     ├─ studio/           # the Family Studio: photos, faces, voices, iPad setup
│     ├─ components/       # Lock screen, Living Room, Library, Detail, Gallery, Timeline, Vault
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
- Voice input uses the browser's Web Speech API (quality varies by browser; unreliable in iPad Home Screen apps). Whisper on Workers AI is the planned voice-in for the iPad companion (Phase 3).
- Memory art uses open Flux.1 [schnell] on Workers AI when hosted; locally it falls back to a labeled interpretation card.
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
