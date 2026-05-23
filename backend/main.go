package main

import (
	"fmt"
	"log"
	"net/http"
)

func main() {
	fmt.Println("Chat App Backend - Starting...")

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	log.Println("Server running on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
