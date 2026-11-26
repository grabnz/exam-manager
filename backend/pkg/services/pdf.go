package services

import (
	"bytes"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/ledongthuc/pdf"
	"golang.org/x/text/unicode/norm"
)

// PDFParseResult holds the extracted student list and class metadata.
type PDFParseResult struct {
	Students []string
	Meta     PDFMeta
}

type PDFMeta struct {
	ClassName  string
	Trimester  *int
	ExamType   string
	SchoolYear string
	Teacher    string
}

var (
	arabicRe     = regexp.MustCompile(`[\x{0600}-\x{06FF}\x{FB50}-\x{FDFF}\x{FE70}-\x{FEFF}]`)
	arabicPresRe = regexp.MustCompile(`[\x{FB50}-\x{FDFF}\x{FE70}-\x{FEFF}]`)
	yearRe       = regexp.MustCompile(`(\d{4})\s*[-–]\s*(\d{4})`)
	trimesterRe  = regexp.MustCompile(`الثلاثي\s*(\d)`)
	teacherRe    = regexp.MustCompile(`المربي\s*[:：]\s*([^\n(]+)`)
	classRe      = regexp.MustCompile(`القسم\s*[:：]\s*([^\n\-–]+)`)
	classFallRe  = regexp.MustCompile(`(الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة)\s*(أ|ب|ج|د|ه|و)`)
)

var emptyScoreTokens = map[string]bool{
	"": true, "-": true, "--": true, "--.--": true, "--,--": true,
	"x": true, "X": true, "None": true, "none": true,
}

func reverseRunes(s string) string {
	r := []rune(s)
	for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {
		r[i], r[j] = r[j], r[i]
	}
	return string(r)
}

func fixArabicName(name string) string {
	name = strings.ReplaceAll(name, "ـ", "")
	if arabicPresRe.MatchString(name) {
		name = reverseRunes(name)
	}
	name = norm.NFKC.String(name)
	return strings.Join(strings.Fields(name), " ")
}

// ParsePDF parses a Tunisian primary school PDF export to extract student names and metadata.
func ParsePDF(pdfBytes []byte) (*PDFParseResult, error) {
	reader, err := pdf.NewReader(bytes.NewReader(pdfBytes), int64(len(pdfBytes)))
	if err != nil {
		return nil, fmt.Errorf("read pdf: %w", err)
	}

	var students []string
	seen := map[string]bool{}
	var fullText strings.Builder

	numPages := reader.NumPage()
	for p := 1; p <= numPages; p++ {
		page := reader.Page(p)
		if page.V.IsNull() {
			continue
		}
		rows, err := page.GetTextByRow()
		if err != nil {
			continue
		}
		for _, row := range rows {
			// Sort words left-to-right by X position
			words := append([]pdf.Text(nil), row.Content...)
			sort.Slice(words, func(i, j int) bool { return words[i].X < words[j].X })

			var lineParts []string
			for _, w := range words {
				if s := strings.TrimSpace(w.S); s != "" {
					lineParts = append(lineParts, s)
				}
			}
			if len(lineParts) == 0 {
				continue
			}
			rawLine := strings.Join(lineParts, " ")
			if arabicPresRe.MatchString(rawLine) {
				fullText.WriteString(fixArabicName(rawLine))
			} else {
				fullText.WriteString(rawLine)
			}
			fullText.WriteByte('\n')

			// Heuristic for student table row: right-most Arabic text (full name) with
			// only empty/dash/number-less score cells on the left.
			if len(words) == 0 {
				continue
			}
			// Group adjacent words into cells separated by a horizontal gap (> 18pt)
			var cells []string
			var cur strings.Builder
			prevEnd := -1.0
			for _, w := range words {
				if prevEnd >= 0 && w.X-prevEnd > 18 {
					if s := strings.TrimSpace(cur.String()); s != "" {
						cells = append(cells, s)
					}
					cur.Reset()
				}
				cur.WriteString(w.S)
				prevEnd = w.X + w.W
			}
			if s := strings.TrimSpace(cur.String()); s != "" {
				cells = append(cells, s)
			}
			if len(cells) == 0 {
				continue
			}

			nameCell := strings.TrimSpace(cells[len(cells)-1])
			scoreCells := cells[:len(cells)-1]

			allEmpty := true
			for _, sc := range scoreCells {
				if !emptyScoreTokens[strings.TrimSpace(sc)] {
					allEmpty = false
					break
				}
			}
			if !allEmpty {
				continue
			}
			if !arabicRe.MatchString(nameCell) || len([]rune(nameCell)) < 3 {
				continue
			}
			fixed := fixArabicName(nameCell)
			// Skip header/metadata lines
			if strings.Contains(fixed, "القسم") || strings.Contains(fixed, "المربي") ||
				strings.Contains(fixed, "الثلاثي") || strings.Contains(fixed, "المدرسة") ||
				strings.Contains(fixed, "التلميذ") || strings.Contains(fixed, "الاسم") ||
				strings.Contains(fixed, "امتحان") {
				continue
			}
			if !seen[fixed] {
				seen[fixed] = true
				students = append(students, fixed)
			}
		}
	}

	res := &PDFParseResult{Students: students}
	extractMeta(fullText.String(), &res.Meta)
	return res, nil
}

func extractMeta(text string, meta *PDFMeta) {
	if m := yearRe.FindStringSubmatch(text); len(m) == 3 {
		y1, _ := strconv.Atoi(m[1])
		y2, _ := strconv.Atoi(m[2])
		if y1 > y2 {
			y1, y2 = y2, y1
		}
		meta.SchoolYear = fmt.Sprintf("%d-%d", y1, y2)
	}
	if m := trimesterRe.FindStringSubmatch(text); len(m) == 2 {
		t, err := strconv.Atoi(m[1])
		if err == nil {
			meta.Trimester = &t
		}
	}
	if strings.Contains(text, "امتحان") {
		meta.ExamType = "امتحان"
	} else if strings.Contains(text, "فرض") {
		meta.ExamType = "فرض"
	}
	if m := teacherRe.FindStringSubmatch(text); len(m) == 2 {
		meta.Teacher = strings.TrimSpace(m[1])
	}
	if m := classRe.FindStringSubmatch(text); len(m) == 2 {
		meta.ClassName = strings.TrimSpace(m[1])
	} else if m := classFallRe.FindStringSubmatch(text); len(m) == 3 {
		meta.ClassName = m[1] + " " + m[2]
	}
}
