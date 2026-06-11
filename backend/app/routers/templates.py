from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import GridTemplate, GridSection, User
from ..auth import get_current_user

router = APIRouter(prefix="/api", tags=["templates"])


def template_tree(t: GridTemplate) -> dict:
    """Full template tree, sections in order grouped client-side by group_key."""
    return {
        "id":            t.id,
        "code":          t.code,
        "subject_id":    t.subject_id,
        "name":          t.name,
        "final_formula": t.final_formula,
        "final_cap":     t.final_cap,
        "is_builtin":    t.is_builtin,
        "direction":     t.direction,
        "sections": [
            {
                "id":                s.id,
                "code":              s.code,
                "group_key":         s.group_key,
                "group_label":       s.group_label,
                "label":             s.label,
                "order_index":       s.order_index,
                "has_bonus":         s.has_bonus,
                "allow_st_override": s.allow_st_override,
                "color_key":         s.color_key,
                "criteria": [
                    {"id": c.id, "code": c.code, "label": c.label,
                     "max_score": c.max_score, "order_index": c.order_index}
                    for c in s.criteria
                ],
            }
            for s in t.sections
        ],
    }


@router.get("/subjects/{subject_id}/templates")
def list_templates(subject_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    templates = (
        db.query(GridTemplate)
        .filter_by(subject_id=subject_id, is_active=True)
        .order_by(GridTemplate.created_at)
        .all()
    )
    return [
        {"id": t.id, "name": t.name, "is_builtin": t.is_builtin,
         "final_formula": t.final_formula, "direction": t.direction}
        for t in templates
    ]


@router.get("/templates/{template_id}")
def get_template(template_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = (
        db.query(GridTemplate)
        .options(joinedload(GridTemplate.sections).joinedload(GridSection.criteria))
        .filter_by(id=template_id)
        .first()
    )
    if not t:
        raise HTTPException(404, "Template not found")
    return template_tree(t)
