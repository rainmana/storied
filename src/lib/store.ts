import { create } from 'zustand'
import { database, acquireEditorLock } from './database'
import { now, uid, type Project } from '../domain/schema'
import { parseProject, restorableJSON } from '../domain/project-file'
import { materialState } from '../domain/world-graph'
import { synchronizeImportedWorkflows } from '../domain/coordination'

export type Page =
  | 'Home'
  | 'World'
  | 'Write'
  | 'Play'
  | 'Timeline'
  | 'Relationships'
  | 'Journal'
  | 'Search'
  | 'Settings'
  | 'Voice'
type State = {
  project: Project | null
  projects: Project[]
  page: Page
  selectedEntity: string | null
  selectedScene: string | null
  selectedAdventure: string | null
  ready: boolean
  fatal: string
  saveStatus: 'saved' | 'saving' | 'error'
  error: string
  toast: string
  boot: () => Promise<void>
  navigate: (page: Page, id?: string) => void
  mutate: (fn: (p: Project) => void) => boolean
  openProject: (p: Project) => Promise<void>
  deleteProject: () => Promise<void>
  switchProject: (id: string) => Promise<void>
  notify: (message: string) => void
  retrySave: () => void
}
let saveChain: Promise<unknown> = Promise.resolve(),
  revision = 0,
  booted = false
let pendingSnapshot: Project | null = null,
  saveTimer: ReturnType<typeof setTimeout> | undefined
function scheduleSave(p: Project) {
  pendingSnapshot = p
  // Invalidate prior acknowledgements as soon as a new edit occurs.
  ++revision
  useStore.setState({ saveStatus: 'saving', error: '' })
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (pendingSnapshot) {
      const next = pendingSnapshot
      pendingSnapshot = null
      void enqueue(next)
    }
  }, 300)
}
function enqueue(p: Project) {
  const current = ++revision
  useStore.setState({ saveStatus: 'saving', error: '' })
  saveChain = saveChain
    .catch(() => {})
    .then(() => database.save(p))
    .then(() => {
      if (current === revision)
        useStore.setState({
          saveStatus: 'saved',
          projects: useStore.getState().projects.map((v) => (v.id === p.id ? p : v)),
        })
    })
    .catch((error) => {
      if (current === revision)
        useStore.setState({
          saveStatus: 'error',
          error: `Your latest edits are still in memory. ${String(error)}`,
        })
    })
  return saveChain
}
export async function flushSaves() {
  clearTimeout(saveTimer)
  if (pendingSnapshot) {
    const p = pendingSnapshot
    pendingSnapshot = null
    await enqueue(p)
  }
  await saveChain
  if (useStore.getState().saveStatus === 'error')
    throw new Error('Save failed. Export your project before closing.')
}
export const useStore = create<State>((set, get) => ({
  project: null,
  projects: [],
  page: 'Home',
  selectedEntity: null,
  selectedScene: null,
  selectedAdventure: null,
  ready: false,
  fatal: '',
  saveStatus: 'saved',
  error: '',
  toast: '',
  boot: async () => {
    if (booted) return
    booted = true
    try {
      if (!(await acquireEditorLock())) {
        set({
          fatal:
            'Storied is already open in another tab. Close that tab, then reload this one to continue safely.',
          ready: true,
        })
        return
      }
      const projects = (await database.list()).map((p) => parseProject(JSON.stringify(p)))
      const last = localStorage.getItem('storied-active-project')
      set({
        projects,
        project: projects.find((p) => p.id === last) || projects[0] || null,
        ready: true,
      })
    } catch (error) {
      set({ fatal: `Your local library could not be opened. ${String(error)}`, ready: true })
    }
  },
  navigate: (page, id) =>
    set({
      page,
      ...(page === 'World' ? { selectedEntity: id || null } : {}),
      ...(page === 'Write' && id ? { selectedScene: id } : {}),
      ...(page === 'Play' && id ? { selectedAdventure: id } : {}),
    }),
  mutate: (fn) => {
    const current = get().project
    if (!current) return false
    const p = structuredClone(current)
    try {
      fn(p)
      if (materialState(p) !== materialState(current)) p.worldRevision = current.worldRevision + 1
      p.updatedAt = now()
      // Never persist a world that this version cannot export and restore.
      restorableJSON(p)
      set({ project: p })
      scheduleSave(p)
      return true
    } catch (error) {
      get().notify(error instanceof Error ? error.message : String(error))
      return false
    }
  },
  openProject: async (p) => {
    await flushSaves()
    p = structuredClone(p)
    synchronizeImportedWorkflows(p)
    if (get().projects.some((v) => v.id === p.id))
      p = { ...p, id: uid(), title: `${p.title} (imported copy)` }
    await database.save(p)
    localStorage.setItem('storied-active-project', p.id)
    set({
      project: p,
      projects: [...get().projects.filter((v) => v.id !== p.id), p],
      selectedEntity: null,
      selectedScene: null,
      selectedAdventure: null,
      page: 'Home',
      saveStatus: 'saved',
    })
  },
  deleteProject: async () => {
    await flushSaves()
    const p = get().project
    if (!p) return
    await database.delete(p.id)
    const projects = get().projects.filter((v) => v.id !== p.id)
    localStorage.removeItem('storied-active-project')
    set({
      projects,
      project: projects[0] || null,
      page: 'Home',
      selectedEntity: null,
      selectedScene: null,
      selectedAdventure: null,
    })
    get().notify('Project removed from this device.')
  },
  switchProject: async (id) => {
    await flushSaves()
    const p = get().projects.find((p) => p.id === id)
    if (p) {
      localStorage.setItem('storied-active-project', id)
      set({
        project: p,
        page: 'Home',
        selectedEntity: null,
        selectedScene: null,
        selectedAdventure: null,
      })
    }
  },
  notify: (toast) => {
    set({ toast })
    window.setTimeout(() => {
      if (get().toast === toast) set({ toast: '' })
    }, 4500)
  },
  retrySave: () => {
    const p = get().project
    if (p) scheduleSave(p)
  },
}))
if (typeof window !== 'undefined')
  window.addEventListener('beforeunload', (e) => {
    if (useStore.getState().saveStatus !== 'saved') {
      e.preventDefault()
      e.returnValue = ''
    }
  })
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushSaves().catch(() => {})
  })
