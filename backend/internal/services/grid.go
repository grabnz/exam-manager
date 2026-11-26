package services

import (
	"math"

	"exam-manager/backend/internal/db"
)

// SectionSubtotal computes a single section's subtotal:
// manual ST override when present, otherwise sum(criteria) + bonus.
func SectionSubtotal(sec db.GridSection, values db.ScoreValues) float64 {
	if secVal, ok := values.Sections[sec.ID]; ok {
		if sec.AllowSTOverride && secVal.ST != nil {
			return *secVal.ST
		}
	}
	var total float64
	for _, c := range sec.Criteria {
		if v, ok := values.Criteria[c.ID]; ok && v != nil {
			total += *v
		}
	}
	if sec.HasBonus {
		if secVal, ok := values.Sections[sec.ID]; ok && secVal.Bonus != nil {
			total += *secVal.Bonus
		}
	}
	return total
}

// GroupTotal represents an ordered group total.
type GroupTotal struct {
	Key      string
	Label    string
	Total    float64
	Sections []db.GridSection
}

// TemplateGroups returns ordered groups of sections preserving template section order.
func TemplateGroups(tpl *db.GridTemplate) []GroupTotal {
	var out []GroupTotal
	idxByKey := map[string]int{}
	for _, s := range tpl.Sections {
		idx, ok := idxByKey[s.GroupKey]
		if !ok {
			idx = len(out)
			idxByKey[s.GroupKey] = idx
			out = append(out, GroupTotal{Key: s.GroupKey, Label: s.GroupLabel})
		}
		out[idx].Sections = append(out[idx].Sections, s)
	}
	return out
}

// GroupTotals computes ordered group totals for a student's values.
func GroupTotals(tpl *db.GridTemplate, values db.ScoreValues) []GroupTotal {
	groups := TemplateGroups(tpl)
	for i := range groups {
		var sum float64
		for _, s := range groups[i].Sections {
			sum += SectionSubtotal(s, values)
		}
		groups[i].Total = sum
	}
	return groups
}

// HasAnyValue reports whether the student has any entered criterion, bonus, or ST value.
func HasAnyValue(values db.ScoreValues) bool {
	for _, v := range values.Criteria {
		if v != nil {
			return true
		}
	}
	for _, sv := range values.Sections {
		if sv.Bonus != nil || sv.ST != nil {
			return true
		}
	}
	return false
}

// FinalScore computes the final score according to tpl.FinalFormula.
// Returns nil if the student is absent/exempt or has no entered values.
func FinalScore(tpl *db.GridTemplate, values db.ScoreValues) *float64 {
	if values.Status == "absent" || values.Status == "exempt" {
		return nil
	}
	groups := GroupTotals(tpl, values)
	if len(groups) == 0 || !HasAnyValue(values) {
		return nil
	}
	var sum float64
	for _, g := range groups {
		sum += g.Total
	}

	var res float64
	switch tpl.FinalFormula {
	case "avg_groups":
		res = sum / float64(len(groups))
	case "sum_capped":
		res = sum
		if tpl.FinalCap != nil && *tpl.FinalCap > 0 && res > *tpl.FinalCap {
			res = *tpl.FinalCap
		}
	default:
		res = sum
	}
	rounded := math.Round(res*100) / 100
	return &rounded
}
