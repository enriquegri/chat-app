package models

import "time"

type Channel struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedBy   int       `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
}

type CreateChannelRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}
