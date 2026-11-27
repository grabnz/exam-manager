import type { TemplateDef, StudentValues, SectionValues, StudentStatus } from '../lib/grid'

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
  max_weekly_hours: number
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
export interface TimetableSlot {
  id: string
  teacher_id: string; teacher_name: string | null
  class_id: string | null; class_name: string | null
  subject_id: string | null; subject_code: string | null; subject_name: string | null
  day: number            // ISO 1=Monday … 7=Sunday
  start: string; end: string
  room: string; label: string
  is_pinned?: boolean
}
export interface RoomRow {
  id: string; name: string; room_type: 'standard' | 'computer' | 'yard' | 'multipurpose'; is_active: boolean
}
export interface CurriculumRow {
  id: string; level: string; subject_id: string; subject_code: string; subject_name: string
  weekly_hours: number; block_size: number; cognitive_weight: 'heavy' | 'light'; room_type: string
}
export interface GeneratedSlot {
  teacher_id: string; teacher_name: string
  class_id: string | null; class_name: string | null
  subject_id: string | null; subject_code: string | null; subject_name: string | null
  day: number; start: string; end: string; room: string; label: string; is_pinned: boolean
}
export interface ScheduleResult {
  slots: GeneratedSlot[]
  quality_score: number
  teacher_loads: {
    teacher_id: string; teacher_name: string
    max_weekly_hours: number; assigned_hours: number; scheduled_hours: number
    gap_hours: number; saturday_hours: number
  }[]
  warnings: string[]
  unplaced: { class_name: string; subject_name: string; teacher_name: string; hours: number; reason: string }[]
}
export interface ScoreBucket { label: string; count: number }

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
  distribution: ScoreBucket[]
  totals: { classes: number; subjects: number; students: number; completion_pct: number }
  cards: PairStats[]
}
export interface DirectorStats {
  role: 'director'
  distribution: ScoreBucket[]
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

export type { TemplateDef, StudentValues, SectionValues, StudentStatus } from '../lib/grid'

export interface ScoreRow {
  student_id: string; student_name: string; order_index: number
  criteria: Record<string, number | null>
  sections: Record<string, SectionValues>
  status?: StudentStatus
  final_score: number | null
  updated_at: string | null
}

export interface ScoreSaveItem {
  student_id: string
  criteria: Record<string, number | null>
  sections: Record<string, SectionValues>
  status?: StudentStatus
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

export interface PDFPreviewResult {
  students: string[]
  meta: {
    class_name: string
    school_year: string
    teacher: string
    trimester: number | null
    exam_type: string
  }
}

export interface SynthesisData {
  class_id: string
  class_name: string
  level?: string | null
  school_year: string
  trimester: number
  subjects: {
    id: string
    code: string
    name: string
    sessions: {
      id: string
      exam_type: string
      is_finalized: boolean
      scores: Record<string, number | null>
    }[]
  }[]
  students: {
    student_id: string
    student_name: string
    order_index: number
    scores: Record<string, number | null>
    statuses: Record<string, string>
    average: number | null
    rank: number | null
  }[]
}

export interface BulkCreatedUser {
  id: string
  username: string
  full_name: string
  password: string
  role: string
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
    create: (data: { username: string; password: string; full_name: string; grade?: string; role?: string; max_weekly_hours?: number }) =>
      req<UserRow>('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    bulkCreate: (users: { full_name: string; username?: string; password?: string; role?: string }[]) =>
      req<BulkCreatedUser[]>('/users/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users }),
      }),
    update: (id: string, data: { full_name?: string; grade?: string; is_active?: boolean; max_weekly_hours?: number }) =>
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
  timetable: {
    list: () => req<TimetableSlot[]>('/timetable'),
    create: (data: {
      teacher_id: string; class_id?: string | null; subject_id?: string | null
      day: number; start: string; end: string; room?: string; label?: string
    }) =>
      req<TimetableSlot>('/timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    togglePin: (id: string) => req<{ ok: boolean; is_pinned: boolean }>(`/timetable/${id}/pin`, { method: 'PATCH' }),
    delete: (id: string) => req<{ ok: boolean }>(`/timetable/${id}`, { method: 'DELETE' }),
    generate: (cfg?: { days?: number[]; morning_slots?: string[]; afternoon_slots?: string[] }) =>
      req<ScheduleResult>('/timetable/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg ?? {}),
      }),
    commit: (slots: GeneratedSlot[]) =>
      req<{ ok: boolean }>('/timetable/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots }),
      }),
  },
  rooms: {
    list: () => req<RoomRow[]>('/rooms'),
    create: (name: string, roomType = 'standard') =>
      req<RoomRow>('/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, room_type: roomType }),
      }),
    delete: (id: string) => req<{ ok: boolean }>(`/rooms/${id}`, { method: 'DELETE' }),
  },
  curriculum: {
    list: () => req<CurriculumRow[]>('/curriculum'),
    save: (items: { level: string; subject_id: string; weekly_hours: number; block_size?: number; cognitive_weight?: string; room_type?: string }[]) =>
      req<{ ok: boolean }>('/curriculum', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      }),
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
    parsePdf: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return req<PDFPreviewResult>('/classes/parse-pdf', { method: 'POST', body: fd })
    },
    clone: (id: string, data: { name?: string; school_year: string; level?: string | null; copy_students?: boolean }) =>
      req<{ id: string; name: string; school_year: string; student_count: number }>(`/classes/${id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    synthesis: (id: string, trimester: number) =>
      req<SynthesisData>(`/classes/${id}/synthesis?trimester=${trimester}`),
  },
  students: {
    add: (classId: string, fullName: string) =>
      req<Student>(`/classes/${classId}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName }),
      }),
    bulkAdd: (classId: string, names: string[]) =>
      req<Student[]>(`/classes/${classId}/students/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names }),
      }),
    reorder: (classId: string, studentIds: string[]) =>
      req<{ ok: boolean }>(`/classes/${classId}/students/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_ids: studentIds }),
      }),
    transfer: (studentId: string, targetClassId: string) =>
      req<{ ok: boolean; class_id: string }>(`/students/${studentId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_class_id: targetClassId }),
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
    create: (classId: string, trimester: number, examType: string, subjectId?: string, templateId?: string) =>
      req<{ id: string }>(`/classes/${classId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trimester, exam_type: examType, subject_id: subjectId || null, template_id: templateId || null }),
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
  exams: {
    list: (params?: { school_year?: string; level?: string; trimester?: number; q?: string }) => {
      const sp = new URLSearchParams()
      if (params?.school_year) sp.set('school_year', params.school_year)
      if (params?.level) sp.set('level', params.level)
      if (params?.trimester) sp.set('trimester', String(params.trimester))
      if (params?.q) sp.set('q', params.q)
      const qs = sp.toString()
      return req<ExamPaper[]>(`/exams${qs ? `?${qs}` : ''}`)
    },
    get: (id: string) => req<ExamPaper>(`/exams/${id}`),
    create: (data: ExamUpsertInput) =>
      req<ExamPaper>('/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    update: (id: string, data: ExamUpsertInput) =>
      req<ExamPaper>(`/exams/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    delete: (id: string) => req<{ ok: boolean }>(`/exams/${id}`, { method: 'DELETE' }),
    clone: (id: string, data: { school_year?: string; title?: string; trimester?: number }) =>
      req<ExamPaper>(`/exams/${id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    generate: (data: { title?: string; school_year?: string; level?: string; trimester?: number; module_num?: number; exam_type?: string }) =>
      req<ExamPaper>('/exams/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    uploadLegacy: (file: File, meta: { title?: string; school_year?: string; level?: string; trimester?: number; module_num?: number }) => {
      const fd = new FormData()
      fd.append('file', file)
      if (meta.title) fd.append('title', meta.title)
      if (meta.school_year) fd.append('school_year', meta.school_year)
      if (meta.level) fd.append('level', meta.level)
      if (meta.trimester) fd.append('trimester', String(meta.trimester))
      if (meta.module_num) fd.append('module_num', String(meta.module_num))
      return req<ExamPaper>('/exams/upload-legacy', { method: 'POST', body: fd })
    },
    downloadAttachment: async (id: string, filename: string): Promise<string | null> => {
      const res = await fetch(`${BASE}/exams/${id}/attachment`, { headers: authHeaders() })
      if (!res.ok) return `Erreur ${res.status}`
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || 'exam'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      return null
    },
  },
  questionBank: {
    list: (params?: { section?: string; level?: string; criterion?: string; q?: string }) => {
      const sp = new URLSearchParams()
      if (params?.section) sp.set('section', params.section)
      if (params?.level) sp.set('level', params.level)
      if (params?.criterion) sp.set('criterion', params.criterion)
      if (params?.q) sp.set('q', params.q)
      const qs = sp.toString()
      return req<QuestionBankItem[]>(`/question-bank${qs ? `?${qs}` : ''}`)
    },
    create: (data: {
      section: string; block_type: string; level: string; trimester: number; module_num?: number
      criterion: string; points: number; difficulty?: string; topic?: string; content: Record<string, any>
    }) =>
      req<QuestionBankItem>('/question-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    delete: (id: string) => req<{ ok: boolean }>(`/question-bank/${id}`, { method: 'DELETE' }),
    suggest: (data: {
      level?: string; trimester?: number; module_num?: number; section?: string
      criterion?: string; target_difficulty?: string; current_year?: string
      exclude_ids?: string[]; limit?: number
    }) =>
      req<ScoredSuggestion[]>('/question-bank/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    feedback: (id: string, data: { action: 'accepted' | 'skipped'; empirical_pass_rate?: number; school_year?: string }) =>
      req<QuestionBankItem>(`/question-bank/${id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  },
  illustrations: {
    search: (q: string, bw = true) =>
      req<IllustrationSuggestion[]>(`/illustrations/search?q=${encodeURIComponent(q)}&bw=${bw ? '1' : '0'}`),
  },
}

export type ExamBlockType =
  | 'reading_text'
  | 'mcq'
  | 'true_false'
  | 'open_question'
  | 'fill_blanks'
  | 'scramble'
  | 'matching'
  | 'production_ecrite'

export interface ExamBlock {
  id: string
  bank_id?: string
  section: 'lecture' | 'langue' | 'production'
  type: ExamBlockType
  criterion: string
  points: number
  topic?: string
  content: Record<string, any>
}

export interface ExamPaper {
  id: string
  title: string
  school_year: string
  level: string
  subject_code: string
  trimester: number
  module_num: number
  exam_type: string
  direction: 'ltr' | 'rtl'
  blocks: ExamBlock[]
  total_points: number
  used_count: number
  avg_score: number | null
  source_file_name: string
  has_attachment: boolean
  created_at: string
  updated_at: string
}

export interface ExamUpsertInput {
  title: string
  school_year: string
  level: string
  subject_code?: string
  trimester: number
  module_num?: number
  exam_type: string
  direction?: 'ltr' | 'rtl'
  blocks: ExamBlock[]
  total_points: number
  save_to_bank?: boolean
}

export interface QuestionBankItem {
  id: string
  section: 'lecture' | 'langue' | 'production'
  block_type: ExamBlockType
  level: string
  subject_code: string
  trimester: number
  module_num: number
  criterion: string
  points: number
  difficulty: 'easy' | 'medium' | 'hard'
  empirical_pass_rate: number | null
  topic: string
  content: Record<string, any>
  times_used: number
  times_accepted: number
  times_skipped: number
  last_used_year: string
  is_starter: boolean
}

export interface ScoredSuggestion {
  block: QuestionBankItem
  fit_score: number
  reasons: string[]
}

export interface IllustrationSuggestion {
  id: string
  title: string
  url: string
  source: 'builtin_svg' | 'arasaac'
  print_score: number
  reasons: string[]
}
