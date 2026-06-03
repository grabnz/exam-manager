import re
import io
from typing import List, Dict, Optional

# Arabic text including presentation forms (visual-order PDFs use U+FB50-U+FEFF)
ARABIC_RE   = re.compile(r"[؀-߿ﭐ-﷿ﹰ-﻿]")
EMPTY_SCORE = {"", "-", "--", "--.--", "--,--", "x", "X", "None", "none"}


def _fix_arabic_name(name: str) -> str:
    """Convert visual-order presentation-form Arabic to proper logical-order Unicode.

    Reverse FIRST (ligatures like ﻻ are still single glyphs), THEN normalize.
    """
    import unicodedata
    name = name.replace("ـ", "")
    name = name[::-1]
    name = unicodedata.normalize("NFKC", name)
    return " ".join(name.split())


def parse_pdf(pdf_bytes: bytes) -> Dict:
    """
    Parse the school website PDF export.
    Returns:
      {
        students: [str, ...],          # in original website order
        meta: {class_name, trimester, exam_type, school_year, teacher}
      }
    """
    import pdfplumber

    students: List[str] = []
    meta: Dict[str, Optional[str | int]] = {
        "class_name":  None,
        "trimester":   None,
        "exam_type":   None,
        "school_year": None,
        "teacher":     None,
    }

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        full_text = ""
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            full_text += page_text + "\n"

            for table in page.extract_tables():
                for row in table:
                    if not row or len(row) < 2:
                        continue

                    # Student rows: name in last column, all score columns empty
                    name_cell   = row[-1]
                    score_cells = row[:-1]

                    if not name_cell:
                        continue

                    name = str(name_cell).strip()

                    if not all(
                        not c or str(c).strip() in EMPTY_SCORE
                        for c in score_cells
                    ):
                        continue

                    if not ARABIC_RE.search(name) or len(name) < 3:
                        continue

                    name = _fix_arabic_name(name)
                    if name not in students:
                        students.append(name)

        _extract_meta(full_text, meta)

    return {"students": students, "meta": meta}


def _extract_meta(text: str, meta: dict):
    # School year: "2025 - 2026" or "2025-2026"
    m = re.search(r"(\d{4})\s*[-–]\s*(\d{4})", text)
    if m:
        meta["school_year"] = f"{m.group(1)}-{m.group(2)}"

    # Trimester: "الثلاثي 1" / "الثلاثي 2" / "الثلاثي 3"
    m = re.search(r"الثلاثي\s*(\d)", text)
    if m:
        meta["trimester"] = int(m.group(1))

    # Exam type
    if "امتحان" in text:
        meta["exam_type"] = "امتحان"
    elif "فرض" in text:
        meta["exam_type"] = "فرض"

    # Teacher name after "المربي :"
    m = re.search(r"المربي\s*[:：]\s*([^\n(]+)", text)
    if m:
        meta["teacher"] = m.group(1).strip()

    # Class name from "القسم : الرابعة أ" pattern (most reliable)
    m = re.search(r"القسم\s*[:：]\s*([^\n\-–]+)", text)
    if m:
        meta["class_name"] = m.group(1).strip()
    else:
        # Fallback: look for grade word + letter
        m = re.search(
            r"(الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة)\s*(أ|ب|ج|د|ه|و)",
            text,
        )
        if m:
            meta["class_name"] = f"{m.group(1)} {m.group(2)}"
