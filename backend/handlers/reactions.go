package handlers

import (
	"net/http"
	"strconv"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/mux"
	"github.com/yourusername/chat-app/middleware"
	"github.com/yourusername/chat-app/models"
	"github.com/yourusername/chat-app/services"
)

type ReactionHandler struct {
	reactionSvc *services.ReactionService
}

func NewReactionHandler(svc *services.ReactionService) *ReactionHandler {
	return &ReactionHandler{reactionSvc: svc}
}

func (h *ReactionHandler) Toggle(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	messageID, err := strconv.Atoi(vars["messageId"])
	if err != nil {
		jsonError(w, "invalid message id", http.StatusBadRequest)
		return
	}

	emoji := vars["emoji"]
	if emoji == "" {
		jsonError(w, "emoji required", http.StatusBadRequest)
		return
	}

	raw := r.Context().Value(middleware.UserKey)
	claims := *raw.(*jwt.MapClaims)
	userID := int(claims["user_id"].(float64))

	added, err := h.reactionSvc.Toggle(messageID, userID, emoji)
	if err != nil {
		jsonError(w, "error toggling reaction", http.StatusInternalServerError)
		return
	}

	status := "removed"
	if added {
		status = "added"
	}
	jsonResponse(w, map[string]string{"status": status}, http.StatusOK)
}

func (h *ReactionHandler) List(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	messageID, err := strconv.Atoi(vars["messageId"])
	if err != nil {
		jsonError(w, "invalid message id", http.StatusBadRequest)
		return
	}

	reactions, err := h.reactionSvc.GetForMessage(messageID)
	if err != nil {
		jsonError(w, "error fetching reactions", http.StatusInternalServerError)
		return
	}
	if reactions == nil {
		reactions = []models.Reaction{}
	}
	jsonResponse(w, reactions, http.StatusOK)
}
