// Her Kitchen. Remembering and cooking, at her pace.
//   • "Tell me how you make it": she talks; family turns it into a recipe.
//   • Each recipe: "Tell me about it", "What I need", "Let's cook it".
//   • Guided cooking: one step per screen, read aloud. Safety follows what the
//     family chose for that recipe: "cook together" asks her to get help for
//     heat and knife steps; "on her own" keeps an "oven is on" reminder up until
//     the turn-off step, and every heated recipe ends with "Is everything off?".
// No quizzes, no fail states, Home always top-left.

import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Recipe, RecipeStep } from '../types';
import { pickMime } from '../studio/VoiceRecorder';
import { prepareImage } from '../studio/image';
import { playRecording, speak, stopAll } from './voice';

type Screen =
  | { name: 'shelf' }
  | { name: 'tell' }
  | { name: 'recipe'; recipe: Recipe }
  | { name: 'about'; recipe: Recipe }
  | { name: 'gather'; recipe: Recipe }
  | { name: 'cook'; recipe: Recipe; step: number }
  | { name: 'finish'; recipe: Recipe }
  | { name: 'photo'; recipe: Recipe };

const BIG = 'min-h-[72px] rounded-3xl px-7 font-sans text-2xl font-semibold shadow-warm';
const DARK = `${BIG} bg-cocoa text-linen`;
const LIGHT = `${BIG} border-2 border-cocoa/20 bg-linen text-cocoa`;

const HELP_CARE = new Set(['oven_on', 'stove_on', 'knife', 'hot']);

function usesHeat(r: Recipe): 'oven' | 'stove' | null {
  if (r.steps.some((s) => s.care === 'oven_on')) return 'oven';
  if (r.steps.some((s) => s.care === 'stove_on')) return 'stove';
  return null;
}

/** A soft two-note chime for "it's time". */
function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.35);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.35 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.35 + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.35);
      o.stop(ctx.currentTime + i * 0.35 + 0.65);
    });
  } catch {
    /* sound is a nicety */
  }
}

