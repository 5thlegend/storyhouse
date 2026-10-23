#!/usr/bin/env node
// Import a folder of images (e.g. art made on Higgsfield Unlimited) into the
// Family Studio as DRAFTS. Nothing reaches her iPad until you publish it in the
// Studio. AI art is labeled "Art made with AI by <name>" automatically.
//
//   npm run studio:import -- <folder-or-files...> --made-by Penta [options]
//
// Options:
//   --to album|coloring       where it shows on her iPad   (default: coloring)
//   --kind ai_art|family_art|photo                          (default: ai_art)
//   --made-by <name>          who made it — required for art
//   --caption <text>          one caption for every image  (default: from the file name)
//   --url <address>           your Storyhouse              (default: the live site)
//
// The Studio passcode is read from STORYHOUSE_PASSCODE, or asked for (hidden).

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import sharp from 'sharp';

const MAX_EDGE = 2048;
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function parseArgs(argv) {
  const opts = { to: 'coloring', kind: 'ai_art', url: 'https://storyhouse.dankpenta.workers.dev', inputs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--to') opts.to = argv[++i];
    else if (a === '--kind') opts.kind = argv[++i];
    else if (a === '--made-by') opts.madeBy = argv[++i];
    else if (a === '--caption') opts.caption = argv[++i];
    else if (a === '--url') opts.url = argv[++i].replace(/\/+$/, '');
    else if (a === '--help' || a === '-h') opts.help = true;
    else opts.inputs.push(a);
  }
  return opts;
}

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function listImages(inputs) {
  const files = [];
  for (const input of inputs) {
    if (!fs.existsSync(input)) fail(`Not found: ${input}`);
    if (fs.statSync(input).isDirectory()) {
      for (const name of fs.readdirSync(input).sort()) {
        if (IMAGE_EXT.has(path.extname(name).toLowerCase())) files.push(path.join(input, name));
      }
    } else if (IMAGE_EXT.has(path.extname(input).toLowerCase())) {
      files.push(input);
    }
  }
  return files;
}

/** "lake-house_sunset.png" → "Lake house sunset"; generator names (hf_2026…, uuids) → "". */
function captionFrom(file) {
  const base = path.basename(file, path.extname(file));
  if (/^(hf|img|image|download|generated)?[_-]?[\da-f-]{6,}/i.test(base) || /\d{6,}/.test(base)) return '';
  const words = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function signIn(url, passcode) {
  const res = await fetch(`${url}/api/session/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) fail(body.error ?? `Sign-in failed (${res.status}).`);
  if (body.role !== 'studio') fail('That passcode opens the Family View, not the Studio.');
  const cookie = (res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''])
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith('sh_studio='));
  if (!cookie) fail('Signed in, but no Studio session came back.');
  return cookie;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.inputs.length) {
    console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 17).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(opts.help ? 0 : 1);
  }
  if (!['album', 'coloring'].includes(opts.to)) fail('--to must be album or coloring.');
  if (!['ai_art', 'family_art', 'photo'].includes(opts.kind)) fail('--kind must be ai_art, family_art or photo.');
  if (opts.kind !== 'photo' && !opts.madeBy?.trim()) {
    fail('Say who made the art with --made-by (she is always told; AI art reads "Art made with AI by <name>").');
  }

  const files = listImages(opts.inputs);
  if (!files.length) fail('No .png, .jpg or .webp images found.');

  const passcode = process.env.STORYHOUSE_PASSCODE || (await askHidden('Family Studio passcode: '));
  const cookie = await signIn(opts.url, passcode);
  console.log(`\nImporting ${files.length} image(s) into ${opts.to === 'coloring' ? 'the coloring library' : 'her photo album'} as drafts…\n`);

  let ok = 0;
  for (const file of files) {
    try {
      // Fit within 2048px, flatten any transparency onto white paper, strip metadata.
      const { data, info } = await sharp(file)
        .rotate()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 88 })
        .toBuffer({ resolveWithObject: true });
      const q = new URLSearchParams({
        width: String(info.width),
        height: String(info.height),
        kind: opts.kind,
        collection: opts.to,
        caption: opts.caption ?? captionFrom(file),
        ...(opts.madeBy ? { made_by: opts.madeBy.trim() } : {}),
      });
      const res = await fetch(`${opts.url}/api/studio/photos?${q}`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg', Cookie: cookie },
        body: data,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      ok++;
      console.log(`  ✓ ${path.basename(file)}${q.get('caption') ? `  —  "${q.get('caption')}"` : ''}`);
    } catch (err) {
      console.log(`  ✗ ${path.basename(file)}: ${err.message}`);
    }
  }

  console.log(`\n${ok} of ${files.length} imported as drafts.`);
  console.log(`Review and publish them in the Studio: ${opts.url}  →  Family Studio → Photos & art\n`);
  process.exit(ok === files.length ? 0 : 1);
}

main().catch((err) => fail(err.message));
