package models

import "time"

type Message struct {
	ID        int       `json:"id"`
	ChannelID int       `json:"channel_id"`
	UserID    int       `json:"user_id"`
	Username  string    `json:"username"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

// WSMessage es el formato de mensaje enviado por WebSocket
type WSMessage struct {
	Type      string  `json:"type"`
	Message   Message `json:"message,omitempty"`
	ChannelID int     `json:"channel_id,omitempty"`
	Content   string  `json:"content,omitempty"`
}
