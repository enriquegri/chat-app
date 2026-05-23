package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/yourusername/chat-app/services"
)

type TwoFAHandler struct {
	authSvc *services.AuthService
}

func NewTwoFAHandler(authSvc *services.AuthService) *TwoFAHandler {
	return &TwoFAHandler{authSvc: authSvc}
}

// Setup genera un secreto TOTP y devuelve el otpauth:// URL para el QR code.
// Requiere autenticación (el usuario ya ha iniciado sesión y quiere activar 2FA).
func (h *TwoFAHandler) Setup(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	// Necesitamos el username para el QR code
	user, err := h.authSvc.GetUserByID(userID)
	if err != nil {
		jsonError(w, "user not found", http.StatusInternalServerError)
		return
	}

	secret, otpauthURL, err := h.authSvc.GenerateTOTPSetup(user.Username)
	if err != nil {
		jsonError(w, "failed to generate 2FA secret", http.StatusInternalServerError)
		return
	}

	jsonResponse(w, map[string]string{
		"secret":      secret,
		"otpauth_url": otpauthURL,
	}, http.StatusOK)
}

// Enable verifica el código TOTP y activa 2FA para el usuario autenticado.
func (h *TwoFAHandler) Enable(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Secret string `json:"secret"`
		Code   string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Code == "" || body.Secret == "" {
		jsonError(w, "secret and code are required", http.StatusBadRequest)
		return
	}
	if err := h.authSvc.EnableTOTP(getUserID(r), body.Secret, body.Code); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResponse(w, map[string]bool{"enabled": true}, http.StatusOK)
}

// Disable desactiva 2FA tras verificar el código actual.
func (h *TwoFAHandler) Disable(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Code == "" {
		jsonError(w, "code is required", http.StatusBadRequest)
		return
	}
	if err := h.authSvc.DisableTOTP(getUserID(r), body.Code); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResponse(w, map[string]bool{"enabled": false}, http.StatusOK)
}

// Status devuelve si el usuario autenticado tiene 2FA habilitado.
func (h *TwoFAHandler) Status(w http.ResponseWriter, r *http.Request) {
	enabled := h.authSvc.TOTPEnabled(getUserID(r))
	jsonResponse(w, map[string]bool{"enabled": enabled}, http.StatusOK)
}

// Verify es un endpoint público que acepta un temp_token + código TOTP
// y devuelve el JWT completo si son válidos.
func (h *TwoFAHandler) Verify(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TempToken string `json:"temp_token"`
		Code      string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Code == "" || body.TempToken == "" {
		jsonError(w, "temp_token and code are required", http.StatusBadRequest)
		return
	}
	resp, err := h.authSvc.Verify2FA(body.TempToken, body.Code)
	if err != nil {
		jsonError(w, err.Error(), http.StatusUnauthorized)
		return
	}
	jsonResponse(w, resp, http.StatusOK)
}
