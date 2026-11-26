import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, DocumentRow } from '../api/client'
import { useAuth } from '../auth'
import { useUI } from '../components/ui'
import { relativeTimeAr } from '../lib/subjectStyle'
import AppShell from '../components/AppShell'
import { EmptyState, ListSkeleton } from '../components/Skeleton'
import {
  FileIcon, FileSpreadsheetIcon, FileArchiveIcon, PresentationIcon,
  ImageIcon, FolderIcon, UploadIcon, DownloadIcon, TrashIcon, AlertIcon,
} from '../components/icons'

function fileVisual(contentType: string, filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (contentType.includes('pdf') || ext === 'pdf') return { Icon: FileIcon, tint: 'bg-rose-50 text-rose-600' }
  if (contentType.startsWith('image/')) return { Icon: ImageIcon, tint: 'bg-violet-50 text-violet-600' }
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { Icon: FileSpreadsheetIcon, tint: 'bg-emerald-50 text-emerald-700' }
  if (['ppt', 'pptx'].includes(ext)) return { Icon: PresentationIcon, tint: 'bg-amber-50 text-amber-700' }
  if (['zip', 'rar'].includes(ext)) return { Icon: FileArchiveIcon, tint: 'bg-slate-100 text-slate-700' }
  return { Icon: FileIcon, tint: 'bg-brand-light text-brand' }
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

export default function Documents() {
  const qc = useQueryClient()
  const ui = useUI()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const fileRef = useRef<HTMLInputElement>(null)

  const [error,     setError]     = useState('')
  const [uploading, setUploading] = useState(false)
  const [title,     setTitle]     = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  const { data: docs = [], isLoading } = useQuery<DocumentRow[]>({
    queryKey: ['documents'],
    queryFn:  api.documents.list,
  })

  async function run(fn: () => Promise<unknown>) {
    setError('')
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: ['documents'] })
    } catch (err: any) {
      setError(err.message || 'حدث خطأ')
    }
  }

  async function upload() {
    if (!pendingFile) return
    setUploading(true)
    try {
      await run(() => api.documents.upload(pendingFile, title))
      setPendingFile(null)
      setTitle('')
    } finally {
      setUploading(false)
    }
  }

  const pendingVis = pendingFile ? fileVisual(pendingFile.type, pendingFile.name) : null

  return (
    <AppShell
      title="الوثائق الرسمية"
      subtitle={isAdmin ? 'منشورة من الإدارة لجميع المعلمين' : 'وثائق منشورة من إدارة المدرسة'}
      actions={
        isAdmin ? (
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="arabic inline-flex items-center gap-1.5 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white px-4 py-2 rounded-xl text-xs md:text-sm font-semibold shadow-sm transition">
            <UploadIcon className="w-4 h-4" /> نشر وثيقة
          </button>
        ) : undefined
      }
    >
      <div className="max-w-3xl space-y-4" dir="rtl">
        {error && (
          <div className="arabic bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2.5 rounded-2xl text-sm">{error}</div>
        )}

        <input ref={fileRef} type="file" className="hidden"
               onChange={e => { const f = e.target.files?.[0]; if (f) { setPendingFile(f); setTitle('') } e.target.value = '' }} />

        {/* Pending upload confirmation */}
        {pendingFile && pendingVis && (
          <div className="bg-surface border border-brand-mid rounded-3xl p-5 space-y-3 shadow-card">
            <div className="flex items-center gap-3">
              <span className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${pendingVis.tint}`}>
                <pendingVis.Icon className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink truncate" dir="ltr">{pendingFile.name}</p>
                <p className="text-xs text-ink-muted flex items-center gap-1">
                  <span>{humanSize(pendingFile.size)}</span>
                  {pendingFile.size > 4 * 1024 * 1024 && (
                    <span className="arabic text-rose-600 inline-flex items-center gap-1">
                      — <AlertIcon className="w-3.5 h-3.5" /> الحد الأقصى 4 ميغابايت
                    </span>
                  )}
                </p>
              </div>
            </div>
            <input value={title} onChange={e => setTitle(e.target.value)}
                   placeholder="عنوان الوثيقة (مثال: منشور التقييم — الثلاثي الثاني)"
                   className="arabic w-full border border-line bg-canvas/40 focus:bg-surface rounded-xl px-3.5 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand/40" />
            <div className="flex gap-2">
              <button onClick={upload} disabled={uploading || pendingFile.size > 4 * 1024 * 1024}
                      className="arabic px-5 py-2 bg-brand hover:bg-brand-hover disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold shadow-sm transition">
                {uploading ? 'جاري النشر…' : 'نشر'}
              </button>
              <button onClick={() => setPendingFile(null)}
                      className="arabic px-4 py-2 text-sm text-ink-muted hover:text-ink transition">
                إلغاء
              </button>
            </div>
          </div>
        )}

        {/* Document list */}
        {isLoading ? (
          <ListSkeleton rows={4} />
        ) : docs.length === 0 ? (
          <EmptyState
            Icon={FolderIcon}
            title="لا وثائق منشورة بعد"
            description={isAdmin ? 'انشروا منشورات الوزارة والمذكرات الإدارية ليصل إليها جميع المعلمين.' : 'ستظهر هنا الوثائق والمذكرات المنشورة من إدارة المدرسة.'}
          />
        ) : (
          <div className="space-y-2.5">
            {docs.map(d => {
              const vis = fileVisual(d.content_type, d.filename)
              return (
                <div key={d.id}
                     className="flex items-center gap-3 bg-surface border border-line rounded-2xl px-4 py-3.5 shadow-card hover:border-brand/40 transition">
                  <span className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${vis.tint}`}>
                    <vis.Icon className="w-5 h-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="arabic text-sm font-bold text-ink truncate">{d.title}</p>
                    <p className="text-xs text-ink-subtle truncate num">
                      <span dir="ltr">{d.filename} · {humanSize(d.size)}</span>
                      {d.created_at && <span className="arabic"> · {relativeTimeAr(d.created_at)}</span>}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      setDownloading(d.id)
                      const err = await api.documents.download(d.id, d.filename)
                      setDownloading(null)
                      if (err) setError('فشل التحميل')
                    }}
                    disabled={downloading === d.id}
                    className="arabic inline-flex items-center gap-1.5 text-xs bg-brand-light text-brand hover:bg-brand hover:text-white px-3.5 py-2 rounded-xl font-semibold flex-shrink-0 transition">
                    <DownloadIcon className="w-3.5 h-3.5" />
                    <span>{downloading === d.id ? '…' : 'تحميل'}</span>
                  </button>
                  {isAdmin && (
                    <button
                      onClick={async () => {
                        const ok = await ui.confirm({
                          title: 'حذف الوثيقة',
                          message: `حذف "${d.title}" نهائياً؟`,
                          confirmLabel: 'حذف',
                          danger: true,
                        })
                        if (ok) run(() => api.documents.delete(d.id))
                      }}
                      className="p-2 text-ink-subtle hover:text-rose-600 rounded-xl transition flex-shrink-0"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
