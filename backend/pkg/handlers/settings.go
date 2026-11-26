package handlers

import (
	"net/http"
	"strings"

	"exam-manager/backend/pkg/db"
	"exam-manager/backend/pkg/httpx"

	"gorm.io/gorm"
)

type SettingsHandler struct {
	DB *gorm.DB
}

func settingsOut(s *db.SchoolSettings) map[string]string {
	if s == nil {
		return map[string]string{"school_name": "", "active_year": "", "region": ""}
	}
	return map[string]string{
		"school_name": s.SchoolName,
		"active_year": s.ActiveYear,
		"region":      s.Region,
	}
}

func (h *SettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	var s db.SchoolSettings
	if err := h.DB.Where("id = ?", 1).First(&s).Error; err != nil {
		httpx.WriteJSON(w, http.StatusOK, settingsOut(nil))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, settingsOut(&s))
}

func (h *SettingsHandler) Update(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SchoolName string `json:"school_name"`
		ActiveYear string `json:"active_year"`
		Region     string `json:"region"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	var s db.SchoolSettings
	if err := h.DB.Where("id = ?", 1).First(&s).Error; err != nil {
		s = db.SchoolSettings{ID: 1}
	}
	s.SchoolName = strings.TrimSpace(body.SchoolName)
	s.ActiveYear = strings.TrimSpace(body.ActiveYear)
	s.Region = strings.TrimSpace(body.Region)
	if err := h.DB.Save(&s).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, settingsOut(&s))
}
