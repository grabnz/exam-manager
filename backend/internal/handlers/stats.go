package handlers

import (
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"exam-manager/backend/internal/auth"
	"exam-manager/backend/internal/db"
	"exam-manager/backend/internal/httpx"

	"gorm.io/gorm"
)

const imtihanLabel = "امتحان"

type StatsHandler struct {
	DB *gorm.DB
}

func avgPtr(values []*float64) *float64 {
	var sum float64
	n := 0
	for _, v := range values {
		if v != nil {
			sum += *v
			n++
		}
	}
	if n == 0 {
		return nil
	}
	res := math.Round((sum/float64(n))*100) / 100
	return &res
}

func distribution(finals []*float64) []map[string]any {
	type bucket struct {
		label string
		min   float64
		max   float64
		count int
	}
	buckets := []bucket{
		{label: "0-5", min: 0, max: 5},
		{label: "5-10", min: 5, max: 10},
		{label: "10-15", min: 10, max: 15},
		{label: "15-20", min: 15, max: 21},
	}
	for _, v := range finals {
		if v == nil {
			continue
		}
		for i := range buckets {
			if *v >= buckets[i].min && *v < buckets[i].max {
				buckets[i].count++
				break
			}
		}
	}
	out := make([]map[string]any, 0, len(buckets))
	for _, b := range buckets {
		out = append(out, map[string]any{"label": b.label, "count": b.count})
	}
	return out
}

func pairStats(c *db.Class, subj *db.Subject) map[string]any {
	var sessions []db.ExamSession
	for _, s := range c.Sessions {
		if s.SubjectID != nil && *s.SubjectID == subj.ID {
			sessions = append(sessions, s)
		}
	}

	tStatus := map[int]map[string]bool{}
	for _, s := range sessions {
		st, ok := tStatus[s.Trimester]
		if !ok {
			st = map[string]bool{
				"has_taqyim":        false,
				"imtihan_finalized": false,
				"imtihan_exists":    false,
			}
			tStatus[s.Trimester] = st
		}
		if s.ExamType == imtihanLabel {
			st["imtihan_exists"] = true
			if s.IsFinalized {
				st["imtihan_finalized"] = true
			}
		} else if strings.HasPrefix(s.ExamType, "تقييم") {
			st["has_taqyim"] = true
		}
	}

	finalizedTrims := 0
	for _, st := range tStatus {
		if st["imtihan_finalized"] {
			finalizedTrims++
		}
	}

	// Average: latest امتحان with entries, else latest session with entries
	candidates := append([]db.ExamSession(nil), sessions...)
	sort.Slice(candidates, func(i, j int) bool {
		iImt := candidates[i].ExamType == imtihanLabel
		jImt := candidates[j].ExamType == imtihanLabel
		if iImt != jImt {
			return iImt
		}
		return candidates[i].Trimester > candidates[j].Trimester
	})
	var avgFinal *float64
	for _, s := range candidates {
		if len(s.Entries) > 0 {
			vals := make([]*float64, 0, len(s.Entries))
			for _, e := range s.Entries {
				vals = append(vals, e.FinalScore)
			}
			if a := avgPtr(vals); a != nil {
				avgFinal = a
				break
			}
		}
	}

	var lastSession map[string]any
	var withEntries []db.ExamSession
	for _, s := range sessions {
		if len(s.Entries) > 0 {
			withEntries = append(withEntries, s)
		}
	}
	if len(withEntries) > 0 {
		latestTime := func(s db.ExamSession) time.Time {
			t := s.CreatedAt
			for _, e := range s.Entries {
				if e.UpdatedAt != nil && e.UpdatedAt.After(t) {
					t = *e.UpdatedAt
				}
			}
			return t
		}
		best := withEntries[0]
		bestT := latestTime(best)
		for _, s := range withEntries[1:] {
			if t := latestTime(s); t.After(bestT) {
				best = s
				bestT = t
			}
		}
		lastSession = map[string]any{"id": best.ID, "trimester": best.Trimester, "exam_type": best.ExamType}
	} else if len(sessions) > 0 {
		best := sessions[0]
		for _, s := range sessions[1:] {
			if s.CreatedAt.After(best.CreatedAt) {
				best = s
			}
		}
		lastSession = map[string]any{"id": best.ID, "trimester": best.Trimester, "exam_type": best.ExamType}
	}

	yearLabel := ""
	if c.SchoolYear != nil {
		yearLabel = c.SchoolYear.Label
	}

	return map[string]any{
		"class_id":             c.ID,
		"class_name":           c.Name,
		"level":                c.Level,
		"school_year":          yearLabel,
		"subject_id":           subj.ID,
		"subject_code":         subj.Code,
		"subject_name":         subj.NameAr,
		"student_count":        len(c.Students),
		"session_count":        len(sessions),
		"trimester_status":     tStatus,
		"finalized_trimesters": finalizedTrims,
		"avg_final":            avgFinal,
		"last_session":         lastSession,
	}
}

