package models

import "time"

type Message struct {
	ID          int        `json:"id"`
	ChannelID   int        `json:"channel_id"`
	UserID      int        `json:"user_id"`
	Username    string     `json:"username"`
	AvatarColor string     `json:"avatar_color"`
	Content     string     `json:"content"`
	FileURL     string     `json:"file_url,omitempty"`
	FileType    string     `json:"file_type,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	EditedAt    *time.Time `json:"edited_at,omitempty"`
}

// WSMessage es el formato de mensaje enviado por WebSocket
type WSMessage struct {
	Type      string  `json:"type"`
	Message   Message `json:"message,omitempty"`
	ChannelID int     `json:"channel_id,omitempty"`
	MessageID int     `json:"message_id,omitempty"`
	Content   string  `json:"content,omitempty"`
	Username  string  `json:"username,omitempty"`
	FileURL   string  `json:"file_url,omitempty"`
	FileType  string  `json:"file_type,omitempty"`
	Edited    bool    `json:"edited,omitempty"`
}

type Reaction struct {
	ID        int    `json:"id"`
	MessageID int    `json:"message_id"`
	UserID    int    `json:"user_id"`
	Username  string `json:"username"`
	Emoji     string `json:"emoji"`
}
