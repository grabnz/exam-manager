package handler

import (
	"net/http"
	"sync"

	"exam-manager/backend/internal/app"
)

var (
	once    sync.Once
	root    http.Handler
	initErr error
)

// Handler is the Vercel Go Serverless Function entrypoint.
func Handler(w http.ResponseWriter, r *http.Request) {
	once.Do(func() {
		root, initErr = app.New()
	})
	if initErr != nil {
		http.Error(w, "backend initialization failed: "+initErr.Error(), http.StatusInternalServerError)
		return
	}
	root.ServeHTTP(w, r)
}
