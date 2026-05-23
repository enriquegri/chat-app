package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/yourusername/chat-app/services"
)

type AdminHandler struct {
	adminSvc *services.AdminService
}

func NewAdminHandler(adminSvc *services.AdminService) *AdminHandler {
	return &AdminHandler{adminSvc: adminSvc}
}

func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.adminSvc.ListUsers()
	if err != nil {
		jsonError(w, "failed to list users", http.StatusInternalServerError)
		return
	}
	if users == nil {
		jsonResponse(w, []interface{}{}, http.StatusOK)
		return
	}
	jsonResponse(w, users, http.StatusOK)
}

func (h *AdminHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := h.adminSvc.DeleteUser(id); err != nil {
		jsonError(w, "failed to delete user", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminHandler) SetRole(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	var body struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if err := h.adminSvc.SetRole(id, body.Role); err != nil {
		jsonError(w, "failed to update role", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminHandler) ListChannels(w http.ResponseWriter, r *http.Request) {
	channels, err := h.adminSvc.ListChannels()
	if err != nil {
		jsonError(w, "failed to list channels", http.StatusInternalServerError)
		return
	}
	if channels == nil {
		jsonResponse(w, []interface{}{}, http.StatusOK)
		return
	}
	jsonResponse(w, channels, http.StatusOK)
}

func (h *AdminHandler) DeleteChannel(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := h.adminSvc.DeleteChannel(id); err != nil {
		jsonError(w, "failed to delete channel", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
