package db

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"gorm.io/gorm"
)

type subjectSeed struct {
	Code   string
	NameAr string
	NameFr *string
}

func strPtr(s string) *string    { return &s }
func f64Ptr(f float64) *float64  { return &f }

var defaultSubjects = []subjectSeed{
	{"arabe", "اللغة العربية", nil},
	{"math", "الرياضيات", nil},
	{"eveil", "الإيقاظ العلمي", nil},
	{"francais", "اللغة الفرنسية", strPtr("Français")},
	{"anglais", "اللغة الإنجليزية", strPtr("Anglais")},
	{"islamique", "التربية الإسلامية", nil},
	{"civique", "التربية المدنية", nil},
	{"histoire", "التاريخ", nil},
	{"geographie", "الجغرافيا", nil},
	{"arts", "التربية التشكيلية", nil},
	{"musique", "التربية الموسيقية", nil},
	{"sport", "التربية البدنية", nil},
}

type critSeed struct {
	Code     string
	Label    string
	MaxScore *float64
}

type secSeed struct {
	Code       string
	GroupKey   string
	GroupLabel string
	Label      string
	HasBonus   bool
	AllowST    bool
	ColorKey   string
	Criteria   []critSeed
}

type tplSeed struct {
	Code         string
	SubjectCode  string
	Name         string
	FinalFormula string
	FinalCap     *float64
	Direction    string
	Sections     []secSeed
}

var frenchTemplateSeed = tplSeed{
	Code:         "francais_exam_v1",
	SubjectCode:  "francais",
	Name:         "Français — شبكة التقييم (3 مجالات)",
	FinalFormula: "avg_groups",
	Direction:    "ltr",
	Sections: []secSeed{
		{
			Code: "prod_dictee", GroupKey: "prod", GroupLabel: "Prod. écrite et écriture",
			Label: "Dictée", HasBonus: false, AllowST: false, ColorKey: "blue",
			Criteria: []critSeed{{Code: "prod_dictee_c4", Label: "C4"}},
		},
		{
			Code: "prod_ecriture", GroupKey: "prod", GroupLabel: "Prod. écrite et écriture",
			Label: "Écriture", HasBonus: true, AllowST: true, ColorKey: "blue",
			Criteria: []critSeed{{Code: "prod_ecriture_c2", Label: "C2"}, {Code: "prod_ecriture_c7", Label: "C7"}},
		},
		{
			Code: "prod_production", GroupKey: "prod", GroupLabel: "Prod. écrite et écriture",
			Label: "Prod. écrite", HasBonus: true, AllowST: true, ColorKey: "blue",
			Criteria: []critSeed{
				{Code: "prod_production_c1", Label: "C1"},
				{Code: "prod_production_c3", Label: "C3"},
				{Code: "prod_production_c5", Label: "C5"},
				{Code: "prod_production_c6", Label: "C6"},
			},
		},
		{
			Code: "lect_vocale", GroupKey: "lecture", GroupLabel: "Lecture",
			Label: "Vocale", HasBonus: true, AllowST: true, ColorKey: "green",
			Criteria: []critSeed{{Code: "lect_vocale_c1", Label: "C1"}, {Code: "lect_vocale_c5", Label: "C5"}},
		},
		{
			Code: "lect_comp", GroupKey: "lecture", GroupLabel: "Lecture",
			Label: "Compréhension", HasBonus: true, AllowST: true, ColorKey: "green",
			Criteria: []critSeed{
				{Code: "lect_comp_c2", Label: "C2"},
				{Code: "lect_comp_c3", Label: "C3"},
				{Code: "lect_comp_c4", Label: "C4"},
				{Code: "lect_comp_c6", Label: "C6"},
			},
		},
		{
			Code: "com_rec", GroupKey: "com", GroupLabel: "Com. Orale et Récitation",
			Label: "Récitation", HasBonus: true, AllowST: true, ColorKey: "orange",
			Criteria: []critSeed{
				{Code: "com_rec_c1", Label: "C1"},
				{Code: "com_rec_c2", Label: "C2"},
				{Code: "com_rec_c3", Label: "C3"},
				{Code: "com_rec_c4", Label: "C4"},
			},
		},
		{
			Code: "com_oral", GroupKey: "com", GroupLabel: "Com. Orale et Récitation",
			Label: "Com. Orale", HasBonus: true, AllowST: true, ColorKey: "orange",
			Criteria: []critSeed{
				{Code: "com_oral_c1", Label: "C1"},
				{Code: "com_oral_c2", Label: "C2"},
				{Code: "com_oral_c3", Label: "C3"},
				{Code: "com_oral_c4", Label: "C4"},
				{Code: "com_oral_c5", Label: "C5"},
				{Code: "com_oral_c6", Label: "C6"},
			},
		},
	},
}

