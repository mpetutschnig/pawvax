CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_verification_required INTEGER NOT NULL DEFAULT 0,
  email_verified_at TEXT,
  role          TEXT NOT NULL DEFAULT 'user',
  verified      INTEGER NOT NULL DEFAULT 0,
  verification_status TEXT NOT NULL DEFAULT 'none',
  verification_note TEXT,
  gemini_token  TEXT,
  gemini_model  TEXT DEFAULT 'gemini-3.1-flash-lite-preview',
  anthropic_token TEXT,
  claude_model  TEXT DEFAULT 'claude-3-5-sonnet-20241022',
  openai_token  TEXT,
  openai_model  TEXT DEFAULT 'gpt-4o-mini',
  ai_provider_priority TEXT DEFAULT '["google", "anthropic", "openai"]',
  created_at    TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS animals (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  species    TEXT NOT NULL CHECK(species IN ('dog', 'cat', 'other')),
  breed      TEXT,
  birthdate  TEXT,
  address    TEXT,
  dynamic_fields TEXT DEFAULT '{}',
  avatar_path TEXT,
  unique_id  TEXT UNIQUE,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  is_archived INTEGER DEFAULT 0 NOT NULL,
  archive_reason TEXT CHECK(archive_reason IN ('verstorben', 'verloren', 'verkauft', 'abgegeben', 'sonstiges')),
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS animal_tags (
  tag_id    TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  tag_type  TEXT NOT NULL CHECK(tag_type IN ('barcode', 'nfc', 'chip')),
  active    INTEGER NOT NULL DEFAULT 1,
  added_at  TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS documents (
  id             TEXT PRIMARY KEY,
  animal_id      TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  doc_type       TEXT NOT NULL DEFAULT 'general' CHECK(doc_type IN ('vaccination', 'pedigree', 'dog_certificate', 'medical_product', 'treatment', 'pet_passport', 'general')),
  image_path     TEXT NOT NULL,
  extracted_json TEXT NOT NULL,
  ocr_provider   TEXT,
  added_by_role  TEXT,
  added_by_account TEXT,
  allowed_roles  TEXT DEFAULT '["vet", "authority", "guest"]',
  record_permissions TEXT DEFAULT NULL,
  created_at     TEXT DEFAULT (CURRENT_TIMESTAMP),
  analysis_status TEXT DEFAULT 'pending_analysis'
);

CREATE TABLE IF NOT EXISTS document_pages (
  id          SERIAL PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  image_path  TEXT NOT NULL,
  page_number INTEGER NOT NULL DEFAULT 1,
  ocr_text    TEXT,
  created_at  INTEGER DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::INTEGER)
);

CREATE TABLE IF NOT EXISTS analysis_history (
  id             TEXT PRIMARY KEY,
  document_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  extracted_json TEXT NOT NULL,
  version        INTEGER NOT NULL DEFAULT 1,
  ocr_provider   TEXT,
  created_at     TEXT DEFAULT (CURRENT_TIMESTAMP)
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
  created_at   TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS animal_sharing (
  id                TEXT PRIMARY KEY,
  animal_id         TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK(role IN ('guest', 'authority', 'vet')),
  share_contact     INTEGER NOT NULL DEFAULT 0,
  share_breed       INTEGER NOT NULL DEFAULT 1,
  share_birthdate   INTEGER NOT NULL DEFAULT 1,
  share_address     INTEGER NOT NULL DEFAULT 0,
  share_dynamic_fields INTEGER NOT NULL DEFAULT 0,
  UNIQUE(animal_id, role)
);

CREATE TABLE IF NOT EXISTS animal_public_shares (
  id        TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  link_name TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::INTEGER)
);

CREATE TABLE IF NOT EXISTS jwt_blacklist (
  jti TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::INTEGER)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::INTEGER)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'family',
  owner_id TEXT NOT NULL REFERENCES accounts(id),
  verified INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::INTEGER)
);

CREATE TABLE IF NOT EXISTS org_memberships (
  org_id TEXT NOT NULL REFERENCES organizations(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  role TEXT DEFAULT 'member',
  invited_by TEXT REFERENCES accounts(id),
  accepted INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::INTEGER),
  PRIMARY KEY (org_id, account_id)
);

