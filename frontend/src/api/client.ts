import type { TemplateDef, StudentValues, SectionValues } from '../lib/grid'

const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

export class ApiError extends Error {
  status: number
  body: any
  constructor(status: number, message: string, body?: any) {
    super(message)
    this.status = status
    this.body = body
  }
}

const TOKEN_KEY = 'em_token'
const USER_KEY  = 'em_user'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
export function storeAuth(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}
export function storeUser(user: AuthUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { ...authHeaders(), ...(opts?.headers ?? {}) },
  })
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    clearAuth()
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
    throw new Error('غير مسجَّل للدخول')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new ApiError(res.status, err.detail || `HTTP ${res.status}`, err)
  }
  return res.json()
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string; username: string; full_name: string; grade: string; subject: string
  role: 'admin' | 'teacher'
  must_change_password: boolean
}

export interface UserRow extends AuthUser {
  is_active: boolean
  class_count: number
}

export interface TrimesterStatus {
  has_taqyim: boolean
  imtihan_exists: boolean
  imtihan_finalized: boolean
}
export interface Subject {
  id: string; code: string; name_ar: string; name_fr?: string | null
  order_index: number; is_active: boolean
}
export interface ClassSubjectStatus {
  subject_id: string; code: string; name: string
  session_count: number
  trimester_status: Record<string, TrimesterStatus>
  teachers: string[]
}
export interface ClassSummary {
  id: string; name: string; level?: string | null; teacher?: string
  student_count: number; session_count: number
  subjects: ClassSubjectStatus[]
}
export interface YearGroup { label: string; classes: ClassSummary[] }

export interface Student { id: string; full_name: string; order_index: number }
export interface SessionSummary {
  id: string; subject_id?: string | null; trimester: number; exam_type: string
  has_scores: boolean; is_finalized: boolean
}
export interface AssignmentRow {
  id: string; teacher_id: string; teacher_name: string
  class_id: string; class_name: string; school_year: string
  subject_id: string; subject_name: string
}
export interface SettingsData { school_name: string; active_year: string; region: string }

// ── Calendar & documents ─────────────────────────────────────────────────────
export interface CalendarEvent {
  id: string; title: string; date: string; time: string | null
  note: string; color: string; is_school_wide: boolean; is_mine: boolean
  by: string | null
}
export interface DocumentRow {
  id: string; title: string; filename: string; content_type: string
  size: number; by: string | null; created_at: string | null
}

// ── Dashboard stats ──────────────────────────────────────────────────────────
export interface PairStats {
  class_id: string; class_name: string; level?: string | null; school_year: string
  subject_id: string; subject_code: string; subject_name: string
  student_count: number; session_count: number
  trimester_status: Record<string, TrimesterStatus>
  finalized_trimesters: number
  avg_final: number | null
  last_session: { id: string; trimester: number; exam_type: string } | null
}
export interface TeacherStats {
  role: 'teacher'
  totals: { classes: number; subjects: number; students: number; completion_pct: number }
  cards: PairStats[]
}
export interface DirectorStats {
  role: 'director'
  totals: { teachers: number; classes: number; students: number; sessions: number; completion_pct: number }
  alerts: { unassigned_classes: { id: string; name: string }[] }
  subject_averages: { subject_name: string; avg: number | null }[]
  activity: {
    session_id: string; class_name: string; subject_name: string
    exam_type: string; trimester: number; is_finalized: boolean
    by: string | null; at: string
  }[]
  pairs: PairStats[]
}
export type DashboardStats = TeacherStats | DirectorStats

export interface TeacherProfile { name: string; grade: string; subject: string }
export interface ClassDetail {
  id: string; name: string; level?: string | null; teacher?: string; school_year: string
  is_admin: boolean
  my_subjects: { id: string; code: string; name: string }[]
  assignments: { id: string; teacher_id: string; teacher_name: string; subject_id: string; subject_name: string }[]
  students: Student[]; sessions: SessionSummary[]
}

export interface SessionInfo {
  id: string; trimester: number; exam_type: string; is_finalized: boolean
  class_id: string; class_name: string; school_year: string; teacher?: string
  subject_id?: string | null; subject_name?: string | null; template_id?: string | null
  is_admin: boolean
}

export type { TemplateDef, StudentValues, SectionValues } from '../lib/grid'

export interface ScoreRow {
  student_id: string; student_name: string; order_index: number
  criteria: Record<string, number | null>
  sections: Record<string, SectionValues>
  final_score: number | null
  updated_at: string | null
}

export interface ScoreSaveItem {
  student_id: string
  criteria: Record<string, number | null>
  sections: Record<string, SectionValues>
}

// Director template editor payload
export interface TemplateSpec {
  name: string
  final_formula: 'avg_groups' | 'sum_sections' | 'sum_capped'
  final_cap?: number | null
  direction: 'rtl' | 'ltr'
  sections: {
    group_label: string
    label: string
    has_bonus: boolean
    allow_st_override: boolean
    color_key?: string | null
    criteria: { label: string; max_score?: number | null }[]
  }[]
}

