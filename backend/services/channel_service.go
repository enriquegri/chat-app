package services

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/yourusername/chat-app/models"
)

type ChannelService struct {
	db     *sql.DB
	crypto *Crypto
}

func NewChannelService(db *sql.DB, crypto *Crypto) *ChannelService {
	return &ChannelService{db: db, crypto: crypto}
}

func (s *ChannelService) GetUserChannels(userID int) ([]models.Channel, error) {
	rows, err := s.db.Query(`
		SELECT c.id, c.name, c.description, c.created_by, c.created_at, c.is_private
		FROM channels c
		JOIN channel_members cm ON c.id = cm.channel_id
		WHERE cm.user_id = ? AND c.is_dm = FALSE
		ORDER BY c.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []models.Channel
	for rows.Next() {
		var ch models.Channel
		if err := rows.Scan(&ch.ID, &ch.Name, &ch.Description, &ch.CreatedBy, &ch.CreatedAt, &ch.IsPrivate); err != nil {
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
		"INSERT INTO channels (name, description, created_by, is_private) VALUES (?, ?, ?, ?)",
		req.Name, req.Description, userID, req.IsPrivate,
	)
	if err != nil {
		return nil, errors.New("channel name already exists or database error")
	}

	id, _ := result.LastInsertId()

	// El creador entra automáticamente al canal
	s.db.Exec("INSERT IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)", id, userID)

	var ch models.Channel
	s.db.QueryRow("SELECT id, name, description, created_by, created_at, is_private FROM channels WHERE id = ?", id).
		Scan(&ch.ID, &ch.Name, &ch.Description, &ch.CreatedBy, &ch.CreatedAt, &ch.IsPrivate)

	return &ch, nil
}

func (s *ChannelService) GetOrCreateDM(user1ID, user2ID int) (*models.Channel, error) {
	var ch models.Channel
	err := s.db.QueryRow(`
		SELECT id, name, description, created_by, created_at, is_private FROM channels
		WHERE is_dm = TRUE AND (
			(dm_user1_id = ? AND dm_user2_id = ?) OR
			(dm_user1_id = ? AND dm_user2_id = ?)
		)`, user1ID, user2ID, user2ID, user1ID,
	).Scan(&ch.ID, &ch.Name, &ch.Description, &ch.CreatedBy, &ch.CreatedAt, &ch.IsPrivate)

	if err == nil {
		// ensure both users are members
		s.db.Exec("INSERT IGNORE INTO channel_members (channel_id, user_id) VALUES (?,?),(?,?)",
			ch.ID, user1ID, ch.ID, user2ID)
		return &ch, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}

	// create the DM channel
	name := fmt.Sprintf("dm_%d_%d", min2(user1ID, user2ID), max2(user1ID, user2ID))
	res, err := s.db.Exec(
		`INSERT INTO channels (name, description, created_by, is_dm, dm_user1_id, dm_user2_id)
		 VALUES (?, '', ?, TRUE, ?, ?)`,
		name, user1ID, user1ID, user2ID,
	)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	s.db.Exec("INSERT IGNORE INTO channel_members (channel_id, user_id) VALUES (?,?),(?,?)",
		id, user1ID, id, user2ID)

	s.db.QueryRow("SELECT id, name, description, created_by, created_at, is_private FROM channels WHERE id = ?", id).
		Scan(&ch.ID, &ch.Name, &ch.Description, &ch.CreatedBy, &ch.CreatedAt, &ch.IsPrivate)
	return &ch, nil
}

func (s *ChannelService) GetDMConversations(userID int) ([]models.DMConversation, error) {
	rows, err := s.db.Query(`
		SELECT c.id,
		       CASE WHEN c.dm_user1_id = ? THEN c.dm_user2_id ELSE c.dm_user1_id END AS other_id,
		       u.username, u.avatar_color
		FROM channels c
		JOIN users u ON u.id = CASE WHEN c.dm_user1_id = ? THEN c.dm_user2_id ELSE c.dm_user1_id END
		WHERE c.is_dm = TRUE AND (c.dm_user1_id = ? OR c.dm_user2_id = ?)
		ORDER BY c.created_at DESC`,
		userID, userID, userID, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var convs []models.DMConversation
	for rows.Next() {
		var d models.DMConversation
		if err := rows.Scan(&d.ChannelID, &d.UserID, &d.Username, &d.AvatarColor); err != nil {
			return nil, err
		}
		convs = append(convs, d)
	}
	return convs, nil
}

func (s *ChannelService) ListUsers(excludeID int) ([]models.UserInfo, error) {
	rows, err := s.db.Query(
		"SELECT id, username, avatar_color FROM users WHERE username != 'system' AND id != ? ORDER BY username",
		excludeID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.UserInfo
	for rows.Next() {
		var u models.UserInfo
		if err := rows.Scan(&u.ID, &u.Username, &u.AvatarColor); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

func min2(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max2(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func (s *ChannelService) IsMember(channelID, userID int) (bool, error) {
	var count int
	err := s.db.QueryRow(
		"SELECT COUNT(*) FROM channel_members WHERE channel_id = ? AND user_id = ?",
		channelID, userID,
	).Scan(&count)
	return count > 0, err
}

func (s *ChannelService) JoinChannel(channelID, userID int) error {
	_, err := s.db.Exec(
		"INSERT IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)",
		channelID, userID,
	)
	return err
}

// reactionsByMsgIDs obtiene todas las reactions para una lista concreta de message IDs
// en una sola query usando IN (?,...). Más preciso que filtrar por canal/parent cuando
// ya tenemos los IDs exactos de los mensajes devueltos.
func (s *ChannelService) reactionsByMsgIDs(ids []int) map[int][]models.Reaction {
	if len(ids) == 0 {
		return nil
	}
	placeholders := strings.Repeat("?,", len(ids))
	placeholders = placeholders[:len(placeholders)-1]
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	rows, err := s.db.Query(fmt.Sprintf(`
		SELECT r.id, r.message_id, r.user_id, u.username, r.emoji
		FROM reactions r JOIN users u ON r.user_id = u.id
		WHERE r.message_id IN (%s)`, placeholders), args...)
	if err != nil {
		return nil
	}
	defer rows.Close()
	result := make(map[int][]models.Reaction)
	for rows.Next() {
		var r models.Reaction
		if err := rows.Scan(&r.ID, &r.MessageID, &r.UserID, &r.Username, &r.Emoji); err != nil {
			continue
		}
		result[r.MessageID] = append(result[r.MessageID], r)
	}
	return result
}

// GetMessages devuelve hasta `limit` mensajes top-level de un canal en orden ASC.
// Si beforeID > 0, pagina hacia atrás usando (created_at, id) como cursor compuesto
// para que el orden por fecha y la paginación sean siempre consistentes.
func (s *ChannelService) GetMessages(channelID, limit, beforeID int) ([]models.Message, error) {
	var rows *sql.Rows
	var err error

	if beforeID > 0 {
		var beforeTS string
		s.db.QueryRow("SELECT created_at FROM messages WHERE id = ?", beforeID).Scan(&beforeTS)
		rows, err = s.db.Query(`
			SELECT m.id, m.channel_id, m.user_id, u.username, u.avatar_color,
			       m.content, COALESCE(m.file_url,''), COALESCE(m.file_type,''), m.created_at, m.edited_at,
			       (SELECT COUNT(*) FROM messages r WHERE r.reply_to_id = m.id) as reply_count
			FROM messages m FORCE INDEX (idx_channel_reply_created)
			JOIN users u ON m.user_id = u.id
			WHERE m.channel_id = ? AND m.reply_to_id IS NULL
			  AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))
			ORDER BY m.created_at DESC, m.id DESC
			LIMIT ?`, channelID, beforeTS, beforeTS, beforeID, limit)
	} else {
		rows, err = s.db.Query(`
			SELECT m.id, m.channel_id, m.user_id, u.username, u.avatar_color,
			       m.content, COALESCE(m.file_url,''), COALESCE(m.file_type,''), m.created_at, m.edited_at,
			       (SELECT COUNT(*) FROM messages r WHERE r.reply_to_id = m.id) as reply_count
			FROM messages m FORCE INDEX (idx_channel_reply_created)
			JOIN users u ON m.user_id = u.id
			WHERE m.channel_id = ? AND m.reply_to_id IS NULL
			ORDER BY m.created_at DESC, m.id DESC
			LIMIT ?`, channelID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []models.Message
	var ids []int
	for rows.Next() {
		var msg models.Message
		if err := rows.Scan(&msg.ID, &msg.ChannelID, &msg.UserID, &msg.Username, &msg.AvatarColor,
			&msg.Content, &msg.FileURL, &msg.FileType, &msg.CreatedAt, &msg.EditedAt,
			&msg.ReplyCount); err != nil {
			return nil, err
		}
		msg.Content = s.crypto.Decrypt(msg.Content)
		msg.FileURL = s.crypto.Decrypt(msg.FileURL)
		msg.Reactions = []models.Reaction{}
		messages = append(messages, msg)
		ids = append(ids, msg.ID)
	}

	// Invertir (estaban DESC, los queremos ASC)
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	if i, j := 0, len(ids)-1; i < j {
		for ; i < j; i, j = i+1, j-1 {
			ids[i], ids[j] = ids[j], ids[i]
		}
	}

	// Una sola query para las reactions de exactamente estos mensajes
	reactionMap := s.reactionsByMsgIDs(ids)
	for i := range messages {
		if rxs, ok := reactionMap[messages[i].ID]; ok {
			messages[i].Reactions = rxs
		}
	}

	return messages, nil
}

// GetThreadMessages devuelve todas las respuestas directas a un mensaje.
func (s *ChannelService) GetThreadMessages(parentID int) ([]models.Message, error) {
	rows, err := s.db.Query(`
		SELECT m.id, m.channel_id, m.user_id, u.username, u.avatar_color,
		       m.content, COALESCE(m.file_url,''), COALESCE(m.file_type,''), m.created_at, m.edited_at
		FROM messages m
		JOIN users u ON m.user_id = u.id
		WHERE m.reply_to_id = ?
		ORDER BY m.created_at ASC`, parentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []models.Message
	var ids []int
	for rows.Next() {
		var msg models.Message
		if err := rows.Scan(&msg.ID, &msg.ChannelID, &msg.UserID, &msg.Username, &msg.AvatarColor,
			&msg.Content, &msg.FileURL, &msg.FileType, &msg.CreatedAt, &msg.EditedAt); err != nil {
			return nil, err
		}
		msg.Content = s.crypto.Decrypt(msg.Content)
		msg.FileURL = s.crypto.Decrypt(msg.FileURL)
		replyToIDVal := parentID
		msg.ReplyToID = &replyToIDVal
		msg.Reactions = []models.Reaction{}
		messages = append(messages, msg)
		ids = append(ids, msg.ID)
	}

	reactionMap := s.reactionsByMsgIDs(ids)
	for i := range messages {
		if rxs, ok := reactionMap[messages[i].ID]; ok {
			messages[i].Reactions = rxs
		}
	}

	return messages, nil
}

func (s *ChannelService) SearchMessages(channelID int, query string) ([]models.Message, error) {
	// Content is encrypted — fetch all messages and filter in-memory.
	rows, err := s.db.Query(`
		SELECT m.id, m.channel_id, m.user_id, u.username, u.avatar_color,
		       m.content, COALESCE(m.file_url,''), COALESCE(m.file_type,''), m.created_at, m.edited_at,
		       rm.id, COALESCE(ru.username,''), COALESCE(rm.content,'')
		FROM messages m
		JOIN users u ON m.user_id = u.id
		LEFT JOIN messages rm ON m.reply_to_id = rm.id
		LEFT JOIN users ru ON rm.user_id = ru.id
		WHERE m.channel_id = ? AND m.reply_to_id IS NULL
		ORDER BY m.created_at DESC`, channelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	query = strings.ToLower(query)
	var matches []models.Message
	for rows.Next() {
		var msg models.Message
		var replyID sql.NullInt64
		var replyUsername, replyContent string
		if err := rows.Scan(&msg.ID, &msg.ChannelID, &msg.UserID, &msg.Username, &msg.AvatarColor,
			&msg.Content, &msg.FileURL, &msg.FileType, &msg.CreatedAt, &msg.EditedAt,
			&replyID, &replyUsername, &replyContent); err != nil {
			return nil, err
		}
		msg.Content = s.crypto.Decrypt(msg.Content)
		msg.FileURL = s.crypto.Decrypt(msg.FileURL)
		if replyID.Valid {
			id := int(replyID.Int64)
			msg.ReplyToID = &id
			msg.ReplyTo = &models.ReplySnippet{
				ID:       id,
				Username: replyUsername,
				Content:  s.crypto.Decrypt(replyContent),
			}
		}
		if strings.Contains(strings.ToLower(msg.Content), query) {
			matches = append(matches, msg)
			if len(matches) >= 50 {
				break
			}
		}
	}
	return matches, nil
}

func (s *ChannelService) SaveMessage(msg *models.Message) error {
	encContent, err := s.crypto.Encrypt(msg.Content)
	if err != nil {
		return err
	}
	encFileURL, err := s.crypto.Encrypt(msg.FileURL)
	if err != nil {
		return err
	}
	var replyToID interface{}
	if msg.ReplyToID != nil {
		replyToID = *msg.ReplyToID
	}
	result, err := s.db.Exec(
		"INSERT INTO messages (channel_id, user_id, content, file_url, file_type, reply_to_id) VALUES (?, ?, ?, ?, ?, ?)",
		msg.ChannelID, msg.UserID, encContent, encFileURL, msg.FileType, replyToID,
	)
	if err != nil {
		return err
	}
	id, _ := result.LastInsertId()
	msg.ID = int(id)
	s.db.QueryRow("SELECT avatar_color FROM users WHERE id = ?", msg.UserID).Scan(&msg.AvatarColor)
	return nil
}

// GetChannelName returns the name of a channel by ID.
func (s *ChannelService) GetChannelName(channelID int) string {
	var name string
	s.db.QueryRow("SELECT name FROM channels WHERE id = ?", channelID).Scan(&name)
	return name
}

// GlobalSearch busca mensajes en todos los canales a los que pertenece el usuario.
// Para DMs muestra el username del otro usuario en vez de dm_X_X.
func (s *ChannelService) GlobalSearch(userID int, query string) ([]models.Message, error) {
	rows, err := s.db.Query(`
		SELECT m.id, m.channel_id,
		       CASE WHEN c.is_dm = 1 THEN COALESCE(dm_other.username, c.name) ELSE c.name END as display_name,
		       m.user_id, u.username, u.avatar_color,
		       m.content, COALESCE(m.file_url,''), COALESCE(m.file_type,''), m.created_at, m.edited_at
		FROM messages m
		JOIN users u ON m.user_id = u.id
		JOIN channels c ON m.channel_id = c.id
		JOIN channel_members cm ON c.id = cm.channel_id AND cm.user_id = ?
		LEFT JOIN users dm_other ON c.is_dm = 1 AND dm_other.id =
		    CASE WHEN c.dm_user1_id = ? THEN c.dm_user2_id ELSE c.dm_user1_id END
		ORDER BY m.created_at DESC
		LIMIT 2000`, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	query = strings.ToLower(query)
	var matches []models.Message
	for rows.Next() {
		var msg models.Message
		if err := rows.Scan(&msg.ID, &msg.ChannelID, &msg.ChannelName, &msg.UserID, &msg.Username,
			&msg.AvatarColor, &msg.Content, &msg.FileURL, &msg.FileType, &msg.CreatedAt, &msg.EditedAt); err != nil {
			return nil, err
		}
		msg.Content = s.crypto.Decrypt(msg.Content)
		msg.FileURL = s.crypto.Decrypt(msg.FileURL)
		if strings.Contains(strings.ToLower(msg.Content), query) ||
			strings.Contains(strings.ToLower(msg.Username), query) {
			matches = append(matches, msg)
			if len(matches) >= 50 {
				break
			}
		}
	}
	return matches, nil
}

// GetReplySnippet obtiene el extracto de un mensaje para mostrar en la respuesta.
func (s *ChannelService) GetReplySnippet(messageID int) *models.ReplySnippet {
	var snippet models.ReplySnippet
	var encContent string
	err := s.db.QueryRow(`
		SELECT m.id, u.username, m.content
		FROM messages m JOIN users u ON m.user_id = u.id
		WHERE m.id = ?`, messageID,
	).Scan(&snippet.ID, &snippet.Username, &encContent)
	if err != nil {
		return nil
	}
	snippet.Content = s.crypto.Decrypt(encContent)
	return &snippet
}

// UpdateMessage edita el contenido de un mensaje. Devuelve el channel_id del mensaje.
func (s *ChannelService) UpdateMessage(messageID, userID int, content string) (int, error) {
	encContent, err := s.crypto.Encrypt(content)
	if err != nil {
		return 0, err
	}
	res, err := s.db.Exec(
		"UPDATE messages SET content = ?, edited_at = NOW() WHERE id = ? AND user_id = ?",
		encContent, messageID, userID,
	)
	if err != nil {
		return 0, err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return 0, errors.New("not found or forbidden")
	}
	var channelID int
	s.db.QueryRow("SELECT channel_id FROM messages WHERE id = ?", messageID).Scan(&channelID)
	return channelID, nil
}

// DeleteMessage borra un mensaje. Los admin pueden borrar cualquiera.
func (s *ChannelService) DeleteMessage(messageID, userID int, isAdmin bool) (int, error) {
	var channelID int
	if err := s.db.QueryRow("SELECT channel_id FROM messages WHERE id = ?", messageID).Scan(&channelID); err != nil {
		return 0, errors.New("not found")
	}
	var query string
	var args []interface{}
	if isAdmin {
		query = "DELETE FROM messages WHERE id = ?"
		args = []interface{}{messageID}
	} else {
		query = "DELETE FROM messages WHERE id = ? AND user_id = ?"
		args = []interface{}{messageID, userID}
	}
	res, err := s.db.Exec(query, args...)
	if err != nil {
		return 0, err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return 0, errors.New("not found or forbidden")
	}
	return channelID, nil
}
