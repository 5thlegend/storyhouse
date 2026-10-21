-- Grandma's House: the photo album, the people in it, her paired iPad, and the
-- Today card. Media bytes live in R2; these tables hold only keys + metadata.

-- The people she sees in photos. A name is what SHE calls them ("Danny").
-- intro_audio_key is a recording made BY that real person (or a relative who
-- says who recorded it). Storyhouse never synthesizes a relative's voice.
CREATE TABLE IF NOT EXISTS people (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  relation          TEXT,                 -- "your grandson"
  intro_audio_key   TEXT,
  intro_audio_mime  TEXT,
  intro_recorded_by TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

-- One picture in her album: a real family photo, family-made art, or AI art.
-- AI art always carries is_ai_generated = 1, made_by, and a visible label.
CREATE TABLE IF NOT EXISTS photos (
  id              TEXT PRIMARY KEY,
  image_key       TEXT NOT NULL,
  image_mime      TEXT NOT NULL DEFAULT 'image/jpeg',
  width           INTEGER,
  height          INTEGER,
  kind            TEXT NOT NULL DEFAULT 'photo',   -- photo | family_art | ai_art
  caption         TEXT NOT NULL DEFAULT '',
  when_text       TEXT,                            -- as the family describes it: "Summer 1962"
  made_by         TEXT,                            -- who made it (required for art)
  is_ai_generated INTEGER NOT NULL DEFAULT 0,
  voice_key       TEXT,                            -- a family member's recorded caption
  voice_mime      TEXT,
  voice_by        TEXT,                            -- who recorded it, shown to her
  status          TEXT NOT NULL DEFAULT 'draft',   -- draft | published
  created_by      TEXT NOT NULL DEFAULT 'studio',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  published_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_photos_status ON photos(status, published_at);

-- "Tap a face to hear who it is." Positions are fractions (0–1) of the image.
CREATE TABLE IF NOT EXISTS photo_faces (
  id         TEXT PRIMARY KEY,
  photo_id   TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  person_id  TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  x          REAL NOT NULL,
  y          REAL NOT NULL,
  r          REAL NOT NULL DEFAULT 0.08,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_faces_photo ON photo_faces(photo_id);

-- Her paired iPad(s). Only a SHA-256 of the device token is stored, so a
-- database leak can't be replayed as her device. Revoking is instant.
CREATE TABLE IF NOT EXISTS devices (
  id           TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at   TEXT
);

-- One-time pairing codes, created in the Family Studio, typed once on her iPad.
CREATE TABLE IF NOT EXISTS pairing_codes (
  code_hash  TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL
);

-- The Today card: who's visiting, a gentle note. Keyed by her local date.
CREATE TABLE IF NOT EXISTS today_notes (
  date       TEXT PRIMARY KEY,                -- YYYY-MM-DD
  visitors   TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

-- Failed passcode attempts, to slow down guessing on a public URL.
CREATE TABLE IF NOT EXISTS login_attempts (
  id         TEXT PRIMARY KEY,
  ip         TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_ip ON login_attempts(ip, created_at);
