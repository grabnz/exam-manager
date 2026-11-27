package handlers

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"exam-manager/backend/pkg/auth"
	"exam-manager/backend/pkg/db"
	"exam-manager/backend/pkg/httpx"
)

type gradingItem struct {
	Key       string  `json:"key"`
	BlockID   string  `json:"block_id"`
	BankID    string  `json:"bank_id"`
	Section   string  `json:"section"`
	Label     string  `json:"label"`
	Criterion string  `json:"criterion"`
	MaxPoints float64 `json:"max_points"`
}

type studentGradingRow struct {
	StudentID   string             `json:"student_id"`
	StudentName string             `json:"student_name"`
	OrderIndex  int                `json:"order_index"`
	Status      string             `json:"status"`
	ItemScores  map[string]float64 `json:"item_scores"`
	TotalScore  *float64           `json:"total_score"`
}

type itemStat struct {
	Key                string   `json:"key"`
	Label              string   `json:"label"`
	Section            string   `json:"section"`
	Criterion          string   `json:"criterion"`
	MaxPoints          float64  `json:"max_points"`
	AvgScore           float64  `json:"avg_score"`
	PassRate           float64  `json:"pass_rate"` // 0..100
	GradedCount        int      `json:"graded_count"`
	StrugglingStudents []string `json:"struggling_students"`
}

type remediationStudent struct {
	StudentID   string   `json:"student_id"`
	StudentName string   `json:"student_name"`
	TotalScore  float64  `json:"total_score"`
	WeakAreas   []string `json:"weak_areas"`
}

type gradingAnalytics struct {
	ClassAvg            *float64             `json:"class_avg"`
	GradedCount         int                  `json:"graded_count"`
	TotalStudents       int                  `json:"total_students"`
	PassCount           int                  `json:"pass_count"`
	PassRate            float64              `json:"pass_rate"` // 0..100
	ItemStats           []itemStat           `json:"item_stats"`
	RemediationStudents []remediationStudent `json:"remediation_students"`
}

// flattenExamItems extracts every scored exercise (and sub-question inside reading_comprehension)
// from an ExamPaper's BlocksJSON so the teacher can enter red-pen scores rapidly.
func flattenExamItems(blocksJSON string) []gradingItem {
	var rawBlocks []struct {
		ID        string         `json:"id"`
		BankID    string         `json:"bank_id"`
		Section   string         `json:"section"`
		Type      string         `json:"type"`
		Criterion string         `json:"criterion"`
		Points    float64        `json:"points"`
		Topic     string         `json:"topic"`
		Content   map[string]any `json:"content"`
	}
	if err := json.Unmarshal([]byte(blocksJSON), &rawBlocks); err != nil {
		return []gradingItem{}
	}

	items := make([]gradingItem, 0)
	exNum := 0
	for _, b := range rawBlocks {
		if b.Type == "section_header" {
			continue
		}
		if b.Type == "reading_comprehension" {
			if qs, ok := b.Content["questions"].([]any); ok && len(qs) > 0 {
				for qi, qRaw := range qs {
					q, ok := qRaw.(map[string]any)
					if !ok {
						continue
					}
					pts, _ := q["points"].(float64)
					if pts <= 0 {
						continue
					}
					exNum++
					prompt, _ := q["prompt"].(string)
					crit, _ := q["criterion"].(string)
					if crit == "" {
						crit = "C2"
					}
					lbl := strings.TrimSpace(prompt)
					if lbl == "" {
						lbl = fmt.Sprintf("Question %d", qi+1)
					}
					items = append(items, gradingItem{
						Key:       fmt.Sprintf("%s:q%d", b.ID, qi),
						BlockID:   b.ID,
						BankID:    b.BankID,
						Section:   "lecture",
						Label:     truncateStr(fmt.Sprintf("Q%d. %s", qi+1, lbl), 64),
						Criterion: crit,
						MaxPoints: pts,
					})
				}
				continue
			}
		}
		if b.Points <= 0 {
			continue
		}
		exNum++
		lbl := strings.TrimSpace(b.Topic)
		if lbl == "" {
			if p, ok := b.Content["prompt"].(string); ok && strings.TrimSpace(p) != "" {
				lbl = p
			} else if t, ok := b.Content["title"].(string); ok && strings.TrimSpace(t) != "" {
				lbl = t
			} else {
				lbl = fmt.Sprintf("Exercice %d", exNum)
			}
		}
		crit := b.Criterion
		if crit == "" {
			crit = "C1"
		}
		items = append(items, gradingItem{
			Key:       b.ID,
			BlockID:   b.ID,
			BankID:    b.BankID,
			Section:   b.Section,
			Label:     truncateStr(lbl, 64),
			Criterion: crit,
			MaxPoints: b.Points,
		})
	}
	return items
}

