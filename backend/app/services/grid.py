"""Score formula engine — single source of truth for subtotal/total/final
computations over a GridTemplate and a ScoreEntry.values JSON:

values = {"criteria": {criterion_id: number|null},
          "sections": {section_id: {"bonus": number|null, "st": number|null}}}

Rules (mirrors the legacy hardcoded French grid):
- section subtotal = manual ST override when present,
  otherwise sum(criteria) + bonus
- group total = sum of its sections' subtotals
- final score per template.final_formula:
    avg_groups   → average of group totals
    sum_sections → sum of all section subtotals
    sum_capped   → same sum, capped at template.final_cap
"""


def section_subtotal(section, values: dict) -> float:
    sec_vals = (values.get("sections") or {}).get(section.id) or {}
    if section.allow_st_override and sec_vals.get("st") is not None:
        return float(sec_vals["st"])
    crit_vals = values.get("criteria") or {}
    total = sum(float(crit_vals.get(c.id) or 0) for c in section.criteria)
    if section.has_bonus:
        total += float(sec_vals.get("bonus") or 0)
    return total


def group_totals(template, values: dict) -> dict:
    """Ordered {group_key: total} following section order."""
    out: dict = {}
    for s in template.sections:
        out[s.group_key] = out.get(s.group_key, 0.0) + section_subtotal(s, values)
    return out


def final_score(template, values: dict):
    groups = group_totals(template, values)
    if not groups or not any(groups.values()):
        return None
    if template.final_formula == "avg_groups":
        return round(sum(groups.values()) / len(groups), 2)
    total = sum(groups.values())
    if template.final_formula == "sum_capped" and template.final_cap:
        total = min(total, template.final_cap)
    return round(total, 2)


def has_any_value(values: dict) -> bool:
    if any(v is not None for v in (values.get("criteria") or {}).values()):
        return True
    for sec in (values.get("sections") or {}).values():
        if sec and (sec.get("bonus") is not None or sec.get("st") is not None):
            return True
    return False
