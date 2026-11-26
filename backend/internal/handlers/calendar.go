package handlers

import (
	"net/http"
	"regexp"
	"strings"

	"exam-manager/backend/internal/auth"
	"exam-manager/backend/internal/db"
	"exam-manager/backend/internal/httpx"

	"gorm.io/gorm"
)

var (
	dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	timeRe = regexp.MustCompile(`^\d{2}:\d{2}$`)
)

var eventColors = map[string]bool{
	"blue": true, "green": true, "amber": true, "rose": true, "purple": true,
}

type CalendarHandler struct {
	DB *gorm.DB
}

func eventOut(e *db.CalendarEvent, userID string) map[string]any {
	var by *string
	if e.User != nil {
		name := e.User.FullName
		if name == "" {
			name = e.User.Username
		}
		by = &name
	}
	return map[string]any{
		"id":             e.ID,
		"title":          e.Title,
		"date":           e.Date,
		"time":           e.Time,
		"note":           e.Note,
		"color":          e.Color,
		"is_school_wide": e.IsSchoolWide,
		"is_mine":        e.UserID == userID,
		"by":             by,
	}
}

func (h *CalendarHandler) List(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	start := r.URL.Query().Get("start")
	end := r.URL.Query().Get("end")
	if !dateRe.MatchString(start) || !dateRe.MatchString(end) {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid date range")
		return
	}
	var events []db.CalendarEvent
	err := h.DB.Preload("User").
		Where("date >= ? AND date <= ?", start, end).
		Where("user_id = ? OR is_school_wide = ?", u.ID, true).
		Order("date ASC, time ASC").
		Find(&events).Error
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]map[string]any, 0, len(events))
	for i := range events {
		out = append(out, eventOut(&events[i], u.ID))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *CalendarHandler) Create(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	var body struct {
		Title        string  `json:"title"`
		Date         string  `json:"date"`
		Time         *string `json:"time"`
		Note         string  `json:"note"`
		Color        string  `json:"color"`
		IsSchoolWide bool    `json:"is_school_wide"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if strings.TrimSpace(body.Title) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "العنوان مطلوب")
		return
	}
	if !dateRe.MatchString(body.Date) {
		httpx.WriteError(w, http.StatusBadRequest, "تاريخ غير صالح")
		return
	}
	if body.Time != nil && *body.Time != "" && !timeRe.MatchString(*body.Time) {
		httpx.WriteError(w, http.StatusBadRequest, "توقيت غير صالح")
		return
	}
	if body.IsSchoolWide && u.Role != "admin" {
		httpx.WriteError(w, http.StatusForbidden, "فقط المدير يمكنه نشر أحداث للمدرسة كلها")
		return
	}
	color := body.Color
	if !eventColors[color] {
		color = "blue"
	}
	e := db.CalendarEvent{
		UserID:       u.ID,
		Title:        strings.TrimSpace(body.Title),
		Date:         body.Date,
		Time:         body.Time,
		Note:         strings.TrimSpace(body.Note),
		Color:        color,
		IsSchoolWide: body.IsSchoolWide,
		User:         u,
	}
	if err := h.DB.Create(&e).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, eventOut(&e, u.ID))
}

func (h *CalendarHandler) Delete(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	id := r.PathValue("event_id")
	var e db.CalendarEvent
	if err := h.DB.Where("id = ?", id).First(&e).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Event not found")
		return
	}
	if e.UserID != u.ID && u.Role != "admin" {
		httpx.WriteError(w, http.StatusForbidden, "Forbidden")
		return
	}
	if err := h.DB.Delete(&e).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
