const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface TrimesterStatus {
  has_taqyim: boolean
  imtihan_exists: boolean
  imtihan_finalized: boolean
}
export interface ClassSummary {
  id: string; name: string; teacher?: string
  student_count: number; session_count: number; has_scores: boolean
  trimester_status: Record<string, TrimesterStatus>
}
export interface YearGroup { label: string; classes: ClassSummary[] }

export interface Student { id: string; full_name: string; order_index: number }
export interface SessionSummary {
  id: string; trimester: number; exam_type: string
  has_scores: boolean; is_finalized: boolean
}

export interface TeacherProfile { name: string; grade: string }
export interface ClassDetail {
  id: string; name: string; teacher?: string; school_year: string
  students: Student[]; sessions: SessionSummary[]
}

export interface SessionInfo {
  id: string; trimester: number; exam_type: string; is_finalized: boolean
  class_id: string; class_name: string; school_year: string; teacher?: string
}

export type ScoreRow = {
  student_id: string; student_name: string; order_index: number
  prod_dictee_c4?: number | null
  prod_ecriture_c2?: number | null; prod_ecriture_c7?: number | null; prod_ecriture_bonus?: number | null; prod_ecriture_st?: number | null
  prod_production_c1?: number | null; prod_production_c3?: number | null
  prod_production_c5?: number | null; prod_production_c6?: number | null; prod_production_bonus?: number | null; prod_production_st?: number | null
  lect_vocale_c1?: number | null; lect_vocale_c5?: number | null; lect_vocale_bonus?: number | null; lect_vocale_st?: number | null
  lect_comp_c2?: number | null; lect_comp_c3?: number | null
  lect_comp_c4?: number | null; lect_comp_c6?: number | null; lect_comp_bonus?: number | null; lect_comp_st?: number | null
  com_rec_c1?: number | null; com_rec_c2?: number | null
  com_rec_c3?: number | null; com_rec_c4?: number | null; com_rec_bonus?: number | null; com_rec_st?: number | null
  com_oral_c1?: number | null; com_oral_c2?: number | null
  com_oral_c3?: number | null; com_oral_c4?: number | null
  com_oral_c5?: number | null; com_oral_c6?: number | null; com_oral_bonus?: number | null; com_oral_st?: number | null
}

// ── API calls ──────────────────────────────────────────────────────────────

export const api = {
  classes: {
    list:   ()           => req<YearGroup[]>('/classes'),
    get:    (id: string) => req<ClassDetail>(`/classes/${id}`),
    delete: (id: string) => req<void>(`/classes/${id}`, { method: 'DELETE' }),
    upload: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return req<{ id: string; name: string; school_year: string; student_count: number; session_id: string | null }>(
        '/classes/upload', { method: 'POST', body: fd }
      )
    },
  },
  sessions: {
    get:    (id: string) => req<SessionInfo>(`/sessions/${id}`),
    create: (classId: string, trimester: number, examType: string) =>
      req<{ id: string }>(`/classes/${classId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trimester, exam_type: examType }),
      }),
    delete:   (id: string) => req<void>(`/sessions/${id}`, { method: 'DELETE' }),
    finalize: (id: string, finalized: boolean) =>
      req<{ ok: boolean; is_finalized: boolean }>(`/sessions/${id}/finalize`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finalized }),
      }),
  },
  profile: {
    get: () => req<TeacherProfile>('/profile'),
    save: (data: TeacherProfile) => req<TeacherProfile>('/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  },
  scores: {
    get:    (sessionId: string) => req<ScoreRow[]>(`/sessions/${sessionId}/scores`),
    save:   (sessionId: string, scores: Omit<ScoreRow, 'student_name' | 'order_index'>[]) =>
      req<{ ok: boolean }>(`/sessions/${sessionId}/scores`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores }),
      }),
    downloadExcel: async (sessionId: string): Promise<string | null> => {
      const res = await fetch(`${BASE}/sessions/${sessionId}/export`)
      if (!res.ok) return await res.text().catch(() => `Erreur ${res.status}`)
      const blob = await res.blob()
      const cd   = res.headers.get('Content-Disposition') ?? ''
      const name = cd.match(/filename\*?=(?:UTF-8'')?([^;"\n]+)/i)?.[1]
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = decodeURIComponent(name ?? 'scores.xlsx')
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      return null  // null = success
    },
  },
}
