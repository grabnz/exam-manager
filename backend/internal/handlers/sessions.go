package handlers

import (
	"net/http"

	"exam-manager/backend/internal/auth"
	"exam-manager/backend/internal/db"
	"exam-manager/backend/internal/httpx"

	"gorm.io/gorm"
)

type SessionsHandler struct {
	DB *gorm.DB
}

func getAccessibleSession(conn *gorm.DB, u *db.User, sessionID string) (*db.ExamSession, bool) {
	var s db.ExamSession
	if err := conn.
		Preload("Class.SchoolYear").
		Preload("Class.Students", func(d *gorm.DB) *gorm.DB { return d.Order("order_index ASC") }).
		Preload("Subject").
		Preload("Template.Sections", func(d *gorm.DB) *gorm.DB { return d.Order("order_index ASC") }).
		Preload("Template.Sections.Criteria", func(d *gorm.DB) *gorm.DB { return d.Order("order_index ASC") }).
		Preload("Entries").
		Where("id = ?", sessionID).
		First(&s).Error; err != nil {
		return nil, false
	}
	if u.Role == "admin" {
		return &s, true
	}
	if s.SubjectID == nil {
		return nil, false
	}
	var count int64
	conn.Model(&db.TeacherAssignment{}).
		Where("teacher_id = ? AND class_id = ? AND subject_id = ?", u.ID, s.ClassID, *s.SubjectID).
		Count(&count)
	if count == 0 {
		return nil, false
	}
	return &s, true
}

func sessionTeacherName(conn *gorm.DB, s *db.ExamSession) *string {
	if s.SubjectID != nil {
		var a db.TeacherAssignment
		if err := conn.Preload("Teacher").
			Where("class_id = ? AND subject_id = ?", s.ClassID, *s.SubjectID).
			First(&a).Error; err == nil && a.Teacher != nil {
			n := a.Teacher.FullName
			if n == "" {
				n = a.Teacher.Username
			}
			return &n
		}
	}
	if s.Class != nil {
		return s.Class.Teacher
	}
	return nil
}

func (h *SessionsHandler) Get(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	s, ok := getAccessibleSession(h.DB, u, r.PathValue("session_id"))
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "Session not found")
		return
	}
	var subjectName *string
	if s.Subject != nil {
		n := s.Subject.NameAr
		subjectName = &n
	}
	className, yearLabel := "", ""
	if s.Class != nil {
		className = s.Class.Name
		if s.Class.SchoolYear != nil {
			yearLabel = s.Class.SchoolYear.Label
		}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"id":           s.ID,
		"trimester":    s.Trimester,
		"exam_type":    s.ExamType,
		"is_finalized": s.IsFinalized,
		"class_id":     s.ClassID,
		"class_name":   className,
		"school_year":  yearLabel,
		"subject_id":   s.SubjectID,
		"subject_name": subjectName,
		"template_id":  s.TemplateID,
		"teacher":      sessionTeacherName(h.DB, s),
		"is_admin":     u.Role == "admin",
	})
}

func (h *SessionsHandler) Create(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	classID := r.PathValue("class_id")
	if _, ok := getVisibleClass(h.DB, u, classID); !ok {
		httpx.WriteError(w, http.StatusNotFound, "Class not found")
		return
	}
	var body struct {
		Trimester  int     `json:"trimester"`
		ExamType   string  `json:"exam_type"`
		SubjectID  *string `json:"subject_id"`
		TemplateID *string `json:"template_id"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	var subj db.Subject
	if body.SubjectID != nil && *body.SubjectID != "" {
		if err := h.DB.Where("id = ?", *body.SubjectID).First(&subj).Error; err != nil {
			httpx.WriteError(w, http.StatusNotFound, "Subject not found")
			return
		}
	} else {
		if err := h.DB.Where("code = ?", "francais").First(&subj).Error; err != nil {
			httpx.WriteError(w, http.StatusNotFound, "Subject not found")
			return
		}
	}

	if u.Role != "admin" {
		var count int64
		h.DB.Model(&db.TeacherAssignment{}).
			Where("teacher_id = ? AND class_id = ? AND subject_id = ?", u.ID, classID, subj.ID).
			Count(&count)
		if count == 0 {
			httpx.WriteError(w, http.StatusForbidden, "لستم مسندين لهذه المادة في هذا القسم")
			return
		}
	}

	var existing db.ExamSession
	if err := h.DB.Where("class_id = ? AND subject_id = ? AND trimester = ? AND exam_type = ?",
		classID, subj.ID, body.Trimester, body.ExamType).First(&existing).Error; err == nil {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"id": existing.ID})
		return
	}

	var tpl db.GridTemplate
	if body.TemplateID != nil && *body.TemplateID != "" {
		if err := h.DB.Where("id = ? AND subject_id = ? AND is_active = ?", *body.TemplateID, subj.ID, true).First(&tpl).Error; err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "شبكة التقييم المختارة غير صالحة")
			return
		}
	} else {
		if err := h.DB.Where("subject_id = ? AND is_active = ?", subj.ID, true).
			Order("is_builtin ASC, created_at DESC").First(&tpl).Error; err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "لا توجد شبكة تقييم لهذه المادة بعد")
			return
		}
	}

	subjID := subj.ID
	tplID := tpl.ID
	sess := db.ExamSession{
		ClassID:    classID,
		SubjectID:  &subjID,
		TemplateID: &tplID,
		Trimester:  body.Trimester,
		ExamType:   body.ExamType,
	}
	if err := h.DB.Create(&sess).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"id": sess.ID})
}

func (h *SessionsHandler) Finalize(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	s, ok := getAccessibleSession(h.DB, u, r.PathValue("session_id"))
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "Session not found")
		return
	}
	var body struct {
		Finalized bool `json:"finalized"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if !body.Finalized && u.Role != "admin" {
		httpx.WriteError(w, http.StatusForbidden, "فقط المدير يمكنه إلغاء قفل جلسة نهائية")
		return
	}
	s.IsFinalized = body.Finalized
	if err := h.DB.Model(&db.ExamSession{}).Where("id = ?", s.ID).Update("is_finalized", body.Finalized).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "is_finalized": s.IsFinalized})
}

func (h *SessionsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	s, ok := getAccessibleSession(h.DB, u, r.PathValue("session_id"))
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "Session not found")
		return
	}
	if s.IsFinalized {
		httpx.WriteError(w, http.StatusBadRequest, "لا يمكن حذف جلسة مقفلة. اطلبوا من المدير إلغاء القفل أولاً.")
		return
	}
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		tx.Where("session_id = ?", s.ID).Delete(&db.ScoreEntry{})
		return tx.Delete(&db.ExamSession{}, "id = ?", s.ID).Error
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
