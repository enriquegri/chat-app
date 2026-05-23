package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/golang-jwt/jwt/v5"
	"github.com/yourusername/chat-app/middleware"
	"github.com/yourusername/chat-app/models"
	"github.com/yourusername/chat-app/services"
)

type ProfileHandler struct {
	authSvc *services.AuthService
}

func NewProfileHandler(authSvc *services.AuthService) *ProfileHandler {
	return &ProfileHandler{authSvc: authSvc}
}

func (h *ProfileHandler) Get(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(middleware.UserKey).(*jwt.MapClaims)
	userID := int((*claims)["user_id"].(float64))

	user, err := h.authSvc.GetUserByID(userID)
	if err != nil {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}
	jsonResponse(w, user, http.StatusOK)
}

func (h *ProfileHandler) Update(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(middleware.UserKey).(*jwt.MapClaims)
	userID := int((*claims)["user_id"].(float64))

	var req models.UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	user, err := h.authSvc.UpdateProfile(userID, req)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResponse(w, user, http.StatusOK)
}

func (h *ProfileHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(middleware.UserKey).(*jwt.MapClaims)
	userID := int((*claims)["user_id"].(float64))

	var req models.ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.authSvc.ChangePassword(userID, req); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
