from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime


SCORE_FIELDS = [
    "prod_dictee_c4",
    "prod_ecriture_c2", "prod_ecriture_c7", "prod_ecriture_bonus", "prod_ecriture_st",
    "prod_production_c1", "prod_production_c3", "prod_production_c5", "prod_production_c6", "prod_production_bonus", "prod_production_st",
    "lect_vocale_c1", "lect_vocale_c5", "lect_vocale_bonus", "lect_vocale_st",
    "lect_comp_c2", "lect_comp_c3", "lect_comp_c4", "lect_comp_c6", "lect_comp_bonus", "lect_comp_st",
    "com_rec_c1", "com_rec_c2", "com_rec_c3", "com_rec_c4", "com_rec_bonus", "com_rec_st",
    "com_oral_c1", "com_oral_c2", "com_oral_c3", "com_oral_c4", "com_oral_c5", "com_oral_c6", "com_oral_bonus", "com_oral_st",
]


class ScoreFields(BaseModel):
    prod_dictee_c4:        Optional[float] = None
    prod_ecriture_c2:      Optional[float] = None
    prod_ecriture_c7:      Optional[float] = None
    prod_ecriture_bonus:   Optional[float] = None
    prod_ecriture_st:      Optional[float] = None
    prod_production_c1:    Optional[float] = None
    prod_production_c3:    Optional[float] = None
    prod_production_c5:    Optional[float] = None
    prod_production_c6:    Optional[float] = None
    prod_production_bonus: Optional[float] = None
    prod_production_st:    Optional[float] = None
    lect_vocale_c1:        Optional[float] = None
    lect_vocale_c5:        Optional[float] = None
    lect_vocale_bonus:     Optional[float] = None
    lect_vocale_st:        Optional[float] = None
    lect_comp_c2:          Optional[float] = None
    lect_comp_c3:          Optional[float] = None
    lect_comp_c4:          Optional[float] = None
    lect_comp_c6:          Optional[float] = None
    lect_comp_bonus:       Optional[float] = None
    lect_comp_st:          Optional[float] = None
    com_rec_c1:            Optional[float] = None
    com_rec_c2:            Optional[float] = None
    com_rec_c3:            Optional[float] = None
    com_rec_c4:            Optional[float] = None
    com_rec_bonus:         Optional[float] = None
    com_rec_st:            Optional[float] = None
    com_oral_c1:           Optional[float] = None
    com_oral_c2:           Optional[float] = None
    com_oral_c3:           Optional[float] = None
    com_oral_c4:           Optional[float] = None
    com_oral_c5:           Optional[float] = None
    com_oral_c6:           Optional[float] = None
    com_oral_bonus:        Optional[float] = None
    com_oral_st:           Optional[float] = None


class StudentScoreIn(ScoreFields):
    student_id: str


class ScoresSave(BaseModel):
    scores: List[StudentScoreIn]


class SectionValuesIn(BaseModel):
    bonus: Optional[float] = None
    st:    Optional[float] = None


class ScoreEntryIn(BaseModel):
    student_id: str
    criteria: Dict[str, Optional[float]] = {}
    sections: Dict[str, SectionValuesIn] = {}


class ScoresSaveV2(BaseModel):
    scores: List[ScoreEntryIn]
    base_updated_at: Optional[datetime] = None  # offline conflict detection
    force: bool = False


class SessionCreate(BaseModel):
    trimester: int
    exam_type: str
    subject_id: Optional[str] = None  # None → français (legacy clients)


class FinalizeBody(BaseModel):
    finalized: bool


class ProfileUpdate(BaseModel):
    name:    str
    grade:   str
    subject: str = ""


# ── Auth / users ─────────────────────────────────────────────────────────────

class LoginBody(BaseModel):
    username: str
    password: str


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


class UserCreate(BaseModel):
    username:  str
    password:  str
    full_name: str = ""
    grade:     str = ""
    role:      str = "teacher"


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    grade:     Optional[str] = None
    is_active: Optional[bool] = None


class ResetPasswordBody(BaseModel):
    password: str


# ── Class / student management ───────────────────────────────────────────────

class ClassCreate(BaseModel):
    name:        str
    school_year: str
    level:       Optional[str] = None  # السنة الأولى…السادسة


class ClassUpdate(BaseModel):
    name:  Optional[str] = None
    level: Optional[str] = None


class AssignmentCreate(BaseModel):
    teacher_id:  str
    class_id:    str
    subject_ids: List[str]


class SettingsUpdate(BaseModel):
    school_name: str = ""
    active_year: str = ""
    region:      str = ""


# ── Template editing (director) ──────────────────────────────────────────────

class CriterionSpec(BaseModel):
    label:     str
    max_score: Optional[float] = None


class SectionSpec(BaseModel):
    group_label:       str
    label:             str
    has_bonus:         bool = True
    allow_st_override: bool = True
    color_key:         Optional[str] = None
    criteria:          List[CriterionSpec]


class TemplateUpdate(BaseModel):
    name:          str
    final_formula: str = "sum_sections"   # avg_groups | sum_sections | sum_capped
    final_cap:     Optional[float] = None
    direction:     str = "rtl"
    sections:      List[SectionSpec]


class StudentCreate(BaseModel):
    full_name: str


class StudentUpdate(BaseModel):
    full_name: str
