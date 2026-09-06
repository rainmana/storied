import { create } from 'zustand'
import { type Adventure, type Project, type Proposal } from '../domain/schema'
import {
  extractionEntities,
  extractionResponseSchema,
  parseExtractedProposals,
} from '../domain/extraction'
import { database } from './database'
import { searchDocuments } from '../domain/search'
import { EMBEDDING_CACHE } from './model-catalog'

type Progress = { text?: string; progress?: number; status?: string; file?: string }
export class ModelWorker {
  private worker: Worker | undefined
  private seq = 0
  private generation = 0
  private queue: Promise<void> = Promise.resolve()
  private calls = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; progress?: (p: Progress) => void }
  >()
  constructor(private create: () => Worker) {}
  call<T>(type: string, payload: unknown = {}, progress?: (p: Progress) => void): Promise<T> {
    const generation = this.generation
    const result = this.queue.then(() => {
      if (generation !== this.generation) throw new Error('Local model operation canceled.')
      return this.dispatch<T>(type, payload, progress)
    })
    // Cache inspection must finish before loading, even when the user clicks immediately.
    this.queue = result.then(
      () => {},
      () => {},
    )
    return result
  }
  private dispatch<T>(
    type: string,
    payload: unknown,
    progress?: (p: Progress) => void,
  ): Promise<T> {
    if (!this.worker) {
      this.worker = this.create()
      this.worker.onmessage = ({ data }) => {
        const c = this.calls.get(data.id)
        if (!c) return
        if (data.progress) {
          c.progress?.(data.progress)
          return
        }
        this.calls.delete(data.id)
        if (data.error) c.reject(new Error(data.error))
        else c.resolve(data.result)
      }
      this.worker.onerror = (e) => {
        for (const c of this.calls.values())
          c.reject(new Error(e.message || 'The local model worker stopped.'))
        this.calls.clear()
      }
    }
    return new Promise((resolve, reject) => {
      const id = ++this.seq
      this.calls.set(id, { resolve: (v) => resolve(v as T), reject, progress })
      this.worker!.postMessage({ id, type, payload })
    })
  }
  stop() {
    ++this.generation
    this.queue = Promise.resolve()
    this.worker?.terminate()
    this.worker = undefined
    for (const c of this.calls.values()) c.reject(new Error('Local model operation canceled.'))
    this.calls.clear()
  }
}
const storyteller = new ModelWorker(
  () =>
    new Worker(new URL('../workers/storyteller.worker.ts', import.meta.url), { type: 'module' }),
)
const embeddings = new ModelWorker(
  () => new Worker(new URL('../workers/embeddings.worker.ts', import.meta.url), { type: 'module' }),
)
type ModelState = {
  loadedId: string
  busy: boolean
  embeddingReady: boolean
  embeddingCached: boolean
  cached: string[]
  progress: string
  error: string
  refresh: () => Promise<void>
  load: (id: string, download: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
  loadEmbeddings: (download: boolean) => Promise<void>
  removeEmbeddings: () => Promise<void>
  cancel: () => void
}
const progressText = (p: Progress) =>
  p.text ||
  `${p.status || 'Loading'}${p.progress ? ` · ${Math.round(p.progress)}%` : ''}${p.file ? ` · ${p.file.split('/').pop()}` : ''}`
export const useModels = create<ModelState>((set, get) => ({
  loadedId: '',
  busy: false,
  embeddingReady: false,
  embeddingCached: false,
  cached: [],
  progress: '',
  error: '',
  refresh: async () => {
    try {
      const rows =
        await storyteller.call<{ id: string; cached: boolean; loaded: boolean }[]>('status')
      const cache = await caches.open(EMBEDDING_CACHE)
      set({
        cached: rows.filter((r) => r.cached).map((r) => r.id),
        loadedId: rows.find((r) => r.loaded)?.id || '',
        embeddingCached: (await cache.keys()).some((k) => k.url.endsWith('.onnx')),
      })
    } catch (e) {
      set({ error: String(e) })
    }
  },
  load: async (modelId, allowDownload) => {
    if (get().busy) return
    set({ busy: true, error: '', progress: 'Preparing your local storyteller…', loadedId: '' })
    try {
      await storyteller.call('load', { modelId, allowDownload }, (p) =>
        set({ progress: progressText(p) }),
      )
      set({ loadedId: modelId, cached: [...new Set([...get().cached, modelId])] })
    } catch (e) {
      set({ error: String(e) })
    } finally {
      set({ busy: false, progress: '' })
    }
  },
  remove: async (modelId) => {
    try {
      await storyteller.call('remove', { modelId })
      set({
        cached: get().cached.filter((id) => id !== modelId),
        loadedId: get().loadedId === modelId ? '' : get().loadedId,
      })
    } catch (e) {
      set({ error: String(e) })
    }
  },
  loadEmbeddings: async (allowDownload) => {
    if (get().busy) return
    set({ busy: true, error: '', progress: 'Preparing local search…' })
    try {
      await embeddings.call('load', { allowDownload }, (p) => set({ progress: progressText(p) }))
      set({ embeddingReady: true, embeddingCached: true })
    } catch (e) {
      set({ error: String(e) })
    } finally {
      set({ busy: false, progress: '' })
    }
  },
  removeEmbeddings: async () => {
    try {
      await embeddings.call('remove')
      set({ embeddingReady: false, embeddingCached: false })
    } catch (e) {
      set({ error: String(e) })
    }
  },
  cancel: () => {
    storyteller.stop()
    embeddings.stop()
    set({ busy: false, loadedId: '', embeddingReady: false, progress: '' })
  },
}))
export async function completeLocally(
  prompt: string,
  role:
    | 'storyteller'
    | 'extractor'
    | 'summarizer'
    | 'worldbuilder'
    | import('../domain/manuscript-schema').StudioRole = 'storyteller',
  responseSchema?: Record<string, unknown>,
): Promise<string> {
  if (!useModels.getState().loadedId)
    throw new Error('Load a storyteller in Local models to generate on this device.')
  if (useModels.getState().busy) throw new Error('The local model is busy.')
  useModels.setState({ busy: true })
  try {
    return await storyteller.call<string>('complete', { prompt, role, responseSchema })
  } finally {
    useModels.setState({ busy: false })
  }
}
export async function extractProposals(
  p: Project,
  a: Adventure,
  turnId: string,
): Promise<Proposal[]> {
  const turn = a.turns.find((t) => t.id === turnId)
  if (!turn) throw new Error('The source passage is missing.')
  const allowed = extractionEntities(p, a)
  if (!allowed.length) return []
  const text = await completeLocally(
    `Extract 1 to 4 durable changes explicitly present in the passage. Use short entity handles exactly as listed: ${JSON.stringify(allowed.map((e) => ({ id: e.handle, name: e.name })))}. A fact describes a changed possession or state; an event describes an action that occurred; knowledge means a character explicitly learned something; a relationship connects two listed entities. Use targetId "" except for relationships. Use a short predicate and a specific value describing the change. Do not invent death, knowledge, or new entities. Return {"proposals":[]} if nothing changed.\nPASSAGE:\n${turn.text.slice(0, 6000)}`,
    'extractor',
    extractionResponseSchema(allowed),
  )
  return parseExtractedProposals(text, allowed, a.id, turnId)
}
export async function embedTexts(texts: string[]): Promise<number[][]> {
  return embeddings.call('embed', { texts })
}
export async function indexProject(p: Project, onProgress: (progress: string) => void) {
  const docs = searchDocuments(p)
  for (let i = 0; i < docs.length; i += 8) {
    const batch = docs.slice(i, i + 8),
      vectors = await embedTexts(batch.map((d) => d.body.slice(0, 2400)))
    await database.embed(
      p.id,
      batch.map((d, j) => ({ id: d.id, source: d.body, vector: vectors[j] })),
    )
    onProgress(`Indexed ${Math.min(i + 8, docs.length)} of ${docs.length} passages`)
  }
}
