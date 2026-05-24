package models

import "time"

// ReplySnippet es el extracto del mensaje al que se responde
type ReplySnippet struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Content  string `json:"content"`
}

type Message struct {
	ID          int           `json:"id"`
	ChannelID   int           `json:"channel_id"`
	ChannelName string        `json:"channel_name,omitempty"`
	UserID      int           `json:"user_id"`
	Username    string        `json:"username"`
	AvatarColor string        `json:"avatar_color"`
	Content     string        `json:"content"`
	FileURL     string        `json:"file_url,omitempty"`
	FileType    string        `json:"file_type,omitempty"`
	CreatedAt   time.Time     `json:"created_at"`
	EditedAt    *time.Time    `json:"edited_at,omitempty"`
	ReplyToID   *int          `json:"reply_to_id,omitempty"`
	ReplyTo     *ReplySnippet `json:"reply_to,omitempty"`
	ReplyCount  int           `json:"reply_count,omitempty"`
	Reactions   []Reaction    `json:"reactions"`
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
	ReplyToID int     `json:"reply_to_id,omitempty"`
}

type Reaction struct {
	ID        int    `json:"id"`
	MessageID int    `json:"message_id"`
	UserID    int    `json:"user_id"`
	Username  string `json:"username"`
	Emoji     string `json:"emoji"`
}
