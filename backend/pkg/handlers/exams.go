package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"exam-manager/backend/pkg/auth"
	"exam-manager/backend/pkg/db"
	"exam-manager/backend/pkg/httpx"
	"github.com/ledongthuc/pdf"
	"gorm.io/gorm"
)

type ExamsHandler struct{ DB *gorm.DB }

// ── Exam Paper DTOs ──────────────────────────────────────────────────────────

type examPaperOut struct {
	ID             string          `json:"id"`
	Title          string          `json:"title"`
	SchoolYear     string          `json:"school_year"`
	Level          string          `json:"level"`
	SubjectCode    string          `json:"subject_code"`
	Trimester      int             `json:"trimester"`
	ModuleNum      int             `json:"module_num"`
	ExamType       string          `json:"exam_type"`
	Direction      string          `json:"direction"`
	Blocks         json.RawMessage `json:"blocks"`
	TotalPoints    float64         `json:"total_points"`
	UsedCount      int             `json:"used_count"`
	AvgScore       *float64        `json:"avg_score"`
	SourceFileName string          `json:"source_file_name"`
	HasAttachment  bool            `json:"has_attachment"`
	CreatedAt      string          `json:"created_at"`
	UpdatedAt      string          `json:"updated_at"`
}

func serializeExam(e db.ExamPaper, includeBlocks bool) examPaperOut {
	blocks := json.RawMessage("[]")
	if includeBlocks && strings.TrimSpace(e.BlocksJSON) != "" {
		blocks = json.RawMessage(e.BlocksJSON)
	}
	return examPaperOut{
		ID:             e.ID,
		Title:          e.Title,
		SchoolYear:     e.SchoolYear,
		Level:          e.Level,
		SubjectCode:    e.SubjectCode,
		Trimester:      e.Trimester,
		ModuleNum:      e.ModuleNum,
		ExamType:       e.ExamType,
		Direction:      e.Direction,
		Blocks:         blocks,
		TotalPoints:    e.TotalPoints,
		UsedCount:      e.UsedCount,
		AvgScore:       e.AvgScore,
		SourceFileName: e.SourceFileName,
		HasAttachment:  len(e.SourceFileData) > 0,
		CreatedAt:      e.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:      e.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func (h *ExamsHandler) List(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	q := h.DB.Model(&db.ExamPaper{})
	if u.Role != "admin" {
		q = q.Where("owner_id = ?", u.ID)
	}
	if sy := strings.TrimSpace(r.URL.Query().Get("school_year")); sy != "" {
		q = q.Where("school_year = ?", sy)
	}
	if lvl := strings.TrimSpace(r.URL.Query().Get("level")); lvl != "" {
		q = q.Where("level = ?", lvl)
	}
	if tr := strings.TrimSpace(r.URL.Query().Get("trimester")); tr != "" {
		if n, err := strconv.Atoi(tr); err == nil && n > 0 {
			q = q.Where("trimester = ?", n)
		}
	}
	if search := strings.TrimSpace(r.URL.Query().Get("q")); search != "" {
		like := "%" + strings.ToLower(search) + "%"
		q = q.Where("LOWER(title) LIKE ?", like)
	}

	var rows []db.ExamPaper
	// Omit SourceFileData in list queries for speed
	q.Select("id, owner_id, title, school_year, level, subject_code, trimester, module_num, exam_type, direction, total_points, used_count, avg_score, source_file_name, created_at, updated_at").
		Order("school_year DESC, trimester DESC, updated_at DESC").
		Find(&rows)

	out := make([]examPaperOut, 0, len(rows))
	for _, row := range rows {
		item := serializeExam(row, false)
		item.HasAttachment = row.SourceFileName != ""
		out = append(out, item)
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *ExamsHandler) Get(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	id := r.PathValue("exam_id")
	var row db.ExamPaper
	if err := h.DB.Where("id = ?", id).First(&row).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "الامتحان غير موجود")
		return
	}
	if u.Role != "admin" && row.OwnerID != u.ID {
		httpx.WriteError(w, http.StatusForbidden, "غير مسموح")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, serializeExam(row, true))
}

type examUpsertReq struct {
	Title       string          `json:"title"`
	SchoolYear  string          `json:"school_year"`
	Level       string          `json:"level"`
	SubjectCode string          `json:"subject_code"`
	Trimester   int             `json:"trimester"`
	ModuleNum   int             `json:"module_num"`
	ExamType    string          `json:"exam_type"`
	Direction   string          `json:"direction"`
	Blocks      json.RawMessage `json:"blocks"`
	TotalPoints float64         `json:"total_points"`
	SaveToBank  bool            `json:"save_to_bank"`
}

func (h *ExamsHandler) Create(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	var body examUpsertReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "بيانات غير صالحة")
		return
	}
	if strings.TrimSpace(body.Title) == "" {
		body.Title = "Évaluation de Français"
	}
	if strings.TrimSpace(body.SchoolYear) == "" {
		body.SchoolYear = "2025-2026"
	}
	if strings.TrimSpace(body.Level) == "" {
		body.Level = "4ème année"
	}
	if strings.TrimSpace(body.SubjectCode) == "" {
		body.SubjectCode = "francais"
	}
	if body.Trimester < 1 || body.Trimester > 3 {
		body.Trimester = 1
	}
	if strings.TrimSpace(body.ExamType) == "" {
		body.ExamType = "Évaluation"
	}
	if body.Direction != "rtl" {
		body.Direction = "ltr"
	}
	blocksStr := "[]"
	if len(body.Blocks) > 0 {
		blocksStr = string(body.Blocks)
	}

	row := db.ExamPaper{
		OwnerID:     u.ID,
		Title:       strings.TrimSpace(body.Title),
		SchoolYear:  strings.TrimSpace(body.SchoolYear),
		Level:       strings.TrimSpace(body.Level),
		SubjectCode: body.SubjectCode,
		Trimester:   body.Trimester,
		ModuleNum:   body.ModuleNum,
		ExamType:    body.ExamType,
		Direction:   body.Direction,
		BlocksJSON:  blocksStr,
		TotalPoints: body.TotalPoints,
		UsedCount:   1,
	}
	if err := h.DB.Create(&row).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if body.SaveToBank {
		h.syncBlocksToBank(u.ID, row)
	}
	httpx.WriteJSON(w, http.StatusCreated, serializeExam(row, true))
}

