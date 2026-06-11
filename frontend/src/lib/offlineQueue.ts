// Offline save queue — one pending payload per session (latest wins),
// persisted in IndexedDB so scores entered in the classroom without
// internet survive reloads and sync when the connection returns.
import { get, set, del, keys } from 'idb-keyval'
import { api, ScoreSaveItem, ApiError } from '../api/client'

const PREFIX = 'em-queue:'

export interface QueuedSave {
  sessionId: string
  scores: ScoreSaveItem[]
  baseUpdatedAt: string | null
  queuedAt: string
  status: 'pending' | 'conflict' | 'error'
  message?: string
}

const listeners = new Set<() => void>()
export function onQueueChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function notify() { listeners.forEach(fn => fn()) }

export async function enqueue(sessionId: string, scores: ScoreSaveItem[], baseUpdatedAt: string | null) {
  const item: QueuedSave = {
    sessionId, scores, baseUpdatedAt,
    queuedAt: new Date().toISOString(),
    status: 'pending',
  }
  await set(PREFIX + sessionId, item)
  notify()
}

export async function getQueued(sessionId: string): Promise<QueuedSave | undefined> {
  return get<QueuedSave>(PREFIX + sessionId)
}

export async function removeQueued(sessionId: string) {
  await del(PREFIX + sessionId)
  notify()
}

export async function listQueued(): Promise<QueuedSave[]> {
  const ks = (await keys()).filter(k => typeof k === 'string' && k.startsWith(PREFIX))
  const items = await Promise.all(ks.map(k => get<QueuedSave>(k as string)))
  return items.filter((x): x is QueuedSave => !!x)
}

export async function pendingCount(): Promise<number> {
  return (await listQueued()).length
}

/** Resend one queued save. force=true overwrites server changes (LWW). */
export async function flushOne(item: QueuedSave, force = false): Promise<'done' | 'conflict' | 'error' | 'offline'> {
  try {
    await api.scores.save(item.sessionId, item.scores, {
      baseUpdatedAt: item.baseUpdatedAt, force,
    })
    await removeQueued(item.sessionId)
    return 'done'
  } catch (err: any) {
    if (err instanceof ApiError) {
      if (err.status === 409) {
        await set(PREFIX + item.sessionId, { ...item, status: 'conflict' })
        notify()
        return 'conflict'
      }
      // 400 = finalized meanwhile, 401/403/404 = no longer accessible:
      // keep the item flagged so the teacher sees why it wasn't saved.
      await set(PREFIX + item.sessionId, { ...item, status: 'error', message: err.message })
      notify()
      return 'error'
    }
    return 'offline'   // network failure — retry later
  }
}

/** Try to send everything still pending. Called on reconnect/app start. */
export async function flushQueue(): Promise<void> {
  for (const item of await listQueued()) {
    if (item.status !== 'pending') continue
    const result = await flushOne(item)
    if (result === 'offline') break   // still no network — stop trying
  }
}

export function startQueueSync() {
  window.addEventListener('online', () => { void flushQueue() })
  void flushQueue()
}
