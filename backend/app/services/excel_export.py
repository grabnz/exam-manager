"""
Excel export service — generates the 4-sheet workbook from a saved ExamSession.
The structure mirrors the standalone pdf_to_excel.py script.
"""
import io
from typing import List

# ── Sheet definitions (same as standalone script) ────────────────────────────
EXAM_SHEETS = [
    {
        "name":        "Prod. écrite et écriture",
        "tab_color":   "2E75B6",
        "sub_hdr_bg":  "DAEAF5",
        "crit_hdr_bg": "C6DFEF",
        "data_bg":     "EBF3FB",
        "total_hdr":   "9DC3E6",
        "total_data":  "BDD7EE",
        "subsections": [
            ("Dictée",       ["prod_dictee_c4"]),
            ("Écriture",     ["prod_ecriture_c2", "prod_ecriture_c7"]),
            ("Prod. écrite", ["prod_production_c1", "prod_production_c3",
                              "prod_production_c5", "prod_production_c6"]),
        ],
    },
    {
        "name":        "Lecture",
        "tab_color":   "375623",
        "sub_hdr_bg":  "D9EAD3",
        "crit_hdr_bg": "C6EFCE",
        "data_bg":     "EBF5EB",
        "total_hdr":   "70AD47",
        "total_data":  "A9D18E",
        "subsections": [
            ("Vocale",        ["lect_vocale_c1", "lect_vocale_c5"]),
            ("Compréhension", ["lect_comp_c2", "lect_comp_c3",
                               "lect_comp_c4", "lect_comp_c6"]),
        ],
    },
    {
        "name":        "Com. Orale et Récitation",
        "tab_color":   "843C00",
        "sub_hdr_bg":  "FDE9D9",
        "crit_hdr_bg": "FCE4D6",
        "data_bg":     "FEF0E7",
        "total_hdr":   "ED7D31",
        "total_data":  "F4B183",
        "subsections": [
            ("Récitation", ["com_rec_c1", "com_rec_c2", "com_rec_c3", "com_rec_c4"]),
            ("Com. Orale", ["com_oral_c1", "com_oral_c2", "com_oral_c3",
                            "com_oral_c4", "com_oral_c5", "com_oral_c6"]),
        ],
    },
]


def _crit_label(field: str) -> str:
    """prod_dictee_c4 → 'C4'"""
    return field.split("_")[-1].upper()


def _st_field(fields: list) -> str | None:
    """Derive the _st override field from the first criterion field.
    e.g. ['prod_ecriture_c2', ...] → 'prod_ecriture_st'
    """
    if len(fields) < 2:
        return None
    parts = fields[0].split("_")
    return "_".join(parts[:-1]) + "_st"


def _bonus_field(fields: list) -> str | None:
    """Derive the bonus field name from the first criterion field."""
    if len(fields) < 2:
        return None
    parts = fields[0].split("_")
    return "_".join(parts[:-1]) + "_bonus"


