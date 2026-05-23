package services

import (
	"database/sql"

	"github.com/yourusername/chat-app/models"
)

type ReactionService struct {
	db *sql.DB
}

func NewReactionService(db *sql.DB) *ReactionService {
	return &ReactionService{db: db}
}

func (s *ReactionService) Toggle(messageID, userID int, emoji string) (added bool, err error) {
	// Intenta borrar primero; si no existía, lo crea
	res, err := s.db.Exec(
		"DELETE FROM reactions WHERE message_id=? AND user_id=? AND emoji=?",
		messageID, userID, emoji,
	)
	if err != nil {
		return false, err
	}
	rows, _ := res.RowsAffected()
	if rows > 0 {
		return false, nil // eliminada
	}

	_, err = s.db.Exec(
		"INSERT INTO reactions (message_id, user_id, emoji) VALUES (?,?,?)",
		messageID, userID, emoji,
	)
	return err == nil, err
}

func (s *ReactionService) GetForMessage(messageID int) ([]models.Reaction, error) {
	rows, err := s.db.Query(`
		SELECT r.id, r.message_id, r.user_id, u.username, r.emoji
		FROM reactions r JOIN users u ON r.user_id = u.id
		WHERE r.message_id = ?`, messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reactions []models.Reaction
	for rows.Next() {
		var r models.Reaction
		rows.Scan(&r.ID, &r.MessageID, &r.UserID, &r.Username, &r.Emoji)
		reactions = append(reactions, r)
	}
	return reactions, nil
}

// GetMessageChannelID devuelve el channel_id de un mensaje dado su id
func (s *ReactionService) GetMessageChannelID(messageID int) (int, error) {
	var channelID int
	err := s.db.QueryRow("SELECT channel_id FROM messages WHERE id = ?", messageID).Scan(&channelID)
	return channelID, err
}

// GetForChannel devuelve todas las reactions de mensajes de un canal (para carga inicial)
func (s *ReactionService) GetForChannel(channelID int) (map[int][]models.Reaction, error) {
	rows, err := s.db.Query(`
		SELECT r.id, r.message_id, r.user_id, u.username, r.emoji
		FROM reactions r
		JOIN users u ON r.user_id = u.id
		JOIN messages m ON r.message_id = m.id
		WHERE m.channel_id = ?`, channelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[int][]models.Reaction)
	for rows.Next() {
		var r models.Reaction
		rows.Scan(&r.ID, &r.MessageID, &r.UserID, &r.Username, &r.Emoji)
		result[r.MessageID] = append(result[r.MessageID], r)
	}
	return result, nil
}
