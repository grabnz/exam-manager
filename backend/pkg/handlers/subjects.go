package handlers

import (
	"net/http"

	"exam-manager/backend/pkg/db"
	"exam-manager/backend/pkg/httpx"

	"gorm.io/gorm"
)

type SubjectsHandler struct {
	DB *gorm.DB
}

func (h *SubjectsHandler) List(w http.ResponseWriter, r *http.Request) {
	var subjects []db.Subject
	if err := h.DB.Where("is_active = ?", true).Order("order_index ASC").Find(&subjects).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]map[string]any, 0, len(subjects))
	for _, s := range subjects {
		out = append(out, map[string]any{
			"id":          s.ID,
			"code":        s.Code,
			"name_ar":     s.NameAr,
			"name_fr":     s.NameFr,
			"order_index": s.OrderIndex,
			"is_active":   s.IsActive,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}