func (h *ExamsHandler) Update(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	id := r.PathValue("exam_id")
	var row db.ExamPaper
	if err := h.DB.Where("id = ?", id).First(&row).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "الامتحان غير موجود")
		return
	}
	if u.Role != "admin" && row.OwnerID != u.ID {
		httpx.WriteError(w, http.StatusForbidden, "غير مسموح")
		return
	}
	var body examUpsertReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "بيانات غير صالحة")
		return
	}
	if strings.TrimSpace(body.Title) != "" {
		row.Title = strings.TrimSpace(body.Title)
	}
	if strings.TrimSpace(body.SchoolYear) != "" {
		row.SchoolYear = strings.TrimSpace(body.SchoolYear)
	}
	if strings.TrimSpace(body.Level) != "" {
		row.Level = strings.TrimSpace(body.Level)
	}
	if body.Trimester >= 1 && body.Trimester <= 3 {
		row.Trimester = body.Trimester
	}
	row.ModuleNum = body.ModuleNum
	if strings.TrimSpace(body.ExamType) != "" {
		row.ExamType = body.ExamType
	}
	if body.Direction == "ltr" || body.Direction == "rtl" {
		row.Direction = body.Direction
	}
	if len(body.Blocks) > 0 {
		row.BlocksJSON = string(body.Blocks)
	}
	row.TotalPoints = body.TotalPoints

	if err := h.DB.Save(&row).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if body.SaveToBank {
		h.syncBlocksToBank(u.ID, row)
	}
	httpx.WriteJSON(w, http.StatusOK, serializeExam(row, true))
}

func (h *ExamsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	id := r.PathValue("exam_id")
	var row db.ExamPaper
	if err := h.DB.Where("id = ?", id).First(&row).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "الامتحان غير موجود")
		return
	}
	if u.Role != "admin" && row.OwnerID != u.ID {
		httpx.WriteError(w, http.StatusForbidden, "غير مسموح")
		return
	}
	if err := h.DB.Delete(&row).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *ExamsHandler) Clone(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	id := r.PathValue("exam_id")
	var src db.ExamPaper
	if err := h.DB.Where("id = ?", id).First(&src).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "الامتحان غير موجود")
		return
	}
	if u.Role != "admin" && src.OwnerID != u.ID {
		httpx.WriteError(w, http.StatusForbidden, "غير مسموح")
		return
	}
	var body struct {
		SchoolYear string `json:"school_year"`
		Title      string `json:"title"`
		Trimester  int    `json:"trimester"`
	}
	_ = httpx.DecodeJSON(r, &body)
	if strings.TrimSpace(body.SchoolYear) == "" {
		body.SchoolYear = nextYearLabel(src.SchoolYear)
	}
	if strings.TrimSpace(body.Title) == "" {
		body.Title = src.Title
	}
	trim := src.Trimester
	if body.Trimester >= 1 && body.Trimester <= 3 {
		trim = body.Trimester
	}

	copyRow := db.ExamPaper{
		OwnerID:     u.ID,
		Title:       strings.TrimSpace(body.Title),
		SchoolYear:  strings.TrimSpace(body.SchoolYear),
		Level:       src.Level,
		SubjectCode: src.SubjectCode,
		Trimester:   trim,
		ModuleNum:   src.ModuleNum,
		ExamType:    src.ExamType,
		Direction:   src.Direction,
		BlocksJSON:  src.BlocksJSON,
		TotalPoints: src.TotalPoints,
		UsedCount:   1,
	}
	if err := h.DB.Create(&copyRow).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = h.DB.Model(&src).Update("used_count", src.UsedCount+1).Error
	httpx.WriteJSON(w, http.StatusCreated, serializeExam(copyRow, true))
}

func nextYearLabel(y string) string {
	parts := strings.Split(y, "-")
	if len(parts) == 2 {
		if a, err := strconv.Atoi(strings.TrimSpace(parts[0])); err == nil {
			return fmt.Sprintf("%d-%d", a+1, a+2)
		}
	}
	now := time.Now()
	return fmt.Sprintf("%d-%d", now.Year(), now.Year()+1)
}

