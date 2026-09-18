-- Chat System Database Schema for RPG Maker MZ
-- Run this in the Supabase SQL Editor.
-- If re-running, the DROP at the top will clear the old table first.

-- Drop and recreate cleanly
DROP TABLE IF EXISTS chat_messages CASCADE;

-- user_id is the app-level UUID from the custom login_user RPC.
-- We do NOT reference auth.users because the game uses a custom auth
-- flow that does not issue Supabase-native JWTs.
CREATE TABLE chat_messages (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL,
    username         TEXT NOT NULL,
    content          TEXT NOT NULL CHECK (length(trim(content)) > 0),
    parent_message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT now(),
    deleted_at       TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX idx_chat_messages_parent_id  ON chat_messages(parent_message_id);
CREATE INDEX idx_chat_messages_user_id    ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_deleted_at ON chat_messages(deleted_at);

-- Enable Row Level Security
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone with the anon key can read non-deleted messages
CREATE POLICY "read_messages"
    ON chat_messages FOR SELECT
    USING (deleted_at IS NULL);

-- INSERT: allow any request that provides a non-null user_id and non-empty content.
-- Ownership is enforced at the application layer (AuthManager guards in ChatDataManager).
CREATE POLICY "insert_messages"
    ON chat_messages FOR INSERT
    WITH CHECK (user_id IS NOT NULL AND length(trim(content)) > 0);

-- UPDATE: allow all — the application only calls this for the current user's own messages.
CREATE POLICY "update_messages"
    ON chat_messages FOR UPDATE
    USING (true) WITH CHECK (true);

-- DELETE: allow all — the application only calls this for the current user's own messages.
CREATE POLICY "delete_messages"
    ON chat_messages FOR DELETE
    USING (true);
