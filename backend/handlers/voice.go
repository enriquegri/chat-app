package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/mux"
	"github.com/yourusername/chat-app/middleware"
	"github.com/yourusername/chat-app/services"
)

type VoiceHandler struct {
	channelSvc    *services.ChannelService
	livekitURL    string
	livekitAPIKey string
	livekitSecret string
}

func NewVoiceHandler(channelSvc *services.ChannelService, url, apiKey, secret string) *VoiceHandler {
	return &VoiceHandler{
		channelSvc:    channelSvc,
		livekitURL:    url,
		livekitAPIKey: apiKey,
		livekitSecret: secret,
	}
}

func (h *VoiceHandler) Token(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	username := getUsername(r)

	channelID, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		jsonError(w, "invalid channel id", http.StatusBadRequest)
		return
	}

	if ok, _ := h.channelSvc.IsMember(channelID, userID); !ok {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	room := fmt.Sprintf("channel-%d", channelID)
	identity := fmt.Sprintf("%d", userID)

	now := time.Now()
	claims := jwt.MapClaims{
		"iss":  h.livekitAPIKey,
		"exp":  now.Add(6 * time.Hour).Unix(),
		"nbf":  now.Add(-10 * time.Second).Unix(),
		"sub":  identity,
		"name": username,
		"video": map[string]interface{}{
			"room":     room,
			"roomJoin": true,
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(h.livekitSecret))
	if err != nil {
		jsonError(w, "token generation failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"token": signed,
		"url":   h.livekitURL,
	})
}

func getUsername(r *http.Request) string {
	raw := r.Context().Value(middleware.UserKey)
	if raw == nil {
		return ""
	}
	claims, ok := raw.(*jwt.MapClaims)
	if !ok {
		return ""
	}
	if name, ok := (*claims)["username"].(string); ok {
		return name
	}
	return ""
}
