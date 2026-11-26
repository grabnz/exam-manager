package handlers

import (
	"io"
	"net/http"
	"sort"
	"strings"

	"exam-manager/backend/pkg/auth"
	"exam-manager/backend/pkg/db"
	"exam-manager/backend/pkg/httpx"
	"exam-manager/backend/pkg/services"

	"gorm.io/gorm"
)

type ClassesHandler struct {
	DB *gorm.DB
}

func getVisibleClass(conn *gorm.DB, u *db.User, classID string) (*db.Class, bool) {
	var c db.Class
	if err := conn.Where("id = ?", classID).First(&c).Error; err != nil {
		return nil, false
	}
	if u.Role == "admin" {
		return &c, true
	}
	var count int64
	conn.Model(&db.TeacherAssignment{}).
		Where("teacher_id = ? AND class_id = ?", u.ID, classID).
		Count(&count)
	if count == 0 {
		return nil, false
	}
	return &c, true
}

func getOrCreateYear(tx *gorm.DB, label string) (*db.SchoolYear, error) {
	var y db.SchoolYear
	if err := tx.Where("label = ?", label).First(&y).Error; err == nil {
		return &y, nil
	}
	y = db.SchoolYear{Label: label}
	if err := tx.Create(&y).Error; err != nil {
		return nil, err
	}
	return &y, nil
}

func trimesterStatus(sessions []db.ExamSession) map[int]map[string]bool {
	status := map[int]map[string]bool{}
	for _, s := range sessions {
		st, ok := status[s.Trimester]
		if !ok {
			st = map[string]bool{
				"has_taqyim":        false,
				"imtihan_finalized": false,
				"imtihan_exists":    false,
			}
			status[s.Trimester] = st
		}
		if s.ExamType == "امتحان" {
			st["imtihan_exists"] = true
			if s.IsFinalized {
				st["imtihan_finalized"] = true
			}
		} else if strings.HasPrefix(s.ExamType, "تقييم") {
			st["has_taqyim"] = true
		}
	}
	return status
}

func (h *ClassesHandler) UploadPDF(w http.ResponseWriter, r *http.Request) {
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
	if len(parsed.Students) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "No students found in this PDF.")
		return
	}

	yearLabel := parsed.Meta.SchoolYear
	if yearLabel == "" {
		yearLabel = "Unknown"
	}
	className := parsed.Meta.ClassName
	if className == "" {
		className = "Unknown"
	}
	var teacherPtr *string
	if parsed.Meta.Teacher != "" {
		t := parsed.Meta.Teacher
		teacherPtr = &t
	}

	var cls db.Class
	var sessionID *string
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		year, err := getOrCreateYear(tx, yearLabel)
		if err != nil {
			return err
		}
		cls = db.Class{
			SchoolYearID: year.ID,
			Name:         className,
			Teacher:      teacherPtr,
		}
		if err := tx.Create(&cls).Error; err != nil {
			return err
		}
		for i, name := range parsed.Students {
			if err := tx.Create(&db.Student{
				ClassID:    cls.ID,
				FullName:   name,
				OrderIndex: i,
			}).Error; err != nil {
				return err
			}
		}
		if parsed.Meta.Trimester != nil && parsed.Meta.ExamType != "" {
			var subj db.Subject
			if err := tx.Where("code = ?", "francais").First(&subj).Error; err == nil {
				var tpl db.GridTemplate
				var tplID *string
				if err := tx.Where("subject_id = ? AND is_builtin = ? AND is_active = ?", subj.ID, true, true).First(&tpl).Error; err == nil {
					id := tpl.ID
					tplID = &id
				}
				subjID := subj.ID
				sess := db.ExamSession{
					ClassID:    cls.ID,
					SubjectID:  &subjID,
					TemplateID: tplID,
					Trimester:  *parsed.Meta.Trimester,
					ExamType:   parsed.Meta.ExamType,
				}
				if err := tx.Create(&sess).Error; err != nil {
					return err
				}
				id := sess.ID
				sessionID = &id
			}
		}
		return nil
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"id":            cls.ID,
		"name":          cls.Name,
		"school_year":   yearLabel,
		"student_count": len(parsed.Students),
		"session_id":    sessionID,
	})
}

