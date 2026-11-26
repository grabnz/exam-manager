import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, SessionInfo, ScoreRow, ScoreSaveItem, TemplateDef, StudentStatus } from '../api/client'
import { groups as templateGroups, finalFromGroupTotals } from '../lib/grid'
import { palette, UIPalette } from '../lib/palette'
import { enqueue, getQueued, removeQueued, flushOne, QueuedSave } from '../lib/offlineQueue'

// ── UI structure built from the session's pinned grid template ────────────────
interface FieldDef {
  key: string
  label: string
  maxScore?: number | null
}
interface Subsection {
  secId: string
  label: string
  fields: FieldDef[]
  bonusField?: string
  stField?: string
}
interface Tab {
  key: string
  label: string
  pal: UIPalette
  subsections: Subsection[]
}

function buildTabs(tpl: TemplateDef): Tab[] {
  return templateGroups(tpl).map((g, gi) => ({
    key: g.key,
    label: g.label,
    pal: palette(g.sections[0]?.color_key, gi),
    subsections: g.sections.map(sec => ({
      secId: sec.id,
      label: sec.label,
      fields: sec.criteria.map(c => ({ key: `c:${c.id}`, label: c.label, maxScore: c.max_score })),
      bonusField: sec.has_bonus ? `b:${sec.id}` : undefined,
      stField: sec.allow_st_override ? `s:${sec.id}` : undefined,
    })),
  }))
}

// ── Helpers ───────────────────────────────────────────────────────────────────
type ScoreMap = Record<string, Record<string, number | null>>
type StatusMap = Record<string, StudentStatus>

