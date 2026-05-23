package config

import (
	"encoding/hex"
	"log"
	"os"
	"strings"
)

type Config struct {
	Port                string
	DBHost              string
	DBPort              string
	DBUser              string
	DBPass              string
	DBName              string
	JWTSecret           string
	RegistrationEnabled bool
	AllowedOrigins      map[string]bool
	EncryptionKey       []byte
	VAPIDPublicKey      string
	VAPIDPrivateKey     string
}

func Load() *Config {
	return &Config{
		Port:                getEnv("PORT", "8080"),
		DBHost:              getEnv("DB_HOST", "localhost"),
		DBPort:              getEnv("DB_PORT", "3306"),
		DBUser:              getEnv("DB_USER", "chatapp"),
		DBPass:              getEnv("DB_PASSWORD", "chatapppass"),
		DBName:              getEnv("DB_NAME", "chatapp"),
		JWTSecret:           getEnv("JWT_SECRET", "supersecretkey-change-in-production"),
		RegistrationEnabled: getEnv("REGISTRATION_ENABLED", "false") == "true",
		AllowedOrigins:      parseOrigins(getEnv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:4173")),
		EncryptionKey:       parseHexKey(getEnv("ENCRYPTION_KEY", "")),
		VAPIDPublicKey:      getEnv("VAPID_PUBLIC_KEY", ""),
		VAPIDPrivateKey:     getEnv("VAPID_PRIVATE_KEY", ""),
	}
}

func parseHexKey(s string) []byte {
	if s == "" {
		log.Fatal("ENCRYPTION_KEY is required — generate one with: openssl rand -hex 32")
	}
	b, err := hex.DecodeString(s)
	if err != nil || len(b) != 32 {
		log.Fatal("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)")
	}
	return b
}

func parseOrigins(raw string) map[string]bool {
	origins := make(map[string]bool)
	for _, o := range strings.Split(raw, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			origins[o] = true
		}
	}
	return origins
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
