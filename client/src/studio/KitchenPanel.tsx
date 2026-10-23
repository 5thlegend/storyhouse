// Her Kitchen, family side. Recipes arrive as drafts (from her voice on the
// iPad, a photo of her recipe card, or the classics), and nothing reaches her
// shelf until you've reviewed it, chosen how she cooks it, and pressed Publish.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Care, Ingredient, Recipe, RecipeSource, RecipeStep } from '../types';
import { prepareImage } from './image';

const SOURCE_LABEL: Record<RecipeSource, string> = {
  her_words: 'her words',
  card: 'her card',
  family: 'family',
  classic: 'classic',
  safety: 'safety step',
};

const CARE_LABEL: Record<Exclude<Care, null>, string> = {
  oven_on: '🔥 Oven on',
  stove_on: '🔥 Stove on',
  knife: '🔪 Knife',
  hot: '♨️ Hot',
  heat_off: '✅ Turn off',
};

const ORIGIN_LABEL: Record<Recipe['origin'], string> = {
  her_voice: '🎙️ Told by her',
  card: '📇 From her card',
  classic: '📖 Classic',
};

export function KitchenPanel() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const card = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setRecipes((await api.studio.recipes()).recipes);
  }, []);
  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  async function fromCard(file: File | undefined) {
    if (!file) return;
    setBusy('Reading her card…');
    setNote(null);
    try {
      const img = await prepareImage(file);
      const { recipe } = await api.studio.recipeFromCard(img.blob);
      URL.revokeObjectURL(img.previewUrl);
      await reload();
      setOpenId(recipe.id);
    } catch (err: any) {
      setNote(err?.message ?? 'Could not read that card.');
    } finally {
      setBusy(null);
      if (card.current) card.current.value = '';
    }
  }

  async function classics() {
    setBusy('Adding classics…');
    try {
      const { added } = await api.studio.addClassics();
      await reload();
      setNote(added ? `Added ${added} classic recipe${added === 1 ? '' : 's'} as drafts.` : 'All the classics are already here.');
    } finally {
      setBusy(null);
    }
  }

  const drafts = recipes.filter((r) => r.status === 'draft');
  const shelf = recipes.filter((r) => r.status === 'published');
  const open = recipes.find((r) => r.id === openId) ?? null;

  return (
    <div>
      <div className="card mb-6 font-sans">
        <h2 className="mb-1 font-serif text-2xl text-cocoa">Her Kitchen</h2>
        <p className="mb-4 text-sm text-umber">
          When she taps <strong>“Tell me how you make something”</strong> on her iPad and says yes, her recording
          becomes a draft here. Nothing reaches her shelf until you review it and press Publish. Anything she didn’t
          say is left blank, never made up.
        </p>
        <div className="flex flex-wrap gap-3">
          <input ref={card} type="file" accept="image/*" className="hidden" onChange={(e) => fromCard(e.target.files?.[0])} />
          <button className="btn-primary" disabled={!!busy} onClick={() => card.current?.click()}>
            📇 Add from a recipe card photo
          </button>
          <button className="btn-ghost" disabled={!!busy} onClick={classics}>
            📖 Add classic recipes (vegan)
          </button>
        </div>
        {(busy || note) && <p className="mt-3 text-umber">{busy ?? note}</p>}
      </div>

      {drafts.length > 0 && (
        <List title={`Drafts — not on her shelf yet (${drafts.length})`} recipes={drafts} onOpen={setOpenId} />
      )}
      <List title={`On her shelf (${shelf.length})`} recipes={shelf} onOpen={setOpenId} empty="Nothing on her shelf yet." />

      {open && <RecipeEditor recipe={open} onClose={() => setOpenId(null)} reload={reload} />}
    </div>
  );
}

