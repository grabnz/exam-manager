from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import GridTemplate, GridSection, GridCriterion, ExamSession, Subject, User
from ..schemas import TemplateUpdate
from ..auth import get_current_user, require_admin

router = APIRouter(prefix="/api", tags=["templates"])


def _slug(label: str, index: int) -> str:
    return f"g{index}"


def _apply_spec(db: Session, tpl: GridTemplate, body: TemplateUpdate):
    """Replace the template's tree from the spec. Only safe on templates not
    referenced by any session (criterion ids change)."""
    if not body.sections or not any(s.criteria for s in body.sections):
        raise HTTPException(400, "الشبكة يجب أن تحتوي على معيار واحد على الأقل")
    if body.final_formula not in ("avg_groups", "sum_sections", "sum_capped"):
        raise HTTPException(400, "Invalid formula")
    tpl.name = body.name.strip() or tpl.name
    tpl.final_formula = body.final_formula
    tpl.final_cap = body.final_cap
    tpl.direction = body.direction if body.direction in ("rtl", "ltr") else "rtl"
    for old in list(tpl.sections):
        db.delete(old)
    db.flush()
    group_keys: dict = {}
    for si, s in enumerate(body.sections):
        gl = s.group_label.strip() or s.label.strip()
        if gl not in group_keys:
            group_keys[gl] = _slug(gl, len(group_keys))
        section = GridSection(
            template_id=tpl.id,
            group_key=group_keys[gl],
            group_label=gl,
            label=s.label.strip(),
            order_index=si,
            has_bonus=s.has_bonus,
            allow_st_override=s.allow_st_override,
            color_key=s.color_key,
        )
        db.add(section)
        db.flush()
        for ci, c in enumerate(s.criteria):
            db.add(GridCriterion(
                section_id=section.id, label=c.label.strip() or f"م{ci+1}",
                max_score=c.max_score, order_index=ci,
            ))


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


def _get_template(db: Session, template_id: str) -> GridTemplate:
    t = db.query(GridTemplate).filter_by(id=template_id).first()
    if not t:
        raise HTTPException(404, "Template not found")
    return t


def _session_count(db: Session, template_id: str) -> int:
    return db.query(ExamSession).filter_by(template_id=template_id).count()


@router.post("/templates/{template_id}/clone")
def clone_template(template_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    src = _get_template(db, template_id)
    copy = GridTemplate(
        code=None,
        subject_id=src.subject_id,
        name=f"{src.name} (نسخة)",
        final_formula=src.final_formula,
        final_cap=src.final_cap,
        is_builtin=False,
        direction=src.direction,
    )
    db.add(copy)
    db.flush()
    for s in src.sections:
        section = GridSection(
            template_id=copy.id, code=None,
            group_key=s.group_key, group_label=s.group_label, label=s.label,
            order_index=s.order_index, has_bonus=s.has_bonus,
            allow_st_override=s.allow_st_override, color_key=s.color_key,
        )
        db.add(section)
        db.flush()
        for c in s.criteria:
            db.add(GridCriterion(
                section_id=section.id, code=None, label=c.label,
                max_score=c.max_score, order_index=c.order_index,
            ))
    db.commit()
    return {"id": copy.id, "name": copy.name}


@router.post("/subjects/{subject_id}/templates")
def create_template(subject_id: str, body: TemplateUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if not db.query(Subject).filter_by(id=subject_id).first():
        raise HTTPException(404, "Subject not found")
    tpl = GridTemplate(subject_id=subject_id, name=body.name.strip() or "شبكة جديدة", is_builtin=False)
    db.add(tpl)
    db.flush()
    _apply_spec(db, tpl, body)
    db.commit()
    return {"id": tpl.id, "name": tpl.name}


@router.put("/templates/{template_id}")
def update_template(template_id: str, body: TemplateUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    tpl = _get_template(db, template_id)
    if tpl.is_builtin:
        raise HTTPException(400, "الشبكات الجاهزة غير قابلة للتعديل — انسخوها أولاً")
    used = _session_count(db, template_id)
    if used:
        raise HTTPException(400, f"هذه الشبكة مستعملة في {used} جلسة — انسخوها وعدّلوا النسخة")
    _apply_spec(db, tpl, body)
    db.commit()
    return {"ok": True}


@router.delete("/templates/{template_id}")
def delete_template(template_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    tpl = _get_template(db, template_id)
    if tpl.is_builtin:
        raise HTTPException(400, "لا يمكن حذف الشبكات الجاهزة")
    if _session_count(db, template_id):
        raise HTTPException(400, "الشبكة مستعملة في جلسات — لا يمكن حذفها")
    db.delete(tpl)
    db.commit()
    return {"ok": True}