// Migrate runs GORM AutoMigrate per model (so an existing SQLAlchemy table
// never blocks creating newer tables like timetable_slots) and runs idempotent
// one-shot data seeds.
func Migrate(conn *gorm.DB) error {
	models := []any{
		&SchemaMigration{},
		&User{},
		&SchoolSettings{},
		&Subject{},
		&GridTemplate{},
		&GridSection{},
		&GridCriterion{},
		&SchoolYear{},
		&Class{},
		&Student{},
		&TeacherAssignment{},
		&ExamSession{},
		&ScoreEntry{},
		&CalendarEvent{},
		&TimetableSlot{},
		&OfficialDocument{},
		&Room{},
		&LevelCurriculum{},
		&ExamPaper{},
		&QuestionBlock{},
		&SavedIllustration{},
		&ExamGrading{},
	}
	for _, m := range models {
		if err := conn.AutoMigrate(m); err != nil {
			log.Printf("[startup] AutoMigrate %T warning: %v", m, err)
		}
	}

	// Guarantee newer tables exist even if GORM AutoMigrate hit a legacy association warning on Postgres
	ensureModernTables(conn)

	isPG := conn.Dialector.Name() == "postgres"
	if isPG {
		_ = conn.Exec("SELECT pg_advisory_lock(817223344)").Error
		defer func() { _ = conn.Exec("SELECT pg_advisory_unlock(817223344)").Error }()
	}

	seeds := []struct {
		key string
		fn  func(*gorm.DB) error
	}{
		{"seed_subjects_v1", seedSubjects},
		{"seed_template_francais_v1", seedFrenchTemplate},
		{"seed_school_settings_v1", seedSchoolSettings},
		{"seed_templates_all_v1", seedAllSubjectTemplates},
		{"seed_rooms_and_curriculum_v1", seedRoomsAndCurriculum},
		{"seed_french_question_bank_v1", EnsureFrenchQuestionBank},
		{"seed_french_question_bank_v2", EnsureFrenchQuestionBank},
		{"seed_french_question_bank_v3", EnsureFrenchQuestionBank},
	}
	for _, s := range seeds {
		if err := once(conn, s.key, s.fn); err != nil {
			log.Printf("[startup] seed %s warning: %v", s.key, err)
		}
	}
	return nil
}

func once(conn *gorm.DB, key string, fn func(*gorm.DB) error) error {
	var existing SchemaMigration
	if err := conn.Where("key = ?", key).First(&existing).Error; err == nil {
		return nil
	}
	return conn.Transaction(func(tx *gorm.DB) error {
		if err := fn(tx); err != nil {
			return err
		}
		return tx.Create(&SchemaMigration{Key: key, AppliedAt: time.Now().UTC()}).Error
	})
}

func seedSubjects(tx *gorm.DB) error {
	for i, s := range defaultSubjects {
		var existing Subject
		if err := tx.Where("code = ?", s.Code).First(&existing).Error; err == nil {
			continue
		}
		if err := tx.Create(&Subject{
			Code:       s.Code,
			NameAr:     s.NameAr,
			NameFr:     s.NameFr,
			OrderIndex: i,
			IsActive:   true,
		}).Error; err != nil {
			return err
		}
	}
	return nil
}

