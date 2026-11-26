package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"exam-manager/backend/pkg/db"
	"exam-manager/backend/pkg/httpx"

	"gorm.io/gorm"
)

type TemplatesHandler struct {
	DB *gorm.DB
}

type criterionSpec struct {
	Label    string   `json:"label"`
	MaxScore *float64 `json:"max_score"`
}

type sectionSpec struct {
	GroupLabel      string          `json:"group_label"`
	Label           string          `json:"label"`
	HasBonus        *bool           `json:"has_bonus"`
	AllowSTOverride *bool           `json:"allow_st_override"`
	ColorKey        *string         `json:"color_key"`
	Criteria        []criterionSpec `json:"criteria"`
}

type templateUpdateBody struct {
	Name         string        `json:"name"`
	FinalFormula string        `json:"final_formula"`
	FinalCap     *float64      `json:"final_cap"`
	Direction    string        `json:"direction"`
	Sections     []sectionSpec `json:"sections"`
}

func loadTemplateTree(conn *gorm.DB, templateID string) (*db.GridTemplate, error) {
	var tpl db.GridTemplate
	err := conn.
		Preload("Sections", func(d *gorm.DB) *gorm.DB { return d.Order("order_index ASC") }).
		Preload("Sections.Criteria", func(d *gorm.DB) *gorm.DB { return d.Order("order_index ASC") }).
		Where("id = ?", templateID).
		First(&tpl).Error
	if err != nil {
		return nil, err
	}
	return &tpl, nil
}

func templateTreeOut(t *db.GridTemplate) map[string]any {
	sections := make([]map[string]any, 0, len(t.Sections))
	for _, s := range t.Sections {
		crits := make([]map[string]any, 0, len(s.Criteria))
		for _, c := range s.Criteria {
			crits = append(crits, map[string]any{
				"id":          c.ID,
				"code":        c.Code,
				"label":       c.Label,
				"max_score":   c.MaxScore,
				"order_index": c.OrderIndex,
			})
		}
		sections = append(sections, map[string]any{
			"id":                s.ID,
			"code":              s.Code,
			"group_key":         s.GroupKey,
			"group_label":       s.GroupLabel,
			"label":             s.Label,
			"order_index":       s.OrderIndex,
			"has_bonus":         s.HasBonus,
			"allow_st_override": s.AllowSTOverride,
			"color_key":         s.ColorKey,
			"criteria":          crits,
		})
	}
	return map[string]any{
		"id":            t.ID,
		"code":          t.Code,
		"subject_id":    t.SubjectID,
		"name":          t.Name,
		"final_formula": t.FinalFormula,
		"final_cap":     t.FinalCap,
		"is_builtin":    t.IsBuiltin,
		"direction":     t.Direction,
		"sections":      sections,
	}
}

