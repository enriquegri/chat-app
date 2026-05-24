ALTER TABLE messages ADD INDEX IF NOT EXISTS idx_reply_to_id (reply_to_id);
ALTER TABLE messages ADD INDEX IF NOT EXISTS idx_channel_reply_id (channel_id, reply_to_id, id);
