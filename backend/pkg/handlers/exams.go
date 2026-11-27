package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
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
	keywords []string
	svg      string
}{
	{
		id: "lofi-famille", title: "La famille heureuse (Lofi Flat Art)",
		keywords: []string{"famille", "parents", "maison", "enfant", "enfants", "ami", "amis", "عائلة", "أسرة"},
		svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#FFFDF9"/><ellipse cx="160" cy="176" rx="126" ry="12" fill="#EFECE4"/><rect x="42" y="34" width="236" height="136" rx="22" fill="#F4F8F9"/><circle cx="252" cy="58" r="18" fill="#FEF3C7"/><path d="M58 170V122C58 104 72 94 92 94C112 94 126 104 126 122V170Z" fill="#B9DDE3" stroke="#1C252C" stroke-width="2" stroke-linejoin="round"/><circle cx="92" cy="70" r="18" fill="#FDE6D2" stroke="#1C252C" stroke-width="2"/><path d="M74 68C76 54 108 54 110 68" fill="#334155" stroke="#1C252C" stroke-width="2"/><path d="M86 73Q92 78 98 73" fill="none" stroke="#1C252C" stroke-width="1.8" stroke-linecap="round"/><path d="M194 170V120C194 102 208 92 228 92C248 92 262 102 262 120V170Z" fill="#FBCFE8" stroke="#1C252C" stroke-width="2" stroke-linejoin="round"/><circle cx="228" cy="68" r="18" fill="#FDE6D2" stroke="#1C252C" stroke-width="2"/><path d="M208 72C208 50 248 50 248 74C244 60 212 60 208 72Z" fill="#475569" stroke="#1C252C" stroke-width="2"/><path d="M222 72Q228 77 234 72" fill="none" stroke="#1C252C" stroke-width="1.8" stroke-linecap="round"/><path d="M126 170V136C126 123 136 116 149 116C162 116 172 123 172 136V170Z" fill="#FDE68A" stroke="#1C252C" stroke-width="2" stroke-linejoin="round"/><circle cx="149" cy="98" r="14" fill="#FDE6D2" stroke="#1C252C" stroke-width="2"/><path d="M144 101Q149 105 154 101" fill="none" stroke="#1C252C" stroke-width="1.6" stroke-linecap="round"/><path d="M168 170V140C168 129 177 122 188 122C199 122 208 129 208 140V170Z" fill="#A7F3D0" stroke="#1C252C" stroke-width="2" stroke-linejoin="round"/><circle cx="188" cy="106" r="12" fill="#FDE6D2" stroke="#1C252C" stroke-width="2"/><path d="M184 109Q188 112 192 109" fill="none" stroke="#1C252C" stroke-width="1.6" stroke-linecap="round"/></svg>`,
	},
	{
		id: "lofi-ecole", title: "L'école primaire ensoleillée (Lofi)",
		keywords: []string{"école", "ecole", "classe", "cour", "élèves", "rentrée", "مدرسة"},
		svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#FFFDF9"/><circle cx="268" cy="44" r="20" fill="#FDE68A"/><ellipse cx="160" cy="176" rx="138" ry="12" fill="#E7EFE9"/><rect x="68" y="76" width="184" height="96" rx="10" fill="#F8FAFC" stroke="#1C252C" stroke-width="2"/><polygon points="56,78 160,30 264,78" fill="#B9DDE3" stroke="#1C252C" stroke-width="2" stroke-linejoin="round"/><path d="M142 172V124C142 114 150 108 160 108C170 108 178 114 178 124V172Z" fill="#FCD34D" stroke="#1C252C" stroke-width="2"/><rect x="86" y="102" width="34" height="30" rx="5" fill="#E0F2FE" stroke="#1C252C" stroke-width="1.8"/><rect x="200" y="102" width="34" height="30" rx="5" fill="#E0F2FE" stroke="#1C252C" stroke-width="1.8"/><circle cx="160" cy="64" r="11" fill="#FFF" stroke="#1C252C" stroke-width="1.8"/><path d="M160 58V64L165 67" fill="none" stroke="#1C252C" stroke-width="1.8" stroke-linecap="round"/><path d="M40 172V126" stroke="#78350F" stroke-width="3" stroke-linecap="round"/><circle cx="40" cy="112" r="20" fill="#A7F3D0" stroke="#1C252C" stroke-width="1.8"/><path d="M280 172V132" stroke="#78350F" stroke-width="3" stroke-linecap="round"/><circle cx="280" cy="118" r="18" fill="#BBF7D0" stroke="#1C252C" stroke-width="1.8"/></svg>`,
	},
	{
		id: "lofi-jardin", title: "Le jardin fleuri et l'arbre (Lofi)",
		keywords: []string{"jardin", "arbre", "fleur", "fleurs", "arroser", "nature", "environnement", "plante", "حديقة", "شجرة"},
		svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#FFFDF9"/><circle cx="256" cy="46" r="22" fill="#FEF08A"/><path d="M18 168Q160 144 302 168L302 190L18 190Z" fill="#DCFCE7"/><path d="M96 164V100" stroke="#78350F" stroke-width="6" stroke-linecap="round"/><circle cx="96" cy="76" r="34" fill="#86EFAC" stroke="#1C252C" stroke-width="2"/><circle cx="72" cy="86" r="20" fill="#A7F3D0" stroke="#1C252C" stroke-width="2"/><circle cx="122" cy="88" r="20" fill="#A7F3D0" stroke="#1C252C" stroke-width="2"/><path d="M188 164V128M226 164V134M260 164V130" stroke="#15803D" stroke-width="2.2" stroke-linecap="round"/><circle cx="188" cy="122" r="10" fill="#FBCFE8" stroke="#1C252C" stroke-width="1.8"/><circle cx="188" cy="122" r="4" fill="#FDE047"/><circle cx="226" cy="128" r="9" fill="#FDE68A" stroke="#1C252C" stroke-width="1.8"/><circle cx="260" cy="124" r="10" fill="#DDD6FE" stroke="#1C252C" stroke-width="1.8"/><rect x="138" y="138" width="28" height="22" rx="6" fill="#93C5FD" stroke="#1C252C" stroke-width="1.8"/><path d="M166 146L180 138M138 144C128 144 128 156 138 156" fill="none" stroke="#1C252C" stroke-width="1.8" stroke-linecap="round"/></svg>`,
	},
	{
		id: "lofi-oiseau", title: "Petit oiseau sur une branche (Lofi)",
		keywords: []string{"oiseau", "animal", "animaux", "branche", "voler", "nature", "عصفور"},
		svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#FFFDF9"/><circle cx="160" cy="100" r="74" fill="#F0F9FF"/><path d="M32 146Q158 122 288 138" fill="none" stroke="#78350F" stroke-width="5" stroke-linecap="round"/><ellipse cx="78" cy="132" rx="14" ry="7" transform="rotate(-24 78 132)" fill="#A7F3D0" stroke="#1C252C" stroke-width="1.8"/><ellipse cx="238" cy="124" rx="14" ry="7" transform="rotate(20 238 124)" fill="#A7F3D0" stroke="#1C252C" stroke-width="1.8"/><path d="M116 112C116 78 154 66 182 78C196 84 206 72 216 80C224 87 218 98 208 102L228 106L208 114C198 132 166 136 138 128L106 138L116 120Z" fill="#BAE6FD" stroke="#1C252C" stroke-width="2" stroke-linejoin="round"/><path d="M138 98C152 90 174 92 184 106C166 112 148 110 138 98Z" fill="#7DD3FC" stroke="#1C252C" stroke-width="1.8"/><circle cx="198" cy="88" r="3" fill="#1C252C"/><path d="M154 130V140M170 130V140" stroke="#1C252C" stroke-width="2" stroke-linecap="round"/></svg>`,
	},
	{
		id: "lofi-lecture", title: "Coin lecture et cahiers (Lofi)",
		keywords: []string{"livre", "lire", "lecture", "cahier", "bibliothèque", "devoir", "étudier", "كتاب", "قراءة"},
		svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#FFFDF9"/><rect x="40" y="148" width="240" height="14" rx="7" fill="#E7E5DF"/><path d="M72 62H148C155 62 160 67 160 74V146C160 140 154 136 146 136H72Z" fill="#E0F2FE" stroke="#1C252C" stroke-width="2" stroke-linejoin="round"/><path d="M248 62H172C165 62 160 67 160 74V146C160 140 166 136 174 136H248Z" fill="#FEF3C7" stroke="#1C252C" stroke-width="2" stroke-linejoin="round"/><path d="M90 84H138M90 98H134M90 112H128M182 84H230M182 98H226M182 112H220" stroke="#475569" stroke-width="2" stroke-linecap="round"/><rect x="256" y="102" width="24" height="46" rx="6" fill="#FBCFE8" stroke="#1C252C" stroke-width="1.8"/><path d="M264 102L260 76M272 102L276 80" stroke="#0F4C5C" stroke-width="3" stroke-linecap="round"/></svg>`,
	},
	{
		id: "lofi-sante", title: "Santé et repas équilibré (Lofi)",
		keywords: []string{"santé", "sante", "pomme", "fruits", "légumes", "hygiène", "médecin", "repas", "صحة"},
		svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#FFFDF9"/><ellipse cx="160" cy="170" rx="120" ry="12" fill="#EFECE4"/><path d="M84 114H206C206 146 182 164 145 164C108 164 84 146 84 114Z" fill="#B9DDE3" stroke="#1C252C" stroke-width="2"/><circle cx="122" cy="100" r="22" fill="#FDA4AF" stroke="#1C252C" stroke-width="2"/><path d="M122 78C124 68 132 64 138 66" fill="none" stroke="#15803D" stroke-width="2.2" stroke-linecap="round"/><circle cx="168" cy="96" r="20" fill="#FDE047" stroke="#1C252C" stroke-width="2"/><rect x="224" y="88" width="38" height="74" rx="8" fill="#E0F2FE" stroke="#1C252C" stroke-width="2"/><rect x="226" y="114" width="34" height="46" rx="5" fill="#7DD3FC"/></svg>`,
	},
	{
		id: "lofi-sport", title: "Jeu et sport dans le parc (Lofi)",
		keywords: []string{"sport", "ballon", "jouer", "jeu", "stade", "récréation", "courir", "رياضة", "كرة"},
		svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#FFFDF9"/><path d="M18 162Q160 144 302 162L302 188L18 188Z" fill="#DCFCE7"/><circle cx="160" cy="102" r="46" fill="#FFFFFF" stroke="#1C252C" stroke-width="2.2"/><polygon points="160,78 180,92 172,116 148,116 140,92" fill="#0F4C5C" stroke="#1C252C" stroke-width="1.8"/><path d="M160 56V78M203 88L180 92M190 138L172 116M130 138L148 116M117 88L140 92" stroke="#1C252C" stroke-width="2"/></svg>`,
	},
	{
		id: "lofi-ordinateur", title: "Bureau et ordinateur Lofi",
		keywords: []string{"ordinateur", "médias", "travail", "science", "écrire", "journal", "حاسوب"},
		svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#FFFDF9"/><rect x="34" y="154" width="252" height="14" rx="7" fill="#E7E5DF"/><rect x="92" y="60" width="136" height="86" rx="10" fill="#E0F2FE" stroke="#1C252C" stroke-width="2"/><rect x="104" y="72" width="112" height="62" rx="5" fill="#FFFFFF" stroke="#1C252C" stroke-width="1.5"/><path d="M74 146H246L238 154H82Z" fill="#CBD5E1" stroke="#1C252C" stroke-width="2" stroke-linejoin="round"/><path d="M118 90H176M118 104H198M118 118H162" stroke="#0F4C5C" stroke-width="2.2" stroke-linecap="round"/><circle cx="256" cy="52" r="16" fill="#FEF08A" stroke="#1C252C" stroke-width="1.8"/><path d="M256 68V154" stroke="#1C252C" stroke-width="2.2"/></svg>`,
	},
	{
		id: "lofi-plage", title: "Vacances et mer calme (Lofi)",
		keywords: []string{"plage", "vacances", "mer", "soleil", "voyage", "été", "فصل الصيف", "بحر"},
		svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#FFFDF9"/><circle cx="246" cy="50" r="24" fill="#FDE047"/><path d="M16 130Q96 116 176 130T304 130L304 164L16 164Z" fill="#BAE6FD"/><path d="M16 154Q160 142 304 158L304 190L16 190Z" fill="#FEF3C7"/><path d="M98 158V86" stroke="#78350F" stroke-width="3" stroke-linecap="round"/><path d="M52 94C64 66 132 66 144 94Z" fill="#FDA4AF" stroke="#1C252C" stroke-width="2" stroke-linejoin="round"/><path d="M206 122L236 82L252 122Z" fill="#FFFFFF" stroke="#1C252C" stroke-width="1.8" stroke-linejoin="round"/><path d="M196 124H262L252 134H206Z" fill="#0F4C5C" stroke="#1C252C" stroke-width="1.8"/></svg>`,
	},
	{
		id: "lofi-animaux", title: "Le chat et le chien amis (Lofi)",
		keywords: []string{"chat", "chien", "animal", "animaux", "ami", "قط", "حيوانات"},
		svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#FFFDF9"/><ellipse cx="160" cy="170" rx="116" ry="12" fill="#EFECE4"/><path d="M84 166V116C84 102 96 92 112 92C128 92 140 102 140 116V166Z" fill="#FED7AA" stroke="#1C252C" stroke-width="2"/><polygon points="88,98 84,74 104,88" fill="#FED7AA" stroke="#1C252C" stroke-width="2" stroke-linejoin="round"/><polygon points="136,98 140,74 120,88" fill="#FED7AA" stroke="#1C252C" stroke-width="2" stroke-linejoin="round"/><circle cx="104" cy="112" r="2.5" fill="#1C252C"/><circle cx="120" cy="112" r="2.5" fill="#1C252C"/><path d="M108 120Q112 124 116 120" fill="none" stroke="#1C252C" stroke-width="1.8" stroke-linecap="round"/><path d="M178 166V112C178 96 192 86 210 86C228 86 242 96 242 112V166Z" fill="#DDD6FE" stroke="#1C252C" stroke-width="2"/><ellipse cx="178" cy="108" rx="10" ry="20" fill="#C4B5FD" stroke="#1C252C" stroke-width="2"/><ellipse cx="242" cy="108" rx="10" ry="20" fill="#C4B5FD" stroke="#1C252C" stroke-width="2"/><circle cx="201" cy="110" r="2.5" fill="#1C252C"/><circle cx="219" cy="110" r="2.5" fill="#1C252C"/><ellipse cx="210" cy="118" rx="5" ry="3.5" fill="#1C252C"/></svg>`,
	},
}