def export_session(session) -> bytes:
    """
    Takes an ExamSession ORM object (with .class_.students and .scores loaded).
    Returns Excel bytes.
    """
    import openpyxl
    from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    # Build student → score lookup
    scores_map = {sc.student_id: sc for sc in session.scores}
    students = session.class_.students  # already ordered by order_index

    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    thin = Side(style="thin", color="BBBBBB")

    def mkfill(h): return PatternFill(fill_type="solid", fgColor=h)
    def mkborder(): return Border(left=thin, right=thin, top=thin, bottom=thin)
    def mkalign(h="center"): return Alignment(horizontal=h, vertical="center", wrap_text=True)

    total_cols = {}   # sheet_name → column letter of Grand Total

    for cfg in EXAM_SHEETS:
        ws = wb.create_sheet(title=cfg["name"])
        ws.sheet_properties.tabColor = cfg["tab_color"]

        # Build column spec: every multi-criterion subsection gets Bonus + S.T.
        subsections = cfg["subsections"]
        col_specs = []
        for sub_label, fields in subsections:
            for f in fields:
                col_specs.append(("crit", sub_label, f))
            if len(fields) >= 2:
                col_specs.append(("bonus", sub_label, None))
                col_specs.append(("subtotal", sub_label, None))
        col_specs.append(("total", None, None))

        NAME_COL  = 1
        DATA_ROW  = 3
        TOTAL_COL = 1 + len(col_specs)

        # subsection merge spans (criteria + subtotal)
        sub_spans = {}
        for ci, (typ, sub, _) in enumerate(col_specs, 2):
            if sub:
                sub_spans.setdefault(sub, [ci, ci])
                sub_spans[sub][1] = ci

        # Row 1: name (r1-r2), subsection headers, total (r1-r2)
        ws.merge_cells(start_row=1, start_column=NAME_COL, end_row=2, end_column=NAME_COL)
        c = ws.cell(row=1, column=NAME_COL, value="التلاميذ")
        c.fill, c.font, c.alignment, c.border = (
            mkfill("D9D9D9"), Font(bold=True, size=11), mkalign(), mkborder()
        )
        for sub, (s, e) in sub_spans.items():
            if s != e:
                ws.merge_cells(start_row=1, start_column=s, end_row=1, end_column=e)
            c = ws.cell(row=1, column=s, value=sub)
            c.fill = mkfill(cfg["sub_hdr_bg"])
            c.font = Font(bold=True, size=10)
            c.alignment, c.border = mkalign(), mkborder()
        ws.merge_cells(start_row=1, start_column=TOTAL_COL, end_row=2, end_column=TOTAL_COL)
        c = ws.cell(row=1, column=TOTAL_COL, value="Total")
        c.fill, c.font, c.alignment, c.border = (
            mkfill(cfg["total_hdr"]), Font(bold=True, size=11), mkalign(), mkborder()
        )

        # Row 2: criterion / Bonus / S.T. labels
        for ci, (typ, sub, field) in enumerate(col_specs, 2):
            if typ == "total":
                break
            lbl = (_crit_label(field) if typ == "crit" else
                   "Bonus"            if typ == "bonus" else "S.T.")
            clr = ("E2EFDA"            if typ == "bonus"    else
                   cfg["sub_hdr_bg"]   if typ == "subtotal" else
                   cfg["crit_hdr_bg"])
            c = ws.cell(row=2, column=ci, value=lbl)
            c.fill, c.font, c.alignment, c.border = (
                mkfill(clr), Font(bold=True, size=9), mkalign(), mkborder()
            )

        # Pre-compute fields list per subsection for _st/_bonus derivation
        fields_by_sub = {sub: flds for sub, flds in subsections}

        # Student rows
        for ri, student in enumerate(students, DATA_ROW):
            sc = scores_map.get(student.id)
            c = ws.cell(row=ri, column=NAME_COL, value=student.full_name)
            c.fill, c.font, c.alignment, c.border = (
                mkfill("FFFFFF"), Font(size=9),
                Alignment(horizontal="right", vertical="center"),
                mkborder()
            )
            crit_totals = {}   # sub_label → sum of raw criteria values
            for ci, (typ, sub, field) in enumerate(col_specs, 2):
                cell = ws.cell(row=ri, column=ci)
                if typ == "crit":
                    val = getattr(sc, field, None) if sc else None
                    cell.value = val
                    cell.fill, cell.alignment, cell.border = (
                        mkfill(cfg["data_bg"]), mkalign(), mkborder()
                    )
                    crit_totals[sub] = crit_totals.get(sub, 0) + (val or 0)
                elif typ == "bonus":
                    bonus_fname = _bonus_field(fields_by_sub.get(sub, []))
                    bonus_val = getattr(sc, bonus_fname, None) if sc and bonus_fname else None
                    cell.value = bonus_val
                    cell.fill, cell.alignment, cell.border = (
                        mkfill("E2EFDA"), mkalign(), mkborder()
                    )
                elif typ == "subtotal":
                    sub_fields = fields_by_sub.get(sub, [])
                    # Use _st direct override if present, else calculate
                    st_fname   = _st_field(sub_fields)
                    direct     = getattr(sc, st_fname, None) if sc and st_fname else None
                    if direct is not None:
                        st_val = direct
                    else:
                        bonus_fname = _bonus_field(sub_fields)
                        bonus_val   = getattr(sc, bonus_fname, None) if sc and bonus_fname else None
                        st_val = crit_totals.get(sub, 0) + (bonus_val or 0)
                    cell.value = st_val or None
                    cell.fill = mkfill(cfg["crit_hdr_bg"])
                    cell.font = Font(bold=True, size=9)
                    cell.alignment, cell.border = mkalign(), mkborder()
                else:  # total
                    # Sum: for each subsection use its resolved subtotal
                    total_val = 0.0
                    for sub_l, sub_flds in subsections:
                        if len(sub_flds) >= 2:
                            st_fn = _st_field(sub_flds)
                            direct_v = getattr(sc, st_fn, None) if sc and st_fn else None
                            if direct_v is not None:
                                total_val += direct_v
                            else:
                                bonus_fn  = _bonus_field(sub_flds)
                                bonus_v   = getattr(sc, bonus_fn, None) if sc and bonus_fn else None
                                total_val += crit_totals.get(sub_l, 0) + (bonus_v or 0)
                        else:
                            total_val += crit_totals.get(sub_l, 0)
                    cell.value = total_val or None
                    cell.fill = mkfill(cfg["total_data"])
                    cell.font = Font(bold=True, size=10)
                    cell.alignment, cell.border = mkalign(), mkborder()

        # Column widths
        ws.column_dimensions[get_column_letter(NAME_COL)].width = 30
        for ci, (typ, _, __) in enumerate(col_specs, 2):
            ws.column_dimensions[get_column_letter(ci)].width = (
                10 if typ == "total" else 9 if typ in ("subtotal", "bonus") else 6.5
            )
        ws.row_dimensions[1].height = 26
        ws.row_dimensions[2].height = 22
        for ri in range(DATA_ROW, DATA_ROW + len(students)):
            ws.row_dimensions[ri].height = 18
        ws.freeze_panes = ws["B3"]
        total_cols[cfg["name"]] = get_column_letter(TOTAL_COL)

    # ── Note Finale sheet ────────────────────────────────────────────────────
    ws = wb.create_sheet(title="Note Finale")
    ws.sheet_properties.tabColor = "FFD966"

    sheet_names = [s["name"] for s in EXAM_SHEETS]
    DATA_ROW_F  = 2
    NAME_COL_F  = 1
    EXAM_COLS_F = list(range(2, 2 + len(sheet_names)))   # cols 2,3,4
    FINAL_COL_F = EXAM_COLS_F[-1] + 1                    # col 5

    COLORS_MAP = {
        "Prod. écrite et écriture": ("C6DFEF", "EBF3FB"),
        "Lecture":                  ("C6EFCE", "EBF5EB"),
        "Com. Orale et Récitation": ("FCE4D6", "FEF0E7"),
    }

    headers_f = (
        [(NAME_COL_F, "التلاميذ", "D9D9D9")] +
        [(ci, n, COLORS_MAP[n][0]) for ci, n in zip(EXAM_COLS_F, sheet_names)] +
        [(FINAL_COL_F, "Moyenne / Note Finale", "FFE699")]
    )
    for ci, lbl, clr in headers_f:
        c = ws.cell(row=1, column=ci, value=lbl)
        c.fill, c.font, c.alignment, c.border = (
            mkfill(clr), Font(bold=True, size=10), mkalign(), mkborder()
        )

    # Compute resolved totals per exam (accounts for _st overrides in each sheet)
    def _exam_total(sc, cfg):
        total = 0.0
        for sub_label, sub_flds in cfg["subsections"]:
            if len(sub_flds) >= 2:
                st_fn    = _st_field(sub_flds)
                direct   = getattr(sc, st_fn, None) if sc and st_fn else None
                if direct is not None:
                    total += direct
                    continue
                bonus_fn = _bonus_field(sub_flds)
                bonus_v  = getattr(sc, bonus_fn, None) if sc and bonus_fn else None
                total += sum(getattr(sc, f, 0) or 0 for f in sub_flds) + (bonus_v or 0)
            else:
                total += sum(getattr(sc, f, 0) or 0 for f in sub_flds)
        return total

    for ri, student in enumerate(students, DATA_ROW_F):
        sc = scores_map.get(student.id)
        c = ws.cell(row=ri, column=NAME_COL_F, value=student.full_name)
        c.fill, c.font, c.alignment, c.border = (
            mkfill("FFFFFF"), Font(size=9),
            Alignment(horizontal="right", vertical="center"),
            mkborder()
        )
        section_vals = []
        for ci, cfg in zip(EXAM_COLS_F, EXAM_SHEETS):
            val = _exam_total(sc, cfg)
            section_vals.append(val)
            c = ws.cell(row=ri, column=ci, value=val or None)
            c.fill, c.alignment, c.border = (
                mkfill(COLORS_MAP[cfg["name"]][1]), mkalign(), mkborder()
            )

        # Note Finale = average of 3 exam totals
        average = sum(section_vals) / 3 if any(section_vals) else None
        c = ws.cell(row=ri, column=FINAL_COL_F, value=round(average, 2) if average else None)
        c.fill, c.font, c.alignment, c.border = (
            mkfill("FFF2CC"), Font(bold=True, size=11), mkalign(), mkborder()
        )

    ws.column_dimensions["A"].width = 30
    ws.column_dimensions[get_column_letter(EXAM_COLS_F[0])].width = 20
    ws.column_dimensions[get_column_letter(EXAM_COLS_F[1])].width = 12
    ws.column_dimensions[get_column_letter(EXAM_COLS_F[2])].width = 20
    ws.column_dimensions[get_column_letter(FINAL_COL_F)].width   = 18
    ws.row_dimensions[1].height = 40
    for ri in range(DATA_ROW_F, DATA_ROW_F + len(students)):
        ws.row_dimensions[ri].height = 18
    ws.freeze_panes = ws["B2"]

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
