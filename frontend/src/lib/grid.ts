// Score formula engine — TS mirror of backend/app/services/grid.py.
// Single source of truth for ScoreEntry and PrintFinale.

export interface CriterionDef {
  id: string; code?: string | null; label: string
  max_score?: number | null; order_index: number
}
export interface SectionDef {
  id: string; code?: string | null
  group_key: string; group_label: string; label: string
  order_index: number; has_bonus: boolean; allow_st_override: boolean
  color_key?: string | null
  criteria: CriterionDef[]
}
export interface TemplateDef {
  id: string; code?: string | null; subject_id: string; name: string
  final_formula: 'avg_groups' | 'sum_sections' | 'sum_capped'
  final_cap?: number | null
  is_builtin: boolean
  direction: 'rtl' | 'ltr'
  sections: SectionDef[]
}

export interface SectionValues { bonus: number | null; st: number | null }
export interface StudentValues {
  criteria: Record<string, number | null>
  sections: Record<string, SectionValues>
}

export interface GroupDef { key: string; label: string; sections: SectionDef[] }

export function groups(tpl: TemplateDef): GroupDef[] {
  const out: GroupDef[] = []
  const seen = new Map<string, GroupDef>()
  for (const s of tpl.sections) {
    let g = seen.get(s.group_key)
    if (!g) {
      g = { key: s.group_key, label: s.group_label, sections: [] }
      seen.set(s.group_key, g)
      out.push(g)
    }
    g.sections.push(s)
  }
  return out
}

export function sectionSubtotal(sec: SectionDef, vals: StudentValues): number {
  const sv = vals.sections[sec.id]
  if (sec.allow_st_override && sv?.st != null) return sv.st
  let total = sec.criteria.reduce((s, c) => s + (vals.criteria[c.id] ?? 0), 0)
  if (sec.has_bonus) total += sv?.bonus ?? 0
  return total
}

export function isDirectSt(sec: SectionDef, vals: StudentValues): boolean {
  return sec.allow_st_override && vals.sections[sec.id]?.st != null
}

export function groupTotal(g: GroupDef, vals: StudentValues): number {
  return g.sections.reduce((s, sec) => s + sectionSubtotal(sec, vals), 0)
}

export function finalFromGroupTotals(tpl: TemplateDef, totals: number[]): number | null {
  if (totals.length === 0 || !totals.some(t => t > 0)) return null
  if (tpl.final_formula === 'avg_groups') {
    return Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100
  }
  let sum = totals.reduce((a, b) => a + b, 0)
  if (tpl.final_formula === 'sum_capped' && tpl.final_cap) sum = Math.min(sum, tpl.final_cap)
  return Math.round(sum * 100) / 100
}

export function finalScore(tpl: TemplateDef, vals: StudentValues): number | null {
  return finalFromGroupTotals(tpl, groups(tpl).map(g => groupTotal(g, vals)))
}

export function emptyValues(): StudentValues {
  return { criteria: {}, sections: {} }
}
