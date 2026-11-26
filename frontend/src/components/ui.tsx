import { createContext, useCallback, useContext, useState } from 'react'
import { AlertIcon, CheckCircleIcon, InfoIcon } from './icons'

interface ConfirmOpts {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}

interface PromptOpts {
  title: string
  label?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  dir?: 'rtl' | 'ltr'
}

interface ToastItem {
  id: number
  message: string
  kind: 'success' | 'error' | 'info'
}

interface UIContextValue {
  confirm: (opts: ConfirmOpts) => Promise<boolean>
  prompt: (opts: PromptOpts) => Promise<string | null>
  toast: (message: string, kind?: 'success' | 'error' | 'info') => void
}

const UIContext = createContext<UIContextValue | null>(null)

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI must be used inside UIProvider')
  return ctx
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [confirmState, setConfirmState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const [promptState, setPromptState] = useState<(PromptOpts & { value: string; resolve: (v: string | null) => void }) | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const confirm = useCallback((opts: ConfirmOpts) => {
    return new Promise<boolean>(resolve => {
      setConfirmState({ ...opts, resolve })
    })
  }, [])

  const prompt = useCallback((opts: PromptOpts) => {
    return new Promise<string | null>(resolve => {
      setPromptState({ ...opts, value: opts.defaultValue ?? '', resolve })
    })
  }, [])

  const toast = useCallback((message: string, kind: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, kind }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3200)
  }, [])

  return (
    <UIContext.Provider value={{ confirm, prompt, toast }}>
      {children}

      {/* Confirm modal */}
      {confirmState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] px-4 animate-fade-in"
          onClick={() => { confirmState.resolve(false); setConfirmState(null) }}
        >
          <div
            className="w-full max-w-sm bg-surface border border-line rounded-3xl p-6 space-y-4 shadow-float animate-scale-in"
            dir="rtl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                confirmState.danger ? 'bg-rose-50 text-rose-600' : 'bg-brand-light text-brand'
              }`}>
                <AlertIcon className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <h3 className="arabic text-base font-bold text-ink">{confirmState.title}</h3>
                <p className="arabic text-sm text-ink-muted mt-1 leading-relaxed">{confirmState.message}</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { confirmState.resolve(true); setConfirmState(null) }}
                className={`arabic flex-1 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition ${
                  confirmState.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-brand hover:bg-brand-hover'
                }`}
              >
                {confirmState.confirmLabel ?? 'تأكيد'}
              </button>
              <button
                type="button"
                onClick={() => { confirmState.resolve(false); setConfirmState(null) }}
                className="arabic flex-1 py-2.5 rounded-xl text-sm font-medium border border-line text-ink-muted hover:bg-canvas transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt modal */}
      {promptState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] px-4 animate-fade-in"
          onClick={() => { promptState.resolve(null); setPromptState(null) }}
        >
          <form
            className="w-full max-w-sm bg-surface border border-line rounded-3xl p-6 space-y-4 shadow-float animate-scale-in"
            dir="rtl"
            onClick={e => e.stopPropagation()}
            onSubmit={e => {
              e.preventDefault()
              const v = promptState.value.trim()
              promptState.resolve(v || null)
              setPromptState(null)
            }}
          >
            <div>
              <h3 className="arabic text-base font-bold text-ink">{promptState.title}</h3>
              {promptState.label && <p className="arabic text-xs text-ink-muted mt-1">{promptState.label}</p>}
            </div>
            <input
              type="text"
              autoFocus
              dir={promptState.dir ?? 'rtl'}
              value={promptState.value}
              placeholder={promptState.placeholder}
              onChange={e => setPromptState(s => s ? { ...s, value: e.target.value } : null)}
              className="arabic w-full border border-line bg-canvas/40 rounded-xl px-3.5 py-2.5 text-sm text-ink focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="arabic flex-1 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-sm font-semibold shadow-sm transition"
              >
                {promptState.confirmLabel ?? 'حفظ'}
              </button>
              <button
                type="button"
                onClick={() => { promptState.resolve(null); setPromptState(null) }}
                className="arabic flex-1 py-2.5 border border-line text-ink-muted hover:bg-canvas rounded-xl text-sm font-medium transition"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-4 z-50 space-y-2 max-w-xs" dir="rtl">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`arabic flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-float text-sm font-medium border animate-scale-in ${
                t.kind === 'error'
                  ? 'bg-rose-600 text-white border-rose-700'
                  : t.kind === 'success'
                  ? 'bg-emerald-600 text-white border-emerald-700'
                  : 'bg-ink text-white border-ink'
              }`}
            >
              {t.kind === 'error' ? (
                <AlertIcon className="w-4 h-4 flex-shrink-0" />
              ) : t.kind === 'success' ? (
                <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
              ) : (
                <InfoIcon className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}
    </UIContext.Provider>
  )
}
