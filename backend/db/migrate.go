package db

import (
	"database/sql"
	"log"
)

// RunMigrations aplica migraciones incrementales de forma idempotente al arrancar.
// Usar ALTER TABLE ... ADD COLUMN IF NOT EXISTS para que sean seguras de relanzar.
func RunMigrations(database *sql.DB) {
	migrations := []struct {
		name string
		sql  string
	}{
		{"add_edited_at", `ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP NULL DEFAULT NULL`},
		{"add_is_private", `ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE`},
		{"add_reply_to_id", `ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INT NULL`},
		{"add_totp_secret", `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(512) NULL`},
		{"add_totp_enabled", `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE`},
		{"create_push_subscriptions", `
			CREATE TABLE IF NOT EXISTS push_subscriptions (
				id INT AUTO_INCREMENT PRIMARY KEY,
				user_id INT NOT NULL,
				endpoint TEXT NOT NULL,
				p256dh VARCHAR(512) NOT NULL,
				auth VARCHAR(256) NOT NULL,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
				UNIQUE KEY uq_user_endpoint (user_id, endpoint(255))
			)`},
		{"add_idx_reply_to_id", `ALTER TABLE messages ADD INDEX IF NOT EXISTS idx_reply_to_id (reply_to_id)`},
		{"add_idx_channel_id", `ALTER TABLE messages ADD INDEX IF NOT EXISTS idx_channel_id (channel_id)`},
		{"add_idx_channel_reply_created", `ALTER TABLE messages ADD INDEX IF NOT EXISTS idx_channel_reply_created (channel_id, reply_to_id, created_at)`},
	}

	for _, m := range migrations {
		if _, err := database.Exec(m.sql); err != nil {
			log.Printf("[migrate] warning (%s): %v", m.name, err)
		} else {
			log.Printf("[migrate] applied: %s", m.name)
		}
	}
}
