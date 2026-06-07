from pydantic import BaseModel
from typing import Optional, List
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


class SessionCreate(BaseModel):
    trimester: int
    exam_type: str


class FinalizeBody(BaseModel):
    finalized: bool


class ProfileUpdate(BaseModel):
    name:  str
    grade: str
