package handlers

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"exam-manager/backend/pkg/auth"
	"exam-manager/backend/pkg/db"
	"exam-manager/backend/pkg/httpx"

	"gorm.io/gorm"
)

var slotTimeRe = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

type TimetableHandler struct {
	DB *gorm.DB
}

func slotOut(s *db.TimetableSlot) map[string]any {
	var teacherName, className, subjCode, subjName *string
	if s.Teacher != nil {
		n := s.Teacher.FullName
		if n == "" {
			n = s.Teacher.Username
		}
		teacherName = &n
	}
	if s.Class != nil {
		n := s.Class.Name
		className = &n
	}
	if s.Subject != nil {
		c := s.Subject.Code
		n := s.Subject.NameAr
		subjCode = &c
		subjName = &n
	}
	return map[string]any{
		"id":           s.ID,
		"teacher_id":   s.TeacherID,
		"teacher_name": teacherName,
		"class_id":     s.ClassID,
		"class_name":   className,
		"subject_id":   s.SubjectID,
		"subject_code": subjCode,
		"subject_name": subjName,
		"day":          s.Day,
		"start":        s.Start,
		"end":          s.End,
		"room":         s.Room,
		"label":        s.Label,
	}
}

func (h *TimetableHandler) List(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	q := h.DB.Preload("Teacher").Preload("Class").Preload("Subject")
	if u.Role != "admin" {
		q = q.Where("teacher_id = ?", u.ID)
	}
	var slots []db.TimetableSlot
	if err := q.Order("day ASC, start ASC").Find(&slots).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]map[string]any, 0, len(slots))
	for i := range slots {
		out = append(out, slotOut(&slots[i]))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func overlaps(aStart, aEnd, bStart, bEnd string) bool {
	return aStart < bEnd && bStart < aEnd
}

func (h *TimetableHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TeacherID string  `json:"teacher_id"`
		ClassID   *string `json:"class_id"`
		SubjectID *string `json:"subject_id"`
		Day       int     `json:"day"`
		Start     string  `json:"start"`
		End       string  `json:"end"`
		Room      string  `json:"room"`
		Label     string  `json:"label"`
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
	if body.Day < 1 || body.Day > 7 {
		httpx.WriteError(w, http.StatusBadRequest, "يوم غير صالح")
		return
	}
	if !slotTimeRe.MatchString(body.Start) || !slotTimeRe.MatchString(body.End) || body.Start >= body.End {
		httpx.WriteError(w, http.StatusBadRequest, "توقيت غير صالح")
		return
	}
	var cls *db.Class
	if body.ClassID != nil && *body.ClassID != "" {
		var c db.Class
		if err := h.DB.Where("id = ?", *body.ClassID).First(&c).Error; err != nil {
			httpx.WriteError(w, http.StatusNotFound, "القسم غير موجود")
			return
		}
		cls = &c
	} else {
		body.ClassID = nil
	}
	var subj *db.Subject
	if body.SubjectID != nil && *body.SubjectID != "" {
		var s db.Subject
		if err := h.DB.Where("id = ?", *body.SubjectID).First(&s).Error; err != nil {
			httpx.WriteError(w, http.StatusNotFound, "المادة غير موجودة")
			return
		}
		subj = &s
	} else {
		body.SubjectID = nil
	}

	room := strings.TrimSpace(body.Room)
	var daySlots []db.TimetableSlot
	h.DB.Preload("Teacher").Where("day = ?", body.Day).Find(&daySlots)
	for _, s := range daySlots {
		if !overlaps(body.Start, body.End, s.Start, s.End) {
			continue
		}
		who := ""
		if s.Teacher != nil {
			who = s.Teacher.FullName
			if who == "" {
				who = s.Teacher.Username
			}
		}
		if s.TeacherID == body.TeacherID {
			httpx.WriteError(w, http.StatusConflict, fmt.Sprintf("تعارض: المعلم لديه حصة في نفس التوقيت (%s–%s)", s.Start, s.End))
			return
		}
		if room != "" && strings.TrimSpace(s.Room) == room {
			httpx.WriteError(w, http.StatusConflict, fmt.Sprintf("تعارض: القاعة «%s» محجوزة لـ%s (%s–%s)", room, who, s.Start, s.End))
			return
		}
		if body.ClassID != nil && s.ClassID != nil && *s.ClassID == *body.ClassID {
			httpx.WriteError(w, http.StatusConflict, fmt.Sprintf("تعارض: القسم في حصة أخرى مع %s (%s–%s)", who, s.Start, s.End))
			return
		}
	}

	slot := db.TimetableSlot{
		TeacherID: body.TeacherID,
		ClassID:   body.ClassID,
		SubjectID: body.SubjectID,
		Day:       body.Day,
		Start:     body.Start,
		End:       body.End,
		Room:      room,
		Label:     strings.TrimSpace(body.Label),
		Teacher:   &teacher,
		Class:     cls,
		Subject:   subj,
	}
	if err := h.DB.Create(&slot).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, slotOut(&slot))
}

func (h *TimetableHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("slot_id")
	var s db.TimetableSlot
	if err := h.DB.Where("id = ?", id).First(&s).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Slot not found")
		return
	}
	if err := h.DB.Delete(&s).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