func (h *ClassesHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name       string  `json:"name"`
		SchoolYear string  `json:"school_year"`
		Level      *string `json:"level"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	name := strings.TrimSpace(body.Name)
	yearLabel := strings.TrimSpace(body.SchoolYear)
	if name == "" || yearLabel == "" {
		httpx.WriteError(w, http.StatusBadRequest, "الاسم والسنة الدراسية مطلوبان")
		return
	}
	var levelPtr *string
	if body.Level != nil {
		if lv := strings.TrimSpace(*body.Level); lv != "" {
			levelPtr = &lv
		}
	}
	year, err := getOrCreateYear(h.DB, yearLabel)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	cls := db.Class{
		SchoolYearID: year.ID,
		Name:         name,
		Level:        levelPtr,
	}
	if err := h.DB.Create(&cls).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"id":          cls.ID,
		"name":        cls.Name,
		"school_year": year.Label,
	})
}

func (h *ClassesHandler) List(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	isAdmin := u.Role == "admin"

	myAssignments := map[string][]db.Subject{}
	if !isAdmin {
		var rows []db.TeacherAssignment
		h.DB.Preload("Subject").Where("teacher_id = ?", u.ID).Find(&rows)
		for _, a := range rows {
			if a.Subject != nil {
				myAssignments[a.ClassID] = append(myAssignments[a.ClassID], *a.Subject)
			}
		}
	}

	var years []db.SchoolYear
	err := h.DB.
		Preload("Classes", func(d *gorm.DB) *gorm.DB { return d.Order("name ASC") }).
		Preload("Classes.Students").
		Preload("Classes.Sessions.Subject").
		Preload("Classes.Assignments.Subject").
		Preload("Classes.Assignments.Teacher").
		Order("label DESC").
		Find(&years).Error
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	result := make([]map[string]any, 0, len(years))
	for _, year := range years {
		var classesOut []map[string]any
		for _, c := range year.Classes {
			if !isAdmin {
				if _, ok := myAssignments[c.ID]; !ok {
					continue
				}
			}
			var subjects []db.Subject
			if isAdmin {
				subjMap := map[string]db.Subject{}
				for _, a := range c.Assignments {
					if a.Subject != nil {
						subjMap[a.Subject.ID] = *a.Subject
					}
				}
				for _, s := range c.Sessions {
					if s.Subject != nil {
						if _, ok := subjMap[s.Subject.ID]; !ok {
							subjMap[s.Subject.ID] = *s.Subject
						}
					}
				}
				for _, s := range subjMap {
					subjects = append(subjects, s)
				}
			} else {
				subjects = append(subjects, myAssignments[c.ID]...)
			}
			sort.Slice(subjects, func(i, j int) bool { return subjects[i].OrderIndex < subjects[j].OrderIndex })

			subjItems := make([]map[string]any, 0, len(subjects))
			for _, subj := range subjects {
				var subjSessions []db.ExamSession
				for _, s := range c.Sessions {
					if s.SubjectID != nil && *s.SubjectID == subj.ID {
						subjSessions = append(subjSessions, s)
					}
				}
				teachers := []string{}
				for _, a := range c.Assignments {
					if a.SubjectID == subj.ID && a.Teacher != nil {
						n := a.Teacher.FullName
						if n == "" {
							n = a.Teacher.Username
						}
						teachers = append(teachers, n)
					}
				}
				subjItems = append(subjItems, map[string]any{
					"subject_id":       subj.ID,
					"code":             subj.Code,
					"name":             subj.NameAr,
					"session_count":    len(subjSessions),
					"trimester_status": trimesterStatus(subjSessions),
					"teachers":         teachers,
				})
			}

			classesOut = append(classesOut, map[string]any{
				"id":            c.ID,
				"name":          c.Name,
				"level":         c.Level,
				"teacher":       c.Teacher,
				"student_count": len(c.Students),
				"session_count": len(c.Sessions),
				"subjects":      subjItems,
			})
		}
		if len(classesOut) > 0 {
			result = append(result, map[string]any{
				"label":   year.Label,
				"classes": classesOut,
			})
		}
	}
	httpx.WriteJSON(w, http.StatusOK, result)
}

func (h *ClassesHandler) Get(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	classID := r.PathValue("class_id")
	if _, ok := getVisibleClass(h.DB, u, classID); !ok {
		httpx.WriteError(w, http.StatusNotFound, "Class not found")
		return
	}

	var c db.Class
	err := h.DB.
		Preload("SchoolYear").
		Preload("Students", func(d *gorm.DB) *gorm.DB { return d.Order("order_index ASC") }).
		Preload("Sessions.Entries").
		Preload("Assignments.Teacher").
		Preload("Assignments.Subject").
		Where("id = ?", classID).
		First(&c).Error
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Class not found")
		return
	}

	sessions := make([]map[string]any, 0, len(c.Sessions))
	for _, s := range c.Sessions {
		sessions = append(sessions, map[string]any{
			"id":           s.ID,
			"subject_id":   s.SubjectID,
			"trimester":    s.Trimester,
			"exam_type":    s.ExamType,
			"has_scores":   len(s.Entries) > 0,
			"is_finalized": s.IsFinalized,
		})
	}

	subjMap := map[string]db.Subject{}
	for _, a := range c.Assignments {
		if a.Subject == nil {
			continue
		}
		if u.Role == "admin" || a.TeacherID == u.ID {
			subjMap[a.Subject.ID] = *a.Subject
		}
	}
	var mySubjs []db.Subject
	for _, s := range subjMap {
		mySubjs = append(mySubjs, s)
	}
	sort.Slice(mySubjs, func(i, j int) bool { return mySubjs[i].OrderIndex < mySubjs[j].OrderIndex })

	mySubjOut := make([]map[string]any, 0, len(mySubjs))
	for _, s := range mySubjs {
		mySubjOut = append(mySubjOut, map[string]any{"id": s.ID, "code": s.Code, "name": s.NameAr})
	}

	assignOut := make([]map[string]any, 0, len(c.Assignments))
	for _, a := range c.Assignments {
		tName := ""
		if a.Teacher != nil {
			tName = a.Teacher.FullName
			if tName == "" {
				tName = a.Teacher.Username
			}
		}
		sName := ""
		if a.Subject != nil {
			sName = a.Subject.NameAr
		}
		assignOut = append(assignOut, map[string]any{
			"id":           a.ID,
			"teacher_id":   a.TeacherID,
			"teacher_name": tName,
			"subject_id":   a.SubjectID,
			"subject_name": sName,
		})
	}

	studentsOut := make([]map[string]any, 0, len(c.Students))
	for _, st := range c.Students {
		studentsOut = append(studentsOut, map[string]any{
			"id":          st.ID,
			"full_name":   st.FullName,
			"order_index": st.OrderIndex,
		})
	}

	yearLabel := ""
	if c.SchoolYear != nil {
		yearLabel = c.SchoolYear.Label
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"id":          c.ID,
		"name":        c.Name,
		"level":       c.Level,
		"teacher":     c.Teacher,
		"school_year": yearLabel,
		"is_admin":    u.Role == "admin",
		"my_subjects": mySubjOut,
		"assignments": assignOut,
		"students":    studentsOut,
		"sessions":    sessions,
	})
}

func (h *ClassesHandler) Update(w http.ResponseWriter, r *http.Request) {
	classID := r.PathValue("class_id")
	var c db.Class
	if err := h.DB.Where("id = ?", classID).First(&c).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Class not found")
		return
	}
	var body struct {
		Name  *string `json:"name"`
		Level *string `json:"level"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if body.Name != nil {
		name := strings.TrimSpace(*body.Name)
		if name == "" {
			httpx.WriteError(w, http.StatusBadRequest, "الاسم لا يمكن أن يكون فارغاً")
			return
		}
		c.Name = name
	}
	if body.Level != nil {
		lv := strings.TrimSpace(*body.Level)
		if lv == "" {
			c.Level = nil
		} else {
			c.Level = &lv
		}
	}
	if err := h.DB.Save(&c).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "name": c.Name})
}

