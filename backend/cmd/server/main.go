package main

import (
	"log"
	"net/http"
	"os"

	"exam-manager/backend/pkg/app"
)

func main() {
	handler, err := app.New()
	if err != nil {
		log.Fatalf("failed to initialize app: %v", err)
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}
	addr := ":" + port
	log.Printf("Exam Manager Go API listening on http://localhost%s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}
