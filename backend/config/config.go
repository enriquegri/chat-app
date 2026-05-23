package config

import (
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
	}
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
