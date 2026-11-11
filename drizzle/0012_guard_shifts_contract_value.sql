-- Per-guard patrol shifts. NULL keeps the company-wide default from the organization row.
ALTER TABLE guards ADD COLUMN IF NOT EXISTS shift_start_hour integer;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS shift_end_hour integer;

-- Client records now carry the total contract size instead of a monthly payment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'monthly_value')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'contract_value') THEN
    ALTER TABLE clients RENAME COLUMN monthly_value TO contract_value;
  END IF;
END $$;
