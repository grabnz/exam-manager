package handlers

import (
	"io"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"exam-manager/backend/internal/auth"
	"exam-manager/backend/internal/db"
	"exam-manager/backend/internal/httpx"
	"exam-manager/backend/internal/services"

	"gorm.io/gorm"
)

// ParsePDFPreview (#6) extracts students & metadata without writing to DB.
func (h *ClassesHandler) ParsePDFPreview(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid multipart form")
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "File is required")
		return
	}
	defer file.Close()
	content, err := io.ReadAll(file)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Failed to read file")
		return
	}
	parsed, err := services.ParsePDF(content)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "تعذّر قراءة ملف PDF")
		return
	}
	students := parsed.Students
	if students == nil {
		students = []string{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"students": students,
		"meta": map[string]any{
			"class_name":  parsed.Meta.ClassName,
			"school_year": parsed.Meta.SchoolYear,
			"teacher":     parsed.Meta.Teacher,
			"trimester":   parsed.Meta.Trimester,
			"exam_type":   parsed.Meta.ExamType,
		},
	})
}

// CloneClass (#8) copies a class and optionally its students to a new school year.
func (h *ClassesHandler) CloneClass(w http.ResponseWriter, r *http.Request) {
	classID := r.PathValue("class_id")
	var src db.Class
	if err := h.DB.Preload("Students", func(d *gorm.DB) *gorm.DB { return d.Order("order_index ASC") }).
		Where("id = ?", classID).First(&src).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Class not found")
		return
	}
	var body struct {
		Name         string  `json:"name"`
		SchoolYear   string  `json:"school_year"`
		Level        *string `json:"level"`
		CopyStudents *bool   `json:"copy_students"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	yearLabel := strings.TrimSpace(body.SchoolYear)
	if yearLabel == "" {
		httpx.WriteError(w, http.StatusBadRequest, "السنة الدراسية مطلوبة")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = src.Name
	}
	level := src.Level
	if body.Level != nil {
		lv := strings.TrimSpace(*body.Level)
		if lv == "" {
			level = nil
		} else {
			level = &lv
		}
	}
	copyStudents := true
	if body.CopyStudents != nil {
		copyStudents = *body.CopyStudents
	}

	var created db.Class
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		year, err := getOrCreateYear(tx, yearLabel)
		if err != nil {
			return err
		}
		created = db.Class{
			SchoolYearID: year.ID,
			Name:         name,
			Level:        level,
		}
		if err := tx.Create(&created).Error; err != nil {
			return err
		}
		if copyStudents {
			for i, st := range src.Students {
				if err := tx.Create(&db.Student{
					ClassID:    created.ID,
					FullName:   st.FullName,
					OrderIndex: i,
				}).Error; err != nil {
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
	count := 0
	if copyStudents {
		count = len(src.Students)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"id":            created.ID,
		"name":          created.Name,
		"school_year":   yearLabel,
		"student_count": count,
	})
}

// ReorderStudents (#17) updates order_index for students in a class.
func (h *ClassesHandler) ReorderStudents(w http.ResponseWriter, r *http.Request) {
	classID := r.PathValue("class_id")
	var body struct {
		StudentIDs []string `json:"student_ids"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		for idx, sid := range body.StudentIDs {
			if err := tx.Model(&db.Student{}).
				Where("id = ? AND class_id = ?", sid, classID).
				Update("order_index", idx).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// TransferStudent (#17) moves a student to another class while preserving score history.
func (h *ClassesHandler) TransferStudent(w http.ResponseWriter, r *http.Request) {
	studentID := r.PathValue("student_id")
	var st db.Student
	if err := h.DB.Where("id = ?", studentID).First(&st).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Student not found")
		return
	}
	var body struct {
		TargetClassID string `json:"target_class_id"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil || body.TargetClassID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "القسم المستهدف مطلوب")
		return
	}
	var target db.Class
	if err := h.DB.Preload("Students").Where("id = ?", body.TargetClassID).First(&target).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "القسم المستهدف غير موجود")
		return
	}
	nextIdx := 0
	for _, s := range target.Students {
		if s.OrderIndex+1 > nextIdx {
			nextIdx = s.OrderIndex + 1
		}
	}
	st.ClassID = target.ID
	st.OrderIndex = nextIdx
	if err := h.DB.Save(&st).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "class_id": target.ID})
}

// Synthesis (#16) aggregates all subjects' final scores for a class/trimester,
// computes student overall averages and ranks, plus per-subject session progression.
func (h *ClassesHandler) Synthesis(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	classID := r.PathValue("class_id")
	if _, ok := getVisibleClass(h.DB, u, classID); !ok {
		httpx.WriteError(w, http.StatusNotFound, "Class not found")
		return
	}
	trimester, err := strconv.Atoi(r.URL.Query().Get("trimester"))
	if err != nil || trimester < 1 || trimester > 3 {
		trimester = 1
	}

	var c db.Class
	err = h.DB.
		Preload("SchoolYear").
		Preload("Students", func(d *gorm.DB) *gorm.DB { return d.Order("order_index ASC") }).
		Preload("Sessions", func(d *gorm.DB) *gorm.DB { return d.Where("trimester = ?", trimester).Order("created_at ASC") }).
		Preload("Sessions.Subject").
		Preload("Sessions.Entries").
		Preload("Assignments.Subject").
		Where("id = ?", classID).
		First(&c).Error
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Class not found")
		return
	}

	subjMap := map[string]db.Subject{}
	for _, a := range c.Assignments {
		if a.Subject != nil && (u.Role == "admin" || a.TeacherID == u.ID) {
			subjMap[a.Subject.ID] = *a.Subject
		}
	}
	for _, s := range c.Sessions {
		if s.Subject != nil && (u.Role == "admin" || subjMap[s.Subject.ID].ID != "") {
			subjMap[s.Subject.ID] = *s.Subject
		}
	}
	var subjects []db.Subject
	for _, s := range subjMap {
		subjects = append(subjects, s)
	}
	sort.Slice(subjects, func(i, j int) bool { return subjects[i].OrderIndex < subjects[j].OrderIndex })

	mainSessionBySubj := map[string]*db.ExamSession{}
	sessionsBySubj := map[string][]db.ExamSession{}
	for i := range c.Sessions {
		s := &c.Sessions[i]
		if s.SubjectID == nil {
			continue
		}
		sid := *s.SubjectID
		sessionsBySubj[sid] = append(sessionsBySubj[sid], *s)
		cur := mainSessionBySubj[sid]
		if cur == nil || s.ExamType == "امتحان" || (cur.ExamType != "امتحان" && s.CreatedAt.After(cur.CreatedAt)) {
			mainSessionBySubj[sid] = s
		}
	}

	type studentRow struct {
		StudentID   string              `json:"student_id"`
		StudentName string              `json:"student_name"`
		OrderIndex  int                 `json:"order_index"`
		Scores      map[string]*float64 `json:"scores"`
		Statuses    map[string]string   `json:"statuses"`
		Average     *float64            `json:"average"`
		Rank        *int                `json:"rank"`
	}

	studentRows := make([]studentRow, 0, len(c.Students))
	for _, st := range c.Students {
		row := studentRow{
			StudentID:   st.ID,
			StudentName: st.FullName,
			OrderIndex:  st.OrderIndex,
			Scores:      map[string]*float64{},
			Statuses:    map[string]string{},
		}
		var sum float64
		count := 0
		for _, subj := range subjects {
			sess := mainSessionBySubj[subj.ID]
			if sess == nil {
				row.Scores[subj.ID] = nil
				continue
			}
			var found *db.ScoreEntry
			for i := range sess.Entries {
				if sess.Entries[i].StudentID == st.ID {
					found = &sess.Entries[i]
					break
				}
			}
			if found != nil {
				if found.Values.Status == "absent" || found.Values.Status == "exempt" {
					row.Statuses[subj.ID] = found.Values.Status
					row.Scores[subj.ID] = nil
				} else {
					row.Scores[subj.ID] = found.FinalScore
					if found.FinalScore != nil {
						sum += *found.FinalScore
						count++
					}
				}
			} else {
				row.Scores[subj.ID] = nil
			}
		}
		if count > 0 {
			avg := math.Round((sum/float64(count))*100) / 100
			row.Average = &avg
		}
		studentRows = append(studentRows, row)
	}

	type rankItem struct {
		idx int
		avg float64
	}
	var ranked []rankItem
	for i, r := range studentRows {
		if r.Average != nil {
			ranked = append(ranked, rankItem{idx: i, avg: *r.Average})
		}
	}
	sort.Slice(ranked, func(i, j int) bool { return ranked[i].avg > ranked[j].avg })
	for i, item := range ranked {
		rank := i + 1
		if i > 0 && ranked[i-1].avg == item.avg {
			rank = *studentRows[ranked[i-1].idx].Rank
		}
		r := rank
		studentRows[item.idx].Rank = &r
	}

	subjOut := make([]map[string]any, 0, len(subjects))
	for _, subj := range subjects {
		sessList := sessionsBySubj[subj.ID]
		sessOut := make([]map[string]any, 0, len(sessList))
		for _, sess := range sessList {
			byStudent := map[string]*float64{}
			for _, e := range sess.Entries {
				byStudent[e.StudentID] = e.FinalScore
			}
			sessOut = append(sessOut, map[string]any{
				"id":           sess.ID,
				"exam_type":    sess.ExamType,
				"is_finalized": sess.IsFinalized,
				"scores":       byStudent,
			})
		}
		subjOut = append(subjOut, map[string]any{
			"id":       subj.ID,
			"code":     subj.Code,
			"name":     subj.NameAr,
			"sessions": sessOut,
		})
	}

	yearLabel := ""
	if c.SchoolYear != nil {
		yearLabel = c.SchoolYear.Label
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"class_id":    c.ID,
		"class_name":  c.Name,
		"level":       c.Level,
		"school_year": yearLabel,
		"trimester":   trimester,
		"subjects":    subjOut,
		"students":    studentRows,
	})
}
