package services

import (
	"database/sql"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
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

	emailHash := s.crypto.HMAC(req.Email)
	err := s.db.QueryRow(
		"SELECT id, username, email, role, bio, avatar_color, password_hash, created_at FROM users WHERE email_hash = ?",
		emailHash,
	).Scan(&user.ID, &user.Username, &user.Email, &user.Role, &user.Bio, &user.AvatarColor, &hash, &user.CreatedAt)

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
