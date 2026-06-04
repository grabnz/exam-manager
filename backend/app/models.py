import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from .database import Base


def _id():
    return str(uuid.uuid4())


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
    name           = Column(String, nullable=False)
    teacher        = Column(String)
    created_at     = Column(DateTime, default=datetime.utcnow)
    school_year    = relationship("SchoolYear", back_populates="classes")
    students       = relationship("Student", back_populates="class_",
                                  order_by="Student.order_index",
                                  cascade="all, delete-orphan")
    sessions       = relationship("ExamSession", back_populates="class_",
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


class ExamSession(Base):
    __tablename__ = "exam_sessions"
    id         = Column(String, primary_key=True, default=_id)
    class_id   = Column(String, ForeignKey("classes.id"), nullable=False)
    trimester  = Column(Integer, nullable=False)          # 1 / 2 / 3
    exam_type  = Column(String, nullable=False)           # "امتحان" / "فرض"
    created_at = Column(DateTime, default=datetime.utcnow)
    class_     = relationship("Class", back_populates="sessions")
    scores     = relationship("StudentScore", back_populates="session",
                              cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("class_id", "trimester", "exam_type"),)


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
