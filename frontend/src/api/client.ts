const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

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
    throw new Error(err.detail || `HTTP ${res.status}`)
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
export interface ClassSummary {
  id: string; name: string; teacher?: string
  owner_id?: string | null; owner_name?: string | null
  student_count: number; session_count: number; has_scores: boolean
  trimester_status: Record<string, TrimesterStatus>
}
export interface YearGroup { label: string; classes: ClassSummary[] }

export interface Student { id: string; full_name: string; order_index: number }
export interface SessionSummary {
  id: string; trimester: number; exam_type: string
  has_scores: boolean; is_finalized: boolean
}

export interface TeacherProfile { name: string; grade: string; subject: string }
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
  classes: {
    list:   ()           => req<YearGroup[]>('/classes'),
    get:    (id: string) => req<ClassDetail>(`/classes/${id}`),
    create: (name: string, schoolYear: string) =>
      req<{ id: string; name: string; school_year: string }>('/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, school_year: schoolYear }),
      }),
    rename: (id: string, name: string) =>
      req<{ ok: boolean; name: string }>(`/classes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    assignOwner: (id: string, ownerId: string | null) =>
      req<{ ok: boolean }>(`/classes/${id}/owner`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: ownerId }),
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
