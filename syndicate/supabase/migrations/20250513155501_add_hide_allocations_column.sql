-- Add hide_allocations column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' 
        AND column_name = 'hide_allocations'
    ) THEN
        ALTER TABLE orders ADD COLUMN hide_allocations BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
END $$;