package db

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

func newID() string {
	return uuid.NewString()
}

// SectionValue holds bonus and optional direct subtotal override for a section.
type SectionValue struct {
	Bonus *float64 `json:"bonus"`
	ST    *float64 `json:"st"`
}

// ScoreValues matches the JSON shape stored in score_entries.values.
type ScoreValues struct {
	Criteria map[string]*float64     `json:"criteria"`
	Sections map[string]SectionValue `json:"sections"`
	Status   string                  `json:"status,omitempty"` // ""|"present"|"absent"|"exempt"
}

func (v ScoreValues) Value() (driver.Value, error) {
	if v.Criteria == nil {
		v.Criteria = map[string]*float64{}
	}
	if v.Sections == nil {
		v.Sections = map[string]SectionValue{}
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func (v *ScoreValues) Scan(src any) error {
	if src == nil {
		*v = ScoreValues{
			Criteria: map[string]*float64{},
			Sections: map[string]SectionValue{},
		}
		return nil
	}
	var raw []byte
	switch s := src.(type) {
	case []byte:
		raw = s
	case string:
		raw = []byte(s)
	default:
		return fmt.Errorf("unsupported ScoreValues type %T", src)
	}
	if len(raw) == 0 {
		*v = ScoreValues{
			Criteria: map[string]*float64{},
			Sections: map[string]SectionValue{},
		}
		return nil
	}
	var parsed ScoreValues
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return err
	}
	if parsed.Criteria == nil {
		parsed.Criteria = map[string]*float64{}
	}
	if parsed.Sections == nil {
		parsed.Sections = map[string]SectionValue{}
	}
	*v = parsed
	return nil
}

// ── Models ───────────────────────────────────────────────────────────────────

type User struct {
	ID                 string              `gorm:"primaryKey;type:text"`
	Username           string              `gorm:"not null;uniqueIndex"`
	PasswordHash       string              `gorm:"not null"`
	FullName           string              `gorm:"default:''"`
	Grade              string              `gorm:"default:''"`
	Subject            string              `gorm:"default:''"`
	Role               string              `gorm:"not null;default:'teacher'"`
	MaxWeeklyHours     float64             `gorm:"not null;default:25"`
	IsActive           bool                `gorm:"not null;default:true"`
	MustChangePassword bool                `gorm:"not null;default:true"`
	CreatedAt          time.Time           `gorm:"autoCreateTime"`
	Classes            []Class             `gorm:"foreignKey:OwnerID"`
	Assignments        []TeacherAssignment `gorm:"foreignKey:TeacherID;constraint:OnDelete:CASCADE"`
}

func (u *User) BeforeCreate(_ *gorm.DB) error {
	if u.ID == "" {
		u.ID = newID()
	}
	return nil
}

type SchemaMigration struct {
	Key       string    `gorm:"primaryKey;type:text"`
	AppliedAt time.Time `gorm:"autoCreateTime"`
}

type SchoolSettings struct {
	ID         int    `gorm:"primaryKey"`
	SchoolName string `gorm:"default:''"`
	ActiveYear string `gorm:"default:''"`
	Region     string `gorm:"default:''"`
}

type Subject struct {
	ID         string         `gorm:"primaryKey;type:text"`
	Code       string         `gorm:"not null;uniqueIndex"`
	NameAr     string         `gorm:"not null"`
	NameFr     *string        `gorm:"type:text"`
	OrderIndex int            `gorm:"default:0"`
	IsActive   bool           `gorm:"not null;default:true"`
	Templates  []GridTemplate `gorm:"foreignKey:SubjectID"`
}

func (s *Subject) BeforeCreate(_ *gorm.DB) error {
	if s.ID == "" {
		s.ID = newID()
	}
	return nil
}

type GridTemplate struct {
	ID           string        `gorm:"primaryKey;type:text"`
	Code         *string       `gorm:"uniqueIndex"`
	SubjectID    string        `gorm:"not null"`
	Name         string        `gorm:"not null"`
	FinalFormula string        `gorm:"not null;default:'avg_groups'"`
	FinalCap     *float64      `gorm:"type:double precision"`
	IsBuiltin    bool          `gorm:"not null;default:false"`
	IsActive     bool          `gorm:"not null;default:true"`
	Direction    string        `gorm:"not null;default:'rtl'"`
	CreatedAt    time.Time     `gorm:"autoCreateTime"`
	Subject      *Subject      `gorm:"foreignKey:SubjectID"`
	Sections     []GridSection `gorm:"foreignKey:TemplateID;constraint:OnDelete:CASCADE"`
}

func (t *GridTemplate) BeforeCreate(_ *gorm.DB) error {
	if t.ID == "" {
		t.ID = newID()
	}
	return nil
}

type GridSection struct {
	ID              string          `gorm:"primaryKey;type:text"`
	TemplateID      string          `gorm:"not null"`
	Code            *string         `gorm:"type:text"`
	GroupKey        string          `gorm:"not null"`
	GroupLabel      string          `gorm:"not null"`
	Label           string          `gorm:"not null"`
	OrderIndex      int             `gorm:"not null;default:0"`
	HasBonus        bool            `gorm:"not null;default:true"`
	AllowSTOverride bool            `gorm:"column:allow_st_override;not null;default:true"`
	ColorKey        *string         `gorm:"type:text"`
	Template        *GridTemplate   `gorm:"foreignKey:TemplateID"`
	Criteria        []GridCriterion `gorm:"foreignKey:SectionID;constraint:OnDelete:CASCADE"`
}

func (s *GridSection) BeforeCreate(_ *gorm.DB) error {
	if s.ID == "" {
		s.ID = newID()
	}
	return nil
}

type GridCriterion struct {
	ID         string       `gorm:"primaryKey;type:text"`
	SectionID  string       `gorm:"not null"`
	Code       *string      `gorm:"type:text"`
	Label      string       `gorm:"not null"`
	MaxScore   *float64     `gorm:"type:double precision"`
	OrderIndex int          `gorm:"not null;default:0"`
	Section    *GridSection `gorm:"foreignKey:SectionID"`
}

func (GridCriterion) TableName() string { return "grid_criteria" }

func (c *GridCriterion) BeforeCreate(_ *gorm.DB) error {
	if c.ID == "" {
		c.ID = newID()
	}
	return nil
}

type TeacherAssignment struct {
	ID        string    `gorm:"primaryKey;type:text"`
	TeacherID string    `gorm:"not null;uniqueIndex:ux_teacher_class_subj"`
	ClassID   string    `gorm:"not null;uniqueIndex:ux_teacher_class_subj"`
	SubjectID string    `gorm:"not null;uniqueIndex:ux_teacher_class_subj"`
	CreatedAt time.Time `gorm:"autoCreateTime"`
	Teacher   *User     `gorm:"foreignKey:TeacherID"`
	Class     *Class    `gorm:"foreignKey:ClassID"`
	Subject   *Subject  `gorm:"foreignKey:SubjectID"`
}

func (a *TeacherAssignment) BeforeCreate(_ *gorm.DB) error {
	if a.ID == "" {
		a.ID = newID()
	}
	return nil
}

type ScoreEntry struct {
	ID         string       `gorm:"primaryKey;type:text"`
	SessionID  string       `gorm:"not null;uniqueIndex:ux_score_session_student"`
	StudentID  string       `gorm:"not null;uniqueIndex:ux_score_session_student"`
	Values     ScoreValues  `gorm:"type:json;not null"`
	FinalScore *float64     `gorm:"type:double precision"`
	UpdatedAt  *time.Time
	UpdatedBy  *string      `gorm:"type:text"`
	Session    *ExamSession `gorm:"foreignKey:SessionID"`
	Student    *Student     `gorm:"foreignKey:StudentID"`
}

func (e *ScoreEntry) BeforeCreate(_ *gorm.DB) error {
	if e.ID == "" {
		e.ID = newID()
	}
	return nil
}

type CalendarEvent struct {
	ID           string    `gorm:"primaryKey;type:text"`
	UserID       string    `gorm:"not null"`
	Title        string    `gorm:"not null"`
	Date         string    `gorm:"not null;index"`
	Time         *string   `gorm:"type:text"`
	Note         string    `gorm:"default:''"`
	Color        string    `gorm:"default:'blue'"`
	IsSchoolWide bool      `gorm:"not null;default:false"`
	CreatedAt    time.Time `gorm:"autoCreateTime"`
	User         *User     `gorm:"foreignKey:UserID"`
}

func (e *CalendarEvent) BeforeCreate(_ *gorm.DB) error {
	if e.ID == "" {
		e.ID = newID()
	}
	return nil
}

type TimetableSlot struct {
	ID        string    `gorm:"primaryKey;type:text"`
	TeacherID string    `gorm:"not null"`
	ClassID   *string   `gorm:"type:text"`
	SubjectID *string   `gorm:"type:text"`
	Day       int       `gorm:"not null"`
	Start     string    `gorm:"not null"`
	End       string    `gorm:"not null"`
	Room      string    `gorm:"default:''"`
	Label     string    `gorm:"default:''"`
	IsPinned  bool      `gorm:"not null;default:false"`
	CreatedAt time.Time `gorm:"autoCreateTime"`
	Teacher   *User     `gorm:"foreignKey:TeacherID"`
	Class     *Class    `gorm:"foreignKey:ClassID"`
	Subject   *Subject  `gorm:"foreignKey:SubjectID"`
}

type Room struct {
	ID        string    `gorm:"primaryKey;type:text"`
	Name      string    `gorm:"not null;uniqueIndex"`
	RoomType  string    `gorm:"not null;default:'standard'"` // standard | computer | yard | multipurpose
	IsActive  bool      `gorm:"not null;default:true"`
	CreatedAt time.Time `gorm:"autoCreateTime"`
}

func (r *Room) BeforeCreate(_ *gorm.DB) error {
	if r.ID == "" {
		r.ID = newID()
	}
	return nil
}

type LevelCurriculum struct {
	ID              string   `gorm:"primaryKey;type:text"`
	Level           string   `gorm:"not null;uniqueIndex:ux_curriculum_level_subj"`
	SubjectID       string   `gorm:"not null;uniqueIndex:ux_curriculum_level_subj"`
	WeeklyHours     float64  `gorm:"not null;default:2"`
	BlockSize       float64  `gorm:"not null;default:1"` // preferred session duration (1 or 2)
	CognitiveWeight string   `gorm:"not null;default:'heavy'"` // heavy | light
	RoomType        string   `gorm:"not null;default:'standard'"`
	Subject         *Subject `gorm:"foreignKey:SubjectID"`
}

func (LevelCurriculum) TableName() string { return "level_curricula" }

func (lc *LevelCurriculum) BeforeCreate(_ *gorm.DB) error {
	if lc.ID == "" {
		lc.ID = newID()
	}
	return nil
}

func (s *TimetableSlot) BeforeCreate(_ *gorm.DB) error {
	if s.ID == "" {
		s.ID = newID()
	}
	return nil
}

type OfficialDocument struct {
	ID          string    `gorm:"primaryKey;type:text"`
	Title       string    `gorm:"not null"`
	Filename    string    `gorm:"not null"`
	ContentType string    `gorm:"default:'application/octet-stream'"`
	Size        int       `gorm:"default:0"`
	Data        []byte    `gorm:"not null"`
	UploadedBy  *string   `gorm:"type:text"`
	CreatedAt   time.Time `gorm:"autoCreateTime"`
	Uploader    *User     `gorm:"foreignKey:UploadedBy"`
}

func (d *OfficialDocument) BeforeCreate(_ *gorm.DB) error {
	if d.ID == "" {
		d.ID = newID()
	}
	return nil
}

type SchoolYear struct {
	ID        string    `gorm:"primaryKey;type:text"`
	Label     string    `gorm:"not null;uniqueIndex"`
	CreatedAt time.Time `gorm:"autoCreateTime"`
	Classes   []Class   `gorm:"foreignKey:SchoolYearID;constraint:OnDelete:CASCADE"`
}

func (y *SchoolYear) BeforeCreate(_ *gorm.DB) error {
	if y.ID == "" {
		y.ID = newID()
	}
	return nil
}

type Class struct {
	ID           string              `gorm:"primaryKey;type:text"`
	SchoolYearID string              `gorm:"not null"`
	OwnerID      *string             `gorm:"type:text"`
	Name         string              `gorm:"not null"`
	Teacher      *string             `gorm:"type:text"`
	Level        *string             `gorm:"type:text"`
	CreatedAt    time.Time           `gorm:"autoCreateTime"`
	SchoolYear   *SchoolYear         `gorm:"foreignKey:SchoolYearID"`
	Owner        *User               `gorm:"foreignKey:OwnerID"`
	Students     []Student           `gorm:"foreignKey:ClassID;constraint:OnDelete:CASCADE"`
	Sessions     []ExamSession       `gorm:"foreignKey:ClassID;constraint:OnDelete:CASCADE"`
	Assignments  []TeacherAssignment `gorm:"foreignKey:ClassID;constraint:OnDelete:CASCADE"`
}

func (c *Class) BeforeCreate(_ *gorm.DB) error {
	if c.ID == "" {
		c.ID = newID()
	}
	return nil
}

type Student struct {
	ID         string       `gorm:"primaryKey;type:text"`
	ClassID    string       `gorm:"not null"`
	FullName   string       `gorm:"not null"`
	OrderIndex int          `gorm:"not null"`
	Class      *Class       `gorm:"foreignKey:ClassID"`
	Entries    []ScoreEntry `gorm:"foreignKey:StudentID;constraint:OnDelete:CASCADE"`
}

func (s *Student) BeforeCreate(_ *gorm.DB) error {
	if s.ID == "" {
		s.ID = newID()
	}
	return nil
}

type ExamSession struct {
	ID          string        `gorm:"primaryKey;type:text"`
	ClassID     string        `gorm:"not null;uniqueIndex:ux_sessions_class_subj_trim_type"`
	SubjectID   *string       `gorm:"type:text;uniqueIndex:ux_sessions_class_subj_trim_type"`
	TemplateID  *string       `gorm:"type:text"`
	Trimester   int           `gorm:"not null;uniqueIndex:ux_sessions_class_subj_trim_type"`
	ExamType    string        `gorm:"not null;uniqueIndex:ux_sessions_class_subj_trim_type"`
	IsFinalized bool          `gorm:"not null;default:false"`
	CreatedAt   time.Time     `gorm:"autoCreateTime"`
	Class       *Class        `gorm:"foreignKey:ClassID"`
	Subject     *Subject      `gorm:"foreignKey:SubjectID"`
	Template    *GridTemplate `gorm:"foreignKey:TemplateID"`
	Entries     []ScoreEntry  `gorm:"foreignKey:SessionID;constraint:OnDelete:CASCADE"`
}

func (s *ExamSession) BeforeCreate(_ *gorm.DB) error {
	if s.ID == "" {
		s.ID = newID()
	}
	return nil
}

// ExamPaper stores a structured or archived yearly exam paper (French/Arabic).
type ExamPaper struct {
	ID              string    `gorm:"primaryKey;type:text"`
	OwnerID         string    `gorm:"not null;index"`
	Title           string    `gorm:"not null"`
	SchoolYear      string    `gorm:"not null;index"`
	Level           string    `gorm:"not null;default:'4ème année'"`
	SubjectCode     string    `gorm:"not null;default:'francais'"`
	Trimester       int       `gorm:"not null;default:1"`
	ModuleNum       int       `gorm:"not null;default:0"`
	ExamType        string    `gorm:"not null;default:'Évaluation'"`
	Direction       string    `gorm:"not null;default:'ltr'"`
	BlocksJSON      string    `gorm:"type:text;not null;default:'[]'"`
	TotalPoints     float64   `gorm:"not null;default:20"`
	UsedCount       int       `gorm:"not null;default:0"`
	AvgScore        *float64  `gorm:"type:double precision"`
	SourceFileName  string    `gorm:"default:''"`
	SourceFileType  string    `gorm:"default:''"`
	SourceFileData  []byte    `gorm:"type:bytea"`
	CreatedAt       time.Time `gorm:"autoCreateTime"`
	UpdatedAt       time.Time `gorm:"autoUpdateTime"`
	Owner           *User     `gorm:"foreignKey:OwnerID"`
}

func (e *ExamPaper) BeforeCreate(_ *gorm.DB) error {
	if e.ID == "" {
		e.ID = newID()
	}
	return nil
}

// QuestionBlock stores a reusable exercise block in the teacher's Exercise Bank
// along with empirical difficulty and teacher accept/skip signals for ML scoring.
type QuestionBlock struct {
	ID                string    `gorm:"primaryKey;type:text"`
	OwnerID           *string   `gorm:"type:text;index"` // nil = shared starter bank
	Section           string    `gorm:"not null;default:'langue'"` // lecture | langue | production
	BlockType         string    `gorm:"not null;default:'open_question'"`
	Level             string    `gorm:"not null;default:'4ème année'"`
	SubjectCode       string    `gorm:"not null;default:'francais'"`
	Trimester         int       `gorm:"not null;default:1"`
	ModuleNum         int       `gorm:"not null;default:0"`
	Criterion         string    `gorm:"not null;default:'C1'"`
	Points            float64   `gorm:"not null;default:2"`
	Difficulty        string    `gorm:"not null;default:'medium'"` // easy | medium | hard
	EmpiricalPassRate *float64  `gorm:"type:double precision"`       // 0..1 calibrated from real scores
	Topic             string    `gorm:"default:''"`
	ContentJSON       string    `gorm:"type:text;not null;default:'{}'"`
	TimesUsed         int       `gorm:"not null;default:0"`
	TimesAccepted     int       `gorm:"not null;default:0"`
	TimesSkipped      int       `gorm:"not null;default:0"`
	LastUsedYear      string    `gorm:"default:''"`
	CreatedAt         time.Time `gorm:"autoCreateTime"`
	UpdatedAt         time.Time `gorm:"autoUpdateTime"`
}

func (q *QuestionBlock) BeforeCreate(_ *gorm.DB) error {
	if q.ID == "" {
		q.ID = newID()
	}
	return nil
}
