package services

import (
	"bytes"
	"fmt"

	"exam-manager/backend/internal/db"

	"github.com/xuri/excelize/v2"
)

type excelPalette struct {
	Tab       string
	SubHdr    string
	CritHdr   string
	Data      string
	TotalHdr  string
	TotalData string
}

var excelPalettes = map[string]excelPalette{
	"blue":   {Tab: "2E75B6", SubHdr: "DAEAF5", CritHdr: "C6DFEF", Data: "EBF3FB", TotalHdr: "9DC3E6", TotalData: "BDD7EE"},
	"green":  {Tab: "375623", SubHdr: "D9EAD3", CritHdr: "C6EFCE", Data: "EBF5EB", TotalHdr: "70AD47", TotalData: "A9D18E"},
	"orange": {Tab: "843C00", SubHdr: "FDE9D9", CritHdr: "FCE4D6", Data: "FEF0E7", TotalHdr: "ED7D31", TotalData: "F4B183"},
	"purple": {Tab: "5B2D8E", SubHdr: "E6DEF2", CritHdr: "D9CCEC", Data: "F2EDF9", TotalHdr: "9A7FC7", TotalData: "B8A5D6"},
	"teal":   {Tab: "1F6E6B", SubHdr: "D6ECEB", CritHdr: "C2E3E1", Data: "EAF5F4", TotalHdr: "4FA3A0", TotalData: "8CC5C3"},
	"rose":   {Tab: "9C3353", SubHdr: "F6DDE5", CritHdr: "F0CBD8", Data: "FAEDF1", TotalHdr: "C9728F", TotalData: "DA9DB1"},
}

var paletteCycle = []string{"blue", "green", "orange", "purple", "teal", "rose"}

const bonusBG = "E2EFDA"

func pickPalette(colorKey *string, idx int) excelPalette {
	if colorKey != nil {
		if p, ok := excelPalettes[*colorKey]; ok {
			return p
		}
	}
	return excelPalettes[paletteCycle[idx%len(paletteCycle)]]
}

func truncateSheetName(name string) string {
	r := []rune(name)
	if len(r) > 31 {
		return string(r[:31])
	}
	return name
}

func colName(col int) string {
	name, _ := excelize.ColumnNumberToName(col)
	return name
}

func cellRef(col, row int) string {
	return fmt.Sprintf("%s%d", colName(col), row)
}

