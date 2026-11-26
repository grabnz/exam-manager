package handlers

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"exam-manager/backend/internal/auth"
	"exam-manager/backend/internal/db"
	"exam-manager/backend/internal/httpx"

	"gorm.io/gorm"
)

const maxDocSize = 4 * 1024 * 1024

type DocumentsHandler struct {
	DB *gorm.DB
}

func docOut(d *db.OfficialDocument) map[string]any {
	var by *string
	if d.Uploader != nil {
		name := d.Uploader.FullName
		if name == "" {
			name = d.Uploader.Username
		}
		by = &name
	}
	var createdAt *string
	if !d.CreatedAt.IsZero() {
		s := d.CreatedAt.UTC().Format(time.RFC3339)
		createdAt = &s
	}
	return map[string]any{
		"id":           d.ID,
		"title":        d.Title,
		"filename":     d.Filename,
		"content_type": d.ContentType,
		"size":         d.Size,
		"by":           by,
		"created_at":   createdAt,
	}
}

func (h *DocumentsHandler) List(w http.ResponseWriter, r *http.Request) {
	var docs []db.OfficialDocument
	err := h.DB.Omit("data").Preload("Uploader").Order("created_at DESC").Find(&docs).Error
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]map[string]any, 0, len(docs))
	for i := range docs {
		out = append(out, docOut(&docs[i]))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *DocumentsHandler) Upload(w http.ResponseWriter, r *http.Request) {
	admin := auth.UserFromContext(r.Context())
	if err := r.ParseMultipartForm(maxDocSize + (1 << 20)); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid multipart form")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "ملف فارغ")
		return
	}
	defer file.Close()

	content, err := io.ReadAll(io.LimitReader(file, maxDocSize+1))
	if err != nil || len(content) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "ملف فارغ")
		return
	}
	if len(content) > maxDocSize {
		httpx.WriteError(w, http.StatusBadRequest, "حجم الملف يتجاوز 4 ميغابايت")
		return
	}

	title := strings.TrimSpace(r.FormValue("title"))
	filename := header.Filename
	if filename == "" {
		filename = "document"
	}
	if title == "" {
		title = filename
	}
	ct := header.Header.Get("Content-Type")
	if ct == "" {
		ct = "application/octet-stream"
	}
	uploaderID := admin.ID
	doc := db.OfficialDocument{
		Title:       title,
		Filename:    filename,
		ContentType: ct,
		Size:        len(content),
		Data:        content,
		UploadedBy:  &uploaderID,
		Uploader:    admin,
	}
	if err := h.DB.Create(&doc).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, docOut(&doc))
}

func (h *DocumentsHandler) Download(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("doc_id")
	var d db.OfficialDocument
	if err := h.DB.Where("id = ?", id).First(&d).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Document not found")
		return
	}
	safeName := url.PathEscape(d.Filename)
	w.Header().Set("Content-Type", d.ContentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="document"; filename*=UTF-8''%s`, safeName))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(d.Data)
}

func (h *DocumentsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("doc_id")
	var d db.OfficialDocument
	if err := h.DB.Where("id = ?", id).First(&d).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Document not found")
		return
	}
	if err := h.DB.Delete(&d).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
