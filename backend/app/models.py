import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, ForeignKey, DateTime,
    UniqueConstraint, JSON, LargeBinary,
)
from sqlalchemy.orm import relationship
from .database import Base


def _id():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"
    id                   = Column(String, primary_key=True, default=_id)
    username             = Column(String, nullable=False, unique=True, index=True)
    password_hash        = Column(String, nullable=False)
    full_name            = Column(String, default="")
    grade                = Column(String, default="")  # رتبة
    subject              = Column(String, default="")  # المادة (فرنسية، رياضيات…)
    role                 = Column(String, nullable=False, default="teacher")  # admin | teacher
    is_active            = Column(Boolean, nullable=False, default=True)
    must_change_password = Column(Boolean, nullable=False, default=True)
    created_at           = Column(DateTime, default=datetime.utcnow)
    classes              = relationship("Class", back_populates="owner")
    assignments          = relationship("TeacherAssignment", back_populates="teacher",
                                        cascade="all, delete-orphan")


class SchemaMigration(Base):
    """One-shot data migrations applied exactly once (no Alembic)."""
    __tablename__ = "schema_migrations"
    key        = Column(String, primary_key=True)
    applied_at = Column(DateTime, default=datetime.utcnow)


class SchoolSettings(Base):
    __tablename__ = "school_settings"
    id          = Column(Integer, primary_key=True, default=1)
    school_name = Column(String, default="")   # المدرسة الابتدائية …
    active_year = Column(String, default="")   # "2025-2026"
    region      = Column(String, default="")   # المندوبية الجهوية


class Subject(Base):
    __tablename__ = "subjects"
    id          = Column(String, primary_key=True, default=_id)
    code        = Column(String, nullable=False, unique=True)  # 'arabe','math','francais',…
    name_ar     = Column(String, nullable=False)               # "اللغة العربية"
    name_fr     = Column(String)                               # "Français" (LTR grids)
    order_index = Column(Integer, default=0)
    is_active   = Column(Boolean, nullable=False, default=True)
    templates   = relationship("GridTemplate", back_populates="subject")


class GridTemplate(Base):
    """A score-grid definition (شبكة تقييم) for one subject.
    Built-ins are immutable; directors clone them to customize.
    Sessions pin a template_id so history never changes."""
    __tablename__ = "grid_templates"
    id            = Column(String, primary_key=True, default=_id)
    code          = Column(String, unique=True)  # stable key for built-ins, NULL for clones
    subject_id    = Column(String, ForeignKey("subjects.id"), nullable=False)
    name          = Column(String, nullable=False)
    final_formula = Column(String, nullable=False, default="avg_groups")  # avg_groups|sum_sections|sum_capped
    final_cap     = Column(Float)                # used by sum_capped (e.g. 20)
    is_builtin    = Column(Boolean, nullable=False, default=False)
    is_active     = Column(Boolean, nullable=False, default=True)
    direction     = Column(String, nullable=False, default="rtl")  # grid text direction
    created_at    = Column(DateTime, default=datetime.utcnow)
    subject       = relationship("Subject", back_populates="templates")
    sections      = relationship("GridSection", back_populates="template",
                                 cascade="all, delete-orphan",
                                 order_by="GridSection.order_index")


class GridSection(Base):
    __tablename__ = "grid_sections"
    id                = Column(String, primary_key=True, default=_id)
    template_id       = Column(String, ForeignKey("grid_templates.id"), nullable=False)
    code              = Column(String)             # migration key for built-ins ('prod_ecriture',…)
    group_key         = Column(String, nullable=False)   # tab/sheet grouping
    group_label       = Column(String, nullable=False)
    label             = Column(String, nullable=False)   # "Dictée" / "القراءة"
    order_index       = Column(Integer, nullable=False, default=0)
    has_bonus         = Column(Boolean, nullable=False, default=True)
    allow_st_override = Column(Boolean, nullable=False, default=True)
    color_key         = Column(String)             # palette key: 'blue'|'green'|'orange'|…
    template          = relationship("GridTemplate", back_populates="sections")
    criteria          = relationship("GridCriterion", back_populates="section",
                                     cascade="all, delete-orphan",
                                     order_by="GridCriterion.order_index")


