-- Adds a monotonic ordering key to messages.
--
-- `created_at` alone cannot order a conversation: Postgres `now()` is
-- transaction-scoped and rapid inserts were observed sharing a timestamp.
-- Existing rows are backfilled in physical order, which for an append-only
-- table matches insertion order.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS seq bigserial NOT NULL;
CREATE INDEX IF NOT EXISTS messages_conversation_seq_idx ON messages (conversation_id, seq);
