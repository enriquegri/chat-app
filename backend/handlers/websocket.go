package handlers

import (
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/golang-jwt/jwt/v5"
	"github.com/yourusername/chat-app/services"
)

type WSHandler struct {
	hub            *services.Hub
	authSvc        *services.AuthService
	channelSvc     *services.ChannelService
	allowedOrigins map[string]bool
}

func NewWSHandler(hub *services.Hub, authSvc *services.AuthService, channelSvc *services.ChannelService, allowedOrigins map[string]bool) *WSHandler {
	return &WSHandler{hub: hub, authSvc: authSvc, channelSvc: channelSvc, allowedOrigins: allowedOrigins}
}

func (h *WSHandler) upgrader() *websocket.Upgrader {
	return &websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" {
				return true // APK Capacitor no envía Origin
			}
			return h.allowedOrigins[origin]
		},
	}
}

func (h *WSHandler) Handle(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	channelID, err := strconv.Atoi(vars["channelId"])
	if err != nil {
		http.Error(w, "invalid channel id", http.StatusBadRequest)
		return
	}

	// Autenticación por query param (WebSocket no soporta headers custom)
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	claims, err := h.authSvc.ValidateToken(tokenStr)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	mapClaims := *claims
	userID := int(mapClaims["user_id"].(float64))
	username := mapClaims["username"].(string)

	if ok, _ := h.channelSvc.IsMember(channelID, userID); !ok {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	conn, err := h.upgrader().Upgrade(w, r, nil)
	if err != nil {
		return
	}

	client := &services.Client{
		ID:        userID,
		Username:  username,
		ChannelID: channelID,
		Conn:      conn,
		Send:      make(chan []byte, 256),
	}

	h.hub.Register(client)

	go client.WritePump()
	client.ReadPump(h.hub, h.channelSvc)
}

// Helper para extraer claims del contexto en otros handlers
func extractClaims(claims interface{}) jwt.MapClaims {
	if c, ok := claims.(*jwt.MapClaims); ok {
		return *c
	}
	return nil
}
