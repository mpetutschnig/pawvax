CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS animals (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  species    TEXT NOT NULL CHECK(species IN ('dog', 'cat', 'other')),
  breed      TEXT,
  birthdate  TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS animal_tags (
  tag_id    TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  tag_type  TEXT NOT NULL CHECK(tag_type IN ('barcode', 'nfc')),
  active    INTEGER NOT NULL DEFAULT 1,
  added_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id             TEXT PRIMARY KEY,
  animal_id      TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  doc_type       TEXT NOT NULL DEFAULT 'other' CHECK(doc_type IN ('vaccination', 'medication', 'other')),
  image_path     TEXT NOT NULL,
  extracted_json TEXT NOT NULL,
  ocr_provider   TEXT,
  created_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id           TEXT PRIMARY KEY,
  account_id   TEXT REFERENCES accounts(id),
  account_role TEXT,
  action       TEXT NOT NULL,
  resource     TEXT NOT NULL,
  resource_id  TEXT NOT NULL,
  details      TEXT,
  ip_address   TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS animal_sharing (
  id                TEXT PRIMARY KEY,
  animal_id         TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK(role IN ('readonly', 'authority', 'vet')),
  share_vaccination INTEGER NOT NULL DEFAULT 1,
  share_medication  INTEGER NOT NULL DEFAULT 0,
  share_other_docs  INTEGER NOT NULL DEFAULT 0,
  share_contact     INTEGER NOT NULL DEFAULT 0,
  share_breed       INTEGER NOT NULL DEFAULT 1,
  share_birthdate   INTEGER NOT NULL DEFAULT 1,
  UNIQUE(animal_id, role)
);

CREATE INDEX IF NOT EXISTS idx_animals_account ON animals(account_id);
CREATE INDEX IF NOT EXISTS idx_tags_animal ON animal_tags(animal_id);
CREATE INDEX IF NOT EXISTS idx_tags_active ON animal_tags(tag_id, active);
CREATE INDEX IF NOT EXISTS idx_documents_animal ON documents(animal_id);
CREATE INDEX IF NOT EXISTS idx_audit_account ON audit_log(account_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_sharing_animal ON animal_sharing(animal_id);