func (h *StatsHandler) Get(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	if u.Role == "admin" {
		httpx.WriteJSON(w, http.StatusOK, h.directorStats())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, h.teacherStats(u))
}

func (h *StatsHandler) teacherStats(u *db.User) map[string]any {
	var assignments []db.TeacherAssignment
	h.DB.
		Preload("Subject").
		Preload("Class.SchoolYear").
		Preload("Class.Students").
		Preload("Class.Sessions.Entries").
		Where("teacher_id = ?", u.ID).
		Find(&assignments)

	cards := make([]map[string]any, 0, len(assignments))
	var finals []*float64
	classSet := map[string]int{}
	subjSet := map[string]bool{}
	finalized := 0

	for _, a := range assignments {
		if a.Class == nil || a.Subject == nil {
			continue
		}
		card := pairStats(a.Class, a.Subject)
		cards = append(cards, card)
		classSet[a.ClassID] = len(a.Class.Students)
		subjSet[a.SubjectID] = true
		finalized += card["finalized_trimesters"].(int)

		for _, s := range a.Class.Sessions {
			if s.SubjectID != nil && *s.SubjectID == a.SubjectID {
				for _, e := range s.Entries {
					finals = append(finals, e.FinalScore)
				}
			}
		}
	}

	sort.Slice(cards, func(i, j int) bool {
		ci, cj := cards[i]["class_name"].(string), cards[j]["class_name"].(string)
		if ci != cj {
			return ci < cj
		}
		return cards[i]["subject_name"].(string) < cards[j]["subject_name"].(string)
	})

	totalStudents := 0
	for _, n := range classSet {
		totalStudents += n
	}
	completionPct := 0
	if len(cards) > 0 {
		completionPct = int(math.Round(100.0 * float64(finalized) / float64(3*len(cards))))
	}

	return map[string]any{
		"role":         "teacher",
		"distribution": distribution(finals),
		"totals": map[string]any{
			"classes":        len(classSet),
			"subjects":       len(subjSet),
			"students":       totalStudents,
			"completion_pct": completionPct,
		},
		"cards": cards,
	}
}