class GridCriterion(Base):
    __tablename__ = "grid_criteria"
    id          = Column(String, primary_key=True, default=_id)
    section_id  = Column(String, ForeignKey("grid_sections.id"), nullable=False)
    code        = Column(String)        # migration key for built-ins ('prod_dictee_c4',…)
    label       = Column(String, nullable=False)   # "C4" / "مع1"
    max_score   = Column(Float)
    order_index = Column(Integer, nullable=False, default=0)
    section     = relationship("GridSection", back_populates="criteria")


class TeacherAssignment(Base):
    """A teacher teaches a subject in a class. Source of truth for access."""
    __tablename__ = "teacher_assignments"
    id         = Column(String, primary_key=True, default=_id)
    teacher_id = Column(String, ForeignKey("users.id"), nullable=False)
    class_id   = Column(String, ForeignKey("classes.id"), nullable=False)
    subject_id = Column(String, ForeignKey("subjects.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    teacher    = relationship("User", back_populates="assignments")
    class_     = relationship("Class", back_populates="assignments")
    subject    = relationship("Subject")
    __table_args__ = (UniqueConstraint("teacher_id", "class_id", "subject_id"),)


class ScoreEntry(Base):
    """Generic per-student scores for a session (replaces student_scores).
    values = {"criteria": {criterion_id: number|null},
              "sections": {section_id: {"bonus": number|null, "st": number|null}}}"""
    __tablename__ = "score_entries"
    id          = Column(String, primary_key=True, default=_id)
    session_id  = Column(String, ForeignKey("exam_sessions.id"), nullable=False)
    student_id  = Column(String, ForeignKey("students.id"), nullable=False)
    values      = Column(JSON, nullable=False, default=dict)
    final_score = Column(Float)        # denormalized, recomputed server-side on save
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by  = Column(String, ForeignKey("users.id"))
    session     = relationship("ExamSession", back_populates="entries")
    student     = relationship("Student", back_populates="entries")
    __table_args__ = (UniqueConstraint("session_id", "student_id"),)


class CalendarEvent(Base):
    """Agenda entry. Personal (visible to its creator) or school-wide
    (created by the director, visible to everyone)."""
    __tablename__ = "calendar_events"
    id             = Column(String, primary_key=True, default=_id)
    user_id        = Column(String, ForeignKey("users.id"), nullable=False)  # creator
    title          = Column(String, nullable=False)
    date           = Column(String, nullable=False, index=True)  # 'YYYY-MM-DD'
    time           = Column(String)                              # 'HH:MM' optional
    note           = Column(String, default="")
    color          = Column(String, default="blue")              # blue|green|amber|rose|purple
    is_school_wide = Column(Boolean, nullable=False, default=False)
    created_at     = Column(DateTime, default=datetime.utcnow)
    user           = relationship("User")


class OfficialDocument(Base):
    """Official documents uploaded by the director, downloadable by teachers
    (stored in the database — no filesystem on serverless)."""
    __tablename__ = "official_documents"
    id           = Column(String, primary_key=True, default=_id)
    title        = Column(String, nullable=False)
    filename     = Column(String, nullable=False)
    content_type = Column(String, default="application/octet-stream")
    size         = Column(Integer, default=0)
    data         = Column(LargeBinary, nullable=False)
    uploaded_by  = Column(String, ForeignKey("users.id"))
    created_at   = Column(DateTime, default=datetime.utcnow)
    uploader     = relationship("User")


class SchoolYear(Base):
    __tablename__ = "school_years"
    id         = Column(String, primary_key=True, default=_id)
    label      = Column(String, nullable=False, unique=True)  # "2025-2026"
    created_at = Column(DateTime, default=datetime.utcnow)
    classes    = relationship("Class", back_populates="school_year",
                              cascade="all, delete-orphan", order_by="Class.name")


class Class(Base):
    __tablename__ = "classes"
    id             = Column(String, primary_key=True, default=_id)
    school_year_id = Column(String, ForeignKey("school_years.id"), nullable=False)
    owner_id       = Column(String, ForeignKey("users.id"), nullable=True)  # legacy (pre-assignments)
    name           = Column(String, nullable=False)
    teacher        = Column(String)   # legacy free-text from PDF import
    level          = Column(String)   # السنة الأولى…السادسة (optional)
    created_at     = Column(DateTime, default=datetime.utcnow)
    school_year    = relationship("SchoolYear", back_populates="classes")
    owner          = relationship("User", back_populates="classes")
    students       = relationship("Student", back_populates="class_",
                                  order_by="Student.order_index",
                                  cascade="all, delete-orphan")
    sessions       = relationship("ExamSession", back_populates="class_",
                                  cascade="all, delete-orphan")
    assignments    = relationship("TeacherAssignment", back_populates="class_",
                                  cascade="all, delete-orphan")


class Student(Base):
    __tablename__ = "students"
    id          = Column(String, primary_key=True, default=_id)
    class_id    = Column(String, ForeignKey("classes.id"), nullable=False)
    full_name   = Column(String, nullable=False)
    order_index = Column(Integer, nullable=False)
    class_      = relationship("Class", back_populates="students")
    scores      = relationship("StudentScore", back_populates="student",
                               cascade="all, delete-orphan")
    entries     = relationship("ScoreEntry", back_populates="student",
                               cascade="all, delete-orphan")


class ExamSession(Base):
    __tablename__ = "exam_sessions"
    id           = Column(String, primary_key=True, default=_id)
    class_id     = Column(String, ForeignKey("classes.id"), nullable=False)
    subject_id   = Column(String, ForeignKey("subjects.id"))      # backfilled; required in app logic
    template_id  = Column(String, ForeignKey("grid_templates.id"))  # pinned grid for this session
    trimester    = Column(Integer, nullable=False)
    exam_type    = Column(String, nullable=False)
    is_finalized = Column(Boolean, default=False, nullable=False)
    created_at   = Column(DateTime, default=datetime.utcnow)
    class_       = relationship("Class", back_populates="sessions")
    subject      = relationship("Subject")
    template     = relationship("GridTemplate")
    scores       = relationship("StudentScore", back_populates="session",
                                cascade="all, delete-orphan")
    entries      = relationship("ScoreEntry", back_populates="session",
                                cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("class_id", "subject_id", "trimester", "exam_type"),)


class TeacherProfile(Base):
    __tablename__ = "teacher_profile"
    id    = Column(Integer, primary_key=True, default=1)
    name  = Column(String, default="")
    grade = Column(String, default="")  # رتبة


class StudentScore(Base):
    __tablename__ = "student_scores"
    id         = Column(String, primary_key=True, default=_id)
    session_id = Column(String, ForeignKey("exam_sessions.id"), nullable=False)
    student_id = Column(String, ForeignKey("students.id"), nullable=False)

    # ── Prod. écrite et écriture ──────────────────────────────────────────
    prod_dictee_c4       = Column(Float)
    prod_ecriture_c2      = Column(Float)
    prod_ecriture_c7      = Column(Float)
    prod_ecriture_bonus   = Column(Float)
    prod_ecriture_st      = Column(Float)   # direct subtotal override
    prod_production_c1    = Column(Float)
    prod_production_c3    = Column(Float)
    prod_production_c5    = Column(Float)
    prod_production_c6    = Column(Float)
    prod_production_bonus = Column(Float)
    prod_production_st    = Column(Float)   # direct subtotal override

    # ── Lecture ───────────────────────────────────────────────────────────
    lect_vocale_c1    = Column(Float)
    lect_vocale_c5    = Column(Float)
    lect_vocale_bonus = Column(Float)
    lect_vocale_st    = Column(Float)   # direct subtotal override
    lect_comp_c2      = Column(Float)
    lect_comp_c3      = Column(Float)
    lect_comp_c4      = Column(Float)
    lect_comp_c6      = Column(Float)
    lect_comp_bonus   = Column(Float)
    lect_comp_st      = Column(Float)   # direct subtotal override

    # ── Com. Orale et Récitation ──────────────────────────────────────────
    com_rec_c1    = Column(Float)
    com_rec_c2    = Column(Float)
    com_rec_c3    = Column(Float)
    com_rec_c4    = Column(Float)
    com_rec_bonus = Column(Float)
    com_rec_st    = Column(Float)   # direct subtotal override
    com_oral_c1   = Column(Float)
    com_oral_c2   = Column(Float)
    com_oral_c3   = Column(Float)
    com_oral_c4   = Column(Float)
    com_oral_c5   = Column(Float)
    com_oral_c6   = Column(Float)
    com_oral_bonus = Column(Float)
    com_oral_st    = Column(Float)   # direct subtotal override

    session = relationship("ExamSession", back_populates="scores")
    student = relationship("Student", back_populates="scores")
    __table_args__ = (UniqueConstraint("session_id", "student_id"),)
