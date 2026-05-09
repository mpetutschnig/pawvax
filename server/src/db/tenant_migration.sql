-- Phase 1: Mandanten-Fundament & Infrastruktur-Governance
-- Strategische Erweiterung für echte Multi-Tenancy und Domain-Registry

-- 1. Erweiterung der organizations Tabelle für Branding und Governance
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_data TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#0ea5e9';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS config_json JSONB DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'maintenance'));
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE; -- Für sprechende URLs/Mandanten-Identifikation

-- 2. Domain-Registry Tabelle für Infrastruktur-Orchestrierung
-- Das Admin-Panel verwaltet diese Tabelle, ein Sidecar synchronisiert Caddy/Nginx
CREATE TABLE IF NOT EXISTS domain_registry (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain TEXT UNIQUE NOT NULL,
  ssl_enabled INTEGER DEFAULT 1,
  ssl_provider TEXT DEFAULT 'letsencrypt',
  is_primary INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_domain_registry_org ON domain_registry(org_id);
CREATE INDEX IF NOT EXISTS idx_domain_registry_domain ON domain_registry(domain);

-- 3. Vorbereitung der globalen Verknüpfung (Soft-Migration)
-- Wir fügen organization_id zu Kernentitäten hinzu.
-- Initial wird diese oft NULL sein (Legacy) oder auf eine Standard-Org zeigen.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;

-- 4. Audit-Log Erweiterung für Multi-Tenancy
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON audit_log(organization_id);

-- 5. Erweiterte System-Settings für Governance
-- Diese Schlüssel werden in der 'settings' Tabelle für globale Regeln verwendet
INSERT INTO settings (key, value) VALUES 
('maintenance_mode', '0'),
('audit_retention_days', '365'),
('default_rate_limit_per_min', '60')
ON CONFLICT (key) DO NOTHING;