// ── Legacy Exam Upload & Auto Block Extraction (PDF / DOCX / Image) ─────────

func (h *ExamsHandler) UploadLegacy(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "ملف كبير جداً (الحد الأقصى 8 ميغابايت)")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "لم يتم إرفاق ملف")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 8<<20))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "تعذّرت قراءة الملف")
		return
	}

	title := strings.TrimSpace(r.FormValue("title"))
	if title == "" {
		title = strings.TrimSuffix(header.Filename, filepath.Ext(header.Filename))
	}
	year := strings.TrimSpace(r.FormValue("school_year"))
	if year == "" {
		year = "2024-2025"
	}
	level := strings.TrimSpace(r.FormValue("level"))
	if level == "" {
		level = "4ème année"
	}
	trim, _ := strconv.Atoi(r.FormValue("trimester"))
	if trim < 1 || trim > 3 {
		trim = 1
	}
	modNum, _ := strconv.Atoi(r.FormValue("module_num"))

	// If PDF, extract text and auto-slice into starter French exam blocks
	extractedBlocks := []map[string]any{}
	if strings.HasSuffix(strings.ToLower(header.Filename), ".pdf") {
		extractedBlocks = extractBlocksFromPDF(data)
	}
	blocksBytes, _ := json.Marshal(extractedBlocks)

	row := db.ExamPaper{
		OwnerID:        u.ID,
		Title:          title,
		SchoolYear:     year,
		Level:          level,
		SubjectCode:    "francais",
		Trimester:      trim,
		ModuleNum:      modNum,
		ExamType:       "Évaluation",
		Direction:      "ltr",
		BlocksJSON:     string(blocksBytes),
		TotalPoints:    20,
		UsedCount:      1,
		SourceFileName: header.Filename,
		SourceFileType: header.Header.Get("Content-Type"),
		SourceFileData: data,
	}
	if err := h.DB.Create(&row).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(extractedBlocks) > 0 {
		h.syncBlocksToBank(u.ID, row)
	}
	httpx.WriteJSON(w, http.StatusCreated, serializeExam(row, true))
}

func (h *ExamsHandler) DownloadAttachment(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	id := r.PathValue("exam_id")
	var row db.ExamPaper
	if err := h.DB.Where("id = ?", id).First(&row).Error; err != nil || len(row.SourceFileData) == 0 {
		httpx.WriteError(w, http.StatusNotFound, "لا يوجد ملف مرفق")
		return
	}
	if u.Role != "admin" && row.OwnerID != u.ID {
		httpx.WriteError(w, http.StatusForbidden, "غير مسموح")
		return
	}
	ct := row.SourceFileType
	if ct == "" {
		ct = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", row.SourceFileName))
	_, _ = w.Write(row.SourceFileData)
}

func extractBlocksFromPDF(data []byte) []map[string]any {
	reader, err := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil
	}
	var buf strings.Builder
	for i := 1; i <= reader.NumPage() && i <= 4; i++ {
		p := reader.Page(i)
		if p.V.IsNull() {
			continue
		}
		txt, err := p.GetPlainText(nil)
		if err == nil {
			buf.WriteString(txt)
			buf.WriteString("\n")
		}
	}
	raw := strings.TrimSpace(buf.String())
	if raw == "" {
		return nil
	}
	// Heuristic segmentation into French primary school blocks
	lines := strings.Split(raw, "\n")
	var clean []string
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if len(l) > 2 {
			clean = append(clean, l)
		}
	}
	if len(clean) == 0 {
		return nil
	}
	blocks := make([]map[string]any, 0)
	var cur []string
	flush := func(sec, btype, crit string, pts float64) {
		if len(cur) == 0 {
			return
		}
		text := strings.Join(cur, "\n")
		id := fmt.Sprintf("ext-%d", len(blocks)+1)
		if btype == "reading_text" {
			blocks = append(blocks, map[string]any{
				"id": id, "section": "lecture", "type": "reading_text", "criterion": "C1", "points": 0,
				"content": map[string]any{"title": "Texte extrait", "text": text, "source": "Import PDF"},
			})
		} else {
			blocks = append(blocks, map[string]any{
				"id": id, "section": sec, "type": "open_question", "criterion": crit, "points": pts,
				"content": map[string]any{"prompt": text, "lines": 2, "answer": ""},
			})
		}
		cur = nil
	}

	curSec := "lecture"
	for _, l := range clean {
		low := strings.ToLower(l)
		if strings.Contains(low, "langue") || strings.Contains(low, "grammaire") || strings.Contains(low, "conjugaison") {
			flush(curSec, "reading_text", "C1", 2)
			curSec = "langue"
			continue
		}
		if strings.Contains(low, "production") || strings.Contains(low, "essai") {
			flush(curSec, "open_question", "C5", 3)
			curSec = "production"
			continue
		}
		if strings.HasPrefix(low, "1)") || strings.HasPrefix(low, "2)") || strings.HasPrefix(low, "3)") || strings.HasPrefix(low, "exercice") {
			if len(blocks) == 0 && curSec == "lecture" {
				flush("lecture", "reading_text", "C1", 0)
			} else {
				flush(curSec, "open_question", "C2", 2)
			}
		}
		cur = append(cur, l)
	}
	if curSec == "production" {
		flush("production", "open_question", "C1", 6)
	} else {
		flush(curSec, "open_question", "C2", 2)
	}
	return blocks
}

