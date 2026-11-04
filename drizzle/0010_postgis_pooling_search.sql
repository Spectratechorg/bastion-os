-- TASK-0081: enable spatial support and keep database connectivity pool-friendly.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- TASK-0082: support the fields used by workspace search and filtered lists.
CREATE INDEX IF NOT EXISTS guards_name_trgm_idx ON guards USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS guards_phone_idx ON guards (phone);
CREATE INDEX IF NOT EXISTS guards_nin_idx ON guards (nin);
CREATE INDEX IF NOT EXISTS guards_organization_status_idx ON guards (organization_id, status);
CREATE INDEX IF NOT EXISTS sites_name_trgm_idx ON sites USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS sites_address_trgm_idx ON sites USING gin (address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS sites_organization_status_idx ON sites (organization_id, status);
CREATE INDEX IF NOT EXISTS clients_name_trgm_idx ON clients USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS clients_email_idx ON clients (email);
CREATE INDEX IF NOT EXISTS clients_organization_status_idx ON clients (organization_id, status);
CREATE INDEX IF NOT EXISTS incidents_title_trgm_idx ON incidents USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS incidents_site_trgm_idx ON incidents USING gin (site gin_trgm_ops);
CREATE INDEX IF NOT EXISTS incidents_organization_status_idx ON incidents (organization_id, status);
CREATE INDEX IF NOT EXISTS alerts_title_trgm_idx ON alerts USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS alerts_organization_created_idx ON alerts (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_title_trgm_idx ON activity_events USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS activity_events_organization_created_idx ON activity_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finances_label_trgm_idx ON finances USING gin (label gin_trgm_ops);
CREATE INDEX IF NOT EXISTS finances_organization_created_idx ON finances (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staff_name_trgm_idx ON staff USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS inventory_items_name_trgm_idx ON inventory_items USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS inventory_items_organization_category_idx ON inventory_items (organization_id, category);
