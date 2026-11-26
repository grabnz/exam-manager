package auth

import (
	"context"
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"exam-manager/backend/internal/db"
	"exam-manager/backend/internal/httpx"

	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

const pbkdf2Iterations = 260000

func secretKey() []byte {
	s := os.Getenv("SECRET_KEY")
	if s == "" {
		s = "dev-secret-change-me"
	}
	return []byte(s)
}

func tokenTTL() time.Duration {
	h, err := strconv.Atoi(os.Getenv("TOKEN_TTL_HOURS"))
	if err != nil || h <= 0 {
		h = 72
	}
	return time.Duration(h) * time.Hour
}

// HashPassword produces "pbkdf2$260000$<salt_hex>$<digest_hex>" — 100% compatible
// with hashes previously created by the Python backend.
func HashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	dk, err := pbkdf2.Key(sha256.New, password, salt, pbkdf2Iterations, sha256.Size)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("pbkdf2$%d$%s$%s", pbkdf2Iterations, hex.EncodeToString(salt), hex.EncodeToString(dk)), nil
}

// VerifyPassword verifies a plaintext password against a stored pbkdf2$... hash.
func VerifyPassword(password, stored string) bool {
	parts := strings.Split(stored, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2" {
		return false
	}
	iter, err := strconv.Atoi(parts[1])
	if err != nil || iter <= 0 {
		return false
	}
	salt, err := hex.DecodeString(parts[2])
	if err != nil {
		return false
	}
	expected, err := hex.DecodeString(parts[3])
	if err != nil {
		return false
	}
	candidate, err := pbkdf2.Key(sha256.New, password, salt, iter, len(expected))
	if err != nil {
		return false
	}
	return hmac.Equal(candidate, expected)
}

// CreateToken signs an HS256 JWT with sub, role, and exp claims.
func CreateToken(u *db.User) (string, error) {
	claims := jwt.MapClaims{
		"sub":  u.ID,
		"role": u.Role,
		"exp":  time.Now().UTC().Add(tokenTTL()).Unix(),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString(secretKey())
}

type ctxKey struct{}

// UserFromContext returns the authenticated *db.User set by RequireAuth.
func UserFromContext(ctx context.Context) *db.User {
	u, _ := ctx.Value(ctxKey{}).(*db.User)
	return u
}

// RequireAuth validates the Bearer JWT and loads the active user into context.
func RequireAuth(conn *gorm.DB, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		hdr := r.Header.Get("Authorization")
		if !strings.HasPrefix(hdr, "Bearer ") {
			httpx.WriteError(w, http.StatusUnauthorized, "Not authenticated")
			return
		}
		raw := strings.TrimSpace(strings.TrimPrefix(hdr, "Bearer "))
		tok, err := jwt.Parse(raw, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, errors.New("unexpected signing method")
			}
			return secretKey(), nil
		})
		if err != nil || !tok.Valid {
			httpx.WriteError(w, http.StatusUnauthorized, "Invalid or expired token")
			return
		}
		claims, ok := tok.Claims.(jwt.MapClaims)
		if !ok {
			httpx.WriteError(w, http.StatusUnauthorized, "Invalid or expired token")
			return
		}
		sub, _ := claims["sub"].(string)
		if sub == "" {
			httpx.WriteError(w, http.StatusUnauthorized, "Invalid or expired token")
			return
		}

		var u db.User
		if err := conn.Where("id = ?", sub).First(&u).Error; err != nil || !u.IsActive {
			httpx.WriteError(w, http.StatusUnauthorized, "Account not found or deactivated")
			return
		}
		ctx := context.WithValue(r.Context(), ctxKey{}, &u)
		next(w, r.WithContext(ctx))
	}
}

// RequireAdmin ensures the authenticated user has role == "admin".
func RequireAdmin(conn *gorm.DB, next http.HandlerFunc) http.HandlerFunc {
	return RequireAuth(conn, func(w http.ResponseWriter, r *http.Request) {
		u := UserFromContext(r.Context())
		if u == nil || u.Role != "admin" {
			httpx.WriteError(w, http.StatusForbidden, "Admin access required")
			return
		}
		next(w, r)
	})
}
