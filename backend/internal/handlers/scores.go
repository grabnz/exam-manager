package handlers

import (
	"fmt"
	"net/http"
	"net/url"
	"time"

	"exam-manager/backend/internal/auth"
	"exam-manager/backend/internal/db"
	"exam-manager/backend/internal/httpx"
	"exam-manager/backend/internal/services"

	"gorm.io/gorm"
)

type ScoresHandler struct {
	DB *gorm.DB
}

func parseFlexTime(raw string) (time.Time, error) {
	formats := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.999999999",
		"2006-01-02T15:04:05",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, raw); err == nil {
			return t.UTC(), nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid time format")
}

func rowsPayload(s *db.ExamSession) []map[string]any {
	byStudent := make(map[string]db.ScoreEntry, len(s.Entries))
	for _, e := range s.Entries {
		byStudent[e.StudentID] = e
	}
	rows := make([]map[string]any, 0, len(s.Class.Students))
	for _, st := range s.Class.Students {
		criteria := map[string]*float64{}
		sections := map[string]db.SectionValue{}
		var finalScore *float64
		var updatedAt *string
		status := "present"
		if e, ok := byStudent[st.ID]; ok {
			if e.Values.Criteria != nil {
				criteria = e.Values.Criteria
			}
			if e.Values.Sections != nil {
				sections = e.Values.Sections
			}
			if e.Values.Status == "absent" || e.Values.Status == "exempt" {
				status = e.Values.Status
			}
			finalScore = e.FinalScore
			if e.UpdatedAt != nil && !e.UpdatedAt.IsZero() {
				ts := e.UpdatedAt.UTC().Format(time.RFC3339Nano)
				updatedAt = &ts
			}
		}
		rows = append(rows, map[string]any{
			"student_id":   st.ID,
			"student_name": st.FullName,
			"order_index":  st.OrderIndex,
			"criteria":     criteria,
			"sections":     sections,
			"status":       status,
			"final_score":  finalScore,
			"updated_at":   updatedAt,
		})
	}
	return rows
}

func (h *ScoresHandler) Get(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	s, ok := getAccessibleSession(h.DB, u, r.PathValue("session_id"))
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "Session not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, rowsPayload(s))
}

func (h *ScoresHandler) Save(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	sessionID := r.PathValue("session_id")
	s, ok := getAccessibleSession(h.DB, u, sessionID)
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "Session not found")
		return
	}
	if s.IsFinalized {
		httpx.WriteError(w, http.StatusBadRequest, "هذه الجلسة مقفلة. اطلبوا من المدير إلغاء القفل لتعديل الأعداد.")
		return
	}
	if s.Template == nil {
		httpx.WriteError(w, http.StatusBadRequest, "لا شبكة تقييم مرتبطة بهذه الجلسة")
		return
	}

	var body struct {
		Scores []struct {
			StudentID string                     `json:"student_id"`
			Criteria  map[string]*float64        `json:"criteria"`
			Sections  map[string]db.SectionValue `json:"sections"`
			Status    string                     `json:"status"`
		} `json:"scores"`
		BaseUpdatedAt *string `json:"base_updated_at"`
		Force         bool    `json:"force"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Offline-sync conflict detection
	if body.BaseUpdatedAt != nil && *body.BaseUpdatedAt != "" && !body.Force {
		if base, err := parseFlexTime(*body.BaseUpdatedAt); err == nil {
			var latest *time.Time
			for _, e := range s.Entries {
				if e.UpdatedAt != nil && (latest == nil || e.UpdatedAt.UTC().After(*latest)) {
					t := e.UpdatedAt.UTC()
					latest = &t
				}
			}
			if latest != nil && latest.After(base) {
				httpx.WriteJSON(w, http.StatusConflict, map[string]any{
					"detail":      "تم تعديل الأعداد من جهاز آخر بعد آخر مزامنة",
					"server_rows": rowsPayload(s),
				})
				return
			}
		}
	}

	validCriteria := map[string]bool{}
	validSections := map[string]bool{}
	for _, sec := range s.Template.Sections {
		validSections[sec.ID] = true
		for _, c := range sec.Criteria {
			validCriteria[c.ID] = true
		}
	}
	validStudents := map[string]bool{}
	for _, st := range s.Class.Students {
		validStudents[st.ID] = true
	}
	existingEntries := make(map[string]db.ScoreEntry, len(s.Entries))
	for _, e := range s.Entries {
		existingEntries[e.StudentID] = e
	}

	now := time.Now().UTC()
	editorID := u.ID
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		for _, item := range body.Scores {
			if !validStudents[item.StudentID] {
				continue
			}
			critMap := map[string]*float64{}
			for k, v := range item.Criteria {
				if validCriteria[k] {
					critMap[k] = v
				}
			}
			secMap := map[string]db.SectionValue{}
			for k, v := range item.Sections {
				if validSections[k] {
					secMap[k] = v
				}
			}
			st := ""
			if item.Status == "absent" || item.Status == "exempt" {
				st = item.Status
			}
			vals := db.ScoreValues{Criteria: critMap, Sections: secMap, Status: st}
			final := services.FinalScore(s.Template, vals)

			if entry, exists := existingEntries[item.StudentID]; exists {
				entry.Values = vals
				entry.FinalScore = final
				entry.UpdatedAt = &now
				entry.UpdatedBy = &editorID
				if err := tx.Save(&entry).Error; err != nil {
					return err
				}
			} else {
				entry := db.ScoreEntry{
					SessionID:  sessionID,
					StudentID:  item.StudentID,
					Values:     vals,
					FinalScore: final,
					UpdatedAt:  &now,
					UpdatedBy:  &editorID,
				}
				if err := tx.Create(&entry).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"saved_at": now.Format(time.RFC3339Nano),
	})
}

func (h *ScoresHandler) ExportExcel(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	s, ok := getAccessibleSession(h.DB, u, r.PathValue("session_id"))
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "Session not found")
		return
	}
	xlsxBytes, err := services.ExportSessionXLSX(s)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	safeName := url.PathEscape(fmt.Sprintf("%s_T%d.xlsx", s.Class.Name, s.Trimester))
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="scores.xlsx"; filename*=UTF-8''%s`, safeName))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(xlsxBytes)
}
