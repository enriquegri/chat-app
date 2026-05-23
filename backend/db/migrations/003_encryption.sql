-- Lookup index for encrypted emails (deterministic HMAC)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_hash VARCHAR(64) DEFAULT NULL;
ALTER TABLE users ADD UNIQUE INDEX IF NOT EXISTS idx_email_hash (email_hash);

-- Expand email column to hold AES-GCM ciphertext (base64, longer than 255)
ALTER TABLE users DROP INDEX email;
ALTER TABLE users MODIFY COLUMN email TEXT NOT NULL;

-- Expand bio column to hold encrypted values
ALTER TABLE users MODIFY COLUMN bio TEXT NOT NULL DEFAULT '';

-- Expand file_url column to hold encrypted values
ALTER TABLE messages MODIFY COLUMN file_url TEXT DEFAULT NULL;
