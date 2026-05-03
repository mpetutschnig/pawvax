CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  gemini_token  TEXT,
  gemini_model  TEXT,
  anthropic_token TEXT,
  claude_model  TEXT,
  openai_token  TEXT,
  openai_model  TEXT,
  ai_provider_priority TEXT DEFAULT '["google", "anthropic", "openai"]',
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS animals (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  species    TEXT NOT NULL CHECK(species IN ('dog', 'cat', 'other')),
  breed      TEXT,
  birthdate  TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  is_archived INTEGER DEFAULT 0 NOT NULL
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
  added_by_role  TEXT,
  added_by_account TEXT,
  allowed_roles  TEXT,
  created_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_pages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  image_path  TEXT NOT NULL,
  page_number INTEGER NOT NULL DEFAULT 1
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

CREATE TABLE IF NOT EXISTS animal_public_shares (
  id        TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS animal_transfers (
  code       TEXT PRIMARY KEY,
  animal_id  TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  key_hash      TEXT NOT NULL UNIQUE,
  description   TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_animals_account ON animals(account_id);
CREATE INDEX IF NOT EXISTS idx_tags_animal ON animal_tags(animal_id);
CREATE INDEX IF NOT EXISTS idx_tags_active ON animal_tags(tag_id, active);
CREATE INDEX IF NOT EXISTS idx_documents_animal ON documents(animal_id);
CREATE INDEX IF NOT EXISTS idx_document_pages_doc ON document_pages(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_account ON audit_log(account_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_sharing_animal ON animal_sharing(animal_id);
CREATE INDEX IF NOT EXISTS idx_public_shares_animal ON animal_public_shares(animal_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
