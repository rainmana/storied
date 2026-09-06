import type { Project } from '../domain/schema'
import type { SearchDoc } from '../domain/search'
let worker: Worker | undefined,
  sequence = 0
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>()
function rpc<T>(type: string, payload?: unknown): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('../workers/database.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = ({ data }) => {
      const call = pending.get(data.id)
      if (call) {
        pending.delete(data.id)
        if (data.error) call.reject(new Error(data.error))
        else call.resolve(data.result)
      }
    }
    worker.onerror = (e) => {
      for (const call of pending.values())
        call.reject(new Error(e.message || 'Local storage could not start.'))
      pending.clear()
    }
  }
  return new Promise((resolve, reject) => {
    const id = ++sequence
    pending.set(id, { resolve: (value) => resolve(value as T), reject })
    worker!.postMessage({ id, type, payload })
  })
}
export const database = {
  list: () => rpc<Project[]>('list'),
  save: (p: Project) => rpc<boolean>('save', p),
  delete: (id: string) => rpc<boolean>('delete', id),
  embed: (projectId: string, items: { id: string; source: string; vector: number[] }[]) =>
    rpc<boolean>('embed', { projectId, items }),
  semantic: (
    projectId: string,
    vector: number[],
    options: { allowedIds?: string[]; kind?: string; tag?: string } = {},
  ) => rpc<(SearchDoc & { similarity: number })[]>('semantic', { projectId, vector, ...options }),
}
export function acquireEditorLock(): Promise<boolean> {
  if (!navigator.locks)
    return Promise.reject(
      new Error(
        'This browser does not support the storage lock needed to protect your project. Use a recent browser on HTTPS or localhost.',
      ),
    )
  return new Promise((resolve, reject) => {
    navigator.locks
      .request('storied-editor-v1', { ifAvailable: true }, async (lock) => {
        resolve(Boolean(lock))
        if (lock) await new Promise<void>(() => {})
      })
      .catch(reject)
  })
}