export function Kitchen({ onHome }: { onHome: () => void }) {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'shelf' });
  // A gentle reminder she asked for ("tell me in 45 minutes"). No countdown on screen.
  const [reminder, setReminder] = useState<{ at: number; what: string } | null>(null);
  const [due, setDue] = useState<string | null>(null);

  useEffect(() => {
    api
      .kitchen()
      .then((r) => setRecipes(r.recipes))
      .catch(() => setRecipes((r) => r ?? []));
  }, []);

  useEffect(() => {
    if (!reminder) return;
    const id = window.setInterval(() => {
      if (Date.now() >= reminder.at) {
        setDue(reminder.what);
        setReminder(null);
        chime();
        speak(`It's time. ${reminder.what}`);
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [reminder]);

  useEffect(() => () => stopAll(), []);

  const back = () => {
    stopAll();
    setScreen({ name: 'shelf' });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-4">
        <button
          onClick={() => {
            stopAll();
            if (screen.name === 'shelf') onHome();
            else if (screen.name === 'cook' || screen.name === 'gather' || screen.name === 'about')
              setScreen({ name: 'recipe', recipe: screen.recipe });
            else back();
          }}
          className={DARK}
        >
          {screen.name === 'shelf' ? '🏠 Home' : '‹ Back'}
        </button>
        <h1 className="font-serif text-4xl text-cocoa sm:text-5xl">Kitchen</h1>
        <span className="w-[120px]" aria-hidden />
      </div>

      {reminder && (
        <div className="mx-5 mt-3 rounded-2xl bg-gold/20 px-5 py-3 font-sans text-2xl text-ink">
          ⏰ I’ll tell you when it’s time.
        </div>
      )}
      {due && (
        <div className="mx-5 mt-3 flex items-center justify-between gap-4 rounded-2xl bg-ember px-5 py-4 font-sans text-2xl font-semibold text-linen">
          <span>⏰ It’s time! {due}</span>
          <button onClick={() => setDue(null)} className="rounded-2xl bg-linen px-5 py-2 text-cocoa">
            OK
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-4">
        {screen.name === 'shelf' && recipes && (
          <Shelf recipes={recipes} onOpen={(recipe) => setScreen({ name: 'recipe', recipe })} onTell={() => setScreen({ name: 'tell' })} />
        )}
        {screen.name === 'tell' && <Tell onDone={back} />}
        {screen.name === 'recipe' && (
          <RecipeHome
            recipe={screen.recipe}
            onAbout={() => setScreen({ name: 'about', recipe: screen.recipe })}
            onGather={() => setScreen({ name: 'gather', recipe: screen.recipe })}
            onCook={() => setScreen({ name: 'cook', recipe: screen.recipe, step: 0 })}
          />
        )}
        {screen.name === 'about' && <About recipe={screen.recipe} />}
        {screen.name === 'gather' && (
          <Gather recipe={screen.recipe} onCook={() => setScreen({ name: 'cook', recipe: screen.recipe, step: 0 })} />
        )}
        {screen.name === 'cook' && (
          <Cook
            recipe={screen.recipe}
            index={screen.step}
            onGo={(step) =>
              step >= screen.recipe.steps.length
                ? setScreen({ name: 'finish', recipe: screen.recipe })
                : setScreen({ name: 'cook', recipe: screen.recipe, step: Math.max(0, step) })
            }
            onRemind={(minutes, what) => setReminder({ at: Date.now() + minutes * 60_000, what })}
          />
        )}
        {screen.name === 'finish' && (
          <Finish recipe={screen.recipe} onPhoto={() => setScreen({ name: 'photo', recipe: screen.recipe })} onDone={back} />
        )}
        {screen.name === 'photo' && <Photo recipe={screen.recipe} onDone={back} />}
      </div>
    </div>
  );
}

function Shelf({ recipes, onOpen, onTell }: { recipes: Recipe[]; onOpen: (r: Recipe) => void; onTell: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <button
        onClick={onTell}
        className="flex aspect-square flex-col items-center justify-center gap-3 rounded-3xl border-4 border-dashed border-gold bg-gold/10 p-4 text-center"
      >
        <span className="text-6xl" aria-hidden>
          🎙️
        </span>
        <span className="font-serif text-3xl text-cocoa">Tell me how you make something</span>
      </button>
      {recipes.map((r) => (
        <button key={r.id} onClick={() => onOpen(r)} className="overflow-hidden rounded-3xl border border-cocoa/10 bg-linen text-left shadow-warm">
          {r.image_url ? (
            <img src={r.image_url} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center bg-parchment text-7xl" aria-hidden>
              🍽️
            </div>
          )}
          <span className="block px-4 pt-3 font-serif text-2xl text-ink">{r.title}</span>
          <span className="block px-4 pb-3 font-sans text-lg text-umber">
            {r.origin === 'classic' ? 'A classic recipe' : 'Your recipe'}
          </span>
        </button>
      ))}
    </div>
  );
}

function RecipeHome({ recipe, onAbout, onGather, onCook }: { recipe: Recipe; onAbout: () => void; onGather: () => void; onCook: () => void }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
      {recipe.image_url && <img src={recipe.image_url} alt="" className="max-h-[38vh] rounded-3xl shadow-warm" />}
      <div>
        <h2 className="font-serif text-5xl text-cocoa">{recipe.title}</h2>
        <p className="mt-1 font-sans text-xl text-umber">
          {recipe.origin === 'classic' ? 'A classic recipe — not one of yours' : 'Your recipe'}
          {recipe.servings ? ` · ${recipe.servings}` : ''}
        </p>
      </div>
      <div className="grid w-full gap-4 sm:grid-cols-3">
        {recipe.origin !== 'classic' && (
          <button onClick={onAbout} className={LIGHT}>
            💬 Tell me about it
          </button>
        )}
        <button onClick={onGather} className={LIGHT}>
          🧺 What I need
        </button>
        <button onClick={onCook} className={DARK}>
          🍳 Let’s cook it
        </button>
      </div>
    </div>
  );
}

function About({ recipe }: { recipe: Recipe }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (recipe.story) speak(recipe.story);
  }, [recipe.story]);
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
      <h2 className="font-serif text-4xl text-cocoa">{recipe.title}</h2>
      {recipe.story ? (
        <blockquote className="font-serif text-3xl italic leading-relaxed text-ink">“{recipe.story}”</blockquote>
      ) : (
        <p className="font-serif text-3xl text-umber">Tell me about it — I’d love to hear.</p>
      )}
      {recipe.her_voice_url && (
        <button
          onClick={async () => {
            if (playing) {
              stopAll();
              setPlaying(false);
              return;
            }
            setPlaying(true);
            await playRecording(recipe.her_voice_url!);
            setPlaying(false);
          }}
          className={DARK}
        >
          {playing ? '■ Stop' : '▶ Hear when you told us'}
        </button>
      )}
    </div>
  );
}

function Gather({ recipe, onCook }: { recipe: Recipe; onCook: () => void }) {
  const [have, setHave] = useState<Set<number>>(new Set());
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h2 className="font-serif text-4xl text-cocoa">What you need</h2>
      {recipe.ingredients.map((ing, i) => {
        const on = have.has(i);
        return (
          <button
            key={i}
            onClick={() =>
              setHave((h) => {
                const n = new Set(h);
                n.has(i) ? n.delete(i) : n.add(i);
                return n;
              })
            }
            className={`flex min-h-[76px] items-center gap-5 rounded-3xl border-2 px-6 text-left font-sans text-2xl ${
              on ? 'border-sage bg-sage/15 text-umber' : 'border-cocoa/15 bg-linen text-ink'
            }`}
          >
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-4 text-3xl ${
                on ? 'border-sage bg-sage text-linen' : 'border-cocoa/30'
              }`}
              aria-hidden
            >
              {on ? '✓' : ''}
            </span>
            <span>
              {ing.amount ? <strong>{ing.amount} </strong> : null}
              {ing.text}
            </span>
          </button>
        );
      })}
      <button onClick={onCook} className={`${DARK} mt-2 self-center`}>
        🍳 Let’s cook it
      </button>
    </div>
  );
}

function Cook({
  recipe,
  index,
  onGo,
  onRemind,
}: {
  recipe: Recipe;
  index: number;
  onGo: (step: number) => void;
  onRemind: (minutes: number, what: string) => void;
}) {
  const step: RecipeStep = recipe.steps[index];
  const together = recipe.cook_mode === 'together';
  const helper = recipe.helper?.trim() || 'someone in your family';
  // On her own: once the heat is on, keep saying so until the turn-off step is done.
  const heatOn = recipe.steps.slice(0, index).some((s) => s.care === 'oven_on' || s.care === 'stove_on') &&
    !recipe.steps.slice(0, index).some((s) => s.care === 'heat_off');
  const heatWord = usesHeat(recipe);
  const [reminded, setReminded] = useState(false);
  const said = useRef('');

  const words = step ? `${step.text}${together && step.care && HELP_CARE.has(step.care) ? ` Please ask ${helper} to help with this step.` : ''}` : '';

  useEffect(() => {
    setReminded(false);
    if (words && said.current !== `${index}:${words}`) {
      said.current = `${index}:${words}`;
      speak(words);
    }
  }, [index, words]);

  if (!step) return null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {!together && heatOn && heatWord && (
        <div className="rounded-2xl bg-ember/15 px-5 py-3 font-sans text-2xl font-semibold text-ember">
          🔥 The {heatWord} is on.
        </div>
      )}
      <p className="font-sans text-xl text-umber">
        Step {index + 1} of {recipe.steps.length}
      </p>
      <p className={`font-serif leading-snug text-ink ${step.care === 'heat_off' ? 'text-6xl font-bold' : 'text-5xl'}`}>
        {step.text}
      </p>
      {together && step.care && HELP_CARE.has(step.care) && (
        <div className="rounded-3xl border-4 border-gold bg-gold/15 px-6 py-5 font-sans text-3xl font-semibold text-ink">
          🤝 Please ask {helper} to help with this step.
        </div>
      )}
      {step.timer_minutes && !reminded && (
        <button
          onClick={() => {
            onRemind(step.timer_minutes!, recipe.steps[index + 1]?.text ?? 'Check on it.');
            setReminded(true);
          }}
          className={`${LIGHT} self-start`}
        >
          ⏰ Remind me in {step.timer_minutes} minutes
        </button>
      )}
      <div className="mt-4 flex flex-wrap gap-4">
        {index > 0 && (
          <button onClick={() => onGo(index - 1)} className={LIGHT}>
            ◀ Back
          </button>
        )}
        <button onClick={() => speak(words)} className={LIGHT}>
          🔊 Say it again
        </button>
        <button onClick={() => onGo(index + 1)} className={`${DARK} ml-auto`}>
          {step.care === 'heat_off' ? 'Done, it’s off ✓' : 'Done, next ▶'}
        </button>
      </div>
    </div>
  );
}

function Finish({ recipe, onPhoto, onDone }: { recipe: Recipe; onPhoto: () => void; onDone: () => void }) {
  const heat = usesHeat(recipe);
  const [checked, setChecked] = useState(!heat);
  useEffect(() => {
    speak(heat ? `Before we finish: is the ${heat} turned off?` : 'All done! Well done.');
  }, [heat]);

  if (!checked && heat) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <p className="font-serif text-5xl text-cocoa">Is the {heat} turned off?</p>
        {recipe.cook_mode === 'together' && (
          <p className="font-sans text-2xl text-umber">Ask {recipe.helper?.trim() || 'someone in your family'} to check with you.</p>
        )}
        <button onClick={() => setChecked(true)} className={DARK}>
          ✓ Yes, the {heat} is off
        </button>
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
      <p className="text-7xl" aria-hidden>
        🎉
      </p>
      <p className="font-serif text-5xl text-cocoa">All done! It looks wonderful.</p>
      <div className="flex flex-wrap justify-center gap-4">
        <button onClick={onPhoto} className={DARK}>
          📷 Take a picture of it
        </button>
        <button onClick={onDone} className={LIGHT}>
          Back to my kitchen
        </button>
      </div>
    </div>
  );
}

function Photo({ recipe, onDone }: { recipe: Recipe; onDone: () => void }) {
  const [state, setState] = useState<'pick' | 'saving' | 'saved' | 'retry'>('pick');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.click();
  }, []);

  async function save(file: File | undefined) {
    if (!file) return;
    setState('saving');
    try {
      const img = await prepareImage(file);
      await api.cookedPhoto(recipe.id, img.blob, { width: img.width, height: img.height });
      URL.revokeObjectURL(img.previewUrl);
      setState('saved');
      speak('Your family can see it in your photo album.');
    } catch {
      setState('retry');
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => save(e.target.files?.[0])} />
      {state === 'saved' ? (
        <>
          <p className="font-serif text-5xl text-cocoa">Lovely! It’s in your photo album.</p>
          <p className="font-sans text-2xl text-umber">Your family can see it.</p>
          <button onClick={onDone} className={DARK}>
            Back to my kitchen
          </button>
        </>
      ) : (
        <>
          <p className="font-serif text-4xl text-cocoa">{state === 'saving' ? 'Saving your picture…' : 'Take a picture of it'}</p>
          {state !== 'saving' && (
            <div className="flex flex-wrap justify-center gap-4">
              <button onClick={() => input.current?.click()} className={DARK}>
                📷 {state === 'retry' ? 'Try again' : 'Open the camera'}
              </button>
              <button onClick={onDone} className={LIGHT}>
                Not now
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** "Tell me how you make it." She talks; nothing is kept unless she says yes. */
function Tell({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<'ready' | 'listening' | 'ask' | 'saving' | 'thanks' | 'nomic'>('ready');
  const recorder = useRef<MediaRecorder | null>(null);
  const take = useRef<Blob | null>(null);

  useEffect(() => {
    speak('Tap the big button, and tell me how you make it. Take your time.');
    return () => recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    stopAll();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        take.current = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/mp4' });
        setState('ask');
        speak('Thank you. Shall I keep this for your family?');
      };
      rec.start();
      recorder.current = rec;
      setState('listening');
    } catch {
      setState('nomic');
    }
  }

  async function keep() {
    if (!take.current) return;
    setState('saving');
    try {
      await api.tellRecipe(take.current);
    } catch {
      /* the family can ask her again; she never sees an error */
    }
    setState('thanks');
    speak('Thank you! Your family will add it to your kitchen.');
  }

  return (
    <div className="flex flex-col items-center gap-8 pt-6 text-center">
      {state === 'ready' && (
        <>
          <p className="font-serif text-4xl text-cocoa">Tell me how you make something you love to cook.</p>
          <button onClick={start} className="flex h-48 w-48 items-center justify-center rounded-full bg-ember text-8xl text-linen shadow-warm" aria-label="Start telling">
            🎙️
          </button>
          <p className="font-sans text-2xl text-umber">Tap the button, then just talk. Take your time.</p>
        </>
      )}
      {state === 'listening' && (
        <>
          <p className="font-serif text-4xl text-cocoa">I’m listening…</p>
          <div className="h-32 w-32 animate-pulse rounded-full bg-ember/70" aria-hidden />
          <button onClick={() => recorder.current?.stop()} className={DARK}>
            ✓ I’m finished
          </button>
        </>
      )}
      {state === 'ask' && (
        <>
          <p className="font-serif text-4xl text-cocoa">Shall I keep this for your family?</p>
          <div className="flex flex-wrap justify-center gap-4">
            <button onClick={keep} className={DARK}>
              Yes, keep it
            </button>
            <button onClick={onDone} className={LIGHT}>
              Not this time
            </button>
          </div>
        </>
      )}
      {state === 'saving' && <p className="font-serif text-4xl text-cocoa">Keeping it safe…</p>}
      {state === 'thanks' && (
        <>
          <p className="font-serif text-4xl text-cocoa">Thank you! Your family will add it to your kitchen.</p>
          <button onClick={onDone} className={DARK}>
            Back to my kitchen
          </button>
        </>
      )}
      {state === 'nomic' && (
        <>
          <p className="font-serif text-3xl text-cocoa">Let’s do this together with your family another time.</p>
          <button onClick={onDone} className={DARK}>
            Back to my kitchen
          </button>
        </>
      )}
    </div>
  );
}
