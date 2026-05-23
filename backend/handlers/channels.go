package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/mux"
	"github.com/yourusername/chat-app/middleware"
	"github.com/yourusername/chat-app/models"
	"github.com/yourusername/chat-app/services"
)

type ChannelHandler struct {
	channelSvc *services.ChannelService
}

func NewChannelHandler(channelSvc *services.ChannelService) *ChannelHandler {
	return &ChannelHandler{channelSvc: channelSvc}
}

func (h *ChannelHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	channels, err := h.channelSvc.GetUserChannels(userID)
	if err != nil {
		jsonError(w, "error fetching channels", http.StatusInternalServerError)
		return
	}
	if channels == nil {
		channels = []models.Channel{}
	}
	jsonResponse(w, channels, http.StatusOK)
}

func (h *ChannelHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var req models.CreateChannelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	ch, err := h.channelSvc.Create(req, userID)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	jsonResponse(w, ch, http.StatusCreated)
}

func (h *ChannelHandler) Messages(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	channelID, err := strconv.Atoi(vars["id"])
	if err != nil {
		jsonError(w, "invalid channel id", http.StatusBadRequest)
		return
	}

	if ok, _ := h.channelSvc.IsMember(channelID, getUserID(r)); !ok {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	messages, err := h.channelSvc.GetMessages(channelID, 50)
	if err != nil {
		jsonError(w, "error fetching messages", http.StatusInternalServerError)
		return
	}
	if messages == nil {
		messages = []models.Message{}
	}
	jsonResponse(w, messages, http.StatusOK)
}

func (h *ChannelHandler) Search(w http.ResponseWriter, r *http.Request) {
	channelID, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		jsonError(w, "invalid channel id", http.StatusBadRequest)
		return
	}

	if ok, _ := h.channelSvc.IsMember(channelID, getUserID(r)); !ok {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	q := r.URL.Query().Get("q")
	if len(q) < 2 {
		jsonResponse(w, []models.Message{}, http.StatusOK)
		return
	}

	messages, err := h.channelSvc.SearchMessages(channelID, q)
	if err != nil {
		jsonError(w, "search failed", http.StatusInternalServerError)
		return
	}
	if messages == nil {
		messages = []models.Message{}
	}
	jsonResponse(w, messages, http.StatusOK)
}

func (h *ChannelHandler) Join(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	channelID, err := strconv.Atoi(vars["id"])
	if err != nil {
		jsonError(w, "invalid channel id", http.StatusBadRequest)
		return
	}

	userID := getUserID(r)
	if err := h.channelSvc.JoinChannel(channelID, userID); err != nil {
		jsonError(w, "error joining channel", http.StatusInternalServerError)
		return
	}

	jsonResponse(w, map[string]string{"status": "joined"}, http.StatusOK)
}

func getUserID(r *http.Request) int {
	raw := r.Context().Value(middleware.UserKey)
	if raw == nil {
		return 0
	}
	claims, ok := raw.(*jwt.MapClaims)
	if !ok {
		return 0
	}
	if id, ok := (*claims)["user_id"].(float64); ok {
		return int(id)
	}
	return 0
}