func (h *ExamsHandler) SearchIllustrations(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	bw := r.URL.Query().Get("bw") != "0" // default true: black & white for school photocopiers
	qLow := strings.ToLower(q)
	results := make([]illustrationSuggestion, 0)

	// 1. Curated Lofi Linear / Flat Art Adouci SVG scenes (always ranked top when matched!)
	for _, item := range builtinIllustrations {
		score := 80
		matched := false
		for _, kw := range item.keywords {
			if qLow != "" && (strings.Contains(qLow, kw) || strings.Contains(kw, qLow)) {
				score = 99
				matched = true
				break
			}
		}
		if qLow == "" || matched {
			dataURI := "data:image/svg+xml;utf8," + url.PathEscape(item.svg)
			reasons := []string{"Lofi Flat Art Adouci", "رسم متجهي نقي"}
			if matched {
				reasons = append([]string{"تطابق مباشر"}, reasons...)
			}
			results = append(results, illustrationSuggestion{
				ID:         item.id,
				Title:      item.title,
				URL:        dataURI,
				Source:     "builtin_svg",
				PrintScore: score,
				Reasons:    reasons,
			})
		}
	}

	// 2. Custom Lofi Linear / Flat Art Adouci AI Illustration card for ANY French scene
	if q != "" {
		styleSuffix := "soft lofi linear illustration, flat art adouci, French children book editorial style, thin clean ink outlines, gentle muted pastel palette, pure white background, minimal school worksheet drawing, no text, no letters"
		if bw {
			styleSuffix = "clean minimalist lofi linear black and white ink drawing, French primary school textbook coloring-book line art, soft clean outlines, pure white background, no shading, no text, no letters"
		}
		aiURL := "https://image.pollinations.ai/prompt/" + url.PathEscape(q+", "+styleSuffix) + "?width=640&height=420&nologo=true&seed=42"
		results = append(results, illustrationSuggestion{
			ID:         "lofi-ai-" + url.PathEscape(qLow),
			Title:      fmt.Sprintf("Lofi Art : %s", q),
			URL:        aiURL,
			Source:     "lofi_ai",
			PrintScore: 96,
			Reasons:    []string{"Lofi Linear / Flat Art Adouci", "مولّد خصيصاً للسؤال"},
		})
	}

	// 3. ARASAAC Educational School Pictograms (additional options)
	if q != "" {
		results = append(results, searchArasaac(q, bw)...)
	}

	sort.Slice(results, func(i, j int) bool { return results[i].PrintScore > results[j].PrintScore })
	if len(results) > 12 {
		results = results[:12]
	}
	httpx.WriteJSON(w, http.StatusOK, results)
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