func computeGradingAnalytics(items []gradingItem, rows []studentGradingRow) gradingAnalytics {
	a := gradingAnalytics{
		TotalStudents:       len(rows),
		ItemStats:           make([]itemStat, 0, len(items)),
		RemediationStudents: make([]remediationStudent, 0),
	}

	sumTotal := 0.0
	for _, r := range rows {
		if r.Status != "present" || r.TotalScore == nil {
			continue
		}
		a.GradedCount++
		sumTotal += *r.TotalScore
		if *r.TotalScore >= 10.0 {
			a.PassCount++
		}
	}
	if a.GradedCount > 0 {
		avg := math.Round((sumTotal/float64(a.GradedCount))*100) / 100
		a.ClassAvg = &avg
		a.PassRate = math.Round((float64(a.PassCount)/float64(a.GradedCount))*1000) / 10
	}

	// Per-item pass rates + struggling students
	weakByStudent := map[string][]string{}
	for _, it := range items {
		stat := itemStat{
			Key:                it.Key,
			Label:              it.Label,
			Section:            it.Section,
			Criterion:          it.Criterion,
			MaxPoints:          it.MaxPoints,
			StrugglingStudents: make([]string, 0),
		}
		sum := 0.0
		passed := 0
		for _, r := range rows {
			if r.Status != "present" {
				continue
			}
			val, ok := r.ItemScores[it.Key]
			if !ok {
				continue
			}
			stat.GradedCount++
			sum += val
			if it.MaxPoints > 0 && val >= it.MaxPoints*0.5 {
				passed++
			} else {
				stat.StrugglingStudents = append(stat.StrugglingStudents, r.StudentName)
				weakByStudent[r.StudentID] = append(weakByStudent[r.StudentID], fmt.Sprintf("%s (%s)", it.Label, it.Criterion))
			}
		}
		if stat.GradedCount > 0 {
			stat.AvgScore = math.Round((sum/float64(stat.GradedCount))*100) / 100
			stat.PassRate = math.Round((float64(passed)/float64(stat.GradedCount))*1000) / 10
		}
		a.ItemStats = append(a.ItemStats, stat)
	}
	// Sort weakest exercises first so remediation priorities stand out immediately
	sort.Slice(a.ItemStats, func(i, j int) bool { return a.ItemStats[i].PassRate < a.ItemStats[j].PassRate })

	for _, r := range rows {
		if r.Status == "present" && r.TotalScore != nil && *r.TotalScore < 10.0 {
			weaks := weakByStudent[r.StudentID]
			if weaks == nil {
				weaks = []string{}
			}
			a.RemediationStudents = append(a.RemediationStudents, remediationStudent{
				StudentID:   r.StudentID,
				StudentName: r.StudentName,
				TotalScore:  *r.TotalScore,
				WeakAreas:   weaks,
			})
		}
	}
	sort.Slice(a.RemediationStudents, func(i, j int) bool {
		return a.RemediationStudents[i].TotalScore < a.RemediationStudents[j].TotalScore
	})

	return a
}

