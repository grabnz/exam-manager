import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, Subject, TemplateDef, TemplateSpec } from '../../api/client'
import { groups as templateGroups } from '../../lib/grid'

export default function Templates() {
  const qc = useQueryClient()
  const [subjectId, setSubjectId] = useState('')
  const [error,     setError]     = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ['subjects'], queryFn: api.subjects.list,
  })
  const activeSubject = subjectId || subjects[0]?.id || ''

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', activeSubject],
    queryFn:  () => api.templates.listForSubject(activeSubject),
    enabled:  !!activeSubject,
  })

  async function run(fn: () => Promise<unknown>) {
    setError('')
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: ['templates'] })
      await qc.invalidateQueries({ queryKey: ['template'] })
    } catch (err: any) {
      setError(err.message || 'حدث خطأ')
    }
  }

  return (
    <div className="space-y-5" dir="rtl">
      {error && (
        <div className="arabic bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <p className="arabic text-xs text-gray-400">
        شبكات التقييم تحدد معايير كل مادة. الشبكات الجاهزة غير قابلة للتعديل: انسخوها ثم عدّلوا النسخة.
        الجلسات الجديدة تستعمل آخر شبكة معدّلة للمادة، والجلسات القديمة تحتفظ بشبكتها.
      </p>

      {/* Subject selector */}
      <div className="flex flex-wrap gap-1.5">
        {subjects.map(s => (
          <button key={s.id} onClick={() => { setSubjectId(s.id); setEditingId(null) }}
                  className={`arabic text-xs px-3 py-1.5 rounded-full border transition ${
                    activeSubject === s.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}>
            {s.name_ar}
          </button>
        ))}
      </div>

      {/* Template list */}
      <div className="space-y-3">
        {templates.map(t => (
          <TemplateCard
            key={t.id}
            templateId={t.id}
            isBuiltin={t.is_builtin}
            editing={editingId === t.id}
            onEdit={() => setEditingId(editingId === t.id ? null : t.id)}
            onClone={() => run(() => api.templates.clone(t.id))}
            onDelete={() => {
              if (window.confirm('حذف هذه الشبكة نهائياً؟')) run(() => api.templates.delete(t.id))
            }}
            onSaved={() => { setEditingId(null); run(async () => {}) }}
            onError={setError}
          />
        ))}
      </div>
    </div>
  )
}

// ── Template card with preview + editor ───────────────────────────────────────
function TemplateCard({ templateId, isBuiltin, editing, onEdit, onClone, onDelete, onSaved, onError }: {
  templateId: string
  isBuiltin: boolean
  editing: boolean
  onEdit: () => void
  onClone: () => void
  onDelete: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const { data: tpl } = useQuery<TemplateDef>({
    queryKey: ['template', templateId],
    queryFn:  () => api.templates.get(templateId),
  })

  if (!tpl) return <div className="bg-white border border-gray-200 rounded-xl p-4 text-gray-300">…</div>

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="arabic text-sm font-semibold text-gray-800">{tpl.name}</span>
          {tpl.is_builtin
            ? <span className="arabic text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">جاهزة 🔒</span>
            : <span className="arabic text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">مخصصة</span>}
          <span className="arabic text-xs text-gray-400">
            {tpl.final_formula === 'avg_groups' ? 'معدل المجالات'
              : tpl.final_formula === 'sum_capped' ? `مجموع ≤ ${tpl.final_cap ?? 20}` : 'مجموع المعايير'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={onClone}
                  className="arabic text-xs text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 px-2 py-1 rounded-lg">
            نسخ
          </button>
          {!isBuiltin && (
            <>
              <button onClick={onEdit}
                      className="arabic text-xs text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 px-2 py-1 rounded-lg">
                {editing ? 'إغلاق' : 'تعديل'}
              </button>
              <button onClick={onDelete}
                      className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 px-2 py-1 rounded-lg">
                ✕
              </button>
            </>
          )}
        </div>
      </div>

      {editing && !isBuiltin
        ? <TemplateEditor tpl={tpl} onSaved={onSaved} onError={onError} />
        : <TemplatePreview tpl={tpl} />}
    </div>
  )
}

function TemplatePreview({ tpl }: { tpl: TemplateDef }) {
  return (
    <div className="px-4 py-3 space-y-2" dir={tpl.direction}>
      {templateGroups(tpl).map(g => (
        <div key={g.key}>
          <p className="text-xs font-semibold text-gray-500 mb-1">{g.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {g.sections.map(sec => (
              <div key={sec.id} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                <span className="text-xs font-medium text-gray-700">{sec.label}:</span>
                {sec.criteria.map(c => (
                  <span key={c.id} className="text-xs text-gray-500">
                    {c.label}{c.max_score ? `/${c.max_score}` : ''}
                  </span>
                ))}
                {sec.has_bonus && <span className="text-xs text-green-600">+Bonus</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Editor (custom templates only) ─────────────────────────────────────────────
function TemplateEditor({ tpl, onSaved, onError }: {
  tpl: TemplateDef
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [spec, setSpec] = useState<TemplateSpec>(() => ({
    name: tpl.name,
    final_formula: tpl.final_formula,
    final_cap: tpl.final_cap ?? null,
    direction: tpl.direction,
    sections: tpl.sections.map(s => ({
      group_label: s.group_label,
      label: s.label,
      has_bonus: s.has_bonus,
      allow_st_override: s.allow_st_override,
      color_key: s.color_key ?? null,
      criteria: s.criteria.map(c => ({ label: c.label, max_score: c.max_score ?? null })),
    })),
  }))
  const [saving, setSaving] = useState(false)

  function setSection(i: number, patch: Partial<TemplateSpec['sections'][0]>) {
    setSpec(p => ({ ...p, sections: p.sections.map((s, si) => si === i ? { ...s, ...patch } : s) }))
  }

  async function save() {
    setSaving(true)
    try {
      await api.templates.update(tpl.id, spec)
      onSaved()
    } catch (err: any) {
      onError(err.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 py-4 space-y-4 bg-gray-50 border-t border-gray-100">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="arabic block text-xs font-medium text-gray-600 mb-1">اسم الشبكة</label>
          <input value={spec.name} onChange={e => setSpec(p => ({ ...p, name: e.target.value }))}
                 className="arabic w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right bg-white" />
        </div>
        <div>
          <label className="arabic block text-xs font-medium text-gray-600 mb-1">النتيجة النهائية</label>
          <select value={spec.final_formula}
                  onChange={e => setSpec(p => ({ ...p, final_formula: e.target.value as TemplateSpec['final_formula'] }))}
                  className="arabic w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="sum_sections">مجموع المعايير</option>
            <option value="avg_groups">معدل المجالات</option>
            <option value="sum_capped">مجموع بسقف</option>
          </select>
          {spec.final_formula === 'sum_capped' && (
            <input type="number" placeholder="السقف (مثال 20)" value={spec.final_cap ?? ''}
                   onChange={e => setSpec(p => ({ ...p, final_cap: e.target.value === '' ? null : +e.target.value }))}
                   className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white" />
          )}
        </div>
      </div>

      {/* Sections */}
      {spec.sections.map((sec, si) => (
        <div key={si} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input value={sec.group_label} onChange={e => setSection(si, { group_label: e.target.value })}
                   placeholder="المجال" title="المجال (تجميع الأقسام)"
                   className="arabic w-32 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right" />
            <input value={sec.label} onChange={e => setSection(si, { label: e.target.value })}
                   placeholder="القسم" title="القسم"
                   className="arabic flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right font-medium" />
            <label className="arabic flex items-center gap-1 text-xs text-gray-500">
              <input type="checkbox" checked={sec.has_bonus}
                     onChange={e => setSection(si, { has_bonus: e.target.checked })} />
              إضافي
            </label>
            <label className="arabic flex items-center gap-1 text-xs text-gray-500">
              <input type="checkbox" checked={sec.allow_st_override}
                     onChange={e => setSection(si, { allow_st_override: e.target.checked })} />
              مجموع مباشر
            </label>
            <button onClick={() => setSpec(p => ({ ...p, sections: p.sections.filter((_, i) => i !== si) }))}
                    disabled={spec.sections.length === 1}
                    className="text-xs text-gray-300 hover:text-red-500 disabled:opacity-30">✕</button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {sec.criteria.map((c, ci) => (
              <div key={ci} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                <input value={c.label}
                       onChange={e => setSection(si, {
                         criteria: sec.criteria.map((x, i) => i === ci ? { ...x, label: e.target.value } : x),
                       })}
                       className="arabic w-14 bg-transparent text-xs text-center focus:outline-none" />
                <span className="text-gray-300 text-xs">/</span>
                <input type="number" value={c.max_score ?? ''} placeholder="—"
                       onChange={e => setSection(si, {
                         criteria: sec.criteria.map((x, i) => i === ci ? { ...x, max_score: e.target.value === '' ? null : +e.target.value } : x),
                       })}
                       className="w-10 bg-transparent text-xs text-center focus:outline-none" />
                <button onClick={() => setSection(si, { criteria: sec.criteria.filter((_, i) => i !== ci) })}
                        disabled={sec.criteria.length === 1}
                        className="text-gray-300 hover:text-red-500 text-xs disabled:opacity-30">✕</button>
              </div>
            ))}
            <button onClick={() => setSection(si, { criteria: [...sec.criteria, { label: `مع${sec.criteria.length + 1}`, max_score: null }] })}
                    className="arabic text-xs text-blue-600 border border-dashed border-blue-300 rounded-lg px-2 py-1 hover:bg-blue-50">
              + معيار
            </button>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <button onClick={() => setSpec(p => ({
                  ...p,
                  sections: [...p.sections, {
                    group_label: p.sections[p.sections.length - 1]?.group_label ?? 'المجال',
                    label: 'قسم جديد', has_bonus: true, allow_st_override: true, color_key: null,
                    criteria: [{ label: 'مع1', max_score: null }],
                  }],
                }))}
                className="arabic text-xs text-blue-600 border border-dashed border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-50">
          + قسم
        </button>
        <button onClick={save} disabled={saving}
                className="arabic mr-auto px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium">
          {saving ? 'جاري الحفظ…' : 'حفظ الشبكة'}
        </button>
      </div>
    </div>
  )
}
