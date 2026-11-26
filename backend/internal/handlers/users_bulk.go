package handlers

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"net/http"
	"strings"

	"exam-manager/backend/internal/auth"
	"exam-manager/backend/internal/db"
	"exam-manager/backend/internal/httpx"
)

func randomPassword(n int) string {
	const chars = "abcdefghjkmnpqrstuvwxyz23456789"
	out := make([]byte, n)
	for i := range out {
		idx, _ := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		out[i] = chars[idx.Int64()]
	}
	return string(out)
}

// BulkCreate (#17) creates multiple teacher accounts and returns their generated credentials.
func (h *UsersHandler) BulkCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Users []struct {
			FullName string `json:"full_name"`
			Username string `json:"username"`
			Password string `json:"password"`
			Role     string `json:"role"`
		} `json:"users"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	created := []map[string]any{}
	for idx, item := range body.Users {
		fullName := strings.TrimSpace(item.FullName)
		username := strings.ToLower(strings.TrimSpace(item.Username))
		if username == "" {
			if fullName == "" {
				continue
			}
			username = fmt.Sprintf("teacher.%d", idx+1)
		}
		if !usernameRe.MatchString(username) {
			continue
		}
		base := username
		suffix := 1
		for {
			var count int64
			h.DB.Model(&db.User{}).Where("username = ?", username).Count(&count)
			if count == 0 {
				break
			}
			suffix++
			username = fmt.Sprintf("%s%d", base, suffix)
		}
		pw := item.Password
		if len(pw) < 6 {
			pw = randomPassword(8)
		}
		role := item.Role
		if role != "admin" {
			role = "teacher"
		}
		hashed, err := auth.HashPassword(pw)
		if err != nil {
			continue
		}
		u := db.User{
			Username:           username,
			PasswordHash:       hashed,
			FullName:           fullName,
			Role:               role,
			IsActive:           true,
			MustChangePassword: true,
		}
		if err := h.DB.Create(&u).Error; err != nil {
			continue
		}
		created = append(created, map[string]any{
			"id":        u.ID,
			"username":  u.Username,
			"full_name": u.FullName,
			"password":  pw,
			"role":      u.Role,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, created)
}
