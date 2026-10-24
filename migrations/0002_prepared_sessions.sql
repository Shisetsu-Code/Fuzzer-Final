ALTER TABLE jobs ADD COLUMN preparation_key TEXT;
ALTER TABLE jobs ADD COLUMN operation_started INTEGER;
CREATE UNIQUE INDEX live_preparation ON jobs(preparation_key) WHERE preparation_key IS NOT NULL AND operation_started IS NULL AND status IN ('queued','preparing','ready','needs_input','running');
CREATE TABLE runners(id TEXT PRIMARY KEY, started INTEGER NOT NULL, heartbeat INTEGER NOT NULL, capacity INTEGER NOT NULL, busy INTEGER NOT NULL, browser_ready INTEGER NOT NULL);