function nextStatus(cur: StudentStatus | undefined): StudentStatus {
  if (cur === 'absent') return 'exempt'
  if (cur === 'exempt') return 'present'
  return 'absent'
}
function statusLabel(st: StudentStatus | undefined): string | null {
  if (st === 'absent') return 'غ'
  if (st === 'exempt') return 'معفى'
  return null
}
function initStatusMap(rows: ScoreRow[]): StatusMap {
  const map: StatusMap = {}
  for (const r of rows) map[r.student_id] = r.status ?? 'present'
  return map
}
function allFields(tab: Tab): string[] {
  return tab.subsections.flatMap(s => {
    const fs = s.fields.map(f => f.key)
    if (s.bonusField) fs.push(s.bonusField)
    if (s.stField)    fs.push(s.stField)
    return fs
  })
}
function initMap(rows: ScoreRow[]): ScoreMap {
  const map: ScoreMap = {}
  for (const r of rows) {
    const m: Record<string, number | null> = {}
    for (const [cid, v] of Object.entries(r.criteria)) m[`c:${cid}`] = v
    for (const [sid, sv] of Object.entries(r.sections)) {
      m[`b:${sid}`] = sv?.bonus ?? null
      m[`s:${sid}`] = sv?.st ?? null
    }
    map[r.student_id] = m
  }
  return map
}
function unflatten(m: Record<string, number | null> | undefined): Pick<ScoreSaveItem, 'criteria' | 'sections'> {
  const criteria: Record<string, number | null> = {}
  const sections: Record<string, { bonus: number | null; st: number | null }> = {}
  for (const [k, v] of Object.entries(m ?? {})) {
    const id = k.slice(2)
    if (k.startsWith('c:')) criteria[id] = v
    else if (k.startsWith('b:')) sections[id] = { ...(sections[id] ?? { bonus: null, st: null }), bonus: v }
    else if (k.startsWith('s:')) sections[id] = { ...(sections[id] ?? { bonus: null, st: null }), st: v }
  }
  return { criteria, sections }
}
function hasSubVal(sid: string, sub: Subsection, map: ScoreMap): boolean {
  const m = map[sid]
  if (!m) return false
  if (sub.stField && m[sub.stField] != null) return true
  if (sub.bonusField && m[sub.bonusField] != null) return true
  return sub.fields.some(f => m[f.key] != null)
}
function hasTabVal(sid: string, tab: Tab, map: ScoreMap): boolean {
  return tab.subsections.some(sub => hasSubVal(sid, sub, map))
}
function hasAnyVal(sid: string, map: ScoreMap): boolean {
  const m = map[sid]
  return !!m && Object.values(m).some(v => v != null)
}
function subTot(sid: string, sub: Subsection, map: ScoreMap): number {
  if (sub.stField) {
    const direct = map[sid]?.[sub.stField] ?? null
    if (direct !== null) return direct
  }
  const crit = sub.fields.reduce((s, f) => s + (map[sid]?.[f.key] ?? 0), 0)
  return crit + (sub.bonusField ? (map[sid]?.[sub.bonusField] ?? 0) : 0)
}
function isDirect(sid: string, sub: Subsection, map: ScoreMap): boolean {
  return !!sub.stField && (map[sid]?.[sub.stField] ?? null) !== null
}
function tabTot(sid: string, tab: Tab, map: ScoreMap) {
  return tab.subsections.reduce((s, sub) => s + subTot(sid, sub, map), 0)
}
function fmt(n: number | null, hasVal = true) {
  return hasVal && n != null ? +n.toFixed(2) + '' : '—'
}
function quickChipsFor(maxScore?: number | null): number[] {
  if (maxScore != null && maxScore > 0) {
    if (maxScore <= 2) return [0, 0.5, 1, 1.5, maxScore].filter((v, i, a) => v <= maxScore && a.indexOf(v) === i)
    if (maxScore <= 5) return [0, 1, 2, 3, 4, maxScore].filter((v, i, a) => v <= maxScore && a.indexOf(v) === i)
    return [0, Math.round(maxScore * 0.25), Math.round(maxScore * 0.5), Math.round(maxScore * 0.75), maxScore]
  }
  return [0, 0.5, 1, 1.5, 2, 3]
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ScoreEntry() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [activeTab,      setActiveTab]      = useState<string | null>(null)
  const [scoreMap,       setScoreMap]       = useState<ScoreMap>({})
  const [statusMap,      setStatusMap]      = useState<StatusMap>({})
  const [isDirty,        setIsDirty]        = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [saveMsg,        setSaveMsg]        = useState('')
  const [saveErr,        setSaveErr]        = useState('')
  const [mobileIdx,      setMobileIdx]      = useState<number | null>(null)
  const [xlsxError,      setXlsxError]      = useState('')
  const [xlsxLoading,    setXlsxLoading]    = useState(false)
  const [search,         setSearch]         = useState('')
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)
  const [finalizing,     setFinalizing]     = useState(false)
  const [baseUpdatedAt,  setBaseUpdatedAt]  = useState<string | null>(null)
  const [queuedSave,     setQueuedSave]     = useState<QueuedSave | null>(null)
  const [conflict,       setConflict]       = useState(false)
  const qc = useQueryClient()

  const { data: session } = useQuery<SessionInfo>({ queryKey: ['session', id], queryFn: () => api.sessions.get(id!), refetchOnWindowFocus: false })
  const { data: template } = useQuery<TemplateDef>({
    queryKey: ['template', session?.template_id],
    queryFn:  () => api.templates.get(session!.template_id!),
    enabled:  !!session?.template_id,
    staleTime: Infinity,
  })
  const { data: rows = [], isLoading } = useQuery<ScoreRow[]>({ queryKey: ['scores', id], queryFn: () => api.scores.get(id!) })

  const locked  = session?.is_finalized ?? false
  const isAdmin = session?.is_admin ?? false

  const tabs = useMemo(() => (template ? buildTabs(template) : []), [template])
  const tab  = tabs.find(t => t.key === activeTab) ?? null
  const dir  = template?.direction ?? 'ltr'
  const finaleLabel = dir === 'ltr' ? 'Note Finale' : 'النتيجة النهائية'

  useEffect(() => {
    if (!rows.length) return
    const map = initMap(rows)
    const stMap = initStatusMap(rows)
    const latest = rows.reduce<string | null>(
      (acc, r) => (r.updated_at && (!acc || r.updated_at > acc) ? r.updated_at : acc), null)
    setBaseUpdatedAt(latest)
    void getQueued(id!).then(q => {
      if (q) {
        for (const item of q.scores) {
          const m: Record<string, number | null> = {}
          for (const [cid, v] of Object.entries(item.criteria)) m[`c:${cid}`] = v
          for (const [sid, sv] of Object.entries(item.sections)) {
            m[`b:${sid}`] = sv?.bonus ?? null
            m[`s:${sid}`] = sv?.st ?? null
          }
          map[item.student_id] = m
          if (item.status) stMap[item.student_id] = item.status
        }
        setQueuedSave(q)
        if (q.status === 'conflict') setConflict(true)
      }
      setScoreMap(map)
      setStatusMap(stMap)
    })
  }, [rows, id])
  useEffect(() => { if (tabs.length && !activeTab) setActiveTab(tabs[0].key) }, [tabs, activeTab])

  // #10 Unsaved changes browser guard
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const update = useCallback((sid: string, field: string, raw: string) => {
    if (locked) return
    const val = raw === '' ? null : parseFloat(raw)
    if (val !== null && (isNaN(val) || val < 0)) return
    setScoreMap(prev => ({ ...prev, [sid]: { ...prev[sid], [field]: val } }))
    setIsDirty(true)
    setSaveMsg('')
  }, [locked])

  const batchUpdate = useCallback((edits: { sid: string; field: string; val: number | null }[]) => {
    if (locked || edits.length === 0) return
    setScoreMap(prev => {
      const next = { ...prev }
      for (const e of edits) {
        next[e.sid] = { ...(next[e.sid] ?? {}), [e.field]: e.val }
      }
      return next
    })
    setIsDirty(true)
    setSaveMsg('')
  }, [locked])

  const setStudentStatus = useCallback((sid: string, st: StudentStatus) => {
    if (locked) return
    setStatusMap(prev => ({ ...prev, [sid]: st }))
    setIsDirty(true)
    setSaveMsg('')
  }, [locked])

  const collectScores = useCallback((): ScoreSaveItem[] => {
    return rows.map(r => ({
      student_id: r.student_id,
      status: statusMap[r.student_id] ?? 'present',
      ...unflatten(scoreMap[r.student_id]),
    }))
  }, [rows, statusMap, scoreMap])

  const saveRef = useRef<(force?: boolean) => Promise<void>>()
  const save = useCallback(async (force = false) => {
    if (locked || rows.length === 0) return
    setSaving(true)
    setSaveErr('')
    const scores = collectScores()
    try {
      const res = await api.scores.save(id!, scores, { baseUpdatedAt, force })
      await removeQueued(id!)
      setQueuedSave(null)
      setConflict(false)
      setBaseUpdatedAt(res.saved_at)
      setIsDirty(false)
      setSaveMsg('تم الحفظ ✓')
      setTimeout(() => setSaveMsg(m => (m === 'تم الحفظ ✓' ? '' : m)), 2500)
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        await enqueue(id!, scores, baseUpdatedAt)
        setQueuedSave(await getQueued(id!) ?? null)
        setConflict(true)
      } else if (err instanceof ApiError) {
        setSaveErr(err.message || 'فشل الحفظ')
      } else {
        await enqueue(id!, scores, baseUpdatedAt)
        setQueuedSave(await getQueued(id!) ?? null)
        setIsDirty(false)
        setSaveMsg('محفوظ محليًا 📡')
      }
    } finally {
      setSaving(false)
    }
  }, [locked, rows.length, collectScores, id, baseUpdatedAt])
  saveRef.current = save

  // #10 Debounced auto-save (1.6s after edit)
  useEffect(() => {
    if (!isDirty || locked || conflict || saving) return
    const timer = setTimeout(() => {
      void saveRef.current?.(false)
    }, 1600)
    return () => clearTimeout(timer)
  }, [isDirty, locked, conflict, saving, scoreMap, statusMap])

  async function toggleFinalize() {
    setFinalizing(true)
    try {
      if (isDirty) await save()
      await api.sessions.finalize(id!, !locked)
      await qc.invalidateQueries({ queryKey: ['session', id] })
    } catch (err: any) {
      setSaveErr(err.message || 'حدث خطأ')
    } finally {
      setFinalizing(false)
    }
  }

  async function resolveConflict(overwrite: boolean) {
    const q = await getQueued(id!)
    if (overwrite) {
      if (q) await flushOne({ ...q, status: 'pending' }, true)
      else await save(true)
    } else {
      await removeQueued(id!)
    }
    setQueuedSave(null)
    setConflict(false)
    setIsDirty(false)
    await qc.invalidateQueries({ queryKey: ['scores', id] })
  }

  // #12 Completion stats for active tab
  const gradedCount = useMemo(() => {
    if (!rows.length) return 0
    return rows.filter(r => {
      const st = statusMap[r.student_id]
      if (st === 'absent' || st === 'exempt') return true
      return tab ? hasTabVal(r.student_id, tab, scoreMap) : hasAnyVal(r.student_id, scoreMap)
    }).length
  }, [rows, tab, scoreMap, statusMap])

  const visibleRows = useMemo(() => {
    return rows.filter(r => {
      if (search.trim() && !r.student_name.includes(search.trim())) return false
      if (onlyIncomplete && tab) {
        const st = statusMap[r.student_id]
        if (st === 'absent' || st === 'exempt') return false
        if (hasTabVal(r.student_id, tab, scoreMap)) return false
      }
      return true
    })
  }, [rows, search, onlyIncomplete, tab, scoreMap, statusMap])

  // #11 Bulk fill column
  function fillColumn(fieldKey: string, val: number, onlyEmpty: boolean) {
    if (locked) return
    const edits: { sid: string; field: string; val: number | null }[] = []
    for (const r of visibleRows) {
      const st = statusMap[r.student_id]
      if (st === 'absent' || st === 'exempt') continue
      const cur = scoreMap[r.student_id]?.[fieldKey] ?? null
      if (onlyEmpty && cur !== null) continue
      edits.push({ sid: r.student_id, field: fieldKey, val })
    }
    batchUpdate(edits)
  }

  // Mobile: student editor open → full-screen overlay
  if (mobileIdx !== null && tab && activeTab !== 'finale') {
    return (
      <MobileEditor
        rows={rows} idx={mobileIdx} tab={tab} scoreMap={scoreMap} statusMap={statusMap}
        onUpdate={update} onStatusChange={setStudentStatus} locked={locked}
        onClose={() => setMobileIdx(null)}
        onNavigate={setMobileIdx}
        isDirty={isDirty} saving={saving} saveMsg={saveMsg} onSave={() => save()}
      />
    )
  }

  const pct = rows.length ? Math.round((gradedCount / rows.length) * 100) : 0

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex-shrink-0">
        <button onClick={() => navigate(session ? `/classes/${session.class_id}` : '/')}
                className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-1">
          ← {session?.class_name ?? 'رجوع'}
        </button>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="arabic text-base md:text-xl font-bold text-gray-900 truncate">
              {session?.class_name} — {session?.subject_name ?? ''}{' '}
              <span className="arabic font-normal text-gray-500 text-sm">
                الثلاثي {session?.trimester} · {session?.exam_type}
              </span>
            </h1>
            {session?.teacher && <p className="arabic text-xs text-gray-400 truncate">{session.teacher}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {saving && <span className="hidden sm:block arabic text-xs text-blue-500 font-medium">جاري الحفظ…</span>}
            {!saving && saveMsg && <span className="hidden sm:block arabic text-xs text-green-600 font-medium">{saveMsg}</span>}
            {saveErr && <span className="arabic text-xs text-red-500">{saveErr}</span>}
            {xlsxError && <span className="text-xs text-red-500">{xlsxError}</span>}

            {locked && (
              <span className="arabic hidden sm:flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-lg font-medium">
                🔒 نهائي
              </span>
            )}

            <button
              disabled={xlsxLoading}
              onClick={async () => {
                setXlsxError('')
                setXlsxLoading(true)
                const err = await api.scores.downloadExcel(id!)
                setXlsxLoading(false)
                if (err) setXlsxError('فشل التصدير')
              }}
              className="text-xs border border-gray-300 hover:border-gray-400 disabled:opacity-50 px-2 py-1.5 rounded-lg">
              {xlsxLoading ? '…' : '↓ Excel'}
            </button>
            <button onClick={() => window.open(`/sessions/${id}/print`, '_blank')}
                    className="text-xs border border-red-300 hover:border-red-400 text-red-600 px-2 py-1.5 rounded-lg">
              ↓ PDF
            </button>

            {!locked && (
              <button onClick={() => save()} disabled={saving || !isDirty}
                      className="arabic text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-lg font-medium">
                {saving ? '…' : isDirty ? 'حفظ' : '✓'}
              </button>
            )}

            {(!locked || isAdmin) && (
              <button
                onClick={toggleFinalize}
                disabled={finalizing}
                className={`arabic text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                  locked
                    ? 'border border-amber-300 text-amber-700 hover:bg-amber-50'
                    : 'bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-300'
                }`}
              >
                {finalizing ? '…' : locked ? '🔓 إلغاء القفل' : '🔒 إنهاء'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Tabs ── */}
      <div className="flex gap-1 px-4 md:px-6 pt-3 overflow-x-auto flex-shrink-0 scrollbar-hide">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); setMobileIdx(null) }}
                  className={`px-3 md:px-4 py-2 rounded-t-lg text-xs md:text-sm font-medium whitespace-nowrap transition ${
                    activeTab === t.key ? t.pal.tabActive : t.pal.tabInactive}`}>
            {t.label}
          </button>
        ))}
        {tabs.length > 0 && (
          <button onClick={() => { setActiveTab('finale'); setMobileIdx(null) }}
                  className={`px-3 md:px-4 py-2 rounded-t-lg text-xs md:text-sm font-medium whitespace-nowrap transition ${
                    activeTab === 'finale'
                      ? 'bg-finale-dark text-white'
                      : 'bg-finale-light text-finale-dark hover:bg-finale-mid'}`}>
            {finaleLabel}
          </button>
        )}
      </div>

      {/* ── Offline queue banner ── */}
      {queuedSave && queuedSave.status === 'pending' && !conflict && (
        <div className="arabic flex items-center gap-2 px-4 md:px-6 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-800 flex-shrink-0" dir="rtl">
          <span>📡</span>
          <span className="font-medium">محفوظ محليًا — سيُرسل تلقائياً عند عودة الاتصال.</span>
        </div>
      )}
      {queuedSave && queuedSave.status === 'error' && (
        <div className="arabic flex items-center gap-2 px-4 md:px-6 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700 flex-shrink-0" dir="rtl">
          <span>⚠</span>
          <span className="font-medium">تعذّرت مزامنة الحفظ المحلي: {queuedSave.message}</span>
          <button onClick={() => { void removeQueued(id!).then(() => { setQueuedSave(null); qc.invalidateQueries({ queryKey: ['scores', id] }) }) }}
                  className="mr-auto text-xs underline">تجاهل</button>
        </div>
      )}

      {/* ── Conflict dialog ── */}
      {conflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-4 shadow-xl" dir="rtl">
            <h3 className="arabic text-lg font-bold text-gray-900">⚠ تعارض في الأعداد</h3>
            <p className="arabic text-sm text-gray-600">
              تم تعديل أعداد هذه الجلسة من جهاز آخر بعد آخر مزامنة. ماذا تريدون أن تفعلوا؟
            </p>
            <div className="space-y-2">
              <button onClick={() => void resolveConflict(true)}
                      className="arabic w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium">
                استبدال بنسختي (هذا الجهاز)
              </button>
              <button onClick={() => void resolveConflict(false)}
                      className="arabic w-full py-2.5 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-sm font-medium">
                تحميل نسخة الخادم وإلغاء تعديلاتي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lock banner ── */}
      {locked && (
        <div className="arabic flex items-center gap-2 px-4 md:px-6 py-2 bg-green-50 border-b border-green-200 text-sm text-green-800 flex-shrink-0" dir="rtl">
          <span>🔒</span>
          <span className="font-medium">الجلسة نهائية — الأعداد للقراءة فقط.</span>
          {isAdmin ? (
            <button onClick={toggleFinalize} disabled={finalizing}
                    className="mr-auto text-xs text-amber-600 hover:underline">
              إلغاء القفل
            </button>
          ) : (
            <span className="mr-auto text-xs text-green-600">لإلغاء القفل اتصلوا بالمدير</span>
          )}
        </div>
      )}

      {/* ── Search, Progress & Incomplete Filter (#12) ── */}
      {activeTab !== 'finale' && rows.length > 0 && (
        <div className="px-4 md:px-6 py-2 flex flex-wrap items-center gap-3 flex-shrink-0" dir="rtl">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <input
              type="text"
              placeholder="البحث عن تلميذ…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white arabic"
              dir="rtl"
            />
            {search && (
              <button onClick={() => setSearch('')}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOnlyIncomplete(v => !v)}
            className={`arabic text-xs px-3 py-1.5 rounded-xl border font-medium transition ${
              onlyIncomplete
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {onlyIncomplete ? '✓ غير مكتمل فقط' : 'غير مكتمل فقط'}
          </button>

          <div className="flex items-center gap-2 mr-auto">
            <span className="arabic text-xs text-gray-500 font-medium">
              {gradedCount} / {rows.length} تلميذ
            </span>
            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-bold text-gray-600" dir="ltr">{pct}%</span>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto px-4 md:px-6 pb-8">
        {isLoading || (!template && session?.template_id) ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : activeTab === 'finale' && template ? (
          <>
            <div className="md:hidden space-y-2 pt-1">
              <MobileFinaleList rows={rows} tabs={tabs} template={template} scoreMap={scoreMap} statusMap={statusMap} />
            </div>
            <div className="hidden md:block">
              <DesktopFinale rows={rows} tabs={tabs} template={template} scoreMap={scoreMap} statusMap={statusMap} finaleLabel={finaleLabel} />
            </div>
          </>
        ) : tab ? (
          <div dir={dir}>
            <div className="md:hidden space-y-2 pt-1">
              <MobileStudentList rows={visibleRows} tab={tab} scoreMap={scoreMap} statusMap={statusMap} onSelect={i => {
                setMobileIdx(rows.indexOf(visibleRows[i]))
              }} />
            </div>
            <div className="hidden md:block">
              <DesktopTable
                rows={visibleRows} tab={tab} dir={dir}
                scoreMap={scoreMap} statusMap={statusMap} locked={locked}
                onUpdate={update} onBatchUpdate={batchUpdate}
                onFillColumn={fillColumn} onStatusChange={setStudentStatus}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── Mobile: student list ───────────────────────────────────────────────────────
function MobileStudentList({ rows, tab, scoreMap, statusMap, onSelect }: {
  rows: ScoreRow[]; tab: Tab; scoreMap: ScoreMap; statusMap: StatusMap; onSelect: (i: number) => void
}) {
  return (
    <>
      {rows.map((row, i) => {
        const stBadge = statusLabel(statusMap[row.student_id])
        const total = tabTot(row.student_id, tab, scoreMap)
        const hasScores = hasTabVal(row.student_id, tab, scoreMap)
        return (
          <button key={row.student_id} onClick={() => onSelect(i)}
                  className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 text-left active:bg-gray-50 transition">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-6 text-right flex-shrink-0">{i + 1}</span>
              <span className="arabic text-gray-900 font-medium">{row.student_name}</span>
            </div>
            <div className="flex items-center gap-2">
              {stBadge ? (
                <span className={`arabic text-xs font-bold px-2 py-0.5 rounded-full ${
                  statusMap[row.student_id] === 'absent' ? 'bg-rose-100 text-rose-700' : 'bg-gray-200 text-gray-600'
                }`}>{stBadge}</span>
              ) : (
                <span className={`text-sm font-bold ${hasScores ? 'text-gray-800' : 'text-gray-300'}`}>
                  {hasScores ? fmt(total, true) : '—'}
                </span>
              )}
              <span className="text-gray-400 text-lg">›</span>
            </div>
          </button>
        )
      })}
    </>
  )
}

// ── Mobile: full-screen score editor (#11 quick chips + #12 jump & swipe) ─────
function MobileEditor({ rows, idx, tab, scoreMap, statusMap, locked, onUpdate, onStatusChange, onClose, onNavigate, isDirty, saving, saveMsg, onSave }: {
  rows: ScoreRow[]; idx: number; tab: Tab; scoreMap: ScoreMap; statusMap: StatusMap; locked: boolean
  onUpdate: (sid: string, f: string, v: string) => void
  onStatusChange: (sid: string, st: StudentStatus) => void
  onClose: () => void; onNavigate: (i: number) => void
  isDirty: boolean; saving: boolean; saveMsg: string; onSave: () => void
}) {
  const row = rows[idx]
  const st = statusMap[row.student_id] ?? 'present'
  const isOut = st === 'absent' || st === 'exempt'
  const total = tabTot(row.student_id, tab, scoreMap)
  const hasTab = hasTabVal(row.student_id, tab, scoreMap)
  const [focusedField, setFocusedField] = useState<{ key: string; maxScore?: number | null } | null>(null)
  const touchStartX = useRef<number | null>(null)

  return (
    <div
      className="fixed inset-0 bg-gray-50 z-50 flex flex-col"
      onTouchStart={e => { touchStartX.current = e.touches[0]?.clientX ?? null }}
      onTouchEnd={e => {
        if (touchStartX.current == null) return
        const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current
        touchStartX.current = null
        if (Math.abs(dx) > 70) {
          if (dx < 0 && idx < rows.length - 1) onNavigate(idx + 1)
          if (dx > 0 && idx > 0) onNavigate(idx - 1)
        }
      }}
    >
      {/* Header with jump dropdown */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between gap-2 flex-shrink-0">
        <button onClick={onClose} className="arabic text-blue-600 font-medium text-sm flex-shrink-0">
          ← القائمة
        </button>
        <div className="flex-1 min-w-0 text-center">
          <select
            value={idx}
            onChange={e => onNavigate(Number(e.target.value))}
            className="arabic max-w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 font-bold text-gray-900 text-sm text-center"
            dir="rtl"
          >
            {rows.map((r, ri) => (
              <option key={r.student_id} value={ri}>{ri + 1}. {r.student_name}</option>
            ))}
          </select>
        </div>
        <button onClick={onSave} disabled={saving || !isDirty}
                className="arabic text-xs bg-blue-600 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-lg font-medium flex-shrink-0">
          {saving ? '…' : saveMsg ? '✓' : 'حفظ'}
        </button>
      </div>

      {/* Status bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center justify-center gap-2 flex-shrink-0" dir="rtl">
        {([
          { key: 'present', label: 'حاضر', active: 'bg-blue-600 text-white border-blue-600' },
          { key: 'absent',  label: 'غائب (غ)', active: 'bg-rose-600 text-white border-rose-600' },
          { key: 'exempt',  label: 'معفى', active: 'bg-gray-700 text-white border-gray-700' },
        ] as const).map(opt => (
          <button key={opt.key} type="button" disabled={locked}
                  onClick={() => onStatusChange(row.student_id, opt.key)}
                  className={`arabic text-xs px-3 py-1 rounded-full border transition ${
                    st === opt.key ? opt.active : 'bg-white text-gray-600 border-gray-200'
                  }`}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Quick-fill chips for currently focused criterion (#11) */}
      {!locked && !isOut && focusedField && (
        <div className="bg-blue-50/80 border-b border-blue-100 px-3 py-2 flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
          <span className="arabic text-[11px] text-blue-700 font-medium flex-shrink-0">إدخال سريع:</span>
          {quickChipsFor(focusedField.maxScore).map(val => (
            <button
              key={val}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => onUpdate(row.student_id, focusedField.key, String(val))}
              className="px-2.5 py-1 bg-white border border-blue-200 hover:bg-blue-600 hover:text-white rounded-lg text-xs font-bold text-blue-800 transition flex-shrink-0"
            >
              {val}
            </button>
          ))}
        </div>
      )}

      {/* Score fields */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-3 transition-opacity ${isOut ? 'opacity-40 pointer-events-none' : ''}`}>
        {tab.subsections.map(sub => {
          const stVal = subTot(row.student_id, sub, scoreMap)
          const subGraded = hasSubVal(row.student_id, sub, scoreMap)
          return (
            <div key={sub.secId} className={`${tab.pal.cardBg} border ${tab.pal.cardBorder} rounded-2xl p-4`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">{sub.label}</h3>
                {(sub.bonusField || sub.stField) && (
                  <span className={`text-sm font-bold ${tab.pal.accentText}`}>
                    S.T. {fmt(stVal, subGraded)}
                  </span>
                )}
              </div>

              <div className={`grid grid-cols-3 gap-2 transition-opacity ${isDirect(row.student_id, sub, scoreMap) ? 'opacity-40 pointer-events-none' : ''}`}>
                {sub.fields.map(f => {
                  const v = scoreMap[row.student_id]?.[f.key] ?? null
                  const overMax = v != null && f.maxScore != null && v > f.maxScore
                  return (
                    <div key={f.key}>
                      <label className="text-xs text-gray-500 mb-1 block text-center">
                        {f.label}{f.maxScore != null ? <span className="text-[10px] text-gray-400">/{f.maxScore}</span> : null}
                      </label>
                      <input type="number" min={0} step={0.25} inputMode="decimal" disabled={locked}
                             className={`w-full border rounded-xl px-2 py-2.5 text-center text-base focus:outline-none focus:ring-2 ${
                               overMax
                                 ? 'border-red-400 bg-red-50 text-red-700 focus:ring-red-400'
                                 : 'border-gray-200 bg-white focus:ring-blue-400'
                             }`}
                             value={v ?? ''}
                             onFocus={e => { e.target.select(); setFocusedField({ key: f.key, maxScore: f.maxScore }) }}
                             onChange={e => onUpdate(row.student_id, f.key, e.target.value)} />
                    </div>
                  )
                })}
                {sub.bonusField && (
                  <div>
                    <label className="text-xs text-green-600 font-semibold mb-1 block text-center">Bonus</label>
                    <input type="number" min={0} step={0.25} inputMode="decimal" disabled={locked}
                           className="w-full border border-green-300 bg-green-50 rounded-xl px-2 py-2.5 text-center text-base focus:outline-none focus:ring-2 focus:ring-green-400"
                           value={scoreMap[row.student_id]?.[sub.bonusField] ?? ''}
                           onFocus={e => { e.target.select(); setFocusedField({ key: sub.bonusField! }) }}
                           onChange={e => onUpdate(row.student_id, sub.bonusField!, e.target.value)} />
                  </div>
                )}
              </div>

              {sub.stField && (
                <div className="mt-3 pt-3 border-t border-dashed border-gray-300">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="arabic text-xs font-semibold text-gray-600 mb-1 block">
                        {isDirect(row.student_id, sub, scoreMap) ? 'مجموع مباشر ✓' : 'مجموع مباشر (اختياري)'}
                      </label>
                      <input type="number" min={0} step={0.25} inputMode="decimal" disabled={locked}
                             className={`w-full border rounded-xl px-3 py-2.5 text-center text-lg font-bold focus:outline-none focus:ring-2 ${
                               isDirect(row.student_id, sub, scoreMap)
                                 ? 'border-blue-400 bg-blue-50 focus:ring-blue-400'
                                 : 'border-gray-300 bg-white focus:ring-gray-400'
                             }`}
                             value={scoreMap[row.student_id]?.[sub.stField] ?? ''}
                             onFocus={() => setFocusedField(null)}
                             onChange={e => onUpdate(row.student_id, sub.stField!, e.target.value)} />
                    </div>
                    {isDirect(row.student_id, sub, scoreMap) && (
                      <button onClick={() => onUpdate(row.student_id, sub.stField!, '')}
                              className="mt-5 text-xs text-red-400 hover:text-red-600 border border-red-200 rounded-lg px-2 py-2">
                        ✕
                      </button>
                    )}
                  </div>
                  {isDirect(row.student_id, sub, scoreMap) && (
                    <p className="arabic text-xs text-blue-600 mt-1">المعايير مُتجاهَلة</p>
                  )}
                </div>
              )}
            </div>
          )
        })}

        <div className={`${tab.pal.totalBg} rounded-2xl px-4 py-4 flex justify-between items-center`}>
          <span className="font-bold text-gray-800">Total {tab.label}</span>
          <span className="text-2xl font-bold text-gray-900">{statusLabel(st) ?? fmt(total, hasTab)}</span>
        </div>
      </div>

      {/* Prev / Next */}
      <div className="bg-white border-t border-gray-200 p-3 grid grid-cols-2 gap-3 flex-shrink-0 safe-bottom">
        <button onClick={() => onNavigate(idx - 1)} disabled={idx === 0}
                className="arabic py-3.5 border border-gray-200 rounded-xl text-gray-700 font-medium text-sm disabled:opacity-30 active:bg-gray-50">
          → السابق
        </button>
        <button onClick={() => onNavigate(idx + 1)} disabled={idx === rows.length - 1}
                className="arabic py-3.5 border border-gray-200 rounded-xl text-gray-700 font-medium text-sm disabled:opacity-30 active:bg-gray-50">
          التالي ←
        </button>
      </div>
    </div>
  )
}

// ── Mobile: finale list ────────────────────────────────────────────────────────
function MobileFinaleList({ rows, tabs, template, scoreMap, statusMap }: {
  rows: ScoreRow[]; tabs: Tab[]; template: TemplateDef; scoreMap: ScoreMap; statusMap: StatusMap
}) {
  return (
    <>
      {rows.map((row, i) => {
        const stBadge = statusLabel(statusMap[row.student_id])
        const graded = hasAnyVal(row.student_id, scoreMap)
        const totals = tabs.map(t => tabTot(row.student_id, t, scoreMap))
        const final = stBadge ? null : finalFromGroupTotals(template, totals, graded)
        return (
          <div key={row.student_id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{i + 1}</span>
                <span className="arabic font-semibold text-gray-900">{row.student_name}</span>
              </div>
              <span className="text-xl font-bold text-yellow-700">{stBadge ?? fmt(final, graded)}</span>
            </div>
            <div className="grid gap-2 text-center text-xs" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
              {tabs.map((t, ti) => (
                <div key={t.key} className={`${t.pal.dataBg} rounded-lg py-2`}>
                  <div className="text-gray-500 mb-0.5 truncate px-1">{t.label}</div>
                  <div className="font-bold text-gray-800">{stBadge ?? fmt(totals[ti], hasTabVal(row.student_id, t, scoreMap))}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

// ── Desktop: spreadsheet table (#9 nav+paste, #11 max+fill, #12 ST dim, #15 sticky thead) ──
function DesktopTable({ rows, tab, dir, scoreMap, statusMap, locked, onUpdate, onBatchUpdate, onFillColumn, onStatusChange }: {
  rows: ScoreRow[]; tab: Tab; dir: 'rtl' | 'ltr'
  scoreMap: ScoreMap; statusMap: StatusMap; locked: boolean
  onUpdate: (sid: string, f: string, v: string) => void
  onBatchUpdate: (edits: { sid: string; field: string; val: number | null }[]) => void
  onFillColumn: (fieldKey: string, val: number, onlyEmpty: boolean) => void
  onStatusChange: (sid: string, st: StudentStatus) => void
}) {
  const fields = useMemo(() => allFields(tab), [tab])
  const [activeRow, setActiveRow] = useState<number | null>(null)
  const [colMenu, setColMenu] = useState<string | null>(null)

  function focusCell(r: number, cIdx: number) {
    if (r < 0 || r >= rows.length || cIdx < 0 || cIdx >= fields.length) return
    document.querySelector<HTMLInputElement>(`[data-row="${r}"][data-field="${fields[cIdx]}"]`)?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, fieldKey: string) {
    const colIdx = fields.indexOf(fieldKey)
    if (colIdx < 0) return
    if (e.key === 'Enter') {
      e.preventDefault()
      focusCell(e.shiftKey ? rowIdx - 1 : rowIdx + 1, colIdx)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusCell(rowIdx + 1, colIdx)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusCell(rowIdx - 1, colIdx)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      focusCell(rowIdx, dir === 'rtl' ? colIdx - 1 : colIdx + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focusCell(rowIdx, dir === 'rtl' ? colIdx + 1 : colIdx - 1)
    }
  }

  // #9 Multi-cell paste from Excel / Google Sheets
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>, startRow: number, fieldKey: string) {
    const raw = e.clipboardData.getData('text')
    if (!raw.includes('\t') && !raw.includes('\n')) return
    e.preventDefault()
    const startCol = fields.indexOf(fieldKey)
    if (startCol < 0) return
    const lines = raw.replace(/\r/g, '').split('\n').filter((l, idx, arr) => idx < arr.length - 1 || l !== '')
    const edits: { sid: string; field: string; val: number | null }[] = []
    lines.forEach((line, dr) => {
      const targetRow = rows[startRow + dr]
      if (!targetRow) return
      const st = statusMap[targetRow.student_id]
      if (st === 'absent' || st === 'exempt') return
      line.split('\t').forEach((cell, dc) => {
        const fKey = fields[startCol + dc]
        if (!fKey) return
        const cleaned = cell.trim().replace(',', '.')
        if (cleaned === '') {
          edits.push({ sid: targetRow.student_id, field: fKey, val: null })
        } else {
          const num = parseFloat(cleaned)
          if (!isNaN(num) && num >= 0) edits.push({ sid: targetRow.student_id, field: fKey, val: num })
        }
      })
    })
    onBatchUpdate(edits)
  }

  return (
    <div className="rounded-b-xl rounded-tr-xl border border-gray-200 overflow-auto bg-white max-h-[72vh]" onClick={() => colMenu && setColMenu(null)}>
      <table className="text-sm border-collapse min-w-max">
        <thead className="sticky top-0 z-20 shadow-sm">
          <tr>
            <th className="bg-gray-100 border border-gray-200 px-3 py-2 text-right font-medium text-gray-600 min-w-[220px] sticky start-0 z-30">
              التلاميذ
            </th>
            {tab.subsections.map(sub => (
              <th key={sub.secId}
                  colSpan={sub.fields.length + (sub.bonusField ? 1 : 0) + ((sub.bonusField || sub.stField) ? 1 : 0)}
                  className={`${tab.pal.hdrBg} border border-gray-200 px-3 py-2 text-center font-medium text-gray-700`}>
                {sub.label}
              </th>
            ))}
            <th className={`${tab.pal.totalBg} border border-gray-200 px-3 py-2 text-center font-bold text-gray-700`}>
              Total
            </th>
          </tr>
          <tr>
            <th className="bg-gray-100 border border-gray-200 sticky start-0 z-30" />
            {tab.subsections.map(sub => (
              <>
                {sub.fields.map(f => (
                  <th key={f.key} className={`${tab.pal.hdrBg} border border-gray-200 px-2 py-1.5 text-center font-medium text-gray-600 text-xs relative`}>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={e => { e.stopPropagation(); setColMenu(colMenu === f.key ? null : f.key) }}
                      title={locked ? undefined : 'خيارات ملء العمود'}
                      className="inline-flex flex-col items-center leading-tight hover:text-blue-700"
                    >
                      <span>{f.label}</span>
                      {f.maxScore != null && <span className="text-[10px] text-gray-400 font-normal">/{f.maxScore}</span>}
                    </button>
                    {colMenu === f.key && !locked && (
                      <div onClick={e => e.stopPropagation()} className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-36 bg-white border border-gray-200 rounded-xl shadow-lg z-40 py-1 text-right" dir="rtl">
                        <button type="button" onClick={() => { onFillColumn(f.key, 0, true); setColMenu(null) }}
                                className="arabic w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-right">
                          ملء الفارغ بـ 0
                        </button>
                        {f.maxScore != null && (
                          <button type="button" onClick={() => { onFillColumn(f.key, f.maxScore!, false); setColMenu(null) }}
                                  className="arabic w-full px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50 text-right">
                            ملء الكل بـ {f.maxScore}
                          </button>
                        )}
                      </div>
                    )}
                  </th>
                ))}
                {sub.bonusField && <th key={`${sub.secId}-b`} className="bg-[#E2EFDA] border border-gray-200 px-2 py-1.5 text-center font-medium text-gray-600 text-xs">Bonus</th>}
                {(sub.bonusField || sub.stField) && <th key={`${sub.secId}-s`} className={`${tab.pal.stBg} border border-gray-200 px-2 py-1.5 text-center font-bold text-gray-700 text-xs`}>S.T.</th>}
              </>
            ))}
            <th className={`${tab.pal.totalBg} border border-gray-200`} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const st = statusMap[row.student_id] ?? 'present'
            const stBadge = statusLabel(st)
            const isOut = st === 'absent' || st === 'exempt'
            const tabGraded = hasTabVal(row.student_id, tab, scoreMap)
            const isFocused = activeRow === i
            return (
            <tr key={row.student_id} className={`group ${isFocused ? 'bg-blue-50/40' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
              <td className={`arabic border border-gray-200 px-3 py-1.5 text-right sticky start-0 z-10 font-medium ${isFocused ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span><span className="text-gray-400 text-xs mx-1.5">{i + 1}</span>{row.student_name}</span>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => onStatusChange(row.student_id, nextStatus(st))}
                    title="تغيير الحالة: حاضر / غائب / معفى"
                    className={`arabic text-[10px] px-1.5 py-0.5 rounded-full font-semibold transition flex-shrink-0 ${
                      st === 'absent'
                        ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                        : st === 'exempt'
                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        : 'text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-600'
                    }`}
                  >
                    {stBadge ?? 'حاضر'}
                  </button>
                </div>
              </td>
              {tab.subsections.map(sub => {
                const directActive = isDirect(row.student_id, sub, scoreMap)
                return (
                <>
                  {sub.fields.map(f => {
                    const val = scoreMap[row.student_id]?.[f.key] ?? null
                    const overMax = val != null && f.maxScore != null && val > f.maxScore
                    return (
                      <td key={f.key} className={`border border-gray-200 p-0 ${overMax ? 'bg-red-100' : tab.pal.dataBg} ${isOut || directActive ? 'opacity-35' : ''}`}>
                        <input
                          type="number" min={0} step={0.25} disabled={locked || isOut}
                          data-row={i} data-field={f.key}
                          title={overMax ? `يتجاوز الحد الأقصى (${f.maxScore})` : undefined}
                          className={`score-input h-8 px-1 w-14 ${overMax ? 'text-red-700 font-bold' : ''}`}
                          value={val ?? ''}
                          onFocus={e => { e.target.select(); setActiveRow(i) }}
                          onBlur={() => setActiveRow(cur => (cur === i ? null : cur))}
                          onKeyDown={e => handleKeyDown(e, i, f.key)}
                          onPaste={e => handlePaste(e, i, f.key)}
                          onChange={e => onUpdate(row.student_id, f.key, e.target.value)}
                        />
                      </td>
                    )
                  })}
                  {sub.bonusField && (
                    <td key={`${sub.secId}-b`} className={`border border-gray-200 p-0 bg-[#E2EFDA] ${isOut || directActive ? 'opacity-35' : ''}`}>
                      <input
                        type="number" min={0} step={0.25} disabled={locked || isOut}
                        data-row={i} data-field={sub.bonusField}
                        className="score-input h-8 px-1 w-14"
                        value={scoreMap[row.student_id]?.[sub.bonusField] ?? ''}
                        onFocus={e => { e.target.select(); setActiveRow(i) }}
                        onBlur={() => setActiveRow(cur => (cur === i ? null : cur))}
                        onKeyDown={e => handleKeyDown(e, i, sub.bonusField!)}
                        onPaste={e => handlePaste(e, i, sub.bonusField!)}
                        onChange={e => onUpdate(row.student_id, sub.bonusField!, e.target.value)}
                      />
                    </td>
                  )}
                  {(sub.bonusField || sub.stField) && (
                    <td key={`${sub.secId}-s`} className={`${directActive ? 'bg-blue-100/70' : tab.pal.stBg} border border-gray-200 p-0 ${isOut ? 'opacity-35' : ''}`}>
                      {sub.stField ? (
                        <div className="relative flex items-center">
                          <input
                            type="number" min={0} step={0.25} disabled={locked || isOut}
                            data-row={i} data-field={sub.stField}
                            className="score-input h-8 px-1 w-16 font-bold"
                            placeholder={directActive ? '' : fmt(subTot(row.student_id, sub, scoreMap), hasSubVal(row.student_id, sub, scoreMap))}
                            value={scoreMap[row.student_id]?.[sub.stField] ?? ''}
                            onFocus={e => { e.target.select(); setActiveRow(i) }}
                            onBlur={() => setActiveRow(cur => (cur === i ? null : cur))}
                            onKeyDown={e => handleKeyDown(e, i, sub.stField!)}
                            onPaste={e => handlePaste(e, i, sub.stField!)}
                            onChange={e => onUpdate(row.student_id, sub.stField!, e.target.value)}
                          />
                          {directActive && !locked && !isOut && (
                            <button
                              type="button"
                              title="إلغاء المجموع المباشر"
                              onClick={() => onUpdate(row.student_id, sub.stField!, '')}
                              className="absolute left-0.5 text-[10px] text-blue-600 hover:text-red-600 px-0.5"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="block px-2 text-center font-bold text-gray-800 text-sm">
                          {fmt(subTot(row.student_id, sub, scoreMap), hasSubVal(row.student_id, sub, scoreMap))}
                        </span>
                      )}
                    </td>
                  )}
                </>
                )
              })}
              <td className={`${tab.pal.totalBg} border border-gray-200 px-2 py-1.5 text-center font-bold text-gray-800`}>
                {stBadge ?? fmt(tabTot(row.student_id, tab, scoreMap), tabGraded)}
              </td>
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Desktop: finale table with summary footer (#15) ───────────────────────────
function DesktopFinale({ rows, tabs, template, scoreMap, statusMap, finaleLabel }: {
  rows: ScoreRow[]; tabs: Tab[]; template: TemplateDef; scoreMap: ScoreMap; statusMap: StatusMap; finaleLabel: string
}) {
  const computed = rows.map(row => {
    const stBadge = statusLabel(statusMap[row.student_id])
    const graded = hasAnyVal(row.student_id, scoreMap)
    const totals = tabs.map(t => tabTot(row.student_id, t, scoreMap))
    const final = stBadge ? null : finalFromGroupTotals(template, totals, graded)
    return { row, stBadge, graded, totals, final }
  })
  const validFinals = computed.map(c => c.final).filter((v): v is number => v != null)
  const avg = validFinals.length ? +(validFinals.reduce((a, b) => a + b, 0) / validFinals.length).toFixed(2) : null
  const min = validFinals.length ? Math.min(...validFinals) : null
  const max = validFinals.length ? Math.max(...validFinals) : null
  const passPct = validFinals.length ? Math.round((validFinals.filter(v => v >= 10).length / validFinals.length) * 100) : null

  return (
    <div className="rounded-xl border border-gray-200 overflow-auto bg-white">
      <table className="text-sm border-collapse min-w-max w-full">
        <thead>
          <tr>
            <th className="bg-gray-100 border border-gray-200 px-4 py-2.5 text-right font-medium text-gray-700 min-w-[200px] sticky start-0">
              التلاميذ
            </th>
            {tabs.map(t => (
              <th key={t.key} className={`${t.pal.hdrBg} border border-gray-200 px-4 py-2.5 text-center font-medium text-gray-700 min-w-[120px]`}>
                {t.label}
              </th>
            ))}
            <th className="bg-finale-mid border border-gray-200 px-4 py-2.5 text-center font-medium text-gray-700 min-w-[120px]">
              {finaleLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {computed.map(({ row, stBadge, graded, totals, final }, i) => (
            <tr key={row.student_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className={`arabic border border-gray-200 px-4 py-2 text-right font-medium sticky start-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                <span className="text-gray-400 text-xs mx-2">{i + 1}</span>{row.student_name}
              </td>
              {tabs.map((t, ti) => (
                <td key={t.key} className={`${t.pal.dataBg} border border-gray-200 px-4 py-2 text-center`}>
                  {stBadge ?? fmt(totals[ti], hasTabVal(row.student_id, t, scoreMap))}
                </td>
              ))}
              <td className={`bg-finale-light border border-gray-200 px-4 py-2 text-center font-bold text-base ${
                final != null ? (final >= 10 ? 'text-green-800' : 'text-red-700') : 'text-gray-700'
              }`}>
                {stBadge ?? fmt(final, graded)}
              </td>
            </tr>
          ))}
        </tbody>
        {validFinals.length > 0 && (
          <tfoot>
            <tr className="bg-gray-100 font-semibold text-xs text-gray-700">
              <td className="arabic border border-gray-200 px-4 py-2.5 text-right sticky start-0 bg-gray-100">
                ملخص القسم ({validFinals.length} تلميذ)
              </td>
              <td colSpan={tabs.length} className="arabic border border-gray-200 px-4 py-2.5 text-center">
                أدنى: {min} · أقصى: {max} · نسبة النجاح (≥10): {passPct}%
              </td>
              <td className="arabic border border-gray-200 px-4 py-2.5 text-center bg-yellow-100 text-gray-900 font-bold">
                المعدل: {avg}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
