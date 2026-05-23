package services

import (
	"database/sql"

	"github.com/yourusername/chat-app/models"
	"golang.org/x/crypto/bcrypt"
)

type AdminService struct {
	db     *sql.DB
	crypto *Crypto
}

func NewAdminService(db *sql.DB, crypto *Crypto) *AdminService {
	return &AdminService{db: db, crypto: crypto}
}

func (s *AdminService) ListUsers() ([]models.UserAdmin, error) {
	rows, err := s.db.Query(
		"SELECT id, username, email, role, created_at FROM users WHERE username != 'system' ORDER BY created_at DESC",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.UserAdmin
	for rows.Next() {
		var u models.UserAdmin
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.Role, &u.CreatedAt); err != nil {
			return nil, err
		}
		u.Email = s.crypto.Decrypt(u.Email)
		users = append(users, u)
	}
	return users, nil
}

func (s *AdminService) CreateUser(username, email, password, role string) error {
	if role != "admin" && role != "user" {
		role = "user"
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	encEmail, err := s.crypto.Encrypt(email)
	if err != nil {
		return err
	}
	emailHash := s.crypto.HMAC(email)
	_, err = s.db.Exec(
		`INSERT INTO users (username, email, email_hash, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
		username, encEmail, emailHash, string(hash), role,
	)
	return err
}

func (s *AdminService) DeleteUser(id int) error {
	_, err := s.db.Exec("DELETE FROM users WHERE id = ? AND username != 'system'", id)
	return err
}

func (s *AdminService) SetRole(id int, role string) error {
	if role != "admin" && role != "user" {
		return nil
	}
	_, err := s.db.Exec("UPDATE users SET role = ? WHERE id = ? AND username != 'system'", role, id)
	return err
}

func (s *AdminService) ListChannels() ([]map[string]interface{}, error) {
	rows, err := s.db.Query(`
		SELECT c.id, c.name, c.created_at,
		       (SELECT COUNT(*) FROM messages m WHERE m.channel_id = c.id) AS msg_count,
		       (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_id = c.id) AS member_count
		FROM channels c
		ORDER BY c.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []map[string]interface{}
	for rows.Next() {
		var id, msgCount, memberCount int
		var name string
		var createdAt interface{}
		if err := rows.Scan(&id, &name, &createdAt, &msgCount, &memberCount); err != nil {
			return nil, err
		}
		channels = append(channels, map[string]interface{}{
			"id":           id,
			"name":         name,
			"created_at":   createdAt,
			"msg_count":    msgCount,
			"member_count": memberCount,
		})
	}
	return channels, nil
}

func (s *AdminService) DeleteChannel(id int) error {
	_, err := s.db.Exec("DELETE FROM channels WHERE id = ? AND name NOT IN ('general','random')", id)
	return err
}
