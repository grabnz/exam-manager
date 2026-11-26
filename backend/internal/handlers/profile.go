package handlers

import (
	"net/http"

	"exam-manager/backend/internal/auth"
	"exam-manager/backend/internal/httpx"

	"gorm.io/gorm"
)

type ProfileHandler struct {
	DB *gorm.DB
}

func (h *ProfileHandler) Get(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	httpx.WriteJSON(w, http.StatusOK, map[string]string{
		"name":    u.FullName,
		"grade":   u.Grade,
		"subject": u.Subject,
	})
}

func (h *ProfileHandler) Update(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	var body struct {
		Name    string `json:"name"`
		Grade   string `json:"grade"`
		Subject string `json:"subject"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	u.FullName = body.Name
	u.Grade = body.Grade
	u.Subject = body.Subject
	if err := h.DB.Save(u).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{
		"name":    u.FullName,
		"grade":   u.Grade,
		"subject": u.Subject,
	})
}
