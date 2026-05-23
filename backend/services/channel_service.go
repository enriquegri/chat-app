package services

import (
	"database/sql"
	"errors"

	"github.com/yourusername/chat-app/models"
)

type ChannelService struct {
	db *sql.DB
}

func NewChannelService(db *sql.DB) *ChannelService {
	return &ChannelService{db: db}
}

func (s *ChannelService) GetUserChannels(userID int) ([]models.Channel, error) {
	rows, err := s.db.Query(`
		SELECT c.id, c.name, c.description, c.created_by, c.created_at
		FROM channels c
		JOIN channel_members cm ON c.id = cm.channel_id
		WHERE cm.user_id = ?
		ORDER BY c.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []models.Channel
	for rows.Next() {
		var ch models.Channel
		if err := rows.Scan(&ch.ID, &ch.Name, &ch.Description, &ch.CreatedBy, &ch.CreatedAt); err != nil {
			return nil, err
		}
		channels = append(channels, ch)
	}
	return channels, nil
}

func (s *ChannelService) Create(req models.CreateChannelRequest, userID int) (*models.Channel, error) {
	if req.Name == "" {
		return nil, errors.New("channel name is required")
	}

	result, err := s.db.Exec(
		"INSERT INTO channels (name, description, created_by) VALUES (?, ?, ?)",
		req.Name, req.Description, userID,
	)
	if err != nil {
		return nil, errors.New("channel name already exists or database error")
	}

	id, _ := result.LastInsertId()

	// El creador entra automáticamente al canal
	s.db.Exec("INSERT IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)", id, userID)

	var ch models.Channel
	s.db.QueryRow("SELECT id, name, description, created_by, created_at FROM channels WHERE id = ?", id).
		Scan(&ch.ID, &ch.Name, &ch.Description, &ch.CreatedBy, &ch.CreatedAt)

	return &ch, nil
}

func (s *ChannelService) JoinChannel(channelID, userID int) error {
	_, err := s.db.Exec(
		"INSERT IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)",
		channelID, userID,
	)
	return err
}

func (s *ChannelService) GetMessages(channelID, limit int) ([]models.Message, error) {
	rows, err := s.db.Query(`
		SELECT m.id, m.channel_id, m.user_id, u.username, m.content, m.created_at
		FROM messages m
		JOIN users u ON m.user_id = u.id
		WHERE m.channel_id = ?
		ORDER BY m.created_at DESC
		LIMIT ?`, channelID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []models.Message
	for rows.Next() {
		var msg models.Message
		if err := rows.Scan(&msg.ID, &msg.ChannelID, &msg.UserID, &msg.Username, &msg.Content, &msg.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}

	// Invertir para orden cronológico
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	return messages, nil
}

func (s *ChannelService) SaveMessage(msg *models.Message) error {
	result, err := s.db.Exec(
		"INSERT INTO messages (channel_id, user_id, content) VALUES (?, ?, ?)",
		msg.ChannelID, msg.UserID, msg.Content,
	)
	if err != nil {
		return err
	}
	id, _ := result.LastInsertId()
	msg.ID = int(id)
	return nil
}
