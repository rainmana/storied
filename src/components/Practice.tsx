import { useEffect, useRef, useState } from 'react'
import { Clock3, Pause, Play, Check, Sprout } from 'lucide-react'
import { useStore, flushSaves } from '../lib/store'
import {
  currentSession,
  startSession,
  sessionTotals,
  sessionProgress,
  pauseSessions,
  addSessionTime,
  IDLE_MS,
} from '../domain/practice'
import { now } from '../domain/schema'
import type { WritingSession } from '../domain/practice-schema'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { Field } from './common'

export const duration = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
export function usePracticeClock() {
  const p = useStore((s) => s.project),
    session = p && currentSession(p)
  const lastInput = useRef(Date.now())
  useEffect(() => {
    const touch = () => {
      lastInput.current = Date.now()
    }
    document.addEventListener('keydown', touch)
    document.addEventListener('pointerdown', touch)
    document.addEventListener('scroll', touch, true)
    return () => {
      document.removeEventListener('keydown', touch)
      document.removeEventListener('pointerdown', touch)
      document.removeEventListener('scroll', touch, true)
    }
  }, [])
  useEffect(() => {
    if (session?.status !== 'running') return
    lastInput.current = Date.now()
    let last = Date.now()
    const tick = (hidden = false) => {
      const state = useStore.getState(),
        project = state.project
      const s = project && currentSession(project)
      if (!s || s.id !== session.id || s.status !== 'running') return
      const time = Date.now()
      const activeAdventure =
        project.adventures.find((a) => a.id === state.selectedAdventure) ||
        project.adventures.at(-1)
      const appropriate =
        state.page === 'Progress' ||
        (s.kind === 'writing'
          ? state.page === 'Write'
          : s.kind === 'worldbuilding'
            ? state.page === 'World'
            : state.page === 'Play' && activeAdventure?.id === s.adventureId)
      const idle = !s.thinking && time - lastInput.current >= IDLE_MS
      const suspended = time - last > 15000 || time < last
      state.mutate((p) => {
        const current = currentSession(p)!
        if (!suspended && appropriate)
          addSessionTime(
            current,
            last,
            Math.min(time, s.thinking ? time : lastInput.current + IDLE_MS),
          )
        if (hidden || !appropriate || idle || suspended) {
          pauseSessions(
            p,
            hidden
              ? 'Paused while Storied is in the background.'
              : !appropriate
                ? 'Paused while you are away from this activity.'
                : suspended
                  ? 'Paused after the device clock or activity changed.'
                  : 'Paused after two quiet minutes. Resume, or enable thinking time.',
          )
        }
      }, 'none')
      last = time
    }
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        tick(true)
        void flushSaves().catch(() => {})
      }
    }
    const timer = window.setInterval(() => tick(document.visibilityState === 'hidden'), 5000)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [p?.id, session?.id, session?.status])
}

