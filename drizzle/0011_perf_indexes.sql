-- Hot-path indexes for the dashboard and list endpoints. All are organisation-scoped reads ordered
-- by time, so a composite (organization_id, created_at DESC) index avoids a sort and a full scan.
CREATE INDEX IF NOT EXISTS guards_org_created_idx ON guards (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS guards_org_status_idx ON guards (organization_id, status);
CREATE INDEX IF NOT EXISTS sites_org_created_idx ON sites (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_org_created_idx ON attendance (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_org_checked_in_idx ON attendance (organization_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS incidents_org_created_idx ON incidents (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS incidents_org_status_idx ON incidents (organization_id, status);
CREATE INDEX IF NOT EXISTS alerts_org_created_idx ON alerts (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_org_acknowledged_idx ON alerts (organization_id, acknowledged);
CREATE INDEX IF NOT EXISTS patrols_org_created_idx ON patrols (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS patrols_org_date_idx ON patrols (organization_id, patrol_date);
CREATE INDEX IF NOT EXISTS patrol_checkpoints_org_signed_idx ON patrol_checkpoints (organization_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS payroll_records_org_period_idx ON payroll_records (organization_id, period);
CREATE INDEX IF NOT EXISTS finances_org_created_idx ON finances (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS clients_org_created_idx ON clients (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_org_created_idx ON activity_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staff_org_created_idx ON staff (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contracts_org_created_idx ON contracts (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_items_org_created_idx ON inventory_items (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS role_permissions_org_role_idx ON role_permissions (organization_id, role);
