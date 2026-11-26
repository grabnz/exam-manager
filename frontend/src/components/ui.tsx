import { createContext, useCallback, useContext, useState } from 'react'

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => { confirmState.resolve(false); setConfirmState(null) }}>
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-4 shadow-xl" dir="rtl" onClick={e => e.stopPropagation()}>
            <h3 className="arabic text-base font-bold text-gray-900">{confirmState.title}</h3>
            <p className="arabic text-sm text-gray-600">{confirmState.message}</p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { confirmState.resolve(true); setConfirmState(null) }}
                className={`arabic flex-1 py-2 rounded-xl text-sm font-medium text-white transition ${
                  confirmState.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {confirmState.confirmLabel ?? 'تأكيد'}
              </button>
              <button
                type="button"
                onClick={() => { confirmState.resolve(false); setConfirmState(null) }}
                className="arabic flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt modal */}
      {promptState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => { promptState.resolve(null); setPromptState(null) }}>
          <form
            className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-4 shadow-xl"
            dir="rtl"
            onClick={e => e.stopPropagation()}
            onSubmit={e => {
              e.preventDefault()
              const v = promptState.value.trim()
              promptState.resolve(v || null)
              setPromptState(null)
            }}
          >
            <h3 className="arabic text-base font-bold text-gray-900">{promptState.title}</h3>
            {promptState.label && <p className="arabic text-xs text-gray-500">{promptState.label}</p>}
            <input
              type="text"
              autoFocus
              dir={promptState.dir ?? 'rtl'}
              value={promptState.value}
              placeholder={promptState.placeholder}
              onChange={e => setPromptState(s => s ? { ...s, value: e.target.value } : null)}
              className="arabic w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="flex gap-2">
              <button type="submit" className="arabic flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium">
                {promptState.confirmLabel ?? 'حفظ'}
              </button>
              <button
                type="button"
                onClick={() => { promptState.resolve(null); setPromptState(null) }}
                className="arabic flex-1 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl text-sm font-medium"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="fixed bottom-16 md:bottom-5 left-4 z-50 space-y-2 max-w-xs" dir="rtl">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`arabic px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium border ${
                t.kind === 'error'
                  ? 'bg-red-600 text-white border-red-700'
                  : t.kind === 'success'
                  ? 'bg-emerald-600 text-white border-emerald-700'
                  : 'bg-gray-900 text-white border-gray-800'
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </UIContext.Provider>
  )
}
