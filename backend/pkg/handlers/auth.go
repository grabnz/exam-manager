package handlers

import (
	"net/http"
	"strings"

	"exam-manager/backend/pkg/auth"
	"exam-manager/backend/pkg/db"
	"exam-manager/backend/pkg/httpx"

	"gorm.io/gorm"
)

type AuthHandler struct {
	DB *gorm.DB
}

func userOut(u *db.User) map[string]any {
	return map[string]any{
		"id":                   u.ID,
		"username":             u.Username,
		"full_name":            u.FullName,
		"grade":                u.Grade,
		"subject":              u.Subject,
		"role":                 u.Role,
		"must_change_password": u.MustChangePassword,
	}
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if body.Password == "" {
		httpx.WriteError(w, http.StatusUnauthorized, "اسم المستخدم أو كلمة المرور غير صحيحة")
		return
	}
	username := strings.ToLower(strings.TrimSpace(body.Username))
	var user db.User
	if err := h.DB.Where("username = ?", username).First(&user).Error; err != nil || !auth.VerifyPassword(body.Password, user.PasswordHash) {
		httpx.WriteError(w, http.StatusUnauthorized, "اسم المستخدم أو كلمة المرور غير صحيحة")
		return
	}
	if !user.IsActive {
		httpx.WriteError(w, http.StatusForbidden, "هذا الحساب معطَّل. اتصلوا بالإدارة.")
		return
	}
	tok, err := auth.CreateToken(&user)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to create token")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"token": tok,
		"user":  userOut(&user),
	})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	httpx.WriteJSON(w, http.StatusOK, userOut(u))
}

func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if !auth.VerifyPassword(body.CurrentPassword, u.PasswordHash) {
		httpx.WriteError(w, http.StatusBadRequest, "كلمة المرور الحالية غير صحيحة")
		return
	}
	if len(body.NewPassword) < 6 {
		httpx.WriteError(w, http.StatusBadRequest, "كلمة المرور الجديدة يجب أن تتكون من 6 أحرف على الأقل")
		return
	}
	hashed, err := auth.HashPassword(body.NewPassword)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to hash password")
		return
	}
	u.PasswordHash = hashed
	u.MustChangePassword = false
	if err := h.DB.Save(u).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to save password")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "user": userOut(u)})
}