func (h *ExamsHandler) GetGrading(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	examID := r.PathValue("exam_id")
	classID := r.PathValue("class_id")

	var paper db.ExamPaper
	if err := h.DB.Where("id = ?", examID).First(&paper).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "الامتحان غير موجود")
		return
	}
	if u.Role != "admin" && paper.OwnerID != u.ID {
		httpx.WriteError(w, http.StatusForbidden, "غير مسموح")
		return
	}

	cls, ok := getVisibleClass(h.DB, u, classID)
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "القسم غير موجود")
		return
	}
	var students []db.Student
	h.DB.Where("class_id = ?", cls.ID).Order("order_index ASC, full_name ASC").Find(&students)

	var gradings []db.ExamGrading
	h.DB.Where("exam_paper_id = ? AND class_id = ?", paper.ID, cls.ID).Find(&gradings)
	byStudent := map[string]db.ExamGrading{}
	for _, g := range gradings {
		byStudent[g.StudentID] = g
	}

	items := flattenExamItems(paper.BlocksJSON)
	rows := make([]studentGradingRow, 0, len(students))
	for _, st := range students {
		row := studentGradingRow{
			StudentID:   st.ID,
			StudentName: st.FullName,
			OrderIndex:  st.OrderIndex,
			Status:      "present",
			ItemScores:  map[string]float64{},
		}
		if g, ok := byStudent[st.ID]; ok {
			row.Status = g.Status
			row.TotalScore = g.TotalScore
			_ = json.Unmarshal([]byte(g.ItemScoresJSON), &row.ItemScores)
			if row.ItemScores == nil {
				row.ItemScores = map[string]float64{}
			}
		}
		rows = append(rows, row)
	}

	// Find matching French ExamSession if one already exists
	linkedSessionID := ""
	var frSubj db.Subject
	if err := h.DB.Where("code = ?", paper.SubjectCode).First(&frSubj).Error; err == nil {
		var sess db.ExamSession
		if err := h.DB.Where("class_id = ? AND subject_id = ? AND trimester = ? AND exam_type = ?",
			cls.ID, frSubj.ID, paper.Trimester, paper.ExamType).First(&sess).Error; err == nil {
			linkedSessionID = sess.ID
		}
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"exam":              serializeExam(paper, false),
		"class":             map[string]any{"id": cls.ID, "name": cls.Name, "level": cls.Level},
		"items":             items,
		"students":          rows,
		"linked_session_id": linkedSessionID,
		"analytics":         computeGradingAnalytics(items, rows),
	})
}

