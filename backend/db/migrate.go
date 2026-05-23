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
	}

	for _, m := range migrations {
		if _, err := database.Exec(m.sql); err != nil {
			log.Printf("[migrate] warning (%s): %v", m.name, err)
		} else {
			log.Printf("[migrate] applied: %s", m.name)
		}
	}
}