func seedTemplate(tx *gorm.DB, spec tplSeed) error {
	var subj Subject
	if err := tx.Where("code = ?", spec.SubjectCode).First(&subj).Error; err != nil {
		return err
	}
	code := spec.Code
	tpl := GridTemplate{
		Code:         &code,
		SubjectID:    subj.ID,
		Name:         spec.Name,
		FinalFormula: spec.FinalFormula,
		FinalCap:     spec.FinalCap,
		IsBuiltin:    true,
		IsActive:     true,
		Direction:    spec.Direction,
	}
	if err := tx.Create(&tpl).Error; err != nil {
		return err
	}
	for si, s := range spec.Sections {
		secCode := s.Code
		colorKey := s.ColorKey
		sec := GridSection{
			TemplateID:      tpl.ID,
			Code:            &secCode,
			GroupKey:        s.GroupKey,
			GroupLabel:      s.GroupLabel,
			Label:           s.Label,
			OrderIndex:      si,
			HasBonus:        s.HasBonus,
			AllowSTOverride: s.AllowST,
			ColorKey:        &colorKey,
		}
		if err := tx.Create(&sec).Error; err != nil {
			return err
		}
		for ci, c := range s.Criteria {
			critCode := c.Code
			crit := GridCriterion{
				SectionID:  sec.ID,
				Code:       &critCode,
				Label:      c.Label,
				MaxScore:   c.MaxScore,
				OrderIndex: ci,
			}
			if err := tx.Create(&crit).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func seedFrenchTemplate(tx *gorm.DB) error {
	var existing GridTemplate
	if err := tx.Where("code = ?", frenchTemplateSeed.Code).First(&existing).Error; err == nil {
		return nil
	}
	return seedTemplate(tx, frenchTemplateSeed)
}

func seedSchoolSettings(tx *gorm.DB) error {
	var existing SchoolSettings
	if err := tx.Where("id = ?", 1).First(&existing).Error; err == nil {
		return nil
	}
	return tx.Create(&SchoolSettings{ID: 1}).Error
}

func seedAllSubjectTemplates(tx *gorm.DB) error {
	var subjects []Subject
	if err := tx.Where("is_active = ?", true).Find(&subjects).Error; err != nil {
		return err
	}
	colorCycle := []string{"teal", "purple", "rose", "green", "orange", "blue"}
	for _, subj := range subjects {
		var count int64
		tx.Model(&GridTemplate{}).Where("subject_id = ?", subj.ID).Count(&count)
		if count > 0 {
			continue
		}
		ltr := subj.Code == "anglais"
		labels := []string{"مع1", "مع2", "مع3", "مع4"}
		dir := "rtl"
		groupLabel := subj.NameAr
		secLabel := "معايير التقييم"
		if ltr {
			labels = []string{"C1", "C2", "C3", "C4"}
			dir = "ltr"
			if subj.NameFr != nil && *subj.NameFr != "" {
				groupLabel = *subj.NameFr
			}
			secLabel = "Critères"
		}
		var criteria []critSeed
		for i, lbl := range labels {
			criteria = append(criteria, critSeed{
				Code:     fmt.Sprintf("%s_m%d", subj.Code, i+1),
				Label:    lbl,
				MaxScore: f64Ptr(5.0),
			})
		}
		spec := tplSeed{
			Code:         subj.Code + "_generic_v1",
			SubjectCode:  subj.Code,
			Name:         subj.NameAr + " — شبكة المعايير",
			FinalFormula: "sum_sections",
			Direction:    dir,
			Sections: []secSeed{{
				Code:       subj.Code + "_main",
				GroupKey:   "main",
				GroupLabel: groupLabel,
				Label:      secLabel,
				HasBonus:   true,
				AllowST:    true,
				ColorKey:   colorCycle[subj.OrderIndex%len(colorCycle)],
				Criteria:   criteria,
			}},
		}
		if err := seedTemplate(tx, spec); err != nil {
			return err
		}
	}
	return nil
}

func seedRoomsAndCurriculum(tx *gorm.DB) error {
	// Seed starter rooms if none exist
	var roomCount int64
	tx.Model(&Room{}).Count(&roomCount)
	if roomCount == 0 {
		starterRooms := []Room{
			{Name: "قاعة 1", RoomType: "standard", IsActive: true},
			{Name: "قاعة 2", RoomType: "standard", IsActive: true},
			{Name: "قاعة 3", RoomType: "standard", IsActive: true},
			{Name: "قاعة 4", RoomType: "standard", IsActive: true},
			{Name: "قاعة 5", RoomType: "standard", IsActive: true},
			{Name: "قاعة 6", RoomType: "standard", IsActive: true},
			{Name: "الساحة الرياضية", RoomType: "yard", IsActive: true},
		}
		for i := range starterRooms {
			_ = tx.Create(&starterRooms[i]).Error
		}
	}

	// Seed default Tunisian primary school weekly hours per (level, subject)
	var subjects []Subject
	if err := tx.Find(&subjects).Error; err != nil {
		return err
	}
	subjByCode := map[string]string{}
	for _, s := range subjects {
		subjByCode[s.Code] = s.ID
	}

	type curSeed struct {
		code   string
		hours  float64
		block  float64
		weight string
		room   string
	}
	byLevel := map[string][]curSeed{
		"السنة الأولى": {
			{"arabe", 8, 2, "heavy", "standard"},
			{"math", 5, 1, "heavy", "standard"},
			{"eveil", 2, 1, "heavy", "standard"},
			{"islamique", 2, 1, "light", "standard"},
			{"arts", 1, 1, "light", "standard"},
			{"musique", 1, 1, "light", "standard"},
			{"sport", 1, 1, "light", "yard"},
		},
		"السنة الثانية": {
			{"arabe", 8, 2, "heavy", "standard"},
			{"math", 5, 1, "heavy", "standard"},
			{"eveil", 2, 1, "heavy", "standard"},
			{"islamique", 2, 1, "light", "standard"},
			{"arts", 1, 1, "light", "standard"},
			{"musique", 1, 1, "light", "standard"},
			{"sport", 1, 1, "light", "yard"},
		},
		"السنة الثالثة": {
			{"arabe", 6, 2, "heavy", "standard"},
			{"math", 5, 1, "heavy", "standard"},
			{"francais", 5, 2, "heavy", "standard"},
			{"eveil", 2, 1, "heavy", "standard"},
			{"islamique", 2, 1, "light", "standard"},
			{"arts", 1, 1, "light", "standard"},
			{"musique", 1, 1, "light", "standard"},
			{"sport", 1, 1, "light", "yard"},
		},
		"السنة الرابعة": {
			{"arabe", 6, 2, "heavy", "standard"},
			{"math", 5, 1, "heavy", "standard"},
			{"francais", 5, 2, "heavy", "standard"},
			{"anglais", 2, 1, "heavy", "standard"},
			{"eveil", 2, 1, "heavy", "standard"},
			{"islamique", 1, 1, "light", "standard"},
			{"civique", 1, 1, "light", "standard"},
			{"sport", 1, 1, "light", "yard"},
		},
		"السنة الخامسة": {
			{"arabe", 5, 2, "heavy", "standard"},
			{"math", 5, 1, "heavy", "standard"},
			{"francais", 5, 2, "heavy", "standard"},
			{"anglais", 2, 1, "heavy", "standard"},
			{"eveil", 2, 1, "heavy", "standard"},
			{"histoire", 1, 1, "light", "standard"},
			{"geographie", 1, 1, "light", "standard"},
			{"islamique", 1, 1, "light", "standard"},
			{"civique", 1, 1, "light", "standard"},
			{"sport", 1, 1, "light", "yard"},
		},
		"السنة السادسة": {
			{"arabe", 5, 2, "heavy", "standard"},
			{"math", 5, 1, "heavy", "standard"},
			{"francais", 5, 2, "heavy", "standard"},
			{"anglais", 2, 1, "heavy", "standard"},
			{"eveil", 2, 1, "heavy", "standard"},
			{"histoire", 1, 1, "light", "standard"},
			{"geographie", 1, 1, "light", "standard"},
			{"islamique", 1, 1, "light", "standard"},
			{"civique", 1, 1, "light", "standard"},
			{"sport", 1, 1, "light", "yard"},
		},
	}

	for level, items := range byLevel {
		for _, it := range items {
			sid, ok := subjByCode[it.code]
			if !ok {
				continue
			}
			var existing LevelCurriculum
			if err := tx.Where("level = ? AND subject_id = ?", level, sid).First(&existing).Error; err == nil {
				continue
			}
			_ = tx.Create(&LevelCurriculum{
				Level:           level,
				SubjectID:       sid,
				WeeklyHours:     it.hours,
				BlockSize:       it.block,
				CognitiveWeight: it.weight,
				RoomType:        it.room,
			}).Error
		}
	}
	return nil
}

// BootstrapAdmin creates the initial admin user if no users exist, or resets
// password if ADMIN_FORCE_RESET=1.
func BootstrapAdmin(conn *gorm.DB, hashFn func(string) (string, error)) error {
	username := strings.ToLower(strings.TrimSpace(os.Getenv("ADMIN_USERNAME")))
	if username == "" {
		username = "admin"
	}
	password := os.Getenv("ADMIN_PASSWORD")
	if password == "" {
		password = "admin123"
	}
	forceReset := os.Getenv("ADMIN_FORCE_RESET") == "1"

	var admin User
	if err := conn.Where("username = ?", username).First(&admin).Error; err == nil {
		if forceReset {
			h, err := hashFn(password)
			if err != nil {
				return err
			}
			admin.PasswordHash = h
			admin.MustChangePassword = true
			return conn.Save(&admin).Error
		}
		return nil
	}

	var total int64
	conn.Model(&User{}).Count(&total)
	if total > 0 {
		return nil
	}

	h, err := hashFn(password)
	if err != nil {
		return err
	}
	return conn.Create(&User{
		Username:           username,
		PasswordHash:       h,
		Role:               "admin",
		IsActive:           true,
		MustChangePassword: true,
	}).Error
}

func seedFrenchQuestionBank(tx *gorm.DB) error {
	return EnsureFrenchQuestionBank(tx)
}

func ensureModernTables(conn *gorm.DB) {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS "timetable_slots" (
			"id" text PRIMARY KEY,
			"teacher_id" text NOT NULL,
			"class_id" text,
			"subject_id" text,
			"day" integer NOT NULL,
			"start" text NOT NULL,
			"end" text NOT NULL,
			"room" text DEFAULT '',
			"label" text DEFAULT '',
			"is_pinned" boolean NOT NULL DEFAULT false,
			"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS "rooms" (
			"id" text PRIMARY KEY,
			"name" text NOT NULL UNIQUE,
			"room_type" text NOT NULL DEFAULT 'standard',
			"is_active" boolean NOT NULL DEFAULT true,
			"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS "level_curricula" (
			"id" text PRIMARY KEY,
			"level" text NOT NULL,
			"subject_id" text NOT NULL,
			"weekly_hours" double precision NOT NULL DEFAULT 2,
			"block_size" double precision NOT NULL DEFAULT 1,
			"cognitive_weight" text NOT NULL DEFAULT 'heavy',
			"room_type" text NOT NULL DEFAULT 'standard'
		)`,
		`CREATE TABLE IF NOT EXISTS "calendar_events" (
			"id" text PRIMARY KEY,
			"user_id" text NOT NULL,
			"title" text NOT NULL,
			"date" text NOT NULL,
			"time" text,
			"note" text DEFAULT '',
			"color" text DEFAULT 'blue',
			"is_school_wide" boolean NOT NULL DEFAULT false,
			"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS "official_documents" (
			"id" text PRIMARY KEY,
			"title" text NOT NULL,
			"category" text DEFAULT 'عام',
			"description" text DEFAULT '',
			"file_name" text NOT NULL,
			"file_type" text DEFAULT 'application/octet-stream',
			"file_size" integer NOT NULL DEFAULT 0,
			"file_data" bytea NOT NULL,
			"uploaded_by" text,
			"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS "exam_gradings" (
			"id" text PRIMARY KEY,
			"exam_paper_id" text NOT NULL,
			"class_id" text NOT NULL,
			"student_id" text NOT NULL,
			"item_scores_json" text NOT NULL DEFAULT '{}',
			"status" text NOT NULL DEFAULT 'present',
			"total_score" double precision,
			"updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP
		)`,
	}
	if conn.Dialector.Name() == "postgres" {
		stmts = append(stmts,
			`ALTER TABLE "timetable_slots" ADD COLUMN IF NOT EXISTS "is_pinned" boolean NOT NULL DEFAULT false`,
			`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "max_weekly_hours" double precision NOT NULL DEFAULT 18`,
		)
	}
	for _, sql := range stmts {
		if err := conn.Exec(sql).Error; err != nil {
			log.Printf("[startup] ensureModernTables warning: %v", err)
		}
	}
}
