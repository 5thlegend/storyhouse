-- The Art Studio. Pictures now belong to a collection:
--   album    — her photo album (family photos, family art, labeled AI art)
--   coloring — the coloring library: pages the family made ahead (e.g. on
--              Higgsfield Unlimited) plus pages Flux drew for her on the spot
--   her_art  — what she painted herself, kept for the family to see
ALTER TABLE photos ADD COLUMN collection TEXT NOT NULL DEFAULT 'album';
CREATE INDEX IF NOT EXISTS idx_photos_collection ON photos(collection, status);

-- One row per picture drawn on the spot, so the free daily AI allowance is
-- never used up by accident (a gentle daily cap, not a visible limit to her).
CREATE TABLE IF NOT EXISTS art_generations (
  id         TEXT PRIMARY KEY,
  device_id  TEXT,
  idea       TEXT NOT NULL,
  photo_id   TEXT REFERENCES photos(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artgen_created ON art_generations(created_at);
