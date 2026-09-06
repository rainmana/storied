import { useState } from 'react'
import { Clock3, Download, Sprout } from 'lucide-react'
import { useStore } from '../lib/store'
import { download } from '../lib/utils'
import { dayKey, pauseSessions, sessionTotals, sessionProgress } from '../domain/practice'
import { SessionPanel, duration } from '../components/Practice'
import { PageHeading, Field } from '../components/common'
import { Button } from '../components/ui/button'
import { Dialog } from '../components/ui/dialog'
import type { WritingSession } from '../domain/practice-schema'

export function Progress() {
  const store = useStore(),
    p = store.project!,
    sessions = p.activity.sessions
  const [kind, setKind] = useState<WritingSession['kind']>('writing'),
    [clear, setClear] = useState(false)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - 6 + i)
    return dayKey(d.getTime())
  })
  const daily = days.map((date) => ({
    date,
    ...sessions
      .flatMap((s) => s.days)
      .filter((d) => d.date === date)
      .reduce(
        (v, d) => ({
          milliseconds: v.milliseconds + d.milliseconds,
          words: v.words + d.author.added - d.author.removed,
        }),
        { milliseconds: 0, words: 0 },
      ),
  }))
  const max = Math.max(60000, ...daily.map((d) => d.milliseconds))
  return (
    <div className="progress-page">
      <PageHeading
        eyebrow="A practice of your own"
        title="Time with your story."
        description="Writing, revision, and exploration all leave room for a story to grow."
        actions={
          <Button
            variant="secondary"
            onClick={() =>
              download(`${p.title}-practice.json`, JSON.stringify(p.activity, null, 2))
            }
          >
            <Download size={15} /> Export history
          </Button>
        }
      />
      <div className="progress-grid">
        <div>
          <section className="practice-week" aria-label="Last seven days of practice">
            <h3>
              <Clock3 size={17} /> The past seven days
            </h3>
            <div className="practice-days">
              {daily.map((d) => (
                <div key={d.date}>
                  <span className="practice-bar-track">
                    <i style={{ height: `${(d.milliseconds / max) * 100}%` }} />
                  </span>
                  <strong>{Math.floor(d.milliseconds / 60000)}m</strong>
                  <span>
                    {d.words >= 0 ? '+' : ''}
                    {d.words} words
                  </span>
                  <small>{d.date.slice(5)}</small>
                </div>
              ))}
            </div>
          </section>
          <section className="practice-history">
            <h3>
              <Sprout size={17} /> Sessions you made time for
            </h3>
            {!sessions.length && (
              <p className="muted">Your first session begins whenever you are ready.</p>
            )}
            {sessions
              .slice()
              .reverse()
              .map((s) => {
                const totals = sessionTotals(s)
                return (
                  <article key={s.id}>
                    <div>
                      <strong>{s.title}</strong>
                      <span className="small muted">
                        {new Date(s.createdAt).toLocaleDateString()} · {s.kind} · {s.status}
                        {sessionProgress(s) >= 100 ? ' · goal reached' : ''}
                      </span>
                    </div>
                    <div className="practice-history-totals">
                      <span>{duration(totals.milliseconds)} practice</span>
                      <span>
                        {totals.author >= 0 ? '+' : ''}
                        {totals.author} author words
                      </span>
                      <span>
                        {totals.assisted >= 0 ? '+' : ''}
                        {totals.assisted} assisted · {totals.imported >= 0 ? '+' : ''}
                        {totals.imported} imported/restored
                      </span>
                    </div>
                  </article>
                )
              })}
          </section>
          <details className="practice-method">
            <summary>What these numbers mean</summary>
            <p>
              Word totals measure changes in word count while a session is running. Replacing an
              equal-length passage adds no net words, but still counts as an edit. Pasted text is
              treated as an author edit unless Storied knows it came from an AI acceptance,
              conversation import, or revision restore.
            </p>
            <p>
              Writing sessions count manuscript text. Worldbuilding sessions count descriptions,
              notes, and attributes. Conversation sessions count accepted turns, with your input and
              generated replies kept separate. Time is saved every five seconds, pauses in the
              background or away from the activity, and pauses after two quiet minutes unless you
              choose thinking time. Reopening the app or importing a project leaves the session
              paused.
            </p>
            <p>
              These are local aggregates, not keystroke recordings or a quality score. No model is
              used to calculate them. History is included in project exports and can be cleared
              independently of your writing.
            </p>
          </details>
        </div>
        <aside>
          <Field label="Practice activity">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as WritingSession['kind'])}
            >
              <option value="writing">Manuscript writing</option>
              <option value="worldbuilding">Worldbuilding</option>
            </select>
          </Field>
          <SessionPanel key={kind} kind={kind} />
          <Button
            variant="ghost"
            onClick={() => store.navigate(kind === 'writing' ? 'Write' : 'World')}
          >
            Go to {kind === 'writing' ? 'your manuscript' : 'your world'}
          </Button>
          <p className="small muted">
            Start a character conversation goal from Play, beside the conversation you choose.
          </p>
          <label className="studio-check">
            <input
              type="checkbox"
              checked={p.activity.enabled}
              onChange={(e) =>
                store.mutate((p) => {
                  p.activity.enabled = e.target.checked
                  if (!e.target.checked) pauseSessions(p, 'Tracking is disabled.')
                }, 'none')
              }
            />{' '}
            Enable local practice tracking
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setClear(true)}
            disabled={!sessions.length}
          >
            Clear practice history
          </Button>
        </aside>
      </div>
      <Dialog
        open={clear}
        onOpenChange={setClear}
        title="Clear practice history?"
        description="This removes session totals from this project, including any current session. Your writing and conversations are preserved."
      >
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setClear(false)}>
            Keep history
          </Button>
          <Button
            onClick={() => {
              if (
                store.mutate((p) => {
                  p.activity.sessions = []
                  p.activity.enabled = false
                }, 'none')
              )
                setClear(false)
            }}
          >
            Clear session totals
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
