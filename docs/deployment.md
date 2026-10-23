# Deployment

Storyhouse runs as **one Cloudflare Worker in the family's own Cloudflare account**:

| Piece | Cloudflare product | Holds |
| --- | --- | --- |
| API + gate | Workers (Hono) | `worker/src` |
| Grandma's iPad app + Family Studio | Workers static assets | `client/dist` |
| Memory Vault + album metadata | D1 (SQLite) | `worker/migrations` |
| Photos, voice messages, memory art | R2 | bucket `storyhouse-media` |
| Open-weight AI | Workers AI | Gemma 4, EmbeddingGemma, Flux.1 schnell |

No third-party AI vendor is involved, and nothing is public. Every family photo, voice
and memory sits behind one of three keys (see `worker/src/auth.ts`):

- **Family Studio passcode** (`STUDIO_PASSCODE`) — full access: upload, record, publish.
- **Her iPad** — paired once with a one-time code from the Studio. Sees published things only.
- **Family View passcode** (`FAMILY_PASSCODE`, optional) — read-only.

A stranger who finds the URL sees only the lock screen.

---

## Run it locally

```bash
npm install
npm run db:migrate:local          # create the local D1 tables (once)
cp worker/.dev.vars.example worker/.dev.vars   # then edit the passcodes
npm run dev                       # Worker on :8787 + Vite on :5173
```

Open **http://localhost:5173**. With `DEMO_MODE=true` (the `.dev.vars` default) the fictional
"Margaret" archive and a small fictional album are seeded on first request.

- Local D1 and R2 live in `worker/.wrangler/` (git-ignored).
- **Workers AI always runs remotely, even in local dev**, so you need `wrangler login`, and
  local testing uses your account's Workers AI allowance.
- **Fully offline instead:** set `AI_PROVIDER=ollama` in `worker/.dev.vars`, run
  `ollama serve`, and pull `gemma3:4b` + `nomic-embed-text`. Everything (data, media, AI) then
  stays on this machine.
- The original Express + `node:sqlite` server is still in `server/` (`npm run dev:legacy`), frozen
  at the hackathon version.

## Deploy to your Cloudflare account (first time)

```bash
npx wrangler login

# 1. Create the database and the media bucket.
npx wrangler d1 create storyhouse         # copy the database_id it prints
npx wrangler r2 bucket create storyhouse-media
```

Paste the `database_id` into `worker/wrangler.jsonc` (replacing the zeros), then:

```bash
# 2. Create the tables.
npm run db:migrate:remote

# 3. Set the secrets (each command prompts for the value; nothing is stored in the repo).
cd worker
npx wrangler secret put STUDIO_PASSCODE   # a long passphrase only the family knows
npx wrangler secret put SESSION_SECRET    # any long random string
npx wrangler secret put FAMILY_PASSCODE   # optional: read-only Family View
npx wrangler secret put ANTHROPIC_API_KEY # Claude for conversation (Gemma 4 runs without it)
cd ..

# 4. Build the app and deploy.
npm run deploy
```

Wrangler prints the address (`https://storyhouse.<your-subdomain>.workers.dev`). A custom
domain can be added later in the Cloudflare dashboard.

`DEMO_MODE` is `false` in `wrangler.jsonc`, so the real deployment starts empty — never with demo
data mixed into real family data.

## Set up her iPad (once)

1. Open the Studio on your own device, go to **Her iPad & Today**, and press **Get a setup code**.
2. On her iPad, open the address in **Safari** → **Share** → **Add to Home Screen**.
3. Open Storyhouse **from the Home Screen icon** (a Home Screen app keeps its own sign-in, separate
   from Safari), tap **Set up Grandma's iPad**, and type the code. It works once and lasts 24 hours.
4. Optional but recommended: **Settings → Accessibility → Guided Access**, then triple-click the
   side/top button inside Storyhouse to keep her in the app.

Her iPad stays signed in (the device cookie renews itself on every visit). To un-pair it, use
**Forget** in the Studio; it returns to the lock screen immediately.

## Extra protection (recommended)

The passcode gate is enforced by the Worker itself, and repeated wrong guesses are slowed down
(10 failures per 15 minutes per IP). For defense in depth you can also put **Cloudflare Access**
(Zero Trust → Access → Applications) in front of the whole hostname and allow only family
email addresses. Her iPad then signs in once with a one-time PIN email.

## Updating

```bash
npm run deploy               # code changes
npm run db:migrate:remote    # only when worker/migrations has a new file
```

Her iPad picks up new photos on its own (on open, and every 10 minutes while open).