// ── Personal Exercise Bank & Sync ────────────────────────────────────────────

type bankBlockOut struct {
	ID                string          `json:"id"`
	Section           string          `json:"section"`
	BlockType         string          `json:"block_type"`
	Level             string          `json:"level"`
	SubjectCode       string          `json:"subject_code"`
	Trimester         int             `json:"trimester"`
	ModuleNum         int             `json:"module_num"`
	Criterion         string          `json:"criterion"`
	Points            float64         `json:"points"`
	Difficulty        string          `json:"difficulty"`
	EmpiricalPassRate *float64        `json:"empirical_pass_rate"`
	Topic             string          `json:"topic"`
	Content           json.RawMessage `json:"content"`
	TimesUsed         int             `json:"times_used"`
	TimesAccepted     int             `json:"times_accepted"`
	TimesSkipped      int             `json:"times_skipped"`
	LastUsedYear      string          `json:"last_used_year"`
	IsStarter         bool            `json:"is_starter"`
}

func serializeBankBlock(b db.QuestionBlock) bankBlockOut {
	content := json.RawMessage("{}")
	if strings.TrimSpace(b.ContentJSON) != "" {
		content = json.RawMessage(b.ContentJSON)
	}
	return bankBlockOut{
		ID:                b.ID,
		Section:           b.Section,
		BlockType:         b.BlockType,
		Level:             b.Level,
		SubjectCode:       b.SubjectCode,
		Trimester:         b.Trimester,
		ModuleNum:         b.ModuleNum,
		Criterion:         b.Criterion,
		Points:            b.Points,
		Difficulty:        b.Difficulty,
		EmpiricalPassRate: b.EmpiricalPassRate,
		Topic:             b.Topic,
		Content:           content,
		TimesUsed:         b.TimesUsed,
		TimesAccepted:     b.TimesAccepted,
		TimesSkipped:      b.TimesSkipped,
		LastUsedYear:      b.LastUsedYear,
		IsStarter:         b.OwnerID == nil,
	}
}

func (h *ExamsHandler) syncBlocksToBank(userID string, paper db.ExamPaper) {
	var rawBlocks []struct {
		Section   string          `json:"section"`
		Type      string          `json:"type"`
		Criterion string          `json:"criterion"`
		Points    float64         `json:"points"`
		Topic     string          `json:"topic"`
		Content   json.RawMessage `json:"content"`
	}
	if err := json.Unmarshal([]byte(paper.BlocksJSON), &rawBlocks); err != nil {
		return
	}
	for _, b := range rawBlocks {
		if len(b.Content) == 0 {
			continue
		}
		cStr := string(b.Content)
		var existing db.QuestionBlock
		if err := h.DB.Where("owner_id = ? AND content_json = ?", userID, cStr).First(&existing).Error; err == nil {
			_ = h.DB.Model(&existing).Updates(map[string]any{
				"times_used":     existing.TimesUsed + 1,
				"last_used_year": paper.SchoolYear,
			}).Error
			continue
		}
		uid := userID
		sec := b.Section
		if sec == "" {
			sec = "langue"
		}
		crit := b.Criterion
		if crit == "" {
			crit = "C1"
		}
		_ = h.DB.Create(&db.QuestionBlock{
			OwnerID:      &uid,
			Section:      sec,
			BlockType:    b.Type,
			Level:        paper.Level,
			SubjectCode:  paper.SubjectCode,
			Trimester:    paper.Trimester,
			ModuleNum:    paper.ModuleNum,
			Criterion:    crit,
			Points:       b.Points,
			Difficulty:   "medium",
			Topic:        b.Topic,
			ContentJSON:  cStr,
			TimesUsed:    1,
			LastUsedYear: paper.SchoolYear,
		}).Error
	}
}

