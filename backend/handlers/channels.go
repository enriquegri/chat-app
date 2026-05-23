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
	hub        *services.Hub
}

func NewChannelHandler(channelSvc *services.ChannelService, hub *services.Hub) *ChannelHandler {
	return &ChannelHandler{channelSvc: channelSvc, hub: hub}
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

func (h *ChannelHandler) DMOpen(w http.ResponseWriter, r *http.Request) {
	targetID, err := strconv.Atoi(mux.Vars(r)["userId"])
	if err != nil {
		jsonError(w, "invalid user id", http.StatusBadRequest)
		return
	}
	userID := getUserID(r)
	if userID == targetID {
		jsonError(w, "cannot DM yourself", http.StatusBadRequest)
		return
	}
	ch, err := h.channelSvc.GetOrCreateDM(userID, targetID)
	if err != nil {
		jsonError(w, "error opening DM", http.StatusInternalServerError)
		return
	}
	jsonResponse(w, ch, http.StatusOK)
}

func (h *ChannelHandler) DMList(w http.ResponseWriter, r *http.Request) {
	convs, err := h.channelSvc.GetDMConversations(getUserID(r))
	if err != nil {
		jsonError(w, "error fetching DMs", http.StatusInternalServerError)
		return
	}
	if convs == nil {
		convs = []models.DMConversation{}
	}
	jsonResponse(w, convs, http.StatusOK)
}

func (h *ChannelHandler) UserList(w http.ResponseWriter, r *http.Request) {
	users, err := h.channelSvc.ListUsers(getUserID(r))
	if err != nil {
		jsonError(w, "error fetching users", http.StatusInternalServerError)
		return
	}
	if users == nil {
		users = []models.UserInfo{}
	}
	jsonResponse(w, users, http.StatusOK)
}

func (h *ChannelHandler) GlobalSearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if len(q) < 2 {
		jsonResponse(w, []models.Message{}, http.StatusOK)
		return
	}
	results, err := h.channelSvc.GlobalSearch(getUserID(r), q)
	if err != nil {
		jsonError(w, "search failed", http.StatusInternalServerError)
		return
	}
	if results == nil {
		results = []models.Message{}
	}
	jsonResponse(w, results, http.StatusOK)
}

func (h *ChannelHandler) EditMessage(w http.ResponseWriter, r *http.Request) {
	messageID, err := strconv.Atoi(mux.Vars(r)["messageId"])
	if err != nil {
		jsonError(w, "invalid message id", http.StatusBadRequest)
		return
	}
	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Content == "" {
		jsonError(w, "content required", http.StatusBadRequest)
		return
	}
	userID := getUserID(r)
	channelID, err := h.channelSvc.UpdateMessage(messageID, userID, body.Content)
	if err != nil {
		jsonError(w, "forbidden or not found", http.StatusForbidden)
		return
	}
	// Broadcast message_edited a todos en el canal
	out := models.WSMessage{Type: "message_edited", ChannelID: channelID, MessageID: messageID, Content: body.Content, Edited: true}
	if data, err := json.Marshal(out); err == nil {
		h.hub.Broadcast(data)
	}
	jsonResponse(w, map[string]string{"status": "ok"}, http.StatusOK)
}

func (h *ChannelHandler) DeleteMessage(w http.ResponseWriter, r *http.Request) {
	messageID, err := strconv.Atoi(mux.Vars(r)["messageId"])
	if err != nil {
		jsonError(w, "invalid message id", http.StatusBadRequest)
		return
	}
	userID := getUserID(r)
	// Comprobar si es admin
	raw := r.Context().Value(middleware.UserKey)
	claims := *raw.(*jwt.MapClaims)
	isAdmin := claims["role"] == "admin"

	channelID, err := h.channelSvc.DeleteMessage(messageID, userID, isAdmin)
	if err != nil {
		jsonError(w, "forbidden or not found", http.StatusForbidden)
		return
	}
	// Broadcast message_deleted
	out := models.WSMessage{Type: "message_deleted", ChannelID: channelID, MessageID: messageID}
	if data, err := json.Marshal(out); err == nil {
		h.hub.Broadcast(data)
	}
	w.WriteHeader(http.StatusNoContent)
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
