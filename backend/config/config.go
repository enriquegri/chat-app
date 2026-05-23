package config

import (
	"os"
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
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
