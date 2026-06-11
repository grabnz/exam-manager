"""Official documents (الوثائق الرسمية): uploaded by the director, viewable
and downloadable by every authenticated user. Files live in the database —
serverless has no persistent filesystem. Size capped (Vercel body limit)."""
import urllib.parse

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.orm import Session, defer

from ..database import get_db
from ..models import OfficialDocument, User
from ..auth import get_current_user, require_admin

router = APIRouter(prefix="/api/documents", tags=["documents"])

MAX_SIZE = 4 * 1024 * 1024  # Vercel serverless request body limit ≈ 4.5 MB


def _out(d: OfficialDocument) -> dict:
    return {
        "id":           d.id,
        "title":        d.title,
        "filename":     d.filename,
        "content_type": d.content_type,
        "size":         d.size,
        "by":           (d.uploader.full_name or d.uploader.username) if d.uploader else None,
        "created_at":   d.created_at.isoformat() if d.created_at else None,
    }


@router.get("")
def list_documents(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    docs = (
        db.query(OfficialDocument)
        .options(defer(OfficialDocument.data))   # never load blobs for the list
        .order_by(OfficialDocument.created_at.desc())
        .all()
    )
    return [_out(d) for d in docs]


@router.post("")
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(""),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    content = await file.read()
    if not content:
        raise HTTPException(400, "ملف فارغ")
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "حجم الملف يتجاوز 4 ميغابايت")
    doc = OfficialDocument(
        title=title.strip() or (file.filename or "وثيقة"),
        filename=file.filename or "document",
        content_type=file.content_type or "application/octet-stream",
        size=len(content),
        data=content,
        uploaded_by=admin.id,
    )
    db.add(doc)
    db.commit()
    return _out(doc)


@router.get("/{doc_id}/download")
def download_document(doc_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    d = db.query(OfficialDocument).filter_by(id=doc_id).first()
    if not d:
        raise HTTPException(404)
    safe_name = urllib.parse.quote(d.filename)
    return Response(
        content=d.data,
        media_type=d.content_type,
        headers={
            "Content-Disposition": f"inline; filename=\"document\"; filename*=UTF-8''{safe_name}",
        },
    )


@router.delete("/{doc_id}")
def delete_document(doc_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    d = db.query(OfficialDocument).filter_by(id=doc_id).first()
    if not d:
        raise HTTPException(404)
    db.delete(d)
    db.commit()
    return {"ok": True}
