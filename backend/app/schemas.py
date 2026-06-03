from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


SCORE_FIELDS = [
    "prod_dictee_c4",
    "prod_ecriture_c2", "prod_ecriture_c7",
    "prod_production_c1", "prod_production_c3", "prod_production_c5", "prod_production_c6",
    "lect_vocale_c1", "lect_vocale_c5",
    "lect_comp_c2", "lect_comp_c3", "lect_comp_c4", "lect_comp_c6",
    "com_rec_c1", "com_rec_c2", "com_rec_c3", "com_rec_c4",
    "com_oral_c1", "com_oral_c2", "com_oral_c3", "com_oral_c4", "com_oral_c5", "com_oral_c6",
]


class ScoreFields(BaseModel):
    prod_dictee_c4:     Optional[float] = None
    prod_ecriture_c2:   Optional[float] = None
    prod_ecriture_c7:   Optional[float] = None
    prod_production_c1: Optional[float] = None
    prod_production_c3: Optional[float] = None
    prod_production_c5: Optional[float] = None
    prod_production_c6: Optional[float] = None
    lect_vocale_c1:     Optional[float] = None
    lect_vocale_c5:     Optional[float] = None
    lect_comp_c2:       Optional[float] = None
    lect_comp_c3:       Optional[float] = None
    lect_comp_c4:       Optional[float] = None
    lect_comp_c6:       Optional[float] = None
    com_rec_c1:         Optional[float] = None
    com_rec_c2:         Optional[float] = None
    com_rec_c3:         Optional[float] = None
    com_rec_c4:         Optional[float] = None
    com_oral_c1:        Optional[float] = None
    com_oral_c2:        Optional[float] = None
    com_oral_c3:        Optional[float] = None
    com_oral_c4:        Optional[float] = None
    com_oral_c5:        Optional[float] = None
    com_oral_c6:        Optional[float] = None


class StudentScoreIn(ScoreFields):
    student_id: str


class ScoresSave(BaseModel):
    scores: List[StudentScoreIn]


class SessionCreate(BaseModel):
    trimester: int
    exam_type: str