func (h *ExamsHandler) ListBank(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	q := h.DB.Model(&db.QuestionBlock{}).Where("owner_id IS NULL OR owner_id = ?", u.ID)
	if sec := strings.TrimSpace(r.URL.Query().Get("section")); sec != "" {
		q = q.Where("section = ?", sec)
	}
	if lvl := strings.TrimSpace(r.URL.Query().Get("level")); lvl != "" {
		q = q.Where("level = ?", lvl)
	}
	if crit := strings.TrimSpace(r.URL.Query().Get("criterion")); crit != "" {
		q = q.Where("criterion = ?", crit)
	}
	if search := strings.TrimSpace(r.URL.Query().Get("q")); search != "" {
		like := "%" + strings.ToLower(search) + "%"
		q = q.Where("LOWER(topic) LIKE ? OR LOWER(content_json) LIKE ?", like, like)
	}
	var rows []db.QuestionBlock
	q.Order("times_accepted DESC, times_used DESC, created_at DESC").Find(&rows)
	out := make([]bankBlockOut, 0, len(rows))
	for _, b := range rows {
		out = append(out, serializeBankBlock(b))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *ExamsHandler) CreateBankBlock(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	var body struct {
		Section    string          `json:"section"`
		BlockType  string          `json:"block_type"`
		Level      string          `json:"level"`
		Trimester  int             `json:"trimester"`
		ModuleNum  int             `json:"module_num"`
		Criterion  string          `json:"criterion"`
		Points     float64         `json:"points"`
		Difficulty string          `json:"difficulty"`
		Topic      string          `json:"topic"`
		Content    json.RawMessage `json:"content"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "بيانات غير صالحة")
		return
	}
	uid := u.ID
	if body.Section == "" {
		body.Section = "langue"
	}
	if body.BlockType == "" {
		body.BlockType = "open_question"
	}
	if body.Level == "" {
		body.Level = "4ème année"
	}
	if body.Difficulty == "" {
		body.Difficulty = "medium"
	}
	row := db.QuestionBlock{
		OwnerID:     &uid,
		Section:     body.Section,
		BlockType:   body.BlockType,
		Level:       body.Level,
		SubjectCode: "francais",
		Trimester:   body.Trimester,
		ModuleNum:   body.ModuleNum,
		Criterion:   body.Criterion,
		Points:      body.Points,
		Difficulty:  body.Difficulty,
		Topic:       strings.TrimSpace(body.Topic),
		ContentJSON: string(body.Content),
	}
	if err := h.DB.Create(&row).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, serializeBankBlock(row))
}

func (h *ExamsHandler) DeleteBankBlock(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	id := r.PathValue("block_id")
	var row db.QuestionBlock
	if err := h.DB.Where("id = ?", id).First(&row).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "التمرين غير موجود")
		return
	}
	if row.OwnerID == nil && u.Role != "admin" {
		httpx.WriteError(w, http.StatusForbidden, "لا يمكن حذف التمارين الجاهزة")
		return
	}
	if row.OwnerID != nil && *row.OwnerID != u.ID && u.Role != "admin" {
		httpx.WriteError(w, http.StatusForbidden, "غير مسموح")
		return
	}
	_ = h.DB.Delete(&row).Error
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ── ML / Statistical Learning Suggestion Engine (0–100% Fit Score) ──────────

type scoredSuggestion struct {
	Block    bankBlockOut `json:"block"`
	FitScore int          `json:"fit_score"`
	Reasons  []string     `json:"reasons"`
}

func scoreBlock(b db.QuestionBlock, level string, trimester int, moduleNum int, section string, criterion string, targetDiff string, currentYear string) (int, []string) {
	score := 0.0
	reasons := make([]string, 0)

	// 1. Level & Section match (35 pts)
	if level == "" || strings.EqualFold(b.Level, level) {
		score += 20
		reasons = append(reasons, "نفس المستوى")
	} else {
		score += 8
	}
	if section == "" || b.Section == section {
		score += 15
	}

	// 2. Curriculum: Trimester, Module & Criterion (25 pts)
	if trimester == 0 || b.Trimester == trimester {
		score += 10
	} else {
		score += 4
	}
	if moduleNum > 0 && b.ModuleNum == moduleNum {
		score += 5
		reasons = append(reasons, fmt.Sprintf("Module %d", moduleNum))
	} else {
		score += 2
	}
	if criterion == "" || strings.EqualFold(b.Criterion, criterion) {
		score += 10
		if criterion != "" {
			reasons = append(reasons, "معيار "+b.Criterion)
		}
	}

	// 3. Empirical / Target Difficulty Fit (20 pts)
	effDiff := b.Difficulty
	if b.EmpiricalPassRate != nil {
		p := *b.EmpiricalPassRate
		if p >= 0.72 {
			effDiff = "easy"
		} else if p <= 0.45 {
			effDiff = "hard"
		} else {
			effDiff = "medium"
		}
	}
	if targetDiff == "" || effDiff == targetDiff {
		score += 20
		if b.EmpiricalPassRate != nil {
			reasons = append(reasons, fmt.Sprintf("نجاح فعلي %.0f%%", *b.EmpiricalPassRate*100))
		}
	} else {
		score += 10
	}

	// 4. Freshness / Cooldown (10 pts)
	if currentYear == "" || b.LastUsedYear != currentYear {
		score += 10
		reasons = append(reasons, "جديد لهذه السنة")
	} else {
		score += 2
	}

	// 5. Teacher Affinity Learning Signal (10 pts — Laplace smoothed accept rate)
	totalFB := float64(b.TimesAccepted + b.TimesSkipped)
	affinity := (float64(b.TimesAccepted) + 1.0) / (totalFB + 2.0)
	score += affinity * 10.0
	if b.TimesAccepted >= 2 && affinity >= 0.65 {
		reasons = append(reasons, "مفضّل لديكم")
	}

	final := int(math.Round(math.Max(0, math.Min(100, score))))
	return final, reasons
}

func (h *ExamsHandler) SuggestBlocks(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	var req struct {
		Level            string   `json:"level"`
		Trimester        int      `json:"trimester"`
		ModuleNum        int      `json:"module_num"`
		Section          string   `json:"section"`
		Criterion        string   `json:"criterion"`
		TargetDifficulty string   `json:"target_difficulty"`
		CurrentYear      string   `json:"current_year"`
		ExcludeIDs       []string `json:"exclude_ids"`
		Limit            int      `json:"limit"`
	}
	_ = httpx.DecodeJSON(r, &req)
	if req.Limit <= 0 || req.Limit > 20 {
		req.Limit = 8
	}
	excluded := map[string]bool{}
	for _, id := range req.ExcludeIDs {
		excluded[id] = true
	}

	var rows []db.QuestionBlock
	h.DB.Where("owner_id IS NULL OR owner_id = ?", u.ID).Find(&rows)

	scored := make([]scoredSuggestion, 0)
	for _, b := range rows {
		if excluded[b.ID] {
			continue
		}
		if req.Section != "" && b.Section != req.Section {
			continue
		}
		s, reasons := scoreBlock(b, req.Level, req.Trimester, req.ModuleNum, req.Section, req.Criterion, req.TargetDifficulty, req.CurrentYear)
		scored = append(scored, scoredSuggestion{
			Block:    serializeBankBlock(b),
			FitScore: s,
			Reasons:  reasons,
		})
	}
	sort.Slice(scored, func(i, j int) bool { return scored[i].FitScore > scored[j].FitScore })
	if len(scored) > req.Limit {
		scored = scored[:req.Limit]
	}
	httpx.WriteJSON(w, http.StatusOK, scored)
}

func (h *ExamsHandler) RecordFeedback(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("block_id")
	var row db.QuestionBlock
	if err := h.DB.Where("id = ?", id).First(&row).Error; err != nil {
		httpx.WriteError(w, http.StatusNotFound, "التمرين غير موجود")
		return
	}
	var body struct {
		Action            string   `json:"action"` // accepted | skipped
		EmpiricalPassRate *float64 `json:"empirical_pass_rate"`
		SchoolYear        string   `json:"school_year"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "بيانات غير صالحة")
		return
	}
	updates := map[string]any{}
	if body.Action == "accepted" {
		updates["times_accepted"] = row.TimesAccepted + 1
		updates["times_used"] = row.TimesUsed + 1
		if body.SchoolYear != "" {
			updates["last_used_year"] = body.SchoolYear
		}
	} else if body.Action == "skipped" {
		updates["times_skipped"] = row.TimesSkipped + 1
	}
	if body.EmpiricalPassRate != nil {
		p := math.Max(0, math.Min(1, *body.EmpiricalPassRate))
		// Exponential moving average so learning smoothly adapts across classes
		if row.EmpiricalPassRate != nil {
			p = (*row.EmpiricalPassRate)*0.6 + p*0.4
		}
		updates["empirical_pass_rate"] = p
	}
	if len(updates) > 0 {
		_ = h.DB.Model(&row).Updates(updates).Error
	}
	h.DB.Where("id = ?", id).First(&row)
	httpx.WriteJSON(w, http.StatusOK, serializeBankBlock(row))
}

