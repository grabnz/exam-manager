package handlers

import (
	"net/http"
	"regexp"
	"strings"

	"exam-manager/backend/pkg/auth"
	"exam-manager/backend/pkg/db"
	"exam-manager/backend/pkg/httpx"

	"gorm.io/gorm"
)

var usernameRe = regexp.MustCompile(`^[a-z0-9._-]{3,30}$`)

type UsersHandler struct {
	DB *gorm.DB
}

func userRow(u *db.User, classCount int) map[string]any {
	maxH := u.MaxWeeklyHours
	if maxH <= 0 {
		maxH = 25
	}
	return map[string]any{
		"id":                   u.ID,
		"username":             u.Username,
		"full_name":            u.FullName,
		"grade":                u.Grade,
		"role":                 u.Role,
		"max_weekly_hours":     maxH,
		"is_active":            u.IsActive,
		"must_change_password": u.MustChangePassword,
		"class_count":          classCount,
	}
}

func assignedClassCount(assignments []db.TeacherAssignment) int {
	seen := map[string]bool{}
	for _, a := range assignments {
		seen[a.ClassID] = true
	}
	return len(seen)
}

func (h *UsersHandler) List(w http.ResponseWriter, r *http.Request) {
	var users []db.User
	if err := h.DB.Preload("Assignments").Order("created_at ASC").Find(&users).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]map[string]any, 0, len(users))
	for i := range users {
		out = append(out, userRow(&users[i], assignedClassCount(users[i].Assignments)))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *UsersHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username       string   `json:"username"`
		Password       string   `json:"password"`
		FullName       string   `json:"full_name"`
		Grade          string   `json:"grade"`
		Role           string   `json:"role"`
		MaxWeeklyHours *float64 `json:"max_weekly_hours"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	username := strings.ToLower(strings.TrimSpace(body.Username))
	if !usernameRe.MatchString(username) {
		httpx.WriteError(w, http.StatusBadRequest, "اسم المستخدم: 3-30 حرفاً لاتينياً صغيراً أو أرقاماً (. _ - مسموحة)")
		return
	}
	if len(body.Password) < 6 {
		httpx.WriteError(w, http.StatusBadRequest, "كلمة المرور يجب أن تتكون من 6 أحرف على الأقل")
		return
	}
	role := body.Role
	if role == "" {
		role = "teacher"
	}
	if role != "teacher" && role != "admin" {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid role")
		return
	}
	var count int64
	h.DB.Model(&db.User{}).Where("username = ?", username).Count(&count)
	if count > 0 {
		httpx.WriteError(w, http.StatusConflict, "اسم المستخدم موجود مسبقاً")
		return
	}
	hashed, err := auth.HashPassword(body.Password)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to hash password")
		return
	}
	maxHours := 25.0
	if body.MaxWeeklyHours != nil && *body.MaxWeeklyHours > 0 {
		maxHours = *body.MaxWeeklyHours
	}
	u := db.User{
		Username:           username,
		PasswordHash:       hashed,
		FullName:           strings.TrimSpace(body.FullName),
		Grade:              strings.TrimSpace(body.Grade),
		Role:               role,
		MaxWeeklyHours:     maxHours,
		IsActive:           true,
		MustChangePassword: true,
	}
	if err := h.DB.Create(&u).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, userRow(&u, 0))
}

func (h *UsersHandler) Update(w http.ResponseWriter, r *http.Request) {
	admin := auth.UserFromContext(r.Context())
	userID := r.PathValue("user_id")
	var u db.User
	if err := h.DB.Preload("Assignments").Where("id = ?", userID).First(&u).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "User not found")
		return
	}
	var body struct {
		FullName       *string  `json:"full_name"`
		Grade          *string  `json:"grade"`
		IsActive       *bool    `json:"is_active"`
		MaxWeeklyHours *float64 `json:"max_weekly_hours"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if body.IsActive != nil && !*body.IsActive && u.ID == admin.ID {
		httpx.WriteError(w, http.StatusBadRequest, "لا يمكن تعطيل حسابكم الخاص")
		return
	}
	if body.FullName != nil {
		u.FullName = strings.TrimSpace(*body.FullName)
	}
	if body.Grade != nil {
		u.Grade = strings.TrimSpace(*body.Grade)
	}
	if body.IsActive != nil {
		u.IsActive = *body.IsActive
	}
	if body.MaxWeeklyHours != nil && *body.MaxWeeklyHours > 0 {
		u.MaxWeeklyHours = *body.MaxWeeklyHours
	}
	if err := h.DB.Save(&u).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, userRow(&u, assignedClassCount(u.Assignments)))
}

func (h *UsersHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	userID := r.PathValue("user_id")
	var u db.User
	if err := h.DB.Where("id = ?", userID).First(&u).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "User not found")
		return
	}
	var body struct {
		Password string `json:"password"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if len(body.Password) < 6 {
		httpx.WriteError(w, http.StatusBadRequest, "كلمة المرور يجب أن تتكون من 6 أحرف على الأقل")
		return
	}
	hashed, err := auth.HashPassword(body.Password)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to hash password")
		return
	}
	u.PasswordHash = hashed
	u.MustChangePassword = true
	if err := h.DB.Save(&u).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *UsersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	admin := auth.UserFromContext(r.Context())
	userID := r.PathValue("user_id")
	var u db.User
	if err := h.DB.Where("id = ?", userID).First(&u).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "User not found")
		return
	}
	if u.ID == admin.ID {
		httpx.WriteError(w, http.StatusBadRequest, "لا يمكن حذف حسابكم الخاص")
		return
	}
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&db.Class{}).Where("owner_id = ?", u.ID).Update("owner_id", nil).Error; err != nil {
			return err
		}
		if err := tx.Model(&db.ScoreEntry{}).Where("updated_by = ?", u.ID).Update("updated_by", nil).Error; err != nil {
			return err
		}
		if tx.Migrator().HasTable("official_documents") {
			if err := tx.Model(&db.OfficialDocument{}).Where("uploaded_by = ?", u.ID).Update("uploaded_by", nil).Error; err != nil {
				return err
			}
		}
		if tx.Migrator().HasTable("calendar_events") {
			if err := tx.Where("user_id = ?", u.ID).Delete(&db.CalendarEvent{}).Error; err != nil {
				return err
			}
		}
		if tx.Migrator().HasTable("timetable_slots") {
			if err := tx.Where("teacher_id = ?", u.ID).Delete(&db.TimetableSlot{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("teacher_id = ?", u.ID).Delete(&db.TeacherAssignment{}).Error; err != nil {
			return err
		}
		return tx.Delete(&u).Error
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
