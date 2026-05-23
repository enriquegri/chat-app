package models

import "time"

type Channel struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedBy   int       `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	IsPrivate   bool      `json:"is_private"`
}

type CreateChannelRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	IsPrivate   bool   `json:"is_private"`
}

type DMConversation struct {
	ChannelID   int    `json:"channel_id"`
	UserID      int    `json:"user_id"`
	Username    string `json:"username"`
	AvatarColor string `json:"avatar_color"`
}

type UserInfo struct {
	ID          int    `json:"id"`
	Username    string `json:"username"`
	AvatarColor string `json:"avatar_color"`
}