func (h *ClassesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	classID := r.PathValue("class_id")
	var c db.Class
	if err := h.DB.Preload("Sessions").Where("id = ?", classID).First(&c).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Class not found")
		return
	}
	for _, s := range c.Sessions {
		if s.IsFinalized {
			httpx.WriteError(w, http.StatusBadRequest, "القسم يحتوي على امتحانات نهائية مقفلة. ألغوا القفل أولاً.")
			return
		}
	}
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		for _, s := range c.Sessions {
			tx.Where("session_id = ?", s.ID).Delete(&db.ScoreEntry{})
		}
		tx.Where("class_id = ?", c.ID).Delete(&db.ExamSession{})
		tx.Where("class_id = ?", c.ID).Delete(&db.Student{})
		tx.Where("class_id = ?", c.ID).Delete(&db.TeacherAssignment{})
		tx.Model(&db.TimetableSlot{}).Where("class_id = ?", c.ID).Update("class_id", nil)
		return tx.Delete(&c).Error
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *ClassesHandler) AddStudent(w http.ResponseWriter, r *http.Request) {
	classID := r.PathValue("class_id")
	var c db.Class
	if err := h.DB.Preload("Students").Where("id = ?", classID).First(&c).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Class not found")
		return
	}
	var body struct {
		FullName string `json:"full_name"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	name := strings.TrimSpace(body.FullName)
	if name == "" {
		httpx.WriteError(w, http.StatusBadRequest, "اسم التلميذ مطلوب")
		return
	}
	nextIdx := 0
	for _, s := range c.Students {
		if s.OrderIndex+1 > nextIdx {
			nextIdx = s.OrderIndex + 1
		}
	}
	st := db.Student{ClassID: c.ID, FullName: name, OrderIndex: nextIdx}
	if err := h.DB.Create(&st).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"id":          st.ID,
		"full_name":   st.FullName,
		"order_index": st.OrderIndex,
	})
}

func (h *ClassesHandler) BulkAddStudents(w http.ResponseWriter, r *http.Request) {
	classID := r.PathValue("class_id")
	var c db.Class
	if err := h.DB.Preload("Students").Where("id = ?", classID).First(&c).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Class not found")
		return
	}
	var body struct {
		Names []string `json:"names"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	existing := make(map[string]bool, len(c.Students))
	nextIdx := 0
	for _, s := range c.Students {
		existing[strings.TrimSpace(s.FullName)] = true
		if s.OrderIndex+1 > nextIdx {
			nextIdx = s.OrderIndex + 1
		}
	}

	var toCreate []db.Student
	for _, raw := range body.Names {
		name := strings.Join(strings.Fields(strings.TrimSpace(raw)), " ")
		if name == "" || existing[name] {
			continue
		}
		existing[name] = true
		toCreate = append(toCreate, db.Student{
			ClassID:    c.ID,
			FullName:   name,
			OrderIndex: nextIdx,
		})
		nextIdx++
	}
	if len(toCreate) == 0 {
		httpx.WriteJSON(w, http.StatusOK, []map[string]any{})
		return
	}
	if err := h.DB.Create(&toCreate).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]map[string]any, 0, len(toCreate))
	for _, st := range toCreate {
		out = append(out, map[string]any{
			"id":          st.ID,
			"full_name":   st.FullName,
			"order_index": st.OrderIndex,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *ClassesHandler) RenameStudent(w http.ResponseWriter, r *http.Request) {
	studentID := r.PathValue("student_id")
	var st db.Student
	if err := h.DB.Where("id = ?", studentID).First(&st).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Student not found")
		return
	}
	var body struct {
		FullName string `json:"full_name"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	name := strings.TrimSpace(body.FullName)
	if name == "" {
		httpx.WriteError(w, http.StatusBadRequest, "اسم التلميذ مطلوب")
		return
	}
	st.FullName = name
	if err := h.DB.Save(&st).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *ClassesHandler) DeleteStudent(w http.ResponseWriter, r *http.Request) {
	studentID := r.PathValue("student_id")
	var st db.Student
	if err := h.DB.Where("id = ?", studentID).First(&st).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Student not found")
		return
	}
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		tx.Where("student_id = ?", st.ID).Delete(&db.ScoreEntry{})
		return tx.Delete(&st).Error
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