func (h *StatsHandler) directorStats() map[string]any {
	var classes []db.Class
	h.DB.
		Preload("SchoolYear").
		Preload("Students").
		Preload("Sessions.Subject").
		Preload("Sessions.Entries").
		Preload("Assignments.Subject").
		Find(&classes)

	var teachersCount, studentsCount, sessionsCount int64
	h.DB.Model(&db.User{}).Where("role = ? AND is_active = ?", "teacher", true).Count(&teachersCount)
	h.DB.Model(&db.Student{}).Count(&studentsCount)
	h.DB.Model(&db.ExamSession{}).Count(&sessionsCount)

	pairKeys := map[string]bool{}
	pairs := []map[string]any{}
	unassigned := []map[string]any{}
	finalized := 0

	for i := range classes {
		c := &classes[i]
		if len(c.Assignments) == 0 {
			unassigned = append(unassigned, map[string]any{"id": c.ID, "name": c.Name})
		}
		subjMap := map[string]*db.Subject{}
		for _, a := range c.Assignments {
			if a.Subject != nil {
				subjMap[a.SubjectID] = a.Subject
			}
		}
		for _, s := range c.Sessions {
			if s.Subject != nil && s.SubjectID != nil {
				if _, ok := subjMap[*s.SubjectID]; !ok {
					subjMap[*s.SubjectID] = s.Subject
				}
			}
		}
		for _, subj := range subjMap {
			key := c.ID + "|" + subj.ID
			if !pairKeys[key] {
				pairKeys[key] = true
				p := pairStats(c, subj)
				finalized += p["finalized_trimesters"].(int)
				pairs = append(pairs, p)
			}
		}
	}

	completion := 0
	if len(pairs) > 0 {
		completion = int(math.Round(100.0 * float64(finalized) / float64(3*len(pairs))))
	}

	subjAvgsMap := map[string][]*float64{}
	for _, p := range pairs {
		if a, ok := p["avg_final"].(*float64); ok && a != nil {
			name := p["subject_name"].(string)
			subjAvgsMap[name] = append(subjAvgsMap[name], a)
		}
	}
	subjAvgs := make([]map[string]any, 0, len(subjAvgsMap))
	for name, vals := range subjAvgsMap {
		subjAvgs = append(subjAvgs, map[string]any{
			"subject_name": name,
			"avg":          avgPtr(vals),
		})
	}
	sort.Slice(subjAvgs, func(i, j int) bool {
		ai, _ := subjAvgs[i]["avg"].(*float64)
		aj, _ := subjAvgs[j]["avg"].(*float64)
		vi, vj := 0.0, 0.0
		if ai != nil {
			vi = *ai
		}
		if aj != nil {
			vj = *aj
		}
		return vi > vj
	})

	// Recent activity
	var recentEntries []db.ScoreEntry
	h.DB.
		Preload("Session.Class").
		Preload("Session.Subject").
		Where("updated_at IS NOT NULL").
		Order("updated_at DESC").
		Limit(60).
		Find(&recentEntries)

	seenSess := map[string]bool{}
	activity := []map[string]any{}
	for _, e := range recentEntries {
		if seenSess[e.SessionID] || e.Session == nil || e.Session.Class == nil {
			continue
		}
		seenSess[e.SessionID] = true
		var by *string
		if e.UpdatedBy != nil && *e.UpdatedBy != "" {
			var editor db.User
			if err := h.DB.Where("id = ?", *e.UpdatedBy).First(&editor).Error; err == nil {
				n := editor.FullName
				if n == "" {
					n = editor.Username
				}
				by = &n
			}
		}
		subjName := ""
		if e.Session.Subject != nil {
			subjName = e.Session.Subject.NameAr
		}
		at := ""
		if e.UpdatedAt != nil {
			at = e.UpdatedAt.UTC().Format(time.RFC3339Nano)
		}
		activity = append(activity, map[string]any{
			"session_id":   e.Session.ID,
			"class_name":   e.Session.Class.Name,
			"subject_name": subjName,
			"exam_type":    e.Session.ExamType,
			"trimester":    e.Session.Trimester,
			"is_finalized": e.Session.IsFinalized,
			"by":           by,
			"at":           at,
		})
		if len(activity) >= 8 {
			break
		}
	}

	var allEntries []db.ScoreEntry
	h.DB.Select("final_score").Where("final_score IS NOT NULL").Find(&allEntries)
	allFinals := make([]*float64, 0, len(allEntries))
	for _, e := range allEntries {
		allFinals = append(allFinals, e.FinalScore)
	}

	return map[string]any{
		"role":         "director",
		"distribution": distribution(allFinals),
		"totals": map[string]any{
			"teachers":       teachersCount,
			"classes":        len(classes),
			"students":       studentsCount,
			"sessions":       sessionsCount,
			"completion_pct": completion,
		},
		"alerts": map[string]any{
			"unassigned_classes": unassigned,
		},
		"subject_averages": subjAvgs,
		"activity":         activity,
		"pairs":            pairs,
	}
}