export function SessionPanel({
  kind = 'writing',
  adventureId,
  characterId,
}: {
  kind?: WritingSession['kind']
  adventureId?: string
  characterId?: string
}) {
  const store = useStore(),
    p = store.project!,
    active = p.activity.sessions.find((s) => s.status !== 'finished')
  const [setup, setSetup] = useState(false),
    [title, setTitle] = useState(
      kind === 'conversation'
        ? 'Ten minutes with a character'
        : kind === 'worldbuilding'
          ? 'A little worldbuilding'
          : 'Time with my story',
    )
  const [target, setTarget] = useState<'minutes' | 'words'>(
      kind === 'writing' ? 'words' : 'minutes',
    ),
    [goal, setGoal] = useState(kind === 'writing' ? p.settings.wordGoal || 500 : 10)
  const totals = active && sessionTotals(active)
  const change = (fn: (s: WritingSession) => void) =>
    store.mutate((p) => {
      const s = p.activity.sessions.find((s) => s.id === active?.id)
      if (s) fn(s)
    }, 'none')
  return (
    <section className="practice-card" aria-label="Practice session">
      <div className="section-heading">
        <h3>
          <Sprout size={16} /> A little practice
        </h3>
        <button className="text-button small" onClick={() => store.navigate('Progress')}>
          History
        </button>
      </div>
      {active && totals ? (
        <>
          <p className="practice-title">{active.title}</p>
          <div className="practice-numbers">
            <strong aria-label="Session elapsed time">{duration(totals.milliseconds)}</strong>
            <span>
              {totals.author >= 0 ? '+' : ''}
              {totals.author} author words
            </span>
          </div>
          <p className="small muted">
            {active.goal} {active.target === 'minutes' ? 'minutes of practice' : 'net author words'}{' '}
            · {active.status}
          </p>
          <progress aria-label="Session goal progress" value={sessionProgress(active)} max={100} />
          {sessionProgress(active) >= 100 && (
            <p className="practice-achieved">
              <Check size={14} /> You made time for this. Goal reached.
            </p>
          )}
          {!!active.pauseReason && <p className="small muted">{active.pauseReason}</p>}
          <div className="button-row">
            <Button
              size="sm"
              variant="secondary"
              disabled={!p.activity.enabled}
              onClick={() =>
                change((s) => {
                  s.status = s.status === 'running' ? 'paused' : 'running'
                  s.pauseReason = s.status === 'paused' ? 'Paused by you.' : ''
                })
              }
            >
              {active.status === 'running' ? <Pause size={13} /> : <Play size={13} />}
              {active.status === 'running' ? 'Pause session' : 'Resume session'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                change((s) => {
                  s.status = 'finished'
                  s.finishedAt = now()
                  s.pauseReason = ''
                })
              }
            >
              Finish session
            </Button>
          </div>
          {!p.activity.enabled && (
            <p className="small muted">Enable local practice tracking in Progress to resume.</p>
          )}
          <label className="studio-check">
            <input
              type="checkbox"
              checked={active.thinking}
              onChange={(e) =>
                change((s) => {
                  s.thinking = e.target.checked
                })
              }
            />{' '}
            Count quiet thinking time
          </label>
          <p className="small muted">
            Time pauses in the background. Quiet time otherwise pauses after two minutes.
          </p>
        </>
      ) : (
        <>
          <p className="small muted">
            Make room for writing, exploring, or ten minutes with a character. Your progress stays
            on this device.
          </p>
          <Button size="sm" variant="secondary" onClick={() => setSetup(true)}>
            <Clock3 size={14} /> Start a session
          </Button>
        </>
      )}
      <Dialog
        open={setup}
        onOpenChange={setSetup}
        title="Make a little room"
        description="Choose a goal for this practice. A session starts at zero; earlier writing stays outside the count."
      >
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (
              store.mutate(
                (p) =>
                  startSession(p, {
                    title: title.trim(),
                    kind,
                    target,
                    goal,
                    adventureId,
                    characterId,
                  }),
                'none',
              )
            )
              setSetup(false)
          }}
        >
          <Field label="Session intention">
            <input
              required
              maxLength={500}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <div className="field-row">
            <Field label="Goal type">
              <select
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value as 'minutes' | 'words')
                  setGoal(e.target.value === 'minutes' ? 10 : 500)
                }}
              >
                <option value="minutes">Time spent</option>
                {kind !== 'conversation' && <option value="words">Net author words</option>}
              </select>
            </Field>
            <Field label={target === 'minutes' ? 'Minutes' : 'Words'}>
              <input
                type="number"
                min={1}
                max={1000000}
                required
                value={goal}
                onChange={(e) => setGoal(Number(e.target.value))}
              />
            </Field>
          </div>
          <p className="small muted">
            Tracking is optional. Session totals are included in your project backups. Delete the
            history at any time in Progress. Accepted AI text and imported passages do not advance
            an author-word goal.
          </p>
          <Button type="submit" disabled={!title.trim() || !Number.isInteger(goal) || goal < 1}>
            Begin session
          </Button>
        </form>
      </Dialog>
    </section>
  )
}