// ── API calls ──────────────────────────────────────────────────────────────

export const api = {
  auth: {
    login: (username: string, password: string) =>
      req<{ token: string; user: AuthUser }>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }),
    me: () => req<AuthUser>('/auth/me'),
    changePassword: (currentPassword: string, newPassword: string) =>
      req<{ ok: boolean; user: AuthUser }>('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      }),
  },
  users: {
    list: () => req<UserRow[]>('/users'),
    create: (data: { username: string; password: string; full_name: string; grade?: string; role?: string }) =>
      req<UserRow>('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { full_name?: string; grade?: string; is_active?: boolean }) =>
      req<UserRow>(`/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    resetPassword: (id: string, password: string) =>
      req<{ ok: boolean }>(`/users/${id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      }),
    delete: (id: string) => req<{ ok: boolean }>(`/users/${id}`, { method: 'DELETE' }),
  },
  subjects: {
    list: () => req<Subject[]>('/subjects'),
  },
  templates: {
    listForSubject: (subjectId: string) =>
      req<{ id: string; name: string; is_builtin: boolean; final_formula: string; direction: string }[]>(
        `/subjects/${subjectId}/templates`),
    get: (id: string) => req<TemplateDef>(`/templates/${id}`),
    clone: (id: string) => req<{ id: string; name: string }>(`/templates/${id}/clone`, { method: 'POST' }),
    update: (id: string, spec: TemplateSpec) =>
      req<{ ok: boolean }>(`/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec),
      }),
    delete: (id: string) => req<{ ok: boolean }>(`/templates/${id}`, { method: 'DELETE' }),
  },
  assignments: {
    list: () => req<AssignmentRow[]>('/assignments'),
    create: (teacherId: string, classId: string, subjectIds: string[]) =>
      req<AssignmentRow[]>('/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: teacherId, class_id: classId, subject_ids: subjectIds }),
      }),
    delete: (id: string) => req<{ ok: boolean }>(`/assignments/${id}`, { method: 'DELETE' }),
  },
  stats: {
    get: () => req<DashboardStats>('/stats'),
  },
  events: {
    list: (start: string, end: string) =>
      req<CalendarEvent[]>(`/events?start=${start}&end=${end}`),
    create: (data: { title: string; date: string; time?: string | null; note?: string; color?: string; is_school_wide?: boolean }) =>
      req<CalendarEvent>('/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    delete: (id: string) => req<{ ok: boolean }>(`/events/${id}`, { method: 'DELETE' }),
  },
  documents: {
    list: () => req<DocumentRow[]>('/documents'),
    upload: (file: File, title: string) => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', title)
      return req<DocumentRow>('/documents', { method: 'POST', body: fd })
    },
    delete: (id: string) => req<{ ok: boolean }>(`/documents/${id}`, { method: 'DELETE' }),
    download: async (id: string, filename: string): Promise<string | null> => {
      const res = await fetch(`${BASE}/documents/${id}/download`, { headers: authHeaders() })
      if (!res.ok) return `Erreur ${res.status}`
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      return null
    },
  },
  settings: {
    get: () => req<SettingsData>('/settings'),
    save: (data: SettingsData) => req<SettingsData>('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  },
  classes: {
    list:   ()           => req<YearGroup[]>('/classes'),
    get:    (id: string) => req<ClassDetail>(`/classes/${id}`),
    create: (name: string, schoolYear: string, level?: string) =>
      req<{ id: string; name: string; school_year: string }>('/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, school_year: schoolYear, level: level || null }),
      }),
    rename: (id: string, name: string) =>
      req<{ ok: boolean; name: string }>(`/classes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    delete: (id: string) => req<void>(`/classes/${id}`, { method: 'DELETE' }),
    upload: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return req<{ id: string; name: string; school_year: string; student_count: number; session_id: string | null }>(
        '/classes/upload', { method: 'POST', body: fd }
      )
    },
  },
  students: {
    add: (classId: string, fullName: string) =>
      req<Student>(`/classes/${classId}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName }),
      }),
    rename: (id: string, fullName: string) =>
      req<{ ok: boolean }>(`/students/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName }),
      }),
    delete: (id: string) => req<{ ok: boolean }>(`/students/${id}`, { method: 'DELETE' }),
  },
  sessions: {
    get:    (id: string) => req<SessionInfo>(`/sessions/${id}`),
    create: (classId: string, trimester: number, examType: string, subjectId?: string) =>
      req<{ id: string }>(`/classes/${classId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trimester, exam_type: examType, subject_id: subjectId || null }),
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
    save:   (sessionId: string, scores: ScoreSaveItem[], opts?: { baseUpdatedAt?: string | null; force?: boolean }) =>
      req<{ ok: boolean; saved_at: string }>(`/sessions/${sessionId}/scores`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scores,
          base_updated_at: opts?.baseUpdatedAt ?? null,
          force: opts?.force ?? false,
        }),
      }),
    downloadExcel: async (sessionId: string): Promise<string | null> => {
      const res = await fetch(`${BASE}/sessions/${sessionId}/export`, { headers: authHeaders() })
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
