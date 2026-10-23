-- The Kitchen: her recipes, told in her own voice or read from her handwritten
-- cards, reviewed by family before they reach her iPad.
CREATE TABLE IF NOT EXISTS recipes (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,                 -- her name for it ("Mom's Sunday peach pie")
  origin          TEXT NOT NULL,                 -- her_voice | card | classic
  status          TEXT NOT NULL DEFAULT 'draft', -- draft | published
  story           TEXT,                          -- what she shared about it, in her words
  transcript      TEXT,                          -- immutable: everything she said when she told it
  her_voice_key   TEXT,                          -- her own recording of telling it
  her_voice_mime  TEXT,
  card_image_key  TEXT,                          -- photo of the handwritten card (a keepsake)
  image_key       TEXT,                          -- a picture of the dish
  servings        TEXT,
  -- [{ text, amount, source }] — source: her_words | card | family | classic
  ingredients     TEXT NOT NULL DEFAULT '[]',
  -- [{ text, care, timer_minutes, source }] — care: oven_on | stove_on | knife | hot | heat_off | null
  steps           TEXT NOT NULL DEFAULT '[]',
  cook_mode       TEXT NOT NULL DEFAULT 'together', -- together | own (set per recipe by family)
  helper          TEXT,                          -- who she should ask for help ("Ellie")
  memory_id       TEXT REFERENCES memories(id) ON DELETE SET NULL,
  created_by      TEXT NOT NULL DEFAULT 'studio',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  published_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status, published_at);