function List({ title, recipes, onOpen, empty }: { title: string; recipes: Recipe[]; onOpen: (id: string) => void; empty?: string }) {
  return (
    <section className="mb-8">
      <h3 className="mb-3 font-serif text-xl text-cocoa">{title}</h3>
      {recipes.length === 0 && empty && <p className="font-sans text-umber">{empty}</p>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {recipes.map((r) => (
          <button
            key={r.id}
            onClick={() => onOpen(r.id)}
            className="card overflow-hidden p-0 text-left transition hover:-translate-y-0.5 hover:shadow-lamp"
          >
            {r.image_url || r.card_image_url ? (
              <img src={(r.image_url ?? r.card_image_url)!} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center bg-parchment text-5xl" aria-hidden>
                🍽️
              </div>
            )}
            <div className="p-3 font-sans text-sm">
              <p className="truncate font-semibold text-ink">{r.title}</p>
              <p className="text-umber">
                {ORIGIN_LABEL[r.origin]} · {r.cook_mode === 'together' ? 'cook together' : 'on her own'}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function RecipeEditor({ recipe, onClose, reload }: { recipe: Recipe; onClose: () => void; reload: () => Promise<void> }) {
  const [title, setTitle] = useState(recipe.title);
  const [story, setStory] = useState(recipe.story ?? '');
  const [servings, setServings] = useState(recipe.servings ?? '');
  const [ingredients, setIngredients] = useState<Ingredient[]>(recipe.ingredients);
  const [steps, setSteps] = useState<RecipeStep[]>(recipe.steps);
  const [mode, setMode] = useState(recipe.cook_mode);
  const [helper, setHelper] = useState(recipe.helper ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photo = useRef<HTMLInputElement>(null);

  const fields = () => ({
    title: title.trim() || recipe.title,
    story: story.trim() || null,
    servings: servings.trim() || null,
    ingredients: ingredients.filter((i) => i.text.trim()),
    steps: steps.filter((s) => s.text.trim()),
    cook_mode: mode,
    helper: helper.trim() || null,
  });

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  // Editing a line makes it family-provided; a missing amount is shown so it's easy to spot.
  const editIngredient = (i: number, patch: Partial<Ingredient>) =>
    setIngredients((list) => list.map((x, j) => (j === i ? { ...x, ...patch, source: 'family' } : x)));
  const editStep = (i: number, patch: Partial<RecipeStep>, keepSource = false) =>
    setSteps((list) => list.map((x, j) => (j === i ? { ...x, ...patch, source: keepSource ? x.source : 'family' } : x)));
  const moveStep = (i: number, d: number) =>
    setSteps((list) => {
      const n = [...list];
      const [s] = n.splice(i, 1);
      n.splice(Math.max(0, Math.min(n.length, i + d)), 0, s);
      return n;
    });

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/50 p-4 backdrop-blur-sm">
      <div className="card my-4 w-full max-w-5xl font-sans">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-serif text-2xl text-cocoa">
            {recipe.status === 'published' ? 'On her shelf' : 'Draft'} · {ORIGIN_LABEL[recipe.origin]}
          </h2>
          <button className="btn-ghost px-4 py-2" onClick={onClose}>
            Done
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
          {/* What it came from */}
          <div className="flex flex-col gap-4">
            {recipe.her_voice_url && (
              <div className="rounded-2xl bg-cream/70 p-4">
                <p className="mb-2 text-sm font-semibold text-umber">Her recording (kept as she said it)</p>
                <audio controls src={recipe.her_voice_url} className="w-full" />
                {recipe.transcript ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm italic text-ink/80">“{recipe.transcript}”</p>
                ) : (
                  <p className="mt-3 text-sm text-ember">It couldn’t be transcribed. Listen and fill it in below.</p>
                )}
              </div>
            )}
            {recipe.card_image_url && (
              <div className="rounded-2xl bg-cream/70 p-4">
                <p className="mb-2 text-sm font-semibold text-umber">Her card (kept as a keepsake)</p>
                <img src={recipe.card_image_url} alt="Her recipe card" className="w-full rounded-xl" />
              </div>
            )}
            <div className="rounded-2xl bg-cream/70 p-4">
              <p className="mb-2 text-sm font-semibold text-umber">Picture on her shelf</p>
              {recipe.image_url && <img src={recipe.image_url} alt="" className="mb-3 w-full rounded-xl" />}
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost px-4 py-2 text-base" disabled={busy} onClick={() => act(() => api.studio.paintRecipe(recipe.id))}>
                  🎨 Paint one (free Flux)
                </button>
                <input
                  ref={photo}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      act(async () => {
                        const img = await prepareImage(f);
                        await api.studio.recipeImage(recipe.id, img.blob);
                      });
                  }}
                />
                <button className="btn-ghost px-4 py-2 text-base" disabled={busy} onClick={() => photo.current?.click()}>
                  ⬆ Upload a photo
                </button>
              </div>
            </div>
          </div>

          {/* The recipe itself */}
          <div className="flex flex-col gap-4">
            <label className="text-sm text-umber">
              Her name for it
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 block w-full rounded-xl border border-cocoa/20 bg-linen px-3 py-2 text-lg text-ink" />
            </label>
            <label className="text-sm text-umber">
              What she said about it <span className="text-umber/70">(read to her under “Tell me about it”)</span>
              <textarea value={story} onChange={(e) => setStory(e.target.value)} rows={3} className="mt-1 block w-full rounded-xl border border-cocoa/20 bg-linen px-3 py-2 text-ink" />
            </label>
            <label className="text-sm text-umber">
              Makes
              <input value={servings} onChange={(e) => setServings(e.target.value)} placeholder="e.g. one pie" className="mt-1 block w-full rounded-xl border border-cocoa/20 bg-linen px-3 py-2 text-ink" />
            </label>

            <fieldset className="rounded-2xl border border-gold/50 bg-gold/10 p-4">
              <legend className="px-1 text-sm font-semibold text-umber">How she cooks this one</legend>
              <div className="flex flex-col gap-2 text-ink">
                <label className="flex items-start gap-2">
                  <input type="radio" checked={mode === 'together'} onChange={() => setMode('together')} className="mt-1" />
                  <span>
                    <strong>Cook together</strong>: oven, stove, knife and hot steps tell her to ask for help.
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="radio" checked={mode === 'own'} onChange={() => setMode('own')} className="mt-1" />
                  <span>
                    <strong>On her own</strong>: an “oven is on” reminder stays up until the turn-off step, and she checks it’s off at the end.
                  </span>
                </label>
                <label className="text-sm text-umber">
                  Who she should ask
                  <input value={helper} onChange={(e) => setHelper(e.target.value)} placeholder="e.g. Ellie" className="mt-1 block w-full max-w-xs rounded-xl border border-cocoa/20 bg-linen px-3 py-2 text-ink" />
                </label>
              </div>
            </fieldset>

            <div>
              <p className="mb-2 text-sm font-semibold text-umber">Ingredients</p>
              <div className="flex flex-col gap-2">
                {ingredients.map((ing, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <input
                      value={ing.amount ?? ''}
                      onChange={(e) => editIngredient(i, { amount: e.target.value || null })}
                      placeholder={ing.source === 'her_words' ? 'she didn’t say' : 'amount'}
                      className={`w-32 rounded-xl border px-3 py-2 text-ink ${ing.amount ? 'border-cocoa/20 bg-linen' : 'border-ember/40 bg-ember/5'}`}
                    />
                    <input value={ing.text} onChange={(e) => editIngredient(i, { text: e.target.value })} className="min-w-0 flex-1 rounded-xl border border-cocoa/20 bg-linen px-3 py-2 text-ink" />
                    <span className="chip">{SOURCE_LABEL[ing.source]}</span>
                    <button aria-label="Remove ingredient" className="text-ember" onClick={() => setIngredients((l) => l.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  </div>
                ))}
                <button className="self-start text-sm text-cocoa underline" onClick={() => setIngredients((l) => [...l, { text: '', amount: null, source: 'family' }])}>
                  + Add an ingredient
                </button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-umber">Steps (one per screen on her iPad)</p>
              <div className="flex flex-col gap-3">
                {steps.map((st, i) => (
                  <div key={i} className="rounded-2xl border border-cocoa/10 bg-linen p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-2 w-6 text-right font-semibold text-umber">{i + 1}.</span>
                      <textarea value={st.text} onChange={(e) => editStep(i, { text: e.target.value })} rows={2} className="min-w-0 flex-1 rounded-xl border border-cocoa/20 bg-white/60 px-3 py-2 text-ink" />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 pl-8 text-sm">
                      <select
                        value={st.care ?? ''}
                        onChange={(e) => editStep(i, { care: (e.target.value || null) as Care }, true)}
                        className="rounded-xl border border-cocoa/20 bg-white/60 px-2 py-1"
                      >
                        <option value="">No safety note</option>
                        {(Object.keys(CARE_LABEL) as Exclude<Care, null>[]).map((k) => (
                          <option key={k} value={k}>
                            {CARE_LABEL[k]}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-umber">
                        ⏰
                        <input
                          type="number"
                          min={1}
                          value={st.timer_minutes ?? ''}
                          onChange={(e) => editStep(i, { timer_minutes: e.target.value ? Number(e.target.value) : null }, true)}
                          placeholder="min"
                          className="w-20 rounded-xl border border-cocoa/20 bg-white/60 px-2 py-1"
                        />
                      </label>
                      <span className="chip">{SOURCE_LABEL[st.source]}</span>
                      <button className="text-umber" aria-label="Move up" onClick={() => moveStep(i, -1)}>
                        ▲
                      </button>
                      <button className="text-umber" aria-label="Move down" onClick={() => moveStep(i, 1)}>
                        ▼
                      </button>
                      <button className="ml-auto text-ember" aria-label="Remove step" onClick={() => setSteps((l) => l.filter((_, j) => j !== i))}>
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  className="self-start text-sm text-cocoa underline"
                  onClick={() => setSteps((l) => [...l, { text: '', care: null, timer_minutes: null, source: 'family' }])}
                >
                  + Add a step
                </button>
                <p className="text-xs text-umber/80">If the oven or stove is used, a final “turn it off” step is always added.</p>
              </div>
            </div>

            {error && <p className="text-ember">{error}</p>}

            <div className="mt-2 flex flex-wrap gap-3 border-t border-cocoa/10 pt-4">
              <button className="btn-ghost" disabled={busy} onClick={() => act(() => api.studio.updateRecipe(recipe.id, fields()))}>
                Save changes
              </button>
              {recipe.status === 'draft' ? (
                <button className="btn-primary" disabled={busy} onClick={() => act(() => api.studio.updateRecipe(recipe.id, { ...fields(), status: 'published' }))}>
                  🥧 Put it on her shelf
                </button>
              ) : (
                <button className="btn-ghost" disabled={busy} onClick={() => act(() => api.studio.updateRecipe(recipe.id, { status: 'draft' }))}>
                  Take off her shelf
                </button>
              )}
              <button
                className="ml-auto px-3 text-sm text-ember underline"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Delete this recipe for good? Her recording and card photo are deleted too.')) {
                    act(async () => {
                      await api.studio.deleteRecipe(recipe.id);
                      onClose();
                    });
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
