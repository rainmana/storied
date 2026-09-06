import { now, uid, type Project } from './schema'
import { wordCount } from '../lib/utils'
import { sessionSchema, type WritingSession, type EditOrigin } from './practice-schema'

export const IDLE_MS = 2 * 60 * 1000
export const dayKey = (time: number) => {
  const d = new Date(time)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function sessionDay(s: WritingSession, date: string) {
  let day = s.days.find((d) => d.date === date)
  if (!day) {
    if (s.days.length >= 3660) throw new Error('Finish this session before starting another day.')
    day = {
      date,
      milliseconds: 0,
      author: { added: 0, removed: 0, edits: 0 },
      assisted: { added: 0, removed: 0, edits: 0 },
      imported: { added: 0, removed: 0, edits: 0 },
    }
    s.days.push(day)
  }
  return day
}
export const currentSession = (p: Project) =>
  p.activity.enabled ? p.activity.sessions.find((s) => s.status !== 'finished') : undefined
export function startSession(
  p: Project,
  options: Pick<WritingSession, 'title' | 'kind' | 'target' | 'goal'> &
    Partial<Pick<WritingSession, 'sceneId' | 'adventureId' | 'characterId'>>,
) {
  if (p.activity.sessions.some((s) => s.status !== 'finished'))
    throw new Error('Finish the current session before beginning another.')
  if (p.activity.sessions.length >= 10000)
    throw new Error('Export and clear session history before starting another session.')
  const session = sessionSchema.parse({
    ...options,
    id: uid(),
    status: 'running',
    createdAt: now(),
    thinking: false,
    days: [],
    pauseReason: '',
  })
  p.activity.enabled = true
  p.activity.sessions.push(session)
  return session
}
export function pauseSessions(p: Project, reason: string) {
  for (const s of p.activity.sessions)
    if (s.status === 'running') {
      s.status = 'paused'
      s.pauseReason = reason
    }
}
export function sessionTotals(s: WritingSession) {
  return s.days.reduce(
    (v, d) => ({
      milliseconds: v.milliseconds + d.milliseconds,
      author: v.author + d.author.added - d.author.removed,
      assisted: v.assisted + d.assisted.added - d.assisted.removed,
      imported: v.imported + d.imported.added - d.imported.removed,
      edits: v.edits + d.author.edits,
    }),
    { milliseconds: 0, author: 0, assisted: 0, imported: 0, edits: 0 },
  )
}
export function sessionProgress(s: WritingSession) {
  const totals = sessionTotals(s)
  return Math.min(
    100,
    Math.max(
      0,
      ((s.target === 'minutes' ? totals.milliseconds / 60000 : totals.author) / s.goal) * 100,
    ),
  )
}
/** Split clock intervals at local midnight; callers supply only visible, non-idle time. */
export function addSessionTime(s: WritingSession, from: number, to: number) {
  if (s.status !== 'running' || to <= from || !Number.isFinite(from) || !Number.isFinite(to)) return
  // A delayed browser callback must not credit sleep or a suspended computer.
  to = Math.min(to, from + 15000)
  while (from < to) {
    const next = new Date(from)
    next.setHours(24, 0, 0, 0)
    const end = Math.min(to, next.getTime())
    sessionDay(s, dayKey(from)).milliseconds += Math.round(end - from)
    from = end
  }
}
function countChange(
  s: WritingSession,
  before: string,
  after: string,
  origin: Exclude<EditOrigin, 'none'>,
  date: string,
) {
  if (before === after) return
  const delta = wordCount(after) - wordCount(before),
    tally = sessionDay(s, date)[origin]
  tally.added += Math.max(0, delta)
  tally.removed += Math.max(0, -delta)
  tally.edits++
}
/** Aggregate word-count deltas only. No text, keystrokes, or author classifications are stored. */
export function recordPracticeEdits(
  before: Project,
  after: Project,
  origin: EditOrigin = 'author',
  time = Date.now(),
) {
  const s = currentSession(after)
  if (!s || s.status !== 'running' || origin === 'none') return
  const date = dayKey(time)
  if (s.kind === 'writing') {
    const previous = new Map(before.scenes.map((v) => [v.id, v.text])),
      next = new Map(after.scenes.map((v) => [v.id, v.text]))
    for (const id of new Set([...previous.keys(), ...next.keys()])) {
      if (s.sceneId && id !== s.sceneId) continue
      countChange(s, previous.get(id) || '', next.get(id) || '', origin, date)
    }
  } else if (s.kind === 'worldbuilding') {
    const oldEntities = new Map(before.entities.map((v) => [v.id, v])),
      newEntities = new Map(after.entities.map((v) => [v.id, v]))
    for (const id of new Set([...oldEntities.keys(), ...newEntities.keys()])) {
      const previous = oldEntities.get(id),
        entity = newEntities.get(id)
      for (const field of ['summary', 'notes'] as const)
        countChange(s, previous?.[field] || '', entity?.[field] || '', origin, date)
      for (const key of new Set([
        ...Object.keys(previous?.fields || {}),
        ...Object.keys(entity?.fields || {}),
      ]))
        countChange(s, previous?.fields[key] || '', entity?.fields[key] || '', origin, date)
    }
  } else {
    for (const adventure of after.adventures) {
      if (adventure.id !== s.adventureId) continue
      const old = before.adventures.find((a) => a.id === adventure.id)
      for (const turn of adventure.turns)
        if (!old?.turns.some((t) => t.id === turn.id)) {
          if (turn.intent !== 'Story') countChange(s, '', turn.input, 'author', date)
          countChange(s, '', turn.text, turn.model === 'Author' ? 'author' : 'assisted', date)
        }
    }
  }
}
