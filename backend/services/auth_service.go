package services

import (
	"database/sql"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/pquerna/otp/totp"
	"github.com/yourusername/chat-app/models"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	db        *sql.DB
	jwtSecret []byte
	crypto    *Crypto
}

func NewAuthService(db *sql.DB, jwtSecret string, crypto *Crypto) *AuthService {
	return &AuthService{db: db, jwtSecret: []byte(jwtSecret), crypto: crypto}
}

func (s *AuthService) Register(req models.RegisterRequest) (*models.AuthResponse, error) {
	if req.Username == "" || req.Email == "" || req.Password == "" {
		return nil, errors.New("username, email and password are required")
	}
	if len(req.Password) < 8 {
		return nil, errors.New("password must be at least 8 characters")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	encEmail, err := s.crypto.Encrypt(req.Email)
	if err != nil {
		return nil, err
	}
	emailHash := s.crypto.HMAC(req.Email)

	result, err := s.db.Exec(
		"INSERT INTO users (username, email, email_hash, password_hash) VALUES (?, ?, ?, ?)",
		req.Username, encEmail, emailHash, string(hash),
	)
	if err != nil {
		return nil, errors.New("username or email already exists")
	}

	id, _ := result.LastInsertId()

	// Auto-join canales #general y #random
	s.db.Exec("INSERT IGNORE INTO channel_members (channel_id, user_id) VALUES (1, ?), (2, ?)", id, id)

	user := models.User{
		ID:       int(id),
		Username: req.Username,
		Email:    req.Email,
		Role:     "user",
	}

	token, err := s.generateToken(user)
	if err != nil {
		return nil, err
	}

	return &models.AuthResponse{Token: token, User: user}, nil
}

func (s *AuthService) Login(req models.LoginRequest) (*models.AuthResponse, error) {
	var user models.User
	var hash string
	var totpEnabled bool

	emailHash := s.crypto.HMAC(req.Email)
	err := s.db.QueryRow(
		"SELECT id, username, email, role, bio, avatar_color, password_hash, created_at, COALESCE(totp_enabled, FALSE) FROM users WHERE email_hash = ?",
		emailHash,
	).Scan(&user.ID, &user.Username, &user.Email, &user.Role, &user.Bio, &user.AvatarColor, &hash, &user.CreatedAt, &totpEnabled)

	if err == sql.ErrNoRows {
		return nil, errors.New("invalid credentials")
	}
	if err != nil {
		return nil, err
	}

	user.Email = s.crypto.Decrypt(user.Email)
	user.Bio = s.crypto.Decrypt(user.Bio)

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		return nil, errors.New("invalid credentials")
	}

	// Si el usuario tiene 2FA habilitado, devolver un token temporal
	if totpEnabled {
		tempToken, err := s.generateTempToken(user.ID)
		if err != nil {
			return nil, err
		}
		return &models.AuthResponse{Requires2FA: true, TempToken: tempToken}, nil
	}

	token, err := s.generateToken(user)
	if err != nil {
		return nil, err
	}

	return &models.AuthResponse{Token: token, User: user}, nil
}

func (s *AuthService) ValidateToken(tokenStr string) (*jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return s.jwtSecret, nil
	})
	if err != nil || !token.Valid {
		return nil, errors.New("invalid token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid token claims")
	}

	return &claims, nil
}

func (s *AuthService) GetUserByID(id int) (*models.User, error) {
	var user models.User
	err := s.db.QueryRow(
		"SELECT id, username, email, role, bio, avatar_color, created_at FROM users WHERE id = ?", id,
	).Scan(&user.ID, &user.Username, &user.Email, &user.Role, &user.Bio, &user.AvatarColor, &user.CreatedAt)
	if err != nil {
		return nil, err
	}
	user.Email = s.crypto.Decrypt(user.Email)
	user.Bio = s.crypto.Decrypt(user.Bio)
	return &user, nil
}

func (s *AuthService) UpdateProfile(userID int, req models.UpdateProfileRequest) (*models.User, error) {
	if len(req.Bio) > 200 {
		return nil, errors.New("bio must be 200 characters or less")
	}
	color := req.AvatarColor
	if len(color) != 7 || color[0] != '#' {
		color = "#5865f2"
	}
	encBio, err := s.crypto.Encrypt(req.Bio)
	if err != nil {
		return nil, err
	}
	_, err = s.db.Exec(
		"UPDATE users SET bio = ?, avatar_color = ? WHERE id = ?",
		encBio, color, userID,
	)
	if err != nil {
		return nil, err
	}
	return s.GetUserByID(userID)
}

