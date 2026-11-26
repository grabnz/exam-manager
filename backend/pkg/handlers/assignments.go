package handlers

import (
	"net/http"

	"exam-manager/backend/pkg/auth"
	"exam-manager/backend/pkg/db"
	"exam-manager/backend/pkg/httpx"

	"gorm.io/gorm"
)

type AssignmentsHandler struct {
	DB *gorm.DB
}

func assignmentOut(a *db.TeacherAssignment) map[string]any {
	teacherName := ""
	if a.Teacher != nil {
		teacherName = a.Teacher.FullName
		if teacherName == "" {
			teacherName = a.Teacher.Username
		}
	}
	className, yearLabel := "", ""
	if a.Class != nil {
		className = a.Class.Name
		if a.Class.SchoolYear != nil {
			yearLabel = a.Class.SchoolYear.Label
		}
	}
	subjName := ""
	if a.Subject != nil {
		subjName = a.Subject.NameAr
	}
	return map[string]any{
		"id":           a.ID,
		"teacher_id":   a.TeacherID,
		"teacher_name": teacherName,
		"class_id":     a.ClassID,
		"class_name":   className,
		"school_year":  yearLabel,
		"subject_id":   a.SubjectID,
		"subject_name": subjName,
	}
}

func (h *AssignmentsHandler) List(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	q := h.DB.Preload("Teacher").Preload("Class.SchoolYear").Preload("Subject")
	if u.Role != "admin" {
		q = q.Where("teacher_id = ?", u.ID)
	}
	var rows []db.TeacherAssignment
	if err := q.Find(&rows).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for i := range rows {
		out = append(out, assignmentOut(&rows[i]))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *AssignmentsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TeacherID  string   `json:"teacher_id"`
		ClassID    string   `json:"class_id"`
		SubjectIDs []string `json:"subject_ids"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	var teacher db.User
	if err := h.DB.Where("id = ?", body.TeacherID).First(&teacher).Error; err != nil || teacher.Role != "teacher" {
		httpx.WriteError(w, http.StatusNotFound, "المعلم غير موجود")
		return
	}
	var cls db.Class
	if err := h.DB.Preload("SchoolYear").Where("id = ?", body.ClassID).First(&cls).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "القسم غير موجود")
		return
	}

	var created []map[string]any
	for _, subjectID := range body.SubjectIDs {
		var subj db.Subject
		if err := h.DB.Where("id = ?", subjectID).First(&subj).Error; err != nil {
			httpx.WriteError(w, http.StatusNotFound, "المادة غير موجودة")
			return
		}
		var count int64
		h.DB.Model(&db.TeacherAssignment{}).
			Where("teacher_id = ? AND class_id = ? AND subject_id = ?", body.TeacherID, body.ClassID, subjectID).
			Count(&count)
		if count > 0 {
			continue
		}
		a := db.TeacherAssignment{
			TeacherID: body.TeacherID,
			ClassID:   body.ClassID,
			SubjectID: subjectID,
			Teacher:   &teacher,
			Class:     &cls,
			Subject:   &subj,
		}
		if err := h.DB.Create(&a).Error; err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		created = append(created, assignmentOut(&a))
	}
	if created == nil {
		created = []map[string]any{}
	}
	httpx.WriteJSON(w, http.StatusOK, created)
}

func (h *AssignmentsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("assignment_id")
	var a db.TeacherAssignment
	if err := h.DB.Where("id = ?", id).First(&a).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Assignment not found")
		return
	}
	if err := h.DB.Delete(&a).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