CREATE TABLE IF NOT EXISTS verification_requests (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'vet',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  notes TEXT,
  document_path TEXT,
  rejection_reason TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS reminders (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  animal_id   TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  due_date    TEXT NOT NULL,
  notes       TEXT,
  dismissed_at TEXT,
  created_at  TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS animal_scans (
  id TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  scanned_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_documents_animal ON documents(animal_id);
CREATE INDEX IF NOT EXISTS idx_tags_animal ON animal_tags(animal_id);
CREATE INDEX IF NOT EXISTS idx_tags_active ON animal_tags(tag_id, active);
CREATE INDEX IF NOT EXISTS idx_reminders_account ON reminders(account_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(due_date);
CREATE INDEX IF NOT EXISTS idx_reminders_animal ON reminders(animal_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_animal_scans_animal ON animal_scans(animal_id);
CREATE INDEX IF NOT EXISTS idx_animal_scans_account ON animal_scans(account_id);

CREATE TABLE IF NOT EXISTS animal_transfers (
  code       TEXT PRIMARY KEY,
  animal_id  TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  key_hash      TEXT NOT NULL UNIQUE,
  description   TEXT,
  rate_limit    INTEGER DEFAULT 100,
  last_used_at  TEXT,
  created_at    TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_animals_account ON animals(account_id);
CREATE INDEX IF NOT EXISTS idx_tags_animal ON animal_tags(animal_id);
CREATE INDEX IF NOT EXISTS idx_tags_active ON animal_tags(tag_id, active);
CREATE INDEX IF NOT EXISTS idx_documents_animal ON documents(animal_id);
CREATE INDEX IF NOT EXISTS idx_document_pages_doc ON document_pages(document_id);
CREATE INDEX IF NOT EXISTS idx_analysis_history_doc ON analysis_history(document_id);
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

CREATE TABLE IF NOT EXISTS medical_administrations (
  id               TEXT PRIMARY KEY,
  animal_id        TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  document_id      TEXT REFERENCES documents(id) ON DELETE SET NULL,
  type             TEXT NOT NULL CHECK(type IN ('vaccination', 'medication', 'other')),
  substance        TEXT NOT NULL,
  purpose          TEXT,
  administered_at  TEXT NOT NULL,
  next_due_at      TEXT,
  notes            TEXT,
  ocr_source       INTEGER DEFAULT 0,
  created_at       TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS test_results (
  id               TEXT PRIMARY KEY,
  test_timestamp   INTEGER NOT NULL,
  summary_json     TEXT NOT NULL,
  details_json     TEXT,
  pass_count       INTEGER DEFAULT 0,
  fail_count       INTEGER DEFAULT 0,
  total_count      INTEGER DEFAULT 0,
  status           TEXT NOT NULL CHECK(status IN ('passed', 'failed', 'incomplete')),
  created_at       INTEGER DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::INTEGER)
);

CREATE INDEX IF NOT EXISTS idx_medical_admin_animal ON medical_administrations(animal_id);
CREATE INDEX IF NOT EXISTS idx_medical_admin_document ON medical_administrations(document_id);
CREATE INDEX IF NOT EXISTS idx_medical_admin_next_due ON medical_administrations(next_due_at);
CREATE INDEX IF NOT EXISTS idx_test_results_timestamp ON test_results(test_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_test_results_created ON test_results(created_at DESC);

CREATE TABLE IF NOT EXISTS verification_requests (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK(type IN ('vet', 'authority')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  notes         TEXT,
  document_path TEXT,
  rejection_reason TEXT,
  created_at    TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at    TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS animal_scans (
  id        TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  scanned_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_verification_requests_account ON verification_requests(account_id);
CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON verification_requests(status);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_account ON email_verification_tokens(account_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires ON email_verification_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_account ON password_reset_tokens(account_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_animal_scans_animal ON animal_scans(animal_id);
CREATE INDEX IF NOT EXISTS idx_animal_scans_account ON animal_scans(account_id);
CREATE INDEX IF NOT EXISTS idx_animal_scans_time ON animal_scans(scanned_at);

CREATE TABLE IF NOT EXISTS reminders (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  animal_id   TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  due_date    TEXT NOT NULL,
  notes       TEXT,
  dismissed_at TEXT,
  created_at  TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_reminders_account ON reminders(account_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(due_date);
CREATE INDEX IF NOT EXISTS idx_reminders_animal ON reminders(animal_id);
