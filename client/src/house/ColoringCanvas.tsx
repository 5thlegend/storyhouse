// Coloring one page. Errorless by design:
//   • a TAP fills the shape under her finger (no precision needed);
//   • a DRAG paints with a big soft brush;
//   • Undo and Start over are always there; nothing she does can be "wrong".
// The line art sits on top (multiply blend), so outlines always stay crisp.

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import type { AlbumPhoto } from '../types';

const COLORS = [
  { name: 'Red', value: '#d94b4b' },
  { name: 'Orange', value: '#f08a3c' },
  { name: 'Yellow', value: '#f2c84b' },
  { name: 'Green', value: '#5aa456' },
  { name: 'Blue', value: '#4a7fd0' },
  { name: 'Purple', value: '#8c5fbf' },
  { name: 'Pink', value: '#e889b5' },
  { name: 'Brown', value: '#8b5a33' },
];

const MAX_UNDO = 10;
const DRAG_PX = 12; // finger movement before a tap becomes a brush stroke

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Scanline flood fill of the open region around (x, y), bounded by the outlines. */
function fillRegion(paint: ImageData, walls: Uint8Array, w: number, h: number, sx: number, sy: number, rgb: [number, number, number]) {
  // Tapped right on a line? Step to the nearest open pixel.
  let start = sy * w + sx;
  if (walls[start]) {
    let found = -1;
    for (let r = 1; r <= 12 && found < 0; r++) {
      for (let dy = -r; dy <= r && found < 0; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = sx + dx;
          const y = sy + dy;
          if (x >= 0 && y >= 0 && x < w && y < h && !walls[y * w + x]) {
            found = y * w + x;
            break;
          }
        }
      }
    }
    if (found < 0) return;
    start = found;
  }
  const seen = new Uint8Array(w * h);
  const stack = [start];
  const d = paint.data;
  while (stack.length) {
    const idx = stack.pop()!;
    const y = (idx / w) | 0;
    let x = idx % w;
    while (x > 0 && !walls[y * w + x - 1] && !seen[y * w + x - 1]) x--;
    let up = false;
    let down = false;
    for (; x < w; x++) {
      const i = y * w + x;
      if (walls[i] || seen[i]) break;
      seen[i] = 1;
      d[i * 4] = rgb[0];
      d[i * 4 + 1] = rgb[1];
      d[i * 4 + 2] = rgb[2];
      d[i * 4 + 3] = 255;
      if (y > 0) {
        const u = i - w;
        if (!walls[u] && !seen[u]) {
          if (!up) {
            stack.push(u);
            up = true;
          }
        } else up = false;
      }
      if (y < h - 1) {
        const dn = i + w;
        if (!walls[dn] && !seen[dn]) {
          if (!down) {
            stack.push(dn);
            down = true;
          }
        } else down = false;
      }
    }
  }
}