func applyTemplateSpec(tx *gorm.DB, tpl *db.GridTemplate, body templateUpdateBody) (int, string) {
	hasCrit := false
	for _, s := range body.Sections {
		if len(s.Criteria) > 0 {
			hasCrit = true
			break
		}
	}
	if len(body.Sections) == 0 || !hasCrit {
		return http.StatusBadRequest, "الشبكة يجب أن تحتوي على معيار واحد على الأقل"
	}
	formula := body.FinalFormula
	if formula == "" {
		formula = "sum_sections"
	}
	if formula != "avg_groups" && formula != "sum_sections" && formula != "sum_capped" {
		return http.StatusBadRequest, "Invalid formula"
	}
	if n := strings.TrimSpace(body.Name); n != "" {
		tpl.Name = n
	}
	tpl.FinalFormula = formula
	tpl.FinalCap = body.FinalCap
	if body.Direction == "ltr" || body.Direction == "rtl" {
		tpl.Direction = body.Direction
	} else {
		tpl.Direction = "rtl"
	}
	if err := tx.Save(tpl).Error; err != nil {
		return http.StatusInternalServerError, err.Error()
	}

	// Delete existing sections (and their criteria)
	var oldSecs []db.GridSection
	if err := tx.Where("template_id = ?", tpl.ID).Find(&oldSecs).Error; err != nil {
		return http.StatusInternalServerError, err.Error()
	}
	for _, os := range oldSecs {
		if err := tx.Where("section_id = ?", os.ID).Delete(&db.GridCriterion{}).Error; err != nil {
			return http.StatusInternalServerError, err.Error()
		}
	}
	if err := tx.Where("template_id = ?", tpl.ID).Delete(&db.GridSection{}).Error; err != nil {
		return http.StatusInternalServerError, err.Error()
	}

	groupKeys := map[string]string{}
	for si, s := range body.Sections {
		gl := strings.TrimSpace(s.GroupLabel)
		if gl == "" {
			gl = strings.TrimSpace(s.Label)
		}
		gk, ok := groupKeys[gl]
		if !ok {
			gk = fmt.Sprintf("g%d", len(groupKeys))
			groupKeys[gl] = gk
		}
		hasBonus := true
		if s.HasBonus != nil {
			hasBonus = *s.HasBonus
		}
		allowST := true
		if s.AllowSTOverride != nil {
			allowST = *s.AllowSTOverride
		}
		sec := db.GridSection{
			TemplateID:      tpl.ID,
			GroupKey:        gk,
			GroupLabel:      gl,
			Label:           strings.TrimSpace(s.Label),
			OrderIndex:      si,
			HasBonus:        hasBonus,
			AllowSTOverride: allowST,
			ColorKey:        s.ColorKey,
		}
		if err := tx.Create(&sec).Error; err != nil {
			return http.StatusInternalServerError, err.Error()
		}
		for ci, c := range s.Criteria {
			lbl := strings.TrimSpace(c.Label)
			if lbl == "" {
				lbl = fmt.Sprintf("م%d", ci+1)
			}
			crit := db.GridCriterion{
				SectionID:  sec.ID,
				Label:      lbl,
				MaxScore:   c.MaxScore,
				OrderIndex: ci,
			}
			if err := tx.Create(&crit).Error; err != nil {
				return http.StatusInternalServerError, err.Error()
			}
		}
	}
	return 0, ""
}

