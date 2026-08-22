-- =============================================================================
-- CtrlX — Neon PostgreSQL bootstrap
-- =============================================================================
-- Run in Neon SQL Editor or: psql "$DATABASE_URL" -f scripts/neon-init.sql
--
-- Demo password for ALL users below: changeme
-- (scrypt hash — same format as server/services/crypto/password.ts)
--
-- Accounts:
--   admin / changeme  → SuperAdmin (all tenants)
--   puig  / changeme  → Operator (PUIG only)
--   lvmh  / changeme  → Operator (LVMH only)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Optional: clean slate (comment out if you already have data)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS playlist_items CASCADE;
DROP TABLE IF EXISTS media_playlists CASCADE;
DROP TABLE IF EXISTS media_content CASCADE;
DROP TABLE IF EXISTS maintenance_requests CASCADE;
DROP TABLE IF EXISTS brands CASCADE;
DROP TABLE IF EXISTS user_access_groups CASCADE;
DROP TABLE IF EXISTS access_groups CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS energy_usage CASCADE;
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS user_store_permissions CASCADE;
DROP TABLE IF EXISTS tvs CASCADE;
DROP TABLE IF EXISTS videos CASCADE;
DROP TABLE IF EXISTS lights CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS legacy_companies CASCADE;
DROP TABLE IF EXISTS organization_invites CASCADE;
DROP TABLE IF EXISTS user_organizations CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS verification_codes CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS automations CASCADE;
DROP TABLE IF EXISTS home_assistant_entities CASCADE;
DROP TABLE IF EXISTS devices CASCADE;
DROP TABLE IF EXISTS kits CASCADE;
DROP TABLE IF EXISTS furniture CASCADE;
DROP TABLE IF EXISTS gateways CASCADE;
DROP TABLE IF EXISTS home_assistant_instances CASCADE;
DROP TABLE IF EXISTS id_counters CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS store_assignments CASCADE;
DROP TABLE IF EXISTS company_memberships CASCADE;
DROP TABLE IF EXISTS stores CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ---------------------------------------------------------------------------
-- Phase 1 — core SaaS
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX companies_code_uidx ON companies (code);

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_code TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  timezone TEXT NOT NULL DEFAULT 'Europe/Lisbon',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX stores_store_code_uidx ON stores (store_code);
CREATE INDEX stores_company_id_idx ON stores (company_id);

CREATE TABLE company_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'Viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX company_memberships_user_company_uidx
  ON company_memberships (user_id, company_id);
CREATE INDEX company_memberships_company_id_idx ON company_memberships (company_id);
CREATE INDEX company_memberships_user_id_idx ON company_memberships (user_id);

CREATE TABLE store_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX store_assignments_user_store_uidx
  ON store_assignments (user_id, store_id);
CREATE INDEX store_assignments_store_id_idx ON store_assignments (store_id);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX refresh_tokens_token_hash_uidx ON refresh_tokens (token_hash);
CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);

CREATE TABLE id_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counter_key TEXT NOT NULL,
  next_value INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX id_counters_key_uidx ON id_counters (counter_key);

-- ---------------------------------------------------------------------------
-- Phase 2+ — hierarchy, HA, automations, audit
-- ---------------------------------------------------------------------------

CREATE TABLE home_assistant_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  store_id UUID NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  api_token_encrypted TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  version TEXT,
  last_seen_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ha_instances_store_id_idx ON home_assistant_instances (store_id);

