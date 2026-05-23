package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/yourusername/chat-app/config"
	"github.com/yourusername/chat-app/db"
	"github.com/yourusername/chat-app/handlers"
	"github.com/yourusername/chat-app/middleware"
	"github.com/yourusername/chat-app/services"
)

func main() {
	cfg := config.Load()

	if err := db.Connect(cfg); err != nil {
		log.Fatalf("Database connection failed: %v", err)
	}
	defer db.DB.Close()
	log.Println("Connected to database")

	// Services
	authSvc := services.NewAuthService(db.DB, cfg.JWTSecret)
	channelSvc := services.NewChannelService(db.DB)
	reactionSvc := services.NewReactionService(db.DB)
	adminSvc := services.NewAdminService(db.DB)
	hub := services.NewHub()
	go hub.Run()

	// Handlers
	authHandler := handlers.NewAuthHandler(authSvc)
	channelHandler := handlers.NewChannelHandler(channelSvc)
	reactionHandler := handlers.NewReactionHandler(reactionSvc)
	adminHandler := handlers.NewAdminHandler(adminSvc)
	profileHandler := handlers.NewProfileHandler(authSvc)
	wsHandler := handlers.NewWSHandler(hub, authSvc, channelSvc)
	authMiddleware := middleware.Auth(authSvc)
	adminMiddleware := middleware.Admin

	r := mux.NewRouter()
	r.Use(corsMiddleware)

	// Servir archivos subidos
	r.PathPrefix("/uploads/").Handler(http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads"))))

	// Public routes
	r.HandleFunc("/health", healthHandler).Methods("GET")
	r.HandleFunc("/auth/register", authHandler.Register).Methods("POST")
	r.HandleFunc("/auth/login", authHandler.Login).Methods("POST")

	// WebSocket (auth via query param)
	r.HandleFunc("/ws/{channelId}", wsHandler.Handle)

	// Protected API routes
	api := r.PathPrefix("/api").Subrouter()
	api.Use(authMiddleware)
	api.HandleFunc("/me", meHandler).Methods("GET")
	api.HandleFunc("/profile", profileHandler.Get).Methods("GET")
	api.HandleFunc("/profile", profileHandler.Update).Methods("PUT")
	api.HandleFunc("/profile/password", profileHandler.ChangePassword).Methods("PUT")
	api.HandleFunc("/channels", channelHandler.List).Methods("GET")
	api.Handle("/channels", adminMiddleware(http.HandlerFunc(channelHandler.Create))).Methods("POST")
	api.HandleFunc("/channels/{id}/messages", channelHandler.Messages).Methods("GET")
	api.HandleFunc("/channels/{id}/search", channelHandler.Search).Methods("GET")
	api.HandleFunc("/channels/{id}/join", channelHandler.Join).Methods("POST")
	api.HandleFunc("/upload", handlers.UploadHandler).Methods("POST")
	api.HandleFunc("/messages/{messageId}/reactions/{emoji}", reactionHandler.Toggle).Methods("POST")
	api.HandleFunc("/messages/{messageId}/reactions", reactionHandler.List).Methods("GET")

	// Admin routes (auth + admin role required)
	admin := api.PathPrefix("/admin").Subrouter()
	admin.Use(adminMiddleware)
	admin.HandleFunc("/users", adminHandler.ListUsers).Methods("GET")
	admin.HandleFunc("/users/{id}", adminHandler.DeleteUser).Methods("DELETE")
	admin.HandleFunc("/users/{id}/role", adminHandler.SetRole).Methods("PUT")
	admin.HandleFunc("/channels", adminHandler.ListChannels).Methods("GET")
	admin.HandleFunc("/channels/{id}", adminHandler.DeleteChannel).Methods("DELETE")

	log.Printf("Server running on :%s", cfg.Port)
	log.Fatal(http.ListenAndServe(":"+cfg.Port, r))
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"ok"}`))
}

func meHandler(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(middleware.UserKey)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(claims)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