func (h *TemplatesHandler) ListForSubject(w http.ResponseWriter, r *http.Request) {
	subjectID := r.PathValue("subject_id")
	var templates []db.GridTemplate
	err := h.DB.Where("subject_id = ? AND is_active = ?", subjectID, true).
		Order("created_at ASC").Find(&templates).Error
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]map[string]any, 0, len(templates))
	for _, t := range templates {
		out = append(out, map[string]any{
			"id":            t.ID,
			"name":          t.Name,
			"is_builtin":    t.IsBuiltin,
			"final_formula": t.FinalFormula,
			"direction":     t.Direction,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *TemplatesHandler) Get(w http.ResponseWriter, r *http.Request) {
	tpl, err := loadTemplateTree(h.DB, r.PathValue("template_id"))
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Template not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, templateTreeOut(tpl))
}

func (h *TemplatesHandler) Clone(w http.ResponseWriter, r *http.Request) {
	src, err := loadTemplateTree(h.DB, r.PathValue("template_id"))
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Template not found")
		return
	}
	var copyTpl db.GridTemplate
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		copyTpl = db.GridTemplate{
			SubjectID:    src.SubjectID,
			Name:         src.Name + " (نسخة)",
			FinalFormula: src.FinalFormula,
			FinalCap:     src.FinalCap,
			IsBuiltin:    false,
			IsActive:     true,
			Direction:    src.Direction,
		}
		if err := tx.Create(&copyTpl).Error; err != nil {
			return err
		}
		for _, s := range src.Sections {
			sec := db.GridSection{
				TemplateID:      copyTpl.ID,
				GroupKey:        s.GroupKey,
				GroupLabel:      s.GroupLabel,
				Label:           s.Label,
				OrderIndex:      s.OrderIndex,
				HasBonus:        s.HasBonus,
				AllowSTOverride: s.AllowSTOverride,
				ColorKey:        s.ColorKey,
			}
			if err := tx.Create(&sec).Error; err != nil {
				return err
			}
			for _, c := range s.Criteria {
				crit := db.GridCriterion{
					SectionID:  sec.ID,
					Label:      c.Label,
					MaxScore:   c.MaxScore,
					OrderIndex: c.OrderIndex,
				}
				if err := tx.Create(&crit).Error; err != nil {
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
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"id": copyTpl.ID, "name": copyTpl.Name})
}

func (h *TemplatesHandler) Create(w http.ResponseWriter, r *http.Request) {
	subjectID := r.PathValue("subject_id")
	var subj db.Subject
	if err := h.DB.Where("id = ?", subjectID).First(&subj).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Subject not found")
		return
	}
	var body templateUpdateBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "شبكة جديدة"
	}
	var tpl db.GridTemplate
	var statusCode int
	var errMsg string
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		tpl = db.GridTemplate{SubjectID: subjectID, Name: name, IsBuiltin: false, IsActive: true}
		if err := tx.Create(&tpl).Error; err != nil {
			return err
		}
		statusCode, errMsg = applyTemplateSpec(tx, &tpl, body)
		if statusCode != 0 {
			return fmt.Errorf("%s", errMsg)
		}
		return nil
	})
	if statusCode != 0 {
		httpx.WriteError(w, statusCode, errMsg)
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"id": tpl.ID, "name": tpl.Name})
}

func (h *TemplatesHandler) Update(w http.ResponseWriter, r *http.Request) {
	tplID := r.PathValue("template_id")
	var tpl db.GridTemplate
	if err := h.DB.Where("id = ?", tplID).First(&tpl).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Template not found")
		return
	}
	if tpl.IsBuiltin {
		httpx.WriteError(w, http.StatusBadRequest, "الشبكات الجاهزة غير قابلة للتعديل — انسخوها أولاً")
		return
	}
	var used int64
	h.DB.Model(&db.ExamSession{}).Where("template_id = ?", tplID).Count(&used)
	if used > 0 {
		httpx.WriteError(w, http.StatusBadRequest, fmt.Sprintf("هذه الشبكة مستعملة في %d جلسة — انسخوها وعدّلوا النسخة", used))
		return
	}
	var body templateUpdateBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	var statusCode int
	var errMsg string
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		statusCode, errMsg = applyTemplateSpec(tx, &tpl, body)
		if statusCode != 0 {
			return fmt.Errorf("%s", errMsg)
		}
		return nil
	})
	if statusCode != 0 {
		httpx.WriteError(w, statusCode, errMsg)
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *TemplatesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	tplID := r.PathValue("template_id")
	var tpl db.GridTemplate
	if err := h.DB.Where("id = ?", tplID).First(&tpl).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Template not found")
		return
	}
	if tpl.IsBuiltin {
		httpx.WriteError(w, http.StatusBadRequest, "لا يمكن حذف الشبكات الجاهزة")
		return
	}
	var used int64
	h.DB.Model(&db.ExamSession{}).Where("template_id = ?", tplID).Count(&used)
	if used > 0 {
		httpx.WriteError(w, http.StatusBadRequest, "الشبكة مستعملة في جلسات — لا يمكن حذفها")
		return
	}
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		var secs []db.GridSection
		if err := tx.Where("template_id = ?", tpl.ID).Find(&secs).Error; err != nil {
			return err
		}
		for _, s := range secs {
			if err := tx.Where("section_id = ?", s.ID).Delete(&db.GridCriterion{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("template_id = ?", tpl.ID).Delete(&db.GridSection{}).Error; err != nil {
			return err
		}
		return tx.Delete(&tpl).Error
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