func (s *AuthService) ChangePassword(userID int, req models.ChangePasswordRequest) error {
	if len(req.NewPassword) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	var hash string
	err := s.db.QueryRow("SELECT password_hash FROM users WHERE id = ?", userID).Scan(&hash)
	if err != nil {
		return errors.New("user not found")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.CurrentPassword)); err != nil {
		return errors.New("current password is incorrect")
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.db.Exec("UPDATE users SET password_hash = ? WHERE id = ?", string(newHash), userID)
	return err
}

func (s *AuthService) generateToken(user models.User) (string, error) {
	claims := jwt.MapClaims{
		"user_id":  user.ID,
		"username": user.Username,
		"email":    user.Email,
		"role":     user.Role,
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

func (s *AuthService) generateTempToken(userID int) (string, error) {
	claims := jwt.MapClaims{
		"user_id": userID,
		"type":    "2fa_pending",
		"exp":     time.Now().Add(5 * time.Minute).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

// ── TOTP / 2FA ──────────────────────────────────────────────────────────────

// GenerateTOTPSetup crea un secreto TOTP para el usuario y devuelve el secreto
// y la URL otpauth:// para generar el QR code en el frontend.
func (s *AuthService) GenerateTOTPSetup(username string) (secret, otpauthURL string, err error) {
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "ChatApp",
		AccountName: username,
	})
	if err != nil {
		return "", "", err
	}
	return key.Secret(), key.URL(), nil
}

// EnableTOTP verifica el código y habilita 2FA para el usuario.
func (s *AuthService) EnableTOTP(userID int, secret, code string) error {
	if !totp.Validate(code, secret) {
		return errors.New("invalid code — check your authenticator app clock")
	}
	encSecret, err := s.crypto.Encrypt(secret)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		"UPDATE users SET totp_secret = ?, totp_enabled = TRUE WHERE id = ?",
		encSecret, userID,
	)
	return err
}

// DisableTOTP deshabilita 2FA tras verificar el código actual.
func (s *AuthService) DisableTOTP(userID int, code string) error {
	var encSecret string
	if err := s.db.QueryRow("SELECT COALESCE(totp_secret,'') FROM users WHERE id = ?", userID).Scan(&encSecret); err != nil {
		return errors.New("user not found")
	}
	secret := s.crypto.Decrypt(encSecret)
	if !totp.Validate(code, secret) {
		return errors.New("invalid code")
	}
	_, err := s.db.Exec("UPDATE users SET totp_secret = NULL, totp_enabled = FALSE WHERE id = ?", userID)
	return err
}

// Verify2FA valida el token temporal + el código TOTP y devuelve el JWT completo.
func (s *AuthService) Verify2FA(tempTokenStr, code string) (*models.AuthResponse, error) {
	claims, err := s.ValidateToken(tempTokenStr)
	if err != nil {
		return nil, errors.New("invalid or expired token")
	}
	if (*claims)["type"] != "2fa_pending" {
		return nil, errors.New("invalid token type")
	}

	userID := int((*claims)["user_id"].(float64))

	var encSecret string
	var user models.User
	err = s.db.QueryRow(
		"SELECT id, username, email, role, bio, avatar_color, COALESCE(totp_secret,'') FROM users WHERE id = ?",
		userID,
	).Scan(&user.ID, &user.Username, &user.Email, &user.Role, &user.Bio, &user.AvatarColor, &encSecret)
	if err != nil {
		return nil, errors.New("user not found")
	}
	user.Email = s.crypto.Decrypt(user.Email)
	user.Bio = s.crypto.Decrypt(user.Bio)

	secret := s.crypto.Decrypt(encSecret)
	if !totp.Validate(code, secret) {
		return nil, errors.New("invalid code")
	}

	token, err := s.generateToken(user)
	if err != nil {
		return nil, err
	}
	return &models.AuthResponse{Token: token, User: user}, nil
}

// TOTPEnabled devuelve si el usuario tiene 2FA habilitado.
func (s *AuthService) TOTPEnabled(userID int) bool {
	var enabled bool
	s.db.QueryRow("SELECT COALESCE(totp_enabled, FALSE) FROM users WHERE id = ?", userID).Scan(&enabled)
	return enabled
}
