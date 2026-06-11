import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, SessionInfo, ScoreRow, ScoreSaveItem, TemplateDef } from '../api/client'
import { groups as templateGroups, finalFromGroupTotals } from '../lib/grid'
import { palette, UIPalette } from '../lib/palette'
import { enqueue, getQueued, removeQueued, flushOne, QueuedSave } from '../lib/offlineQueue'

// ── UI structure built from the session's pinned grid template ────────────────
// Flattened value keys inside the score map:
//   c:<criterion_id>  |  b:<section_id> (bonus)  |  s:<section_id> (ST override)
interface Subsection {
  secId: string
  label: string
  fields: { key: string; label: string }[]
  bonusField?: string
  stField?: string
}
interface Tab {
  key: string; label: string
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
      fields: sec.criteria.map(c => ({ key: `c:${c.id}`, label: c.label })),
      bonusField: sec.has_bonus ? `b:${sec.id}` : undefined,
      stField: sec.allow_st_override ? `s:${sec.id}` : undefined,
    })),
  }))
}

// ── Helpers ───────────────────────────────────────────────────────────────────
type ScoreMap = Record<string, Record<string, number | null>>

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
function fmt(n: number | null) { return n != null && n > 0 ? +n.toFixed(2) + '' : '—' }

// ── Main component ────────────────────────────────────────────────────────────
export default function ScoreEntry() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [activeTab,    setActiveTab]    = useState<string | null>(null)
  const [scoreMap,     setScoreMap]     = useState<ScoreMap>({})
  const [isDirty,      setIsDirty]      = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [saveMsg,      setSaveMsg]      = useState('')
  const [saveErr,      setSaveErr]      = useState('')
  const [mobileIdx,    setMobileIdx]    = useState<number | null>(null)
  const [xlsxError,    setXlsxError]    = useState('')
  const [xlsxLoading,  setXlsxLoading]  = useState(false)
  const [search,       setSearch]       = useState('')
  const [finalizing,   setFinalizing]   = useState(false)
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null)
  const [queuedSave,   setQueuedSave]   = useState<QueuedSave | null>(null)
  const [conflict,     setConflict]     = useState(false)
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

  useEffect(() => {
    if (!rows.length) return
    const map = initMap(rows)
    const latest = rows.reduce<string | null>(
      (acc, r) => (r.updated_at && (!acc || r.updated_at > acc) ? r.updated_at : acc), null)
    setBaseUpdatedAt(latest)
    // Overlay scores saved locally while offline (not yet synced)
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
        }
        setQueuedSave(q)
        if (q.status === 'conflict') setConflict(true)
      }
      setScoreMap(map)
    })
  }, [rows, id])
  useEffect(() => { if (tabs.length && !activeTab) setActiveTab(tabs[0].key) }, [tabs, activeTab])

  const visibleRows = search.trim()
    ? rows.filter(r => r.student_name.includes(search.trim()))
    : rows

  const update = useCallback((sid: string, field: string, raw: string) => {
    if (locked) return
    const val = raw === '' ? null : parseFloat(raw)
    setScoreMap(prev => ({ ...prev, [sid]: { ...prev[sid], [field]: isNaN(val as number) ? null : val } }))
    setIsDirty(true)
    setSaveMsg('')
  }, [locked])

  async function toggleFinalize() {
    setFinalizing(true)
    try {
      await api.sessions.finalize(id!, !locked)
      await qc.invalidateQueries({ queryKey: ['session', id] })
    } catch (err: any) {
      alert(err.message || 'حدث خطأ')
    } finally {
      setFinalizing(false)
    }
  }

  function collectScores(): ScoreSaveItem[] {
    return rows.map(r => ({
      student_id: r.student_id,
      ...unflatten(scoreMap[r.student_id]),
    }))
  }

  async function save(force = false) {
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
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        await enqueue(id!, scores, baseUpdatedAt)
        setQueuedSave(await getQueued(id!) ?? null)
        setConflict(true)
      } else if (err instanceof ApiError) {
        setSaveErr(err.message || 'فشل الحفظ')
      } else {
        // Network failure — keep the scores locally, sync later
        await enqueue(id!, scores, baseUpdatedAt)
        setQueuedSave(await getQueued(id!) ?? null)
        setIsDirty(false)
        setSaveMsg('محفوظ محليًا 📡')
      }
    } finally { setSaving(false) }
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

  const tab = tabs.find(t => t.key === activeTab) ?? null
  const dir = template?.direction ?? 'ltr'
  const finaleLabel = dir === 'ltr' ? 'Note Finale' : 'النتيجة النهائية'

  // Mobile: student editor open → show full-screen overlay
  if (mobileIdx !== null && tab && activeTab !== 'finale') {
    return (
      <MobileEditor
        rows={rows} idx={mobileIdx} tab={tab} scoreMap={scoreMap}
        onUpdate={update}
        onClose={() => setMobileIdx(null)}
        onNavigate={setMobileIdx}
        isDirty={isDirty} saving={saving} saveMsg={saveMsg} onSave={() => save()}
      />
    )
  }

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
            {saveMsg && <span className="hidden sm:block arabic text-xs text-green-600 font-medium">{saveMsg}</span>}
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

            {/* Finalize (teacher) / Unlock (director only) */}
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

      {/* ── Search bar ── */}
      {activeTab !== 'finale' && (
        <div className="px-4 md:px-6 py-2 flex-shrink-0">
          <div className="relative max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              type="text"
              placeholder="البحث عن تلميذ…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-8 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white arabic"
              dir="rtl"
            />
            {search && (
              <button onClick={() => setSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                ✕
              </button>
            )}
          </div>
          {search && (
            <p className="arabic text-xs text-gray-400 mt-1 mr-1 text-right" dir="rtl">
              {visibleRows.length} تلميذ
            </p>
          )}
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
              <MobileFinaleList rows={rows} tabs={tabs} template={template} scoreMap={scoreMap} />
            </div>
            <div className="hidden md:block">
              <DesktopFinale rows={rows} tabs={tabs} template={template} scoreMap={scoreMap} finaleLabel={finaleLabel} />
            </div>
          </>
        ) : tab ? (
          <div dir={dir}>
            <div className="md:hidden space-y-2 pt-1">
              <MobileStudentList rows={visibleRows} tab={tab} scoreMap={scoreMap} onSelect={i => {
                setMobileIdx(rows.indexOf(visibleRows[i]))
              }} />
            </div>
            <div className="hidden md:block">
              <DesktopTable rows={visibleRows} tab={tab} scoreMap={scoreMap} onUpdate={update} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── Mobile: student list ───────────────────────────────────────────────────────
function MobileStudentList({ rows, tab, scoreMap, onSelect }: {
  rows: ScoreRow[]; tab: Tab; scoreMap: ScoreMap; onSelect: (i: number) => void
}) {
  return (
    <>
      {rows.map((row, i) => {
        const total = tabTot(row.student_id, tab, scoreMap)
        const hasScores = tab.subsections.some(s =>
          s.fields.some(f => (scoreMap[row.student_id]?.[f.key] ?? null) !== null)
          || (s.stField && (scoreMap[row.student_id]?.[s.stField] ?? null) !== null)
        )
        return (
          <button key={row.student_id} onClick={() => onSelect(i)}
                  className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 text-left active:bg-gray-50 transition">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-6 text-right flex-shrink-0">{i + 1}</span>
              <span className="arabic text-gray-900 font-medium">{row.student_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${hasScores ? 'text-gray-800' : 'text-gray-300'}`}>
                {hasScores ? total : '—'}
              </span>
              <span className="text-gray-400 text-lg">›</span>
            </div>
          </button>
        )
      })}
    </>
  )
}

// ── Mobile: full-screen score editor ──────────────────────────────────────────
function MobileEditor({ rows, idx, tab, scoreMap, onUpdate, onClose, onNavigate, isDirty, saving, saveMsg, onSave }: {
  rows: ScoreRow[]; idx: number; tab: Tab; scoreMap: ScoreMap
  onUpdate: (sid: string, f: string, v: string) => void
  onClose: () => void; onNavigate: (i: number) => void
  isDirty: boolean; saving: boolean; saveMsg: string; onSave: () => void
}) {
  const row   = rows[idx]
  const total = tabTot(row.student_id, tab, scoreMap)

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <button onClick={onClose} className="arabic text-blue-600 font-medium text-sm flex items-center gap-1">
          ← القائمة
        </button>
        <div className="text-center">
          <p className="arabic font-bold text-gray-900 text-sm">{row.student_name}</p>
          <p className="text-xs text-gray-400">{idx + 1} / {rows.length}</p>
        </div>
        <button onClick={onSave} disabled={saving || !isDirty}
                className="arabic text-xs bg-blue-600 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-lg font-medium">
          {saving ? '…' : saveMsg ? '✓' : 'حفظ'}
        </button>
      </div>

      {/* Score fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tab.subsections.map(sub => {
          const st = subTot(row.student_id, sub, scoreMap)
          return (
            <div key={sub.secId} className={`${tab.pal.cardBg} border ${tab.pal.cardBorder} rounded-2xl p-4`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">{sub.label}</h3>
                {(sub.bonusField || sub.stField) && (
                  <span className={`text-sm font-bold ${tab.pal.accentText}`}>
                    S.T. {fmt(st)}
                  </span>
                )}
              </div>

              {/* Criteria grid — dimmed when direct S.T. is active */}
              <div className={`grid grid-cols-3 gap-2 transition-opacity ${isDirect(row.student_id, sub, scoreMap) ? 'opacity-40 pointer-events-none' : ''}`}>
                {sub.fields.map(f => (
                  <div key={f.key}>
                    <label className="text-xs text-gray-500 mb-1 block text-center">{f.label}</label>
                    <input type="number" min={0} step={0.25} inputMode="decimal"
                           className="w-full border border-gray-200 bg-white rounded-xl px-2 py-2.5 text-center text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                           value={scoreMap[row.student_id]?.[f.key] ?? ''}
                           onFocus={e => e.target.select()}
                           onChange={e => onUpdate(row.student_id, f.key, e.target.value)} />
                  </div>
                ))}
                {sub.bonusField && (
                  <div>
                    <label className="text-xs text-green-600 font-semibold mb-1 block text-center">Bonus</label>
                    <input type="number" min={0} step={0.25} inputMode="decimal"
                           className="w-full border border-green-300 bg-green-50 rounded-xl px-2 py-2.5 text-center text-base focus:outline-none focus:ring-2 focus:ring-green-400"
                           value={scoreMap[row.student_id]?.[sub.bonusField] ?? ''}
                           onFocus={e => e.target.select()}
                           onChange={e => onUpdate(row.student_id, sub.bonusField!, e.target.value)} />
                  </div>
                )}
              </div>

              {/* Direct S.T. override */}
              {sub.stField && (
                <div className="mt-3 pt-3 border-t border-dashed border-gray-300">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="arabic text-xs font-semibold text-gray-600 mb-1 block">
                        {isDirect(row.student_id, sub, scoreMap) ? 'مجموع مباشر ✓' : 'مجموع مباشر (اختياري)'}
                      </label>
                      <input type="number" min={0} step={0.25} inputMode="decimal"
                             className={`w-full border rounded-xl px-3 py-2.5 text-center text-lg font-bold focus:outline-none focus:ring-2 ${
                               isDirect(row.student_id, sub, scoreMap)
                                 ? 'border-blue-400 bg-blue-50 focus:ring-blue-400'
                                 : 'border-gray-300 bg-white focus:ring-gray-400'
                             }`}
                             value={scoreMap[row.student_id]?.[sub.stField] ?? ''}
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

        {/* Total */}
        <div className={`${tab.pal.totalBg} rounded-2xl px-4 py-4 flex justify-between items-center`}>
          <span className="font-bold text-gray-800">Total {tab.label}</span>
          <span className="text-2xl font-bold text-gray-900">{fmt(total)}</span>
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
function MobileFinaleList({ rows, tabs, template, scoreMap }: {
  rows: ScoreRow[]; tabs: Tab[]; template: TemplateDef; scoreMap: ScoreMap
}) {
  return (
    <>
      {rows.map((row, i) => {
        const totals = tabs.map(t => tabTot(row.student_id, t, scoreMap))
        const final = finalFromGroupTotals(template, totals)
        return (
          <div key={row.student_id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{i + 1}</span>
                <span className="arabic font-semibold text-gray-900">{row.student_name}</span>
              </div>
              <span className="text-xl font-bold text-yellow-700">{fmt(final)}</span>
            </div>
            <div className={`grid gap-2 text-center text-xs`} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
              {tabs.map((t, ti) => (
                <div key={t.key} className={`${t.pal.dataBg} rounded-lg py-2`}>
                  <div className="text-gray-500 mb-0.5 truncate px-1">{t.label}</div>
                  <div className="font-bold text-gray-800">{fmt(totals[ti])}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

// ── Desktop: wide scrollable table ────────────────────────────────────────────
function DesktopTable({ rows, tab, scoreMap, onUpdate }: {
  rows: ScoreRow[]; tab: Tab; scoreMap: ScoreMap
  onUpdate: (sid: string, f: string, v: string) => void
}) {
  return (
    <div className="rounded-b-xl rounded-tr-xl border border-gray-200 overflow-auto bg-white">
      <table className="text-sm border-collapse min-w-max">
        <thead>
          <tr>
            <th className="bg-gray-100 border border-gray-200 px-3 py-2 text-right font-medium text-gray-600 min-w-[200px] sticky left-0 z-10">
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
            <th className="bg-gray-100 border border-gray-200 sticky left-0 z-10" />
            {tab.subsections.map(sub => (
              <>
                {sub.fields.map(f => (
                  <th key={f.key} className={`${tab.pal.hdrBg} border border-gray-200 px-2 py-1.5 text-center font-medium text-gray-600 text-xs`}>
                    {f.label}
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
          {rows.map((row, i) => (
            <tr key={row.student_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className={`arabic border border-gray-200 px-3 py-1.5 text-right sticky left-0 z-10 font-medium ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                <span className="text-gray-400 text-xs mr-2">{i + 1}</span>{row.student_name}
              </td>
              {tab.subsections.map(sub => (
                <>
                  {sub.fields.map(f => (
                    <td key={f.key} className={`border border-gray-200 p-0 ${tab.pal.dataBg}`}>
                      <input
                        type="number" min={0} step={0.25}
                        data-row={i} data-field={f.key}
                        className="score-input h-8 px-1 w-14"
                        value={scoreMap[row.student_id]?.[f.key] ?? ''}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            document.querySelector<HTMLInputElement>(`[data-row="${i+1}"][data-field="${f.key}"]`)?.focus()
                          }
                        }}
                        onChange={e => onUpdate(row.student_id, f.key, e.target.value)}
                      />
                    </td>
                  ))}
                  {sub.bonusField && (
                    <td key={`${sub.secId}-b`} className="border border-gray-200 p-0 bg-[#E2EFDA]">
                      <input
                        type="number" min={0} step={0.25}
                        data-row={i} data-field={sub.bonusField}
                        className="score-input h-8 px-1 w-14"
                        value={scoreMap[row.student_id]?.[sub.bonusField] ?? ''}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            document.querySelector<HTMLInputElement>(`[data-row="${i+1}"][data-field="${sub.bonusField}"]`)?.focus()
                          }
                        }}
                        onChange={e => onUpdate(row.student_id, sub.bonusField!, e.target.value)}
                      />
                    </td>
                  )}
                  {(sub.bonusField || sub.stField) && (
                    <td key={`${sub.secId}-s`} className={`${tab.pal.stBg} border border-gray-200 p-0`}>
                      {sub.stField ? (
                        <input
                          type="number" min={0} step={0.25}
                          data-row={i} data-field={sub.stField}
                          className="score-input h-8 px-1 w-16 font-bold"
                          placeholder={isDirect(row.student_id, sub, scoreMap) ? '' : fmt(subTot(row.student_id, sub, scoreMap))}
                          value={scoreMap[row.student_id]?.[sub.stField] ?? ''}
                          onFocus={e => e.target.select()}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              document.querySelector<HTMLInputElement>(`[data-row="${i+1}"][data-field="${sub.stField}"]`)?.focus()
                            }
                          }}
                          onChange={e => onUpdate(row.student_id, sub.stField!, e.target.value)}
                        />
                      ) : (
                        <span className="block px-2 text-center font-bold text-gray-800 text-sm">
                          {fmt(subTot(row.student_id, sub, scoreMap))}
                        </span>
                      )}
                    </td>
                  )}
                </>
              ))}
              <td className={`${tab.pal.totalBg} border border-gray-200 px-2 py-1.5 text-center font-bold text-gray-800`}>
                {fmt(tabTot(row.student_id, tab, scoreMap))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Desktop: finale table ──────────────────────────────────────────────────────
function DesktopFinale({ rows, tabs, template, scoreMap, finaleLabel }: {
  rows: ScoreRow[]; tabs: Tab[]; template: TemplateDef; scoreMap: ScoreMap; finaleLabel: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-auto bg-white">
      <table className="text-sm border-collapse min-w-max">
        <thead>
          <tr>
            <th className="bg-gray-100 border border-gray-200 px-4 py-2.5 text-right font-medium text-gray-700 min-w-[200px] sticky left-0">
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
          {rows.map((row, i) => {
            const totals = tabs.map(t => tabTot(row.student_id, t, scoreMap))
            const final = finalFromGroupTotals(template, totals)
            return (
              <tr key={row.student_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className={`arabic border border-gray-200 px-4 py-2 text-right font-medium sticky left-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  <span className="text-gray-400 text-xs mr-2">{i + 1}</span>{row.student_name}
                </td>
                {tabs.map((t, ti) => (
                  <td key={t.key} className={`${t.pal.dataBg} border border-gray-200 px-4 py-2 text-center`}>{fmt(totals[ti])}</td>
                ))}
                <td className="bg-finale-light border border-gray-200 px-4 py-2 text-center font-bold text-gray-900 text-base">{fmt(final)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