export function ColoringCanvas({
  page,
  onBack,
  onKeep,
}: {
  page: AlbumPhoto;
  onBack: () => void;
  onKeep: (painting: Blob, size: { width: number; height: number }) => Promise<void>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const paintRef = useRef<HTMLCanvasElement>(null);
  const lineArt = useRef<HTMLImageElement | null>(null);
  const walls = useRef<Uint8Array | null>(null);
  const undo = useRef<ImageData[]>([]);
  const gesture = useRef<{ x: number; y: number; moved: boolean; last: [number, number] } | null>(null);

  const [color, setColor] = useState(COLORS[0].value);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ w: 1024, h: 1024 });
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [keeping, setKeeping] = useState<'idle' | 'saving' | 'retry'>('idle');

  // Load the line art once; read its outlines into a wall mask for filling.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const probe = document.createElement('canvas');
      probe.width = w;
      probe.height = h;
      const pctx = probe.getContext('2d', { willReadFrequently: true })!;
      pctx.drawImage(img, 0, 0);
      const px = pctx.getImageData(0, 0, w, h).data;
      const mask = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const lum = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
        mask[i] = lum < 150 ? 1 : 0;
      }
      walls.current = mask;
      lineArt.current = img;
      setSize({ w, h });
      const canvas = paintRef.current!;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      setReady(true);
    };
    img.src = page.url;
  }, [page.url]);

  // Fit the square of paper into the space between the top bar and the colors.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const s = Math.min(el.clientWidth / size.w, el.clientHeight / size.h);
      setFit({ w: size.w * s, h: size.h * s });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);

  const ctx = () => paintRef.current!.getContext('2d', { willReadFrequently: true })!;

  function remember() {
    const c = ctx();
    undo.current.push(c.getImageData(0, 0, size.w, size.h));
    if (undo.current.length > MAX_UNDO) undo.current.shift();
    setCanUndo(true);
  }

  function toCanvas(e: PointerEvent): [number, number] {
    const r = paintRef.current!.getBoundingClientRect();
    return [
      Math.max(0, Math.min(size.w - 1, Math.round(((e.clientX - r.left) / r.width) * size.w))),
      Math.max(0, Math.min(size.h - 1, Math.round(((e.clientY - r.top) / r.height) * size.h))),
    ];
  }

  function down(e: PointerEvent) {
    if (!ready) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toCanvas(e);
    gesture.current = { x: e.clientX, y: e.clientY, moved: false, last: p };
  }

  function move(e: PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < DRAG_PX) return;
    const c = ctx();
    if (!g.moved) {
      g.moved = true;
      remember();
    }
    const p = toCanvas(e);
    c.strokeStyle = color;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = size.w * 0.035;
    c.beginPath();
    c.moveTo(g.last[0], g.last[1]);
    c.lineTo(p[0], p[1]);
    c.stroke();
    g.last = p;
  }

  function up(e: PointerEvent) {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.moved || !walls.current) return;
    const [x, y] = toCanvas(e);
    const c = ctx();
    remember();
    const data = c.getImageData(0, 0, size.w, size.h);
    fillRegion(data, walls.current, size.w, size.h, x, y, hexToRgb(color));
    c.putImageData(data, 0, 0);
  }

  function undoLast() {
    const prev = undo.current.pop();
    if (prev) ctx().putImageData(prev, 0, 0);
    setCanUndo(undo.current.length > 0);
  }

  function startOver() {
    remember();
    const c = ctx();
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, size.w, size.h);
  }

  async function keep() {
    if (!lineArt.current) return;
    setKeeping('saving');
    const out = document.createElement('canvas');
    out.width = size.w;
    out.height = size.h;
    const o = out.getContext('2d')!;
    o.drawImage(paintRef.current!, 0, 0);
    o.globalCompositeOperation = 'multiply';
    o.drawImage(lineArt.current, 0, 0);
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/jpeg', 0.9));
    try {
      if (!blob) throw new Error('no image');
      await onKeep(blob, { width: size.w, height: size.h });
    } catch {
      setKeeping('retry');
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-4">
        <button
          onClick={onBack}
          className="min-h-[72px] rounded-3xl bg-cocoa px-7 font-sans text-2xl font-semibold text-linen shadow-warm"
        >
          ‹ Pictures
        </button>
        <button
          onClick={keep}
          disabled={keeping === 'saving'}
          className="min-h-[72px] rounded-3xl bg-sage px-7 font-sans text-2xl font-semibold text-linen shadow-warm"
        >
          {keeping === 'saving' ? 'Keeping it…' : keeping === 'retry' ? 'Keep it — try again' : '✓ I’m finished'}
        </button>
      </div>

      <div ref={box} className="relative min-h-0 flex-1 px-4 py-3">
        <div className="flex h-full w-full items-center justify-center">
          <div
            className="relative touch-none overflow-hidden rounded-3xl bg-white shadow-warm"
            style={fit ? { width: fit.w, height: fit.h } : { width: '100%', aspectRatio: '1' }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => (gesture.current = null)}
          >
            <canvas ref={paintRef} className="absolute inset-0 h-full w-full" />
            <img
              src={page.url}
              alt={page.caption}
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full select-none"
              style={{ mixBlendMode: 'multiply' }}
            />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center font-serif text-3xl text-umber">
                Getting your page ready…
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 px-4 pb-5">
        {COLORS.map((c) => (
          <button
            key={c.value}
            aria-label={c.name}
            aria-pressed={color === c.value}
            onClick={() => setColor(c.value)}
            className={`h-[68px] w-[68px] rounded-full border-4 shadow-warm transition ${
              color === c.value ? 'scale-110 border-ink' : 'border-linen'
            }`}
            style={{ background: c.value }}
          />
        ))}
        <button
          onClick={undoLast}
          disabled={!canUndo}
          className="min-h-[68px] rounded-3xl border-2 border-cocoa/20 bg-linen px-5 font-sans text-xl font-semibold text-cocoa disabled:opacity-40"
        >
          ↶ Undo
        </button>
        <button
          onClick={startOver}
          className="min-h-[68px] rounded-3xl border-2 border-cocoa/20 bg-linen px-5 font-sans text-xl font-semibold text-cocoa"
        >
          Start over
        </button>
      </div>
    </div>
  );
}