// ── Balanced French Exam Generator ───────────────────────────────────────────

func (h *ExamsHandler) GenerateExam(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFromContext(r.Context())
	var req struct {
		Title      string `json:"title"`
		SchoolYear string `json:"school_year"`
		Level      string `json:"level"`
		Trimester  int    `json:"trimester"`
		ModuleNum  int    `json:"module_num"`
		ExamType   string `json:"exam_type"`
	}
	_ = httpx.DecodeJSON(r, &req)
	if req.SchoolYear == "" {
		req.SchoolYear = "2025-2026"
	}
	if req.Level == "" {
		req.Level = "4ème année"
	}
	if req.Trimester < 1 || req.Trimester > 3 {
		req.Trimester = 1
	}
	if req.ExamType == "" {
		req.ExamType = "Évaluation"
	}
	if req.Title == "" {
		req.Title = fmt.Sprintf("%s de Français — %s (T%d)", req.ExamType, req.Level, req.Trimester)
	}

	var bank []db.QuestionBlock
	h.DB.Where("owner_id IS NULL OR owner_id = ?", u.ID).Find(&bank)

	pickSection := func(sec string, wantTypes []string, limit int) []db.QuestionBlock {
		type cand struct {
			b db.QuestionBlock
			s int
		}
		var list []cand
		for _, b := range bank {
			if b.Section != sec {
				continue
			}
			if len(wantTypes) > 0 {
				ok := false
				for _, wt := range wantTypes {
					if b.BlockType == wt {
						ok = true
						break
					}
				}
				if !ok {
					continue
				}
			}
			sc, _ := scoreBlock(b, req.Level, req.Trimester, req.ModuleNum, sec, "", "", req.SchoolYear)
			list = append(list, cand{b, sc})
		}
		sort.Slice(list, func(i, j int) bool { return list[i].s > list[j].s })
		var res []db.QuestionBlock
		for i := 0; i < len(list) && i < limit; i++ {
			res = append(res, list[i].b)
		}
		return res
	}

	var chosen []db.QuestionBlock
	chosen = append(chosen, pickSection("lecture", []string{"reading_text"}, 1)...)
	chosen = append(chosen, pickSection("lecture", []string{"mcq", "true_false", "open_question"}, 3)...)
	chosen = append(chosen, pickSection("langue", nil, 3)...)
	chosen = append(chosen, pickSection("production", []string{"production_ecrite"}, 1)...)

	blocks := make([]map[string]any, 0, len(chosen))
	totalPts := 0.0
	for i, b := range chosen {
		var content any
		_ = json.Unmarshal([]byte(b.ContentJSON), &content)
		blocks = append(blocks, map[string]any{
			"id":        fmt.Sprintf("gen-%d-%s", i+1, b.ID[:6]),
			"bank_id":   b.ID,
			"section":   b.Section,
			"type":      b.BlockType,
			"criterion": b.Criterion,
			"points":    b.Points,
			"topic":     b.Topic,
			"content":   content,
		})
		totalPts += b.Points
	}
	if totalPts == 0 {
		totalPts = 20
	}
	blocksBytes, _ := json.Marshal(blocks)

	paper := db.ExamPaper{
		OwnerID:     u.ID,
		Title:       req.Title,
		SchoolYear:  req.SchoolYear,
		Level:       req.Level,
		SubjectCode: "francais",
		Trimester:   req.Trimester,
		ModuleNum:   req.ModuleNum,
		ExamType:    req.ExamType,
		Direction:   "ltr",
		BlocksJSON:  string(blocksBytes),
		TotalPoints: totalPts,
		UsedCount:   1,
	}
	if err := h.DB.Create(&paper).Error; err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, serializeExam(paper, true))
}