func (h *ExamsHandler) SaveGrading(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	examID := r.PathValue("exam_id")
	classID := r.PathValue("class_id")

	var paper db.ExamPaper
	if err := h.DB.Where("id = ?", examID).First(&paper).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "الامتحان غير موجود")
		return
	}
	if u.Role != "admin" && paper.OwnerID != u.ID {
		httpx.WriteError(w, http.StatusForbidden, "غير مسموح")
		return
	}
	cls, ok := getVisibleClass(h.DB, u, classID)
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "القسم غير موجود")
		return
	}

	var body struct {
		SyncToSession *bool `json:"sync_to_session"`
		Entries       []struct {
			StudentID  string             `json:"student_id"`
			Status     string             `json:"status"`
			ItemScores map[string]float64 `json:"item_scores"`
		} `json:"entries"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "بيانات غير صالحة")
		return
	}
	syncSession := true
	if body.SyncToSession != nil {
		syncSession = *body.SyncToSession
	}

	items := flattenExamItems(paper.BlocksJSON)
	itemMax := map[string]float64{}
	for _, it := range items {
		itemMax[it.Key] = it.MaxPoints
	}

	for _, e := range body.Entries {
		if e.StudentID == "" {
			continue
		}
		st := e.Status
		if st != "absent" && st != "exempt" {
			st = "present"
		}
		cleanScores := map[string]float64{}
		var total *float64
		if st == "present" && len(e.ItemScores) > 0 {
			sum := 0.0
			for k, v := range e.ItemScores {
				if mx, ok := itemMax[k]; ok {
					clamped := math.Max(0, math.Min(mx, v))
					cleanScores[k] = clamped
					sum += clamped
				}
			}
			t := math.Round(math.Min(20.0, sum)*100) / 100
			total = &t
		}
		bBytes, _ := json.Marshal(cleanScores)

		var existing db.ExamGrading
		if err := h.DB.Where("exam_paper_id = ? AND class_id = ? AND student_id = ?", paper.ID, cls.ID, e.StudentID).First(&existing).Error; err == nil {
			existing.Status = st
			existing.ItemScoresJSON = string(bBytes)
			existing.TotalScore = total
			_ = h.DB.Save(&existing).Error
		} else {
			_ = h.DB.Create(&db.ExamGrading{
				ExamPaperID:    paper.ID,
				ClassID:        cls.ID,
				StudentID:      e.StudentID,
				Status:         st,
				ItemScoresJSON: string(bBytes),
				TotalScore:     total,
			}).Error
		}
	}

	// Reload full class rows to compute fresh analytics + ML feedback + ScoreEntry sync
	var students []db.Student
	h.DB.Where("class_id = ?", cls.ID).Order("order_index ASC, full_name ASC").Find(&students)
	var gradings []db.ExamGrading
	h.DB.Where("exam_paper_id = ? AND class_id = ?", paper.ID, cls.ID).Find(&gradings)
	byStudent := map[string]db.ExamGrading{}
	for _, g := range gradings {
		byStudent[g.StudentID] = g
	}
	rows := make([]studentGradingRow, 0, len(students))
	for _, st := range students {
		row := studentGradingRow{
			StudentID:   st.ID,
			StudentName: st.FullName,
			OrderIndex:  st.OrderIndex,
			Status:      "present",
			ItemScores:  map[string]float64{},
		}
		if g, ok := byStudent[st.ID]; ok {
			row.Status = g.Status
			row.TotalScore = g.TotalScore
			_ = json.Unmarshal([]byte(g.ItemScoresJSON), &row.ItemScores)
			if row.ItemScores == nil {
				row.ItemScores = map[string]float64{}
			}
		}
		rows = append(rows, row)
	}

	analytics := computeGradingAnalytics(items, rows)

	// 1. Update ExamPaper.AvgScore & QuestionBlock.EmpiricalPassRate (closes ML loop!)
	if analytics.ClassAvg != nil {
		_ = h.DB.Model(&paper).Update("avg_score", *analytics.ClassAvg).Error
	}
	bankPassAcc := map[string][]float64{}
	itemByKey := map[string]gradingItem{}
	for _, it := range items {
		itemByKey[it.Key] = it
	}
	for _, st := range analytics.ItemStats {
		if st.GradedCount == 0 {
			continue
		}
		if it, ok := itemByKey[st.Key]; ok && it.BankID != "" {
			bankPassAcc[it.BankID] = append(bankPassAcc[it.BankID], st.PassRate/100.0)
		}
	}
	for bankID, rates := range bankPassAcc {
		avgRate := 0.0
		for _, v := range rates {
			avgRate += v
		}
		avgRate /= float64(len(rates))
		var qb db.QuestionBlock
		if err := h.DB.Where("id = ?", bankID).First(&qb).Error; err == nil {
			if qb.EmpiricalPassRate != nil {
				avgRate = (*qb.EmpiricalPassRate)*0.6 + avgRate*0.4
			}
			_ = h.DB.Model(&qb).Update("empirical_pass_rate", avgRate).Error
		}
	}

	// 2. Sync to official ExamSession / ScoreEntry (دفتر الأعداد)
	linkedSessionID := ""
	if syncSession {
		linkedSessionID = h.syncGradingsToScoreSession(u, &paper, cls.ID, items, rows)
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"ok":                true,
		"linked_session_id": linkedSessionID,
		"students":          rows,
		"analytics":         analytics,
	})
}

func (h *ExamsHandler) syncGradingsToScoreSession(u *db.User, paper *db.ExamPaper, classID string, items []gradingItem, rows []studentGradingRow) string {
	var subj db.Subject
	if err := h.DB.Where("code = ?", paper.SubjectCode).First(&subj).Error; err != nil {
		return ""
	}
	var tpl db.GridTemplate
	if err := h.DB.Preload("Sections.Criteria").Where("subject_id = ? AND is_active = ?", subj.ID, true).Order("is_builtin DESC").First(&tpl).Error; err != nil {
		return ""
	}

	var sess db.ExamSession
	if err := h.DB.Where("class_id = ? AND subject_id = ? AND trimester = ? AND exam_type = ?",
		classID, subj.ID, paper.Trimester, paper.ExamType).First(&sess).Error; err != nil {
		sid := subj.ID
		tid := tpl.ID
		sess = db.ExamSession{
			ClassID:    classID,
			SubjectID:  &sid,
			TemplateID: &tid,
			Trimester:  paper.Trimester,
			ExamType:   paper.ExamType,
		}
		if err := h.DB.Create(&sess).Error; err != nil {
			return ""
		}
	}
	if sess.IsFinalized {
		return sess.ID
	}

	// Map (section_hint, criterion_label) -> GridCriterion.ID in template
	critBySecAndLabel := map[string]string{}
	critByLabel := map[string]string{}
	for _, sec := range tpl.Sections {
		secHint := "lecture"
		if sec.GroupKey == "prod" {
			secHint = "production"
		}
		for _, c := range sec.Criteria {
			lbl := strings.ToUpper(strings.TrimSpace(c.Label))
			critBySecAndLabel[secHint+":"+lbl] = c.ID
			if _, exists := critByLabel[lbl]; !exists {
				critByLabel[lbl] = c.ID
			}
		}
	}

	now := time.Now().UTC().Truncate(time.Millisecond)
	uid := u.ID

	for _, r := range rows {
		if r.Status == "present" && r.TotalScore == nil {
			continue
		}
		vals := db.ScoreValues{
			Criteria: map[string]*float64{},
			Sections: map[string]db.SectionValue{},
			Status:   r.Status,
		}
		if r.Status == "present" {
			// Accumulate per-criterion totals from exam items
			acc := map[string]float64{}
			for _, it := range items {
				sc, ok := r.ItemScores[it.Key]
				if !ok {
					continue
				}
				lbl := strings.ToUpper(strings.TrimSpace(it.Criterion))
				secHint := "lecture"
				if it.Section == "production" {
					secHint = "production"
				}
				cid := critBySecAndLabel[secHint+":"+lbl]
				if cid == "" {
					cid = critByLabel[lbl]
				}
				if cid != "" {
					acc[cid] += sc
				}
			}
			for cid, sum := range acc {
				v := math.Round(sum*100) / 100
				vals.Criteria[cid] = &v
			}
		}

		var entry db.ScoreEntry
		if err := h.DB.Where("session_id = ? AND student_id = ?", sess.ID, r.StudentID).First(&entry).Error; err == nil {
			entry.Values = vals
			entry.FinalScore = r.TotalScore
			entry.UpdatedAt = &now
			entry.UpdatedBy = &uid
			_ = h.DB.Save(&entry).Error
		} else {
			_ = h.DB.Create(&db.ScoreEntry{
				SessionID:  sess.ID,
				StudentID:  r.StudentID,
				Values:     vals,
				FinalScore: r.TotalScore,
				UpdatedAt:  &now,
				UpdatedBy:  &uid,
			}).Error
		}
	}
	return sess.ID
}
