import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, DocumentRow } from '../api/client'
import { useAuth } from '../auth'
import { relativeTimeAr } from '../lib/subjectStyle'

function fileIcon(contentType: string, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (contentType.includes('pdf') || ext === 'pdf') return '📕'
  if (contentType.startsWith('image/')) return '🖼️'
  if (['doc', 'docx'].includes(ext)) return '📝'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊'
  if (['ppt', 'pptx'].includes(ext)) return '📽️'
  if (['zip', 'rar'].includes(ext)) return '🗜️'
  return '📄'
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

export default function Documents() {
  const navigate = useNavigate()
  const qc = useQueryClient()
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <button onClick={() => navigate('/')}
                className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-3">
          ← الرئيسية
        </button>
        <div className="flex items-center justify-between" dir="rtl">
          <div>
            <h1 className="arabic text-xl font-bold text-gray-900">📂 الوثائق الرسمية</h1>
            <p className="arabic text-sm text-gray-400">
              {isAdmin ? 'منشورة من الإدارة لجميع المعلمين' : 'وثائق منشورة من إدارة المدرسة'}
            </p>
          </div>
          {isAdmin && (
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="arabic bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
              ⬆ نشر وثيقة
            </button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-4" dir="rtl">
        {error && (
          <div className="arabic bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-sm">{error}</div>
        )}

        <input ref={fileRef} type="file" className="hidden"
               onChange={e => { const f = e.target.files?.[0]; if (f) { setPendingFile(f); setTitle('') } e.target.value = '' }} />

        {/* Pending upload confirmation */}
        {pendingFile && (
          <div className="bg-white border border-blue-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{fileIcon(pendingFile.type, pendingFile.name)}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate" dir="ltr">{pendingFile.name}</p>
                <p className="text-xs text-gray-400">{humanSize(pendingFile.size)}{pendingFile.size > 4 * 1024 * 1024 && ' — ⚠ الحد الأقصى 4 ميغابايت'}</p>
              </div>
            </div>
            <input value={title} onChange={e => setTitle(e.target.value)}
                   placeholder="عنوان الوثيقة (مثال: منشور التقييم — الثلاثي الثاني)"
                   className="arabic w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <div className="flex gap-2">
              <button onClick={upload} disabled={uploading || pendingFile.size > 4 * 1024 * 1024}
                      className="arabic px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-medium">
                {uploading ? 'جاري النشر…' : 'نشر'}
              </button>
              <button onClick={() => setPendingFile(null)}
                      className="arabic px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                إلغاء
              </button>
            </div>
          </div>
        )}

        {/* Document list */}
        {isLoading ? (
          <div className="text-center py-16 text-gray-300">…</div>
        ) : docs.length === 0 ? (
          <div className="text-center py-20 text-gray-300">
            <div className="text-5xl mb-3">📂</div>
            <p className="arabic text-sm text-gray-400">
              {isAdmin ? 'لا وثائق منشورة بعد — انشروا منشورات الوزارة والمذكرات هنا.' : 'لا وثائق منشورة بعد.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map(d => (
              <div key={d.id}
                   className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl px-4 py-3 hover:border-blue-200 transition">
                <span className="w-11 h-11 rounded-xl bg-gray-50 flex items-center justify-center text-xl flex-shrink-0">
                  {fileIcon(d.content_type, d.filename)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="arabic text-sm font-semibold text-gray-800 truncate">{d.title}</p>
                  <p className="text-xs text-gray-400 truncate">
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
                  className="arabic text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-2 rounded-xl font-medium flex-shrink-0 transition">
                  {downloading === d.id ? '…' : '⬇ تحميل'}
                </button>
                {isAdmin && (
                  <button onClick={() => { if (confirm(`حذف "${d.title}" نهائياً؟`)) run(() => api.documents.delete(d.id)) }}
                          className="text-gray-300 hover:text-red-500 text-sm flex-shrink-0">✕</button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
