# Deployment

Storyhouse is **local-first by design** — the fullest experience runs on the family's own machine with Ollama. There are two ways to share it:

## 1. Video demo (recommended for the true experience)
Record the local app running against local Gemma. This honestly shows the on-device, offline, private product. Keep the walkthrough under ~3 minutes (see the demo script in the README).

## 2. Hosted demo (clickable link, fictional data)
A public deploy **must** run with `DEMO_MODE=true` (fictional "Margaret" data only).

Because a hosted server can't reach a visitor's local Ollama, a hosted demo needs an inference endpoint. Two honest options:
- Point `OLLAMA_BASE_URL` at a reachable Ollama host that serves the **same open Gemma model** (still open-weight — the openness argument holds).
- Or run the demo in `AI_PROVIDER=mock` purely to showcase the UI/Vault, clearly noting the live model runs locally.

### Build & run (single service)
```bash
npm run build          # builds client → client/dist, compiles server → server/dist
npm start              # server serves the API and the built client on PORT
```
The server auto-serves `client/dist` when present, so one process serves both UI and API.

### Render (if used)
- One Web Service: build `npm install && npm run build`, start `npm start`.
- Set env: `DEMO_MODE=true`, `PORT` (Render provides it), and `OLLAMA_BASE_URL` (or `AI_PROVIDER=mock`).
- A persistent disk for `DATABASE_PATH` if you want the demo vault to survive restarts.
- Claim the Render partner category only if actually deployed there.

> Note: the production build can be slow on OneDrive-synced folders (file I/O). Building from a non-synced path, or pausing sync during build, is faster.