// ExportSessionXLSX generates an Excel workbook matching the legacy Python export.
func ExportSessionXLSX(sess *db.ExamSession) ([]byte, error) {
	if sess.Template == nil {
		return nil, fmt.Errorf("session has no pinned template")
	}
	tpl := sess.Template
	entriesByStudent := make(map[string]db.ScoreEntry, len(sess.Entries))
	for _, e := range sess.Entries {
		entriesByStudent[e.StudentID] = e
	}
	students := sess.Class.Students
	groups := TemplateGroups(tpl)

	f := excelize.NewFile()
	defer f.Close()

	styleCache := map[string]int{}
	getStyle := func(bg string, bold bool, size float64, alignH string) int {
		key := fmt.Sprintf("%s|%v|%.1f|%s", bg, bold, size, alignH)
		if id, ok := styleCache[key]; ok {
			return id
		}
		border := []excelize.Border{
			{Type: "left", Color: "BBBBBB", Style: 1},
			{Type: "right", Color: "BBBBBB", Style: 1},
			{Type: "top", Color: "BBBBBB", Style: 1},
			{Type: "bottom", Color: "BBBBBB", Style: 1},
		}
		id, _ := f.NewStyle(&excelize.Style{
			Fill: excelize.Fill{Type: "pattern", Color: []string{bg}, Pattern: 1},
			Font: &excelize.Font{Bold: bold, Size: size},
			Alignment: &excelize.Alignment{
				Horizontal: alignH,
				Vertical:   "center",
				WrapText:   true,
			},
			Border: border,
		})
		styleCache[key] = id
		return id
	}

	valuesOf := func(studentID string) db.ScoreValues {
		if e, ok := entriesByStudent[studentID]; ok {
			return e.Values
		}
		return db.ScoreValues{
			Criteria: map[string]*float64{},
			Sections: map[string]db.SectionValue{},
		}
	}

	type colSpec struct {
		typ  string // crit | bonus | subtotal | total
		sec  *db.GridSection
		crit *db.GridCriterion
	}

	// ── One sheet per group ──
	for gi, g := range groups {
		var colorKey *string
		if len(g.Sections) > 0 {
			colorKey = g.Sections[0].ColorKey
		}
		pal := pickPalette(colorKey, gi)
		sheet := truncateSheetName(g.Label)
		_, _ = f.NewSheet(sheet)
		_ = f.SetSheetProps(sheet, &excelize.SheetPropsOptions{TabColorRGB: &pal.Tab})

		var specs []colSpec
		for si := range g.Sections {
			sec := &g.Sections[si]
			for ci := range sec.Criteria {
				specs = append(specs, colSpec{typ: "crit", sec: sec, crit: &sec.Criteria[ci]})
			}
			if sec.HasBonus {
				specs = append(specs, colSpec{typ: "bonus", sec: sec})
			}
			if sec.HasBonus || sec.AllowSTOverride {
				specs = append(specs, colSpec{typ: "subtotal", sec: sec})
			}
		}
		specs = append(specs, colSpec{typ: "total"})

		const nameCol = 1
		const dataRow = 3
		totalCol := 1 + len(specs)

		type span struct {
			sec        *db.GridSection
			start, end int
		}
		spans := map[string]*span{}
		var spanOrder []string
		for idx, sp := range specs {
			col := idx + 2
			if sp.sec != nil {
				if existing, ok := spans[sp.sec.ID]; ok {
					existing.end = col
				} else {
					spans[sp.sec.ID] = &span{sec: sp.sec, start: col, end: col}
					spanOrder = append(spanOrder, sp.sec.ID)
				}
			}
		}

		// Row 1 headers
		_ = f.MergeCell(sheet, cellRef(nameCol, 1), cellRef(nameCol, 2))
		_ = f.SetCellValue(sheet, cellRef(nameCol, 1), "التلاميذ")
		_ = f.SetCellStyle(sheet, cellRef(nameCol, 1), cellRef(nameCol, 2), getStyle("D9D9D9", true, 11, "center"))

		for _, id := range spanOrder {
			sp := spans[id]
			if sp.start != sp.end {
				_ = f.MergeCell(sheet, cellRef(sp.start, 1), cellRef(sp.end, 1))
			}
			_ = f.SetCellValue(sheet, cellRef(sp.start, 1), sp.sec.Label)
			_ = f.SetCellStyle(sheet, cellRef(sp.start, 1), cellRef(sp.end, 1), getStyle(pal.SubHdr, true, 10, "center"))
		}

		totalLabel := "المجموع"
		if tpl.Direction == "ltr" {
			totalLabel = "Total"
		}
		_ = f.MergeCell(sheet, cellRef(totalCol, 1), cellRef(totalCol, 2))
		_ = f.SetCellValue(sheet, cellRef(totalCol, 1), totalLabel)
		_ = f.SetCellStyle(sheet, cellRef(totalCol, 1), cellRef(totalCol, 2), getStyle(pal.TotalHdr, true, 11, "center"))

		// Row 2 labels
		for idx, sp := range specs {
			if sp.typ == "total" {
				break
			}
			col := idx + 2
			lbl := "S.T."
			clr := pal.SubHdr
			if sp.typ == "crit" {
				lbl = sp.crit.Label
				clr = pal.CritHdr
			} else if sp.typ == "bonus" {
				lbl = "Bonus"
				clr = bonusBG
			}
			ref := cellRef(col, 2)
			_ = f.SetCellValue(sheet, ref, lbl)
			_ = f.SetCellStyle(sheet, ref, ref, getStyle(clr, true, 9, "center"))
		}

		// Student rows
		for ri, student := range students {
			row := dataRow + ri
			vals := valuesOf(student.ID)
			nameRef := cellRef(nameCol, row)
			_ = f.SetCellValue(sheet, nameRef, student.FullName)
			_ = f.SetCellStyle(sheet, nameRef, nameRef, getStyle("FFFFFF", false, 9, "right"))

			for idx, sp := range specs {
				col := idx + 2
				ref := cellRef(col, row)
				switch sp.typ {
				case "crit":
					if v, ok := vals.Criteria[sp.crit.ID]; ok && v != nil {
						_ = f.SetCellValue(sheet, ref, *v)
					}
					_ = f.SetCellStyle(sheet, ref, ref, getStyle(pal.Data, false, 10, "center"))
				case "bonus":
					if sv, ok := vals.Sections[sp.sec.ID]; ok && sv.Bonus != nil {
						_ = f.SetCellValue(sheet, ref, *sv.Bonus)
					}
					_ = f.SetCellStyle(sheet, ref, ref, getStyle(bonusBG, false, 10, "center"))
				case "subtotal":
					stVal := SectionSubtotal(*sp.sec, vals)
					if HasAnyValue(vals) {
						_ = f.SetCellValue(sheet, ref, stVal)
					}
					_ = f.SetCellStyle(sheet, ref, ref, getStyle(pal.CritHdr, true, 9, "center"))
				case "total":
					var gTot float64
					for _, s := range g.Sections {
						gTot += SectionSubtotal(s, vals)
					}
					if HasAnyValue(vals) {
						_ = f.SetCellValue(sheet, ref, gTot)
					}
					_ = f.SetCellStyle(sheet, ref, ref, getStyle(pal.TotalData, true, 10, "center"))
				}
			}
			_ = f.SetRowHeight(sheet, row, 18)
		}

		// Widths, heights, freeze panes
		_ = f.SetColWidth(sheet, "A", "A", 30)
		for idx, sp := range specs {
			cn := colName(idx + 2)
			w := 6.5
			if sp.typ == "total" {
				w = 10
			} else if sp.typ == "subtotal" || sp.typ == "bonus" {
				w = 9
			}
			_ = f.SetColWidth(sheet, cn, cn, w)
		}
		_ = f.SetRowHeight(sheet, 1, 26)
		_ = f.SetRowHeight(sheet, 2, 22)
		_ = f.SetPanes(sheet, &excelize.Panes{
			Freeze: true, Split: false, XSplit: 1, YSplit: 2, TopLeftCell: "B3", ActivePane: "bottomRight",
		})
	}

	// ── Note Finale sheet ──
	finalSheet := "Note Finale"
	_, _ = f.NewSheet(finalSheet)
	tabGold := "FFD966"
	_ = f.SetSheetProps(finalSheet, &excelize.SheetPropsOptions{TabColorRGB: &tabGold})

	finalLabel := "المجموع النهائي"
	if tpl.FinalFormula == "avg_groups" {
		finalLabel = "Moyenne / Note Finale"
	}

	const nameColF = 1
	finalColF := 2 + len(groups)

	_ = f.SetCellValue(finalSheet, cellRef(nameColF, 1), "التلاميذ")
	_ = f.SetCellStyle(finalSheet, cellRef(nameColF, 1), cellRef(nameColF, 1), getStyle("D9D9D9", true, 10, "center"))

	for gi, g := range groups {
		var colorKey *string
		if len(g.Sections) > 0 {
			colorKey = g.Sections[0].ColorKey
		}
		pal := pickPalette(colorKey, gi)
		ref := cellRef(2+gi, 1)
		_ = f.SetCellValue(finalSheet, ref, g.Label)
		_ = f.SetCellStyle(finalSheet, ref, ref, getStyle(pal.CritHdr, true, 10, "center"))
	}

	_ = f.SetCellValue(finalSheet, cellRef(finalColF, 1), finalLabel)
	_ = f.SetCellStyle(finalSheet, cellRef(finalColF, 1), cellRef(finalColF, 1), getStyle("FFE699", true, 10, "center"))

	for ri, student := range students {
		row := 2 + ri
		vals := valuesOf(student.ID)
		nameRef := cellRef(nameColF, row)
		_ = f.SetCellValue(finalSheet, nameRef, student.FullName)
		_ = f.SetCellStyle(finalSheet, nameRef, nameRef, getStyle("FFFFFF", false, 9, "right"))

		gtotals := GroupTotals(tpl, vals)
		hasVal := HasAnyValue(vals)
		for gi, gt := range gtotals {
			var colorKey *string
			if len(gt.Sections) > 0 {
				colorKey = gt.Sections[0].ColorKey
			}
			pal := pickPalette(colorKey, gi)
			ref := cellRef(2+gi, row)
			if vals.Status == "absent" {
				_ = f.SetCellValue(finalSheet, ref, "غ")
			} else if vals.Status == "exempt" {
				_ = f.SetCellValue(finalSheet, ref, "معفى")
			} else if hasVal {
				_ = f.SetCellValue(finalSheet, ref, gt.Total)
			}
			_ = f.SetCellStyle(finalSheet, ref, ref, getStyle(pal.Data, false, 10, "center"))
		}

		fRef := cellRef(finalColF, row)
		if vals.Status == "absent" {
			_ = f.SetCellValue(finalSheet, fRef, "غ")
		} else if vals.Status == "exempt" {
			_ = f.SetCellValue(finalSheet, fRef, "معفى")
		} else if final := FinalScore(tpl, vals); final != nil {
			_ = f.SetCellValue(finalSheet, fRef, *final)
		}
		_ = f.SetCellStyle(finalSheet, fRef, fRef, getStyle("FFF2CC", true, 11, "center"))
		_ = f.SetRowHeight(finalSheet, row, 18)
	}

	_ = f.SetColWidth(finalSheet, "A", "A", 30)
	for gi := range groups {
		cn := colName(2 + gi)
		_ = f.SetColWidth(finalSheet, cn, cn, 20)
	}
	_ = f.SetColWidth(finalSheet, colName(finalColF), colName(finalColF), 18)
	_ = f.SetRowHeight(finalSheet, 1, 40)
	_ = f.SetPanes(finalSheet, &excelize.Panes{
		Freeze: true, Split: false, XSplit: 1, YSplit: 1, TopLeftCell: "B2", ActivePane: "bottomRight",
	})

	// Delete default Sheet1
	_ = f.DeleteSheet("Sheet1")

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