// ── Print-Ready Illustration Search with Relevance & Print Scores (0–100%) ──

type illustrationSuggestion struct {
	ID         string   `json:"id"`
	Title      string   `json:"title"`
	URL        string   `json:"url"`
	Source     string   `json:"source"` // builtin_svg | wikimedia
	PrintScore int      `json:"print_score"`
	Reasons    []string `json:"reasons"`
}

var builtinIllustrations = []struct {
	id       string
	title    string
	url      string
	keywords []string
}{
	{
		id: "lofi-famille", title: "La famille à la maison",
		url:      "/illustrations/famille.jpg",
		keywords: []string{"famille", "parents", "maison", "enfant", "enfants", "ami", "amis", "cuisine", "solidarité", "عائلة", "أسرة"},
	},
	{
		id: "lofi-ecole", title: "La cour de l'école",
		url:      "/illustrations/ecole.jpg",
		keywords: []string{"école", "ecole", "classe", "cour", "élèves", "rentrée", "cartable", "maîtresse", "مدرسة"},
	},
	{
		id: "lofi-jardin", title: "Le jardin de l'école",
		url:      "/illustrations/jardin.jpg",
		keywords: []string{"jardin", "arbre", "fleur", "fleurs", "arroser", "nature", "environnement", "plante", "forêt", "حديقة", "شجرة"},
	},
	{
		id: "lofi-oiseau", title: "L'oiseau sur la branche",
		url:      "/illustrations/oiseau.jpg",
		keywords: []string{"oiseau", "animal", "animaux", "branche", "voler", "nature", "chat", "chien", "عصفور"},
	},
	{
		id: "lofi-lecture", title: "Coin lecture et cahiers",
		url:      "/illustrations/lecture.jpg",
		keywords: []string{"livre", "lire", "lecture", "cahier", "bibliothèque", "devoir", "étudier", "écrire", "ordinateur", "كتاب", "قراءة"},
	},
	{
		id: "lofi-sport", title: "Jeu et sport au parc",
		url:      "/illustrations/sport.jpg",
		keywords: []string{"sport", "ballon", "jouer", "jeu", "stade", "récréation", "courir", "santé", "parc", "رياضة", "كرة"},
	},
}

func (h *ExamsHandler) SearchIllustrations(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	bw := r.URL.Query().Get("bw") != "0" // default true: black & white for school photocopiers
	qLow := strings.ToLower(q)
	results := make([]illustrationSuggestion, 0)

	// 1. Studio-grade Lofi Linear / Flat Art Adouci illustrations bundled with the app
	for _, item := range builtinIllustrations {
		score := 86
		matched := false
		for _, kw := range item.keywords {
			if qLow != "" && (strings.Contains(qLow, kw) || strings.Contains(kw, qLow)) {
				score = 99
				matched = true
				break
			}
		}
		if qLow == "" || matched {
			reasons := []string{"Lofi Linear · Flat Art Adouci", "جودة طباعة عالية"}
			if matched {
				reasons = append([]string{"تطابق مباشر"}, reasons...)
			}
			results = append(results, illustrationSuggestion{
				ID:         item.id,
				Title:      item.title,
				URL:        item.url,
				Source:     "builtin_svg",
				PrintScore: score,
				Reasons:    reasons,
			})
		}
	}

	// 2. ARASAAC Educational School Pictograms (additional options for specific vocabulary)
	if q != "" {
		results = append(results, searchArasaac(q, bw)...)
	}

	sort.Slice(results, func(i, j int) bool { return results[i].PrintScore > results[j].PrintScore })
	if len(results) > 12 {
		results = results[:12]
	}
	httpx.WriteJSON(w, http.StatusOK, results)
}

