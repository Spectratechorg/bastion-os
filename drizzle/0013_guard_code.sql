-- Short 3-digit guard IDs, unique per organization. Existing guards are numbered in join order.
ALTER TABLE guards ADD COLUMN IF NOT EXISTS guard_code text;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY organization_id ORDER BY created_at, id) AS rn
  FROM guards
  WHERE guard_code IS NULL
)
UPDATE guards g
SET guard_code = lpad(n.rn::text, 3, '0')
FROM numbered n
WHERE g.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS guards_org_code_unique
  ON guards (organization_id, guard_code)
  WHERE guard_code IS NOT NULL;
