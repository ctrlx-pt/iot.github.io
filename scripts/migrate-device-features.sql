-- CtrlX migration: device metadata, tickets, heartbeat (run after backup)
-- psql "$DATABASE_URL" -f scripts/migrate-device-features.sql

ALTER TABLE devices ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS heartbeat_source text NOT NULL DEFAULT 'mock';

CREATE INDEX IF NOT EXISTS devices_city_idx ON devices (city);
CREATE INDEX IF NOT EXISTS devices_country_idx ON devices (country);

CREATE TABLE IF NOT EXISTS device_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'OPEN',
  priority text NOT NULL DEFAULT 'MEDIUM',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_tickets_device_id_idx ON device_tickets (device_id);
CREATE INDEX IF NOT EXISTS device_tickets_status_idx ON device_tickets (status);

-- Promote PUIG demo user to CompanyAdmin (optional)
UPDATE company_memberships cm
SET role = 'CompanyAdmin', updated_at = now()
FROM users u, companies c
WHERE cm.user_id = u.id AND cm.company_id = c.id
  AND u.username = 'puig' AND c.code = '00' AND cm.role <> 'CompanyAdmin';
