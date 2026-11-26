import type { ComponentType } from 'react'

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-line/70 ${className}`} />
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" dir="rtl">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3 shadow-card">
            <Skeleton className="w-11 h-11 rounded-2xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-14" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-surface border border-line rounded-3xl p-5 space-y-3 shadow-card">
              <div className="flex justify-between">
                <Skeleton className="w-11 h-11 rounded-2xl" />
                <Skeleton className="w-16 h-6 rounded-full" />
              </div>
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
              <div className="pt-3 border-t border-line flex justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="bg-surface border border-line rounded-3xl p-5 space-y-3 shadow-card">
            <Skeleton className="h-3 w-24" />
            <div className="flex items-center gap-4">
              <Skeleton className="w-24 h-24 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-full rounded-full" />
                <Skeleton className="h-5 w-full rounded-full" />
                <Skeleton className="h-5 w-full rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-surface border border-line rounded-2xl divide-y divide-line shadow-card" dir="rtl">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-4 py-3.5 flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-7 w-16 rounded-lg" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  Icon,
  title,
  description,
  action,
}: {
  Icon: ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="bg-surface border border-line rounded-3xl text-center py-14 px-6 shadow-card" dir="rtl">
      <div className="w-14 h-14 mx-auto mb-3.5 rounded-2xl bg-brand-light/70 text-brand flex items-center justify-center">
        <Icon className="w-7 h-7" />
      </div>
      <p className="arabic text-base font-bold text-ink">{title}</p>
      {description && <p className="arabic text-sm text-ink-muted mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