CREATE TABLE gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hardware_id TEXT NOT NULL,
  name TEXT NOT NULL,
  serial_number TEXT,
  ip_address TEXT,
  mac_address TEXT,
  store_id UUID NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  home_assistant_instance_id UUID REFERENCES home_assistant_instances (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  last_seen_at TIMESTAMPTZ,
  version TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX gateways_hardware_id_uidx ON gateways (hardware_id);
CREATE INDEX gateways_store_id_idx ON gateways (store_id);

CREATE TABLE furniture (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  furniture_code TEXT NOT NULL,
  store_id UUID NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  position TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX furniture_code_uidx ON furniture (furniture_code);
CREATE INDEX furniture_store_id_idx ON furniture (store_id);

CREATE TABLE kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_code TEXT NOT NULL,
  furniture_id UUID NOT NULL REFERENCES furniture (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  kit_type TEXT DEFAULT 'standard',
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX kits_kit_code_uidx ON kits (kit_code);
CREATE INDEX kits_furniture_id_idx ON kits (furniture_id);

CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_code TEXT NOT NULL,
  kit_id UUID NOT NULL REFERENCES kits (id) ON DELETE CASCADE,
  gateway_id UUID REFERENCES gateways (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'OTHER',
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  home_assistant_entity_id TEXT,
  configuration TEXT NOT NULL DEFAULT '{}',
  capabilities TEXT NOT NULL DEFAULT '[]',
  last_seen_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX devices_device_code_uidx ON devices (device_code);
CREATE INDEX devices_kit_id_idx ON devices (kit_id);
CREATE INDEX devices_gateway_id_idx ON devices (gateway_id);

CREATE TABLE home_assistant_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_assistant_instance_id UUID NOT NULL REFERENCES home_assistant_instances (id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  friendly_name TEXT,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  last_state TEXT,
  last_updated_at TIMESTAMPTZ
);
CREATE INDEX ha_entities_device_id_idx ON home_assistant_entities (device_id);
CREATE UNIQUE INDEX ha_entities_instance_entity_uidx
  ON home_assistant_entities (home_assistant_instance_id, entity_id);

CREATE TABLE automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  configuration TEXT NOT NULL DEFAULT '{}',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX automations_company_id_idx ON automations (company_id);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_value TEXT,
  new_value TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_logs_company_id_idx ON audit_logs (company_id);
CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at);

CREATE TABLE verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  type TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Legacy tables (optional — old HA proxy / lights / TVs routes)
-- ---------------------------------------------------------------------------

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  invited_by_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  invited_email TEXT,
  invite_code TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member',
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE legacy_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES legacy_companies (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE lights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_on BOOLEAN NOT NULL DEFAULT FALSE,
  brightness INTEGER NOT NULL DEFAULT 100,
  color TEXT NOT NULL DEFAULT '#ffffff',
  status TEXT NOT NULL DEFAULT 'online'
);

CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  duration INTEGER,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tvs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  current_video_id UUID REFERENCES videos (id) ON DELETE SET NULL,
  is_looping BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'online'
);

CREATE TABLE user_store_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES legacy_companies (id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT TRUE,
  can_edit BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations (id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_name TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE energy_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES locations (id) ON DELETE CASCADE,
  light_id UUID REFERENCES lights (id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kwh INTEGER NOT NULL DEFAULT 0,
  brightness INTEGER,
  is_on BOOLEAN
);

CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations (id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations (id) ON DELETE CASCADE,
  light_id UUID REFERENCES lights (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  action TEXT NOT NULL,
  action_value TEXT,
  cron_expression TEXT,
  scheduled_time TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_id UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE access_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 5,
  description TEXT,
  permissions TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_access_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  access_group_id UUID NOT NULL REFERENCES access_groups (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'lighting',
  website TEXT,
  logo TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  company_id UUID REFERENCES legacy_companies (id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'maintenance',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  created_by_id UUID REFERENCES users (id) ON DELETE SET NULL,
  assigned_to_id UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE media_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  size INTEGER,
  duration INTEGER,
  folder TEXT DEFAULT 'root',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE media_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_loop BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE playlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES media_playlists (id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES media_content (id) ON DELETE CASCADE,
  "order" INTEGER NOT NULL DEFAULT 0,
  duration INTEGER
);

-- ---------------------------------------------------------------------------
-- Seed — fixed UUIDs for easy reference
-- ---------------------------------------------------------------------------

-- password: changeme (scrypt, fixed salt for reproducible seed)
-- Regenerate: node -e "const {scryptSync}=require('crypto'); const s='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; console.log(s+':'+scryptSync('changeme',s,64).toString('hex'))"

INSERT INTO users (id, username, email, password_hash, email_verified, is_super_admin, is_active)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'admin', 'admin@ctrlx.local',
   'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:87cd8ce27dc4a492ffabfd8ab533ad5df1bfaf9d786174eb4c6e70cdee3880552159a5f9b8962967e9f9609c8df351c273f80199e4478c26ca3b5fa62617028b',
   TRUE, TRUE, TRUE),
  ('10000000-0000-4000-8000-000000000002', 'puig', 'puig@client.local',
   'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:87cd8ce27dc4a492ffabfd8ab533ad5df1bfaf9d786174eb4c6e70cdee3880552159a5f9b8962967e9f9609c8df351c273f80199e4478c26ca3b5fa62617028b',
   TRUE, FALSE, TRUE),
  ('10000000-0000-4000-8000-000000000003', 'lvmh', 'lvmh@client.local',
   'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:87cd8ce27dc4a492ffabfd8ab533ad5df1bfaf9d786174eb4c6e70cdee3880552159a5f9b8962967e9f9609c8df351c273f80199e4478c26ca3b5fa62617028b',
   TRUE, FALSE, TRUE);

INSERT INTO companies (id, code, name, description, is_active)
VALUES
  ('20000000-0000-4000-8000-000000000001', '00', 'PUIG', 'PUIG retail group', TRUE),
  ('20000000-0000-4000-8000-000000000002', '01', 'LVMH', 'LVMH retail group', TRUE);

INSERT INTO stores (id, store_code, company_id, name, city, country, timezone, is_active)
VALUES
  ('30000000-0000-4000-8000-000000000001', 'ctrlx-00-000001',
   '20000000-0000-4000-8000-000000000001', 'Store Lisbon', 'Lisbon', 'PT', 'Europe/Lisbon', TRUE),
  ('30000000-0000-4000-8000-000000000002', 'ctrlx-01-000001',
   '20000000-0000-4000-8000-000000000002', 'Store Lisbon', 'Lisbon', 'PT', 'Europe/Lisbon', TRUE);

INSERT INTO company_memberships (id, user_id, company_id, role)
VALUES
  ('80000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000001', 'Operator'),
  ('80000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000003',
   '20000000-0000-4000-8000-000000000002', 'Operator');

INSERT INTO id_counters (counter_key, next_value)
VALUES
  ('store:00', 2),
  ('store:01', 2),
  ('furniture:ctrlx-00-000001', 2),
  ('furniture:ctrlx-01-000001', 2),
  ('kit:ctrlx-00-000001', 2),
  ('kit:ctrlx-01-000001', 2),
  ('gateway', 3),
  ('device:ctrlx-00-000001-01:LED', 2),
  ('device:ctrlx-00-000001-01:TV', 2),
  ('device:ctrlx-00-000001-01:LEDCON', 2),
  ('device:ctrlx-01-000001-01:LED', 2),
  ('device:ctrlx-01-000001-01:TV', 2),
  ('device:ctrlx-01-000001-01:LEDCON', 2);

INSERT INTO furniture (id, furniture_code, store_id, name, position, status, is_active)
VALUES
  ('40000000-0000-4000-8000-000000000001', 'ctrlx-00-000001-F01',
   '30000000-0000-4000-8000-000000000001', 'Dior Display', 'floor-1', 'ONLINE', TRUE),
  ('40000000-0000-4000-8000-000000000002', 'ctrlx-01-000001-F01',
   '30000000-0000-4000-8000-000000000002', 'Dior Display', 'floor-1', 'ONLINE', TRUE);

INSERT INTO kits (id, kit_code, furniture_id, name, kit_type, status, is_active)
VALUES
  ('50000000-0000-4000-8000-000000000001', 'ctrlx-00-000001-01',
   '40000000-0000-4000-8000-000000000001', 'Kit 01', 'display', 'ONLINE', TRUE),
  ('50000000-0000-4000-8000-000000000002', 'ctrlx-01-000001-01',
   '40000000-0000-4000-8000-000000000002', 'Kit 01', 'display', 'ONLINE', TRUE);

INSERT INTO gateways (id, hardware_id, name, store_id, status, last_seen_at, version, is_active)
VALUES
  ('60000000-0000-4000-8000-000000000001', 'ctrlx-GTW-000001',
   'Gateway Lisbon', '30000000-0000-4000-8000-000000000001', 'ONLINE', NOW(), '1.0.0', TRUE),
  ('60000000-0000-4000-8000-000000000002', 'ctrlx-GTW-000002',
   'Gateway Lisbon', '30000000-0000-4000-8000-000000000002', 'ONLINE', NOW(), '1.0.0', TRUE);

INSERT INTO devices (
  id, device_code, kit_id, gateway_id, name, device_type, status,
  configuration, capabilities, last_seen_at, is_active
) VALUES
  -- PUIG store
  ('70000000-0000-4000-8000-000000000001', 'ctrlx-00-000001-01-LED01',
   '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
   'LED Strip', 'LED', 'ONLINE',
   '{"brightness":80,"colorTemperature":4000}',
   '["Power","Brightness","Color","Temperature"]', NOW(), TRUE),
  ('70000000-0000-4000-8000-000000000002', 'ctrlx-00-000001-01-TV01',
   '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
   'TV Display', 'TV', 'ONLINE', '{}',
   '["Power","Volume","Input"]', NOW(), TRUE),
  ('70000000-0000-4000-8000-000000000003', 'ctrlx-00-000001-01-LEDCON1',
   '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
   'LED Controller', 'LED_CONTROLLER', 'ONLINE', '{}',
   '["Power","Brightness","Color","Temperature"]', NOW(), TRUE),
  -- LVMH store
  ('70000000-0000-4000-8000-000000000011', 'ctrlx-01-000001-01-LED01',
   '50000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002',
   'LED Strip', 'LED', 'ONLINE',
   '{"brightness":80,"colorTemperature":4000}',
   '["Power","Brightness","Color","Temperature"]', NOW(), TRUE),
  ('70000000-0000-4000-8000-000000000012', 'ctrlx-01-000001-01-TV01',
   '50000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002',
   'TV Display', 'TV', 'ONLINE', '{}',
   '["Power","Volume","Input"]', NOW(), TRUE),
  ('70000000-0000-4000-8000-000000000013', 'ctrlx-01-000001-01-LEDCON1',
   '50000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002',
   'LED Controller', 'LED_CONTROLLER', 'ONLINE', '{}',
   '["Power","Brightness","Color","Temperature"]', NOW(), TRUE);

COMMIT;

-- =============================================================================
-- Quick checks (optional)
-- =============================================================================
-- SELECT username, is_super_admin FROM users;
-- SELECT code, name FROM companies;
-- SELECT store_code, name FROM stores;
-- SELECT username, role, c.code AS company
--   FROM company_memberships m
--   JOIN users u ON u.id = m.user_id
--   JOIN companies c ON c.id = m.company_id;
