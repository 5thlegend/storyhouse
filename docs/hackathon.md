# Hacktoberfest 2026 — Build for a Friend

**Challenge:** [Hacktoberfest Weekend Challenge: Build for a Friend](https://dev.to/challenges/hacktoberfest-weekend-2026-10-01)

## How Storyhouse meets the brief

- **Built for a real person:** my grandmother (in her 80s, early Alzheimer's). It solves a real problem — her stories are undocumented and she has fewer people to tell them to.
- **Open-source AI at the core:** Gemma 3 (open-weight) running locally via Ollama does the conversation, memory extraction, entity reasoning, and retrieval synthesis. `nomic-embed-text` (open) powers semantic search. The app is architected around these, not a closed API.
- **New project** built during the challenge window.
- **Working demo + video**, public source code, and this write-up on why open innovation matters.

## Why open innovation matters (the honest version)

These are a dying woman's most private memories. Local, open-weight AI is the only architecture that keeps them on the device, costs nothing to run, works offline, and lets the family own and fine-tune the system. A closed API could produce the conversation; it could not produce the ownership. See the README's "Why Gemma" section.

## Partner categories — claimed only where genuinely used

| Technology | Used? | How |
| --- | --- | --- |
| **Gemma (open-weight model)** | ✅ Yes | Core conversational + memory intelligence, run locally. |
| ElevenLabs (voice) | ⬜ Not in MVP | Voice is the browser Web Speech API; an ElevenLabs adapter is scaffolded but not claimed. |
| Render (deploy) | ◻️ If deployed | Claimed only if the demo is actually hosted on Render. |
| Arduino UNO Q | ⬜ No | No hardware on hand — documented as future work only, not claimed. |
| MongoDB Atlas | ⬜ No | The Vault is local SQLite by design (privacy); not claimed. |
| Sentry | ⬜ No | Not implemented; not claimed. |

We deliberately do **not** bolt on partner tech just to claim categories — the product's integrity (local, private) comes first.
