package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/yourusername/chat-app/services"
)

type PushHandler struct {
	pushSvc *services.PushService
}

func NewPushHandler(svc *services.PushService) *PushHandler {
	return &PushHandler{pushSvc: svc}
}

// VAPIDPublicKey devuelve la clave pública VAPID para que el frontend pueda subscribirse.
func (h *PushHandler) VAPIDPublicKey(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, map[string]string{"key": h.pushSvc.VAPIDPublicKey()}, http.StatusOK)
}

// Subscribe guarda una suscripción Web Push para el usuario autenticado.
func (h *PushHandler) Subscribe(w http.ResponseWriter, r *http.Request) {
	var body services.PushSubscription
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Endpoint == "" {
		jsonError(w, "invalid subscription", http.StatusBadRequest)
		return
	}
	if err := h.pushSvc.SaveSubscription(getUserID(r), body); err != nil {
		jsonError(w, "could not save subscription", http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]string{"status": "subscribed"}, http.StatusOK)
}

// Unsubscribe elimina una suscripción Web Push.
func (h *PushHandler) Unsubscribe(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Endpoint string `json:"endpoint"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Endpoint == "" {
		jsonError(w, "endpoint required", http.StatusBadRequest)
		return
	}
	h.pushSvc.RemoveSubscription(getUserID(r), body.Endpoint)
	w.WriteHeader(http.StatusNoContent)
}