// GenerateIllustration dynamically generates a studio-grade Lofi Linear / Flat Art Adouci
// French primary school illustration for ANY prompt using Gemini Image Generation (GEMINI_API_KEY).
func (h *ExamsHandler) GenerateIllustration(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Prompt string `json:"prompt"`
		BW     bool   `json:"bw"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil || strings.TrimSpace(body.Prompt) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "الرجاء كتابة وصف المشهد المطلوب")
		return
	}
	apiKey := strings.TrimSpace(os.Getenv("GEMINI_API_KEY"))
	if apiKey == "" {
		httpx.WriteError(w, http.StatusServiceUnavailable, "مفتاح GEMINI_API_KEY غير مفعّل بعد على الخادم (Vercel) — أضيفوه لتفعيل التوليد التلقائي للرسوم بأسلوب Lofi Linear.")
		return
	}

	style := "Studio-quality children's book illustration in warm French editorial lofi linear / flat art adouci style: delicate clean dark charcoal ink outlines, gentle muted pastel colors (soft teal, warm cream, sage green, blush peach), cozy minimal shading, pure clean white background (#FFFFFF), zero text or letters, 4:3 framing for a French primary school worksheet."
	if body.BW {
		style = "Studio-quality black and white ink line-art illustration in warm French editorial lofi linear textbook style: delicate clean charcoal outlines on pure white (#FFFFFF) background, no grey background, photocopy-ready coloring-book style, zero text or letters, 4:3 framing for a French primary school worksheet."
	}
	fullPrompt := style + " Scene: " + strings.TrimSpace(body.Prompt)

	payload := map[string]any{
		"contents": []map[string]any{
			{"parts": []map[string]any{{"text": fullPrompt}}},
		},
		"generationConfig": map[string]any{
			"responseModalities": []string{"IMAGE"},
		},
	}
	rawReq, _ := json.Marshal(payload)

	endpoint := "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=" + url.QueryEscape(apiKey)
	client := &http.Client{Timeout: 35 * time.Second}
	resp, err := client.Post(endpoint, "application/json", bytes.NewReader(rawReq))
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "تعذّر الاتصال بخدمة توليد الصور")
		return
	}
	defer resp.Body.Close()

	var gemResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					InlineData *struct {
						MimeType string `json:"mimeType"`
						Data     string `json:"data"`
					} `json:"inlineData"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&gemResp); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "استجابة غير صالحة من خدمة الصور")
		return
	}
	if gemResp.Error != nil {
		httpx.WriteError(w, http.StatusBadGateway, gemResp.Error.Message)
		return
	}
	for _, cand := range gemResp.Candidates {
		for _, part := range cand.Content.Parts {
			if part.InlineData != nil && part.InlineData.Data != "" {
				mt := part.InlineData.MimeType
				if mt == "" {
					mt = "image/png"
				}
				dataURI := fmt.Sprintf("data:%s;base64,%s", mt, part.InlineData.Data)
				httpx.WriteJSON(w, http.StatusOK, illustrationSuggestion{
					ID:         fmt.Sprintf("gen-%d", time.Now().UnixNano()),
					Title:      strings.TrimSpace(body.Prompt),
					URL:        dataURI,
					Source:     "lofi_ai",
					PrintScore: 99,
					Reasons:    []string{"Lofi Linear · Flat Art Adouci", "مولّد تلقائياً للمشهد"},
				})
				return
			}
		}
	}
	httpx.WriteError(w, http.StatusBadGateway, "لم يتم إرجاع صورة من النموذج")
}

func searchArasaac(query string, bw bool) []illustrationSuggestion {
	client := &http.Client{Timeout: 4 * time.Second}
	endpoint := "https://api.arasaac.org/v1/pictograms/fr/search/" + url.PathEscape(query)
	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "ExamManagerPrimarySchool/1.0")
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != 200 {
		return nil
	}
	defer resp.Body.Close()

	var items []struct {
		ID       int  `json:"_id"`
		Schematic bool `json:"schematic"`
		Violence  bool `json:"violence"`
		Sex       bool `json:"sex"`
		Keywords []struct {
			Keyword string `json:"keyword"`
		} `json:"keywords"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&items); err != nil {
		return nil
	}

	qLow := strings.ToLower(strings.TrimSpace(query))
	out := make([]illustrationSuggestion, 0, len(items))
	for _, it := range items {
		if it.Violence || it.Sex || it.ID <= 0 {
			continue
		}
		label := query
		exact := false
		for _, kw := range it.Keywords {
			if kw.Keyword != "" && label == query {
				label = kw.Keyword
			}
			if strings.EqualFold(strings.TrimSpace(kw.Keyword), qLow) {
				exact = true
				label = kw.Keyword
				break
			}
		}
		score := 84
		reasons := []string{"رسم مدرسي تعليمي (ARASAAC)"}
		if exact {
			score += 11
			reasons = append(reasons, "تطابق تام بالفرنسية")
		}
		if bw {
			score += 3
			reasons = append(reasons, "أبيض وأسود للطباعة")
		}
		if score > 99 {
			score = 99
		}
		imgURL := fmt.Sprintf("https://static.arasaac.org/pictograms/%d/%d_300.png", it.ID, it.ID)
		if bw {
			imgURL = fmt.Sprintf("https://api.arasaac.org/v1/pictograms/%d?download=false&color=false", it.ID)
		}
		out = append(out, illustrationSuggestion{
			ID:         fmt.Sprintf("arasaac-%d", it.ID),
			Title:      label,
			URL:        imgURL,
			Source:     "arasaac",
			PrintScore: score,
			Reasons:    reasons,
		})
		if len(out) >= 10 {
			break
		}
	}
	return out
}
