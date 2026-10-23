// "Draw, and I'll paint it." She draws with her finger on a big blank page;
// Flux 2 turns the drawing into a painting with the same subject and layout.
// Her own drawing is kept too ("Made by Grandma"), next to the painting
// ("Art made with AI by Grandma").

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { api } from '../api';
import type { Painting } from '../types';
import { COLORS } from './ColoringCanvas';
import { useListen } from './useListen';
import { speak } from './voice';

const SIZE = 1024; // drawing resolution
const SEND = 448; // Flux 2 reference images must be under 512×512
const MAX_UNDO = 15;

const BIG = 'min-h-[72px] rounded-3xl px-7 font-sans text-2xl font-semibold shadow-warm';
const DARK = `${BIG} bg-cocoa text-linen`;
const LIGHT = `${BIG} border-2 border-cocoa/20 bg-linen text-cocoa`;

const PENS = [{ name: 'Black', value: '#2c2016' }, ...COLORS];

type Step = 'draw' | 'painting' | 'result' | 'kept';

export function DrawAndPaint({ canPaint, onKept }: { canPaint: boolean; onKept: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const undo = useRef<ImageData[]>([]);
  const last = useRef<[number, number] | null>(null);
  const [fit, setFit] = useState(0);
  const [pen, setPen] = useState(PENS[0].value);
  const [thick, setThick] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [blank, setBlank] = useState(true);
  const [said, setSaid] = useState('');
  const [step, setStep] = useState<Step>('draw');
  const [painting, setPainting] = useState<Painting | null>(null);
  const [drawingUrl, setDrawingUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const listen = useListen((text) => {
    setSaid(text);
    if (text) speak(`A ${text}. Lovely.`);
  });

  useEffect(() => {
    const c = canvas.current!;
    c.width = SIZE;
    c.height = SIZE;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SIZE, SIZE);
    speak('Draw anything you like with your finger. When you are done, I will paint it.');
  }, []);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFit(Math.min(el.clientWidth, el.clientHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ctx = () => canvas.current!.getContext('2d', { willReadFrequently: true })!;

  function point(e: PointerEvent): [number, number] {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * SIZE, ((e.clientY - r.top) / r.height) * SIZE];
  }

  function stroke(from: [number, number], to: [number, number]) {
    const c = ctx();
    c.strokeStyle = pen;
    c.fillStyle = pen;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = thick ? 26 : 12;
    c.beginPath();
    c.moveTo(from[0], from[1]);
    c.lineTo(to[0], to[1]);
    c.stroke();
  }

  function down(e: PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const c = ctx();
    undo.current.push(c.getImageData(0, 0, SIZE, SIZE));
    if (undo.current.length > MAX_UNDO) undo.current.shift();
    setCanUndo(true);
    const p = point(e);
    last.current = p;
    stroke(p, [p[0] + 0.1, p[1] + 0.1]); // a tap makes a dot
    setBlank(false);
  }

  function move(e: PointerEvent) {
    if (!last.current) return;
    const p = point(e);
    stroke(last.current, p);
    last.current = p;
  }

  function up() {
    last.current = null;
  }

  function undoLast() {
    const prev = undo.current.pop();
    if (prev) ctx().putImageData(prev, 0, 0);
    setCanUndo(undo.current.length > 0);
  }

  function startOver() {
    const c = ctx();
    undo.current.push(c.getImageData(0, 0, SIZE, SIZE));
    setCanUndo(true);
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, SIZE, SIZE);
    setBlank(true);
  }

  function snapshot(size: number, type: 'image/png' | 'image/jpeg'): Promise<Blob> {
    const out = document.createElement('canvas');
    out.width = size;
    out.height = size;
    out.getContext('2d')!.drawImage(canvas.current!, 0, 0, size, size);
    return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), type, 0.9));
  }

  async function paint() {
    setNote(null);
    setStep('painting');
    speak('Painting your picture.');
    setDrawingUrl(canvas.current!.toDataURL('image/jpeg', 0.8));
    let p: Painting | null = null;
    try {
      p = (await api.paintDrawing(await snapshot(SEND, 'image/png'), said)).painting;
    } catch {
      p = null;
    }
    if (p) {
      setPainting(p);
      setStep('result');
      speak('Here is your painting.');
    } else {
      setStep('draw');
      setNote('Let’s try painting it again in a little while. Your drawing is still here.');
    }
  }

  async function keepBoth() {
    if (!painting) return;
    const caption = said ? said[0].toUpperCase() + said.slice(1) : 'My drawing';
    try {
      await api.saveHerArt(await snapshot(SIZE, 'image/jpeg'), { width: SIZE, height: SIZE, caption });
      await api.keepPainting(painting.key, caption);
      setStep('kept');
      speak('Lovely. Your drawing and your painting are saved, and your family can see them.');
      onKept();
    } catch {
      setNote('Let’s try keeping it again.');
    }
  }

  function backToDrawing() {
    if (painting) api.discardPainting(painting.key).catch(() => {});
    setPainting(null);
    setStep('draw');
  }

  function newDrawing() {
    setPainting(null);
    setSaid('');
    startOver();
    undo.current = [];
    setCanUndo(false);
    setStep('draw');
  }

  return (
    <div className="flex h-full flex-col">
      {/* The drawing page stays mounted so her drawing is never lost. */}
      <div className={step === 'draw' ? 'flex min-h-0 flex-1 flex-col gap-3' : 'hidden'}>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {listen.state === 'listening' ? (
            <button onClick={listen.stop} className={DARK}>
              ✓ That’s it
            </button>
          ) : (
            <button onClick={listen.start} className={LIGHT} disabled={listen.state === 'thinking'}>
              {listen.state === 'thinking' ? 'Listening…' : said ? `🎙️ “${said}”` : '🎙️ Tell me what it is'}
            </button>
          )}
          <button onClick={paint} disabled={blank || !canPaint} className={`${DARK} disabled:opacity-40`}>
            ✨ Paint it
          </button>
        </div>
        {!canPaint && <p className="text-center font-sans text-xl text-umber">Painting rests until tomorrow, but you can keep drawing!</p>}
        {note && <p className="text-center font-sans text-xl text-umber">{note}</p>}
        <div ref={box} className="flex min-h-0 flex-1 items-center justify-center">
          <canvas
            ref={canvas}
            className="touch-none rounded-3xl bg-white shadow-warm"
            style={{ width: fit || '100%', height: fit || 'auto' }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pb-2">
          {PENS.map((p) => (
            <button
              key={p.value}
              aria-label={p.name}
              aria-pressed={pen === p.value}
              onClick={() => setPen(p.value)}
              className={`h-[60px] w-[60px] rounded-full border-4 shadow-warm transition ${pen === p.value ? 'scale-110 border-gold' : 'border-linen'}`}
              style={{ background: p.value }}
            />
          ))}
          <button onClick={() => setThick((t) => !t)} className={`${LIGHT} min-h-[60px] px-5 text-xl`}>
            {thick ? '● Thick' : '• Thin'}
          </button>
          <button onClick={undoLast} disabled={!canUndo} className={`${LIGHT} min-h-[60px] px-5 text-xl disabled:opacity-40`}>
            ↶ Undo
          </button>
          <button onClick={startOver} className={`${LIGHT} min-h-[60px] px-5 text-xl`}>
            Start over
          </button>
        </div>
      </div>

      {step === 'painting' && (
        <div className="flex flex-col items-center gap-6 pt-10 text-center">
          {drawingUrl && <img src={drawingUrl} alt="Your drawing" className="h-48 w-48 rounded-2xl border border-cocoa/10 bg-white" />}
          <div className="h-20 w-20 animate-pulse rounded-full bg-gold/60" aria-hidden />
          <p className="font-serif text-4xl text-cocoa">Painting your picture…</p>
        </div>
      )}

      {step === 'result' && painting && (
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex flex-wrap items-end justify-center gap-6">
            <figure className="flex flex-col items-center gap-2">
              {drawingUrl && <img src={drawingUrl} alt="Your drawing" className="h-[34vh] max-h-80 rounded-3xl border border-cocoa/10 bg-white shadow-warm" />}
              <figcaption className="font-sans text-xl text-umber">Your drawing</figcaption>
            </figure>
            <span className="pb-16 text-5xl text-gold" aria-hidden>
              →
            </span>
            <figure className="flex flex-col items-center gap-2">
              <img src={painting.url} alt="The painting" className="h-[34vh] max-h-80 rounded-3xl shadow-warm" />
              <figcaption className="font-sans text-xl text-umber">Painted with AI from your drawing</figcaption>
            </figure>
          </div>
          {note && <p className="font-sans text-xl text-umber">{note}</p>}
          <div className="flex flex-wrap justify-center gap-4">
            <button onClick={keepBoth} className={DARK}>
              ✓ Keep both
            </button>
            <button onClick={backToDrawing} className={LIGHT}>
              ‹ Back to my drawing
            </button>
          </div>
        </div>
      )}

      {step === 'kept' && painting && (
        <div className="flex flex-col items-center gap-5 text-center">
          <img src={painting.url} alt="Your painting" className="max-h-[48vh] rounded-3xl shadow-warm" />
          <p className="font-serif text-4xl text-cocoa">Lovely! Both are saved.</p>
          <p className="font-sans text-2xl text-umber">Your family can see them.</p>
          <button onClick={newDrawing} className={DARK}>
            Draw another
          </button>
        </div>
      )}
    </div>
  );
}
