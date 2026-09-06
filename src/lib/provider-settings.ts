import { create } from 'zustand'
import {
  connectionSchema,
  validateConnection,
  type Connection,
  type ProviderId,
} from './provider-client'

const SETTINGS = 'storied-inference-v1'
const KEY = 'storied-provider-key:'
type Profile = { connection: Connection; remember: boolean }
type Saved = { active: ProviderId | 'browser'; profiles: Partial<Record<ProviderId, Profile>> }
function readSaved(): Saved {
  try {
    const data = JSON.parse(localStorage.getItem(SETTINGS) || '{}')
    const profiles: Saved['profiles'] = {}
    for (const [id, profile] of Object.entries(data.profiles || {})) {
      const p = profile as Profile,
        c = validateConnection(connectionSchema.parse(p.connection), 'validation-only', false)
      if (id === c.provider) profiles[c.provider] = { connection: c, remember: p.remember === true }
    }
    return { profiles, active: profiles[data.active as ProviderId] ? data.active : 'browser' }
  } catch {
    return { active: 'browser', profiles: {} }
  }
}
// Credentials belong to browser settings, never Project, SQL, workflow state, URLs, or native exports.
export function readProviderKey(provider: ProviderId) {
  try {
    return sessionStorage.getItem(KEY + provider) || localStorage.getItem(KEY + provider) || ''
  } catch {
    return ''
  }
}
type State = Saved & {
  version: number
  activate: (connection: Connection, key: string, remember: boolean) => void
  useBrowser: () => void
  forget: (provider: ProviderId) => void
}
const save = (state: Saved) =>
  localStorage.setItem(SETTINGS, JSON.stringify({ active: state.active, profiles: state.profiles }))
export const useProviderSettings = create<State>((set, get) => ({
  ...readSaved(),
  version: 0,
  activate: (input, key, remember) => {
    const connection = validateConnection(input, key.trim()),
      provider = connection.provider
    // Drop any old key before assigning a different endpoint. Settings drafts never transmit.
    localStorage.removeItem(KEY + provider)
    sessionStorage.removeItem(KEY + provider)
    if (key.trim()) (remember ? localStorage : sessionStorage).setItem(KEY + provider, key.trim())
    const next = {
      active: provider,
      profiles: { ...get().profiles, [provider]: { connection, remember } },
    }
    save(next)
    set({ ...next, version: get().version + 1 })
  },
  useBrowser: () => {
    const next = { active: 'browser' as const, profiles: get().profiles }
    save(next)
    set({ ...next, version: get().version + 1 })
  },
  forget: (provider) => {
    localStorage.removeItem(KEY + provider)
    sessionStorage.removeItem(KEY + provider)
    const profiles = { ...get().profiles }
    delete profiles[provider]
    const active = get().active === provider ? 'browser' : get().active
    save({ active, profiles })
    set({ active, profiles, version: get().version + 1 })
  },
}))
