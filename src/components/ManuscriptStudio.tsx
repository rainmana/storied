import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, History, Sparkles, Square } from 'lucide-react'
import { useStore, flushSaves } from '../lib/store'
import { runManuscript, stopStudioRun, useStudioActivity } from '../lib/manuscript-runner'
import { useInferenceStatus } from '../lib/inference'
import {
  acceptManuscript,
  canonTicket,
  checkpointScene,
  commitCanonEdit,
  createManuscriptRun,
  previewCanonEdit,
  runIsStale,
  studioRequest,
  type CanonEdit,
  type RunOptions,
} from '../domain/manuscript'
import { entityTypes, now, uid, type Scene } from '../domain/schema'
import type { ManuscriptFinding, ManuscriptRun, StudioSource } from '../domain/manuscript-schema'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { Field } from './common'
import { ConversationSources } from './ConversationBridge'

export const layerNames = { canon: 'Story continuity', prose: 'Prose rules', voice: 'Your voice' }
function SourceEvidence({ source }: { source: StudioSource }) {
  const p = useStore((s) => s.project)!
  try {
    const value = JSON.parse(source.text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return <p>{source.text}</p>
    for (const key of Object.keys(value))
      if (typeof value[key] !== 'string' && typeof value[key] !== 'number') value[key] = ''
    if (source.kind === 'fact')
      return (
        <p>
          {value.predicate}: {value.value}
        </p>
      )
    if (source.kind === 'entity') return <p>{value.summary}</p>
    if (source.kind === 'event')
      return (
        <p>
          {value.description}
          {value.date ? ` (${value.date})` : ''}
        </p>
      )
    if (source.kind === 'belief')
      return (
        <p>
          {value.claim}
          {value.source ? ` · ${value.source}` : ''}
        </p>
      )
    if (source.kind === 'relationship')
      return (
        <p>
          {p.entities.find((e) => e.id === value.from)?.name || 'Source entry'} →{' '}
          {p.entities.find((e) => e.id === value.to)?.name || 'Linked entry'}: {value.description}
        </p>
      )
  } catch {
    /* Plain prose sources have no structured fields. */
  }
  return <p>{source.text}</p>
}
export function AnnotatedPassage({
  text,
  findings,
  offset = 0,
  onFinding,
}: {
  text: string
  findings: ManuscriptFinding[]
  offset?: number
  onFinding: (id: string) => void
}) {
  const active = findings.filter(
    (f) => f.status === 'open' && text.slice(offset + f.start, offset + f.end) === f.quote,
  )
  const points = [
    ...new Set([0, text.length, ...active.flatMap((f) => [offset + f.start, offset + f.end])]),
  ].sort((a, b) => a - b)
  return (
    <div className="annotated-passage" aria-label="Passage with review highlights">
      {points.slice(0, -1).map((start, i) => {
        const end = points[i + 1],
          matched = active.filter((f) => offset + f.start <= start && offset + f.end >= end)
        return matched.length ? (
          <button
            key={start}
            className={`passage-mark mark-${matched[0].layer}`}
            aria-label={`${layerNames[matched[0].layer]}: ${text.slice(start, end)}`}
            title={matched.map((f) => layerNames[f.layer] + ': ' + f.explanation).join('\n')}
            onClick={() => onFinding(matched[0].id)}
          >
            {text.slice(start, end)}
          </button>
        ) : (
          <span key={start}>{text.slice(start, end)}</span>
        )
      })}
    </div>
  )
}
export function RunInspector({ run }: { run: ManuscriptRun }) {
  return (
    <details className="run-inspector">
      <summary>Sources &amp; specialist history</summary>
      <p className="small muted">
        World revision {run.worldRevision} · {run.steps.length} separate model calls ·{' '}
        {run.sources.length} source records. Reviewers receive the same candidate independently.
      </p>
      {run.omissions.map((note, i) => (
        <p className="review-coverage" key={i}>
          {note}
        </p>
      ))}
      <details>
        <summary>Original direction and repairs</summary>
        {run.boundaries.map((b) => (
          <div key={b.id}>
            <strong>{b.kind}</strong>
            <pre>{b.text}</pre>
          </div>
        ))}
      </details>
      <details>
        <summary>Compiled source snapshot</summary>
        <pre>{run.context}</pre>
        {run.sources.map((s) => (
          <div key={s.id}>
            <strong>
              {s.kind} · {s.title}
            </strong>
            <pre>{s.text}</pre>
          </div>
        ))}
      </details>
      {run.steps.map((step, i) => (
        <details key={step.id}>
          <summary>
            {i + 1}. {step.role} · {step.status}
          </summary>
          <p>
            {step.model} · {step.destination}
          </p>
          <pre>{step.settings}</pre>
          <pre>{step.system}</pre>
          <pre>{step.prompt}</pre>
          <details>
            <summary>Response contract</summary>
            <pre>{step.schema}</pre>
          </details>
          <details>
            <summary>Exact response</summary>
            <pre>{step.raw || 'No response recorded.'}</pre>
          </details>
        </details>
      ))}
    </details>
  )
}
export function ManuscriptStudio({
  scene,
  selection,
  onReview,
}: {
  scene: Scene
  selection: { start: number; end: number }
  onReview: (id: string) => void
}) {
  const store = useStore(),
    p = store.project!,
    inference = useInferenceStatus(),
    activity = useStudioActivity()
  const clips = p.studio.clips.filter((c) => c.sceneId === scene.id)
  const [clipId, setClipId] = useState(clips.at(-1)?.id || '')
  const [mode, setMode] = useState<RunOptions['mode']>(
      clips.some((c) => c.method === 'adapt') ? 'adapt' : 'opening',
    ),
    [direction, setDirection] = useState(''),
    [privateContext, setPrivate] = useState(false),
    [samples, setSamples] = useState(false),
    [layers, setLayers] = useState<ManuscriptRun['layers']>(['canon', 'prose', 'voice']),
    [chosen, setChosen] = useState(''),
    [inspector, setInspector] = useState(false),
    [draft, setDraft] = useState(''),
    [finding, setFinding] = useState('')
  const runs = p.studio.runs
    .filter((r) => r.sceneId === scene.id)
    .slice()
    .reverse()
  const run = runs.find((r) => r.id === chosen) || runs[0]
  const resultPanel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (run && ['review', 'paused', 'repair'].includes(run.status))
      resultPanel.current?.scrollIntoView({ block: 'nearest' })
  }, [run?.id, run?.status])
  const stale = !!run && runIsStale(p, run)
  const options = (): RunOptions => {
    const range =
      mode === 'review' && selection.start === selection.end
        ? { start: 0, end: scene.text.length }
        : selection
    return {
      mode,
      direction,
      ...range,
      includePrivate: privateContext,
      includeSamples: samples,
      layers,
      clipId: mode === 'adapt' ? clipId : undefined,
    }
  }
  useEffect(() => {
    setDraft(run?.candidate || '')
    setFinding('')
  }, [run?.id, run?.candidate])
  let preview: ManuscriptRun | undefined,
    previewError = ''
  try {
    preview = createManuscriptRun(p, scene.id, options())
  } catch (e) {
    previewError = e instanceof Error ? e.message : String(e)
  }
  const start = (local = false, parent?: ManuscriptRun) => {
    try {
      const next = createManuscriptRun(
        p,
        scene.id,
        local
          ? {
              ...options(),
              mode: 'review',
              start: selection.start === selection.end ? 0 : selection.start,
              end: selection.start === selection.end ? scene.text.length : selection.end,
              layers: ['prose'],
            }
          : options(),
      )
      if (parent) {
        next.parentId = parent.id
        next.boundaries.push({
          id: uid(),
          actor: 'author',
          kind: 'repair',
          text: `Synchronized with current sources; prior run ${parent.id} remains preserved. Current direction: ${direction}`,
          createdAt: now(),
        })
      }
      if (local) {
        next.node = 'humanReview'
        next.status = 'review'
      }
      if (store.mutate((p) => p.studio.runs.push(next))) {
        setChosen(next.id)
        if (local) onReview(next.id)
        else void runManuscript(p.id, next.id)
      }
    } catch (e) {
      store.notify(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <div className="manuscript-assist">
      <div className="section-heading">
        <h3>Beside the draft</h3>
        <Sparkles size={17} />
      </div>
      <p className="small muted">
        A direction from you. Separate specialists for the draft, continuity, prose rules, and
        voice.
      </p>
      <Field label="Writing action">
        <select value={mode} onChange={(e) => setMode(e.target.value as RunOptions['mode'])}>
          <option value="opening">Start a scene</option>
          <option value="continue">Continue at cursor</option>
          <option value="dialogue">Explore dialogue</option>
          <option value="revise">Revise selection</option>
          {clips.length > 0 && <option value="adapt">Adapt a conversation</option>}
          <option value="review">Review passage</option>
        </select>
      </Field>
      {mode === 'adapt' && (
        <>
          <Field label="Conversation to adapt">
            <select value={clipId} onChange={(e) => setClipId(e.target.value)}>
              {clips.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </Field>
          <ConversationSources sceneId={scene.id} />
        </>
      )}
      <p className="selection-note">
        {selection.end > selection.start
          ? `${selection.end - selection.start} characters selected`
          : `Insertion at character ${selection.start}`}
        . Review uses the whole scene when nothing is selected.
      </p>
      <Field label="Direction for this passage">
        <textarea
          rows={3}
          maxLength={5000}
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          placeholder="Mara asks about the missing boat. Keep their exchange guarded."
        />
      </Field>
      <div className="review-layer-options" role="group" aria-label="Specialist reviews">
        {(['canon', 'prose', 'voice'] as const).map((layer) => (
          <label key={layer}>
            <input
              type="checkbox"
              checked={layers.includes(layer)}
              onChange={(e) =>
                setLayers(e.target.checked ? [...layers, layer] : layers.filter((v) => v !== layer))
              }
            />
            {layerNames[layer]}
          </label>
        ))}
      </div>
      <label className="studio-check">
        <input
          type="checkbox"
          checked={privateContext}
          onChange={(e) => setPrivate(e.target.checked)}
        />
        Include private world evidence in author review
      </label>
      <label className="studio-check">
        <input type="checkbox" checked={samples} onChange={(e) => setSamples(e.target.checked)} />
        Include approved writing-sample excerpts
      </label>
      <p className="small muted">
        {inference.label || 'No model loaded'} · {inference.origin}. Each selected specialist makes
        a separate request. Plain voice preferences can be sent without sample excerpts.
      </p>
      <div className="button-row studio-buttons">
        <Button
          disabled={!inference.ready || inference.busy || !!activity.runId || !!previewError}
          onClick={() => start()}
        >
          <Sparkles size={14} />
          {mode === 'review' ? 'Run specialist review' : 'Find a draft'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setInspector(!inspector)}>
          Preview request
        </Button>
      </div>
      {previewError && <p className="small muted">{previewError}</p>}
      {!inference.ready && (
        <button className="text-button" onClick={() => store.navigate('Settings')}>
          Choose or load a model in Settings
        </button>
      )}
      {inspector && preview && (
        <div className="request-preview">
          <p>
            Opening this preview sends nothing. All records below may be sent to the selected
            provider for the indicated specialist.
          </p>
          <pre>{studioRequest(preview, !inference.connection).system}</pre>
          <pre>{studioRequest(preview, !inference.connection).prompt}</pre>
          <p>
            Review steps use the generated candidate plus their relevant subset of these source
            records.
          </p>
          {preview.sources.map((s) => (
            <details key={s.id}>
              <summary>
                {s.kind}: {s.title}
                {!s.writerAllowed ? ' (author review only)' : ''}
              </summary>
              <pre>{s.text}</pre>
            </details>
          ))}
          {preview.omissions.map((note, i) => (
            <p key={i}>{note}</p>
          ))}
        </div>
      )}
      <Button
        variant="secondary"
        size="sm"
        disabled={!scene.text.trim() || !!activity.runId}
        onClick={() => start(true)}
      >
        Check prose rules locally
      </Button>
      {runs.length > 0 && (
        <Field label="Saved manuscript passes">
          <select value={run?.id || ''} onChange={(e) => setChosen(e.target.value)}>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.mode} · {r.status} · {new Date(r.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        </Field>
      )}
      {run && (
        <section ref={resultPanel} className="studio-result" aria-label="Manuscript result">
          <div className="section-heading">
            <strong>{run.status === 'review' ? 'Ready for your review' : run.status}</strong>
            {activity.runId === run.id && (
              <Button size="sm" variant="ghost" onClick={() => stopStudioRun(run.id)}>
                <Square size={13} />
                Stop
              </Button>
            )}
          </div>
          {run.error && <p role="alert">{run.error}</p>}
          {stale && run.status !== 'accepted' && (
            <p className="review-coverage">
              Sources changed. This pass is preserved as history; its edits and highlights cannot be
              applied.
            </p>
          )}
          {(stale || run.status === 'repair') && (
            <Button
              size="sm"
              variant="secondary"
              disabled={!!activity.runId || !!previewError}
              onClick={() => start(false, run)}
            >
              Start with current sources
            </Button>
          )}
          {!stale &&
            ['paused', 'running', 'ready'].includes(run.status) &&
            activity.runId !== run.id && (
              <Button
                disabled={!inference.ready || inference.busy}
                size="sm"
                onClick={() => {
                  if (
                    store.mutate((p) => {
                      const r = p.studio.runs.find((r) => r.id === run.id)!
                      r.status = 'ready'
                      r.boundaries.push({
                        id: uid(),
                        actor: 'author',
                        kind: 'repair',
                        text: 'Explicitly resumed the saved step. An interrupted request may be sent again.',
                        createdAt: now(),
                      })
                    })
                  )
                    void runManuscript(p.id, run.id)
                }}
              >
                Resume saved step
              </Button>
            )}
          {run.candidate && run.kind === 'draft' && (
            <>
              <Field label="Edit manuscript suggestion">
                <textarea
                  rows={8}
                  value={draft}
                  maxLength={8000}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={run.status === 'accepted'}
                />
              </Field>
              {draft !== run.candidate && (
                <p className="small muted">
                  Your edited version has not been reviewed by the specialists. Findings below refer
                  to the original suggestion.
                </p>
              )}
              <Button
                size="sm"
                disabled={stale || run.status !== 'review' || !!activity.runId || !draft.trim()}
                onClick={() => {
                  if (store.mutate((p) => acceptManuscript(p, run.id, draft), 'assisted'))
                    store.notify('Draft inserted. The previous manuscript is saved in History.')
                }}
              >
                <Check size={14} />
                Insert chosen draft
              </Button>
            </>
          )}
          {run.kind === 'review' && !stale && run.status === 'review' && (
            <Button size="sm" variant="secondary" onClick={() => onReview(run.id)}>
              Show passage highlights
            </Button>
          )}
          {run.candidate && run.kind === 'draft' && (
            <AnnotatedPassage
              text={run.candidate}
              findings={run.findings.filter((f) => run.layers.includes(f.layer))}
              onFinding={setFinding}
            />
          )}
          <FindingList run={run} onFinding={setFinding} />
          <RunInspector run={run} />
        </section>
      )}
      {run && finding && (
        <FindingDialog run={run} findingId={finding} onClose={() => setFinding('')} />
      )}
    </div>
  )
}
export function FindingList({
  run,
  onFinding,
}: {
  run: ManuscriptRun
  onFinding: (id: string) => void
}) {
  const findings = run.findings.filter((f) => run.layers.includes(f.layer))
  return (
    <div className="finding-list" aria-label="Review findings">
      {findings.map((f) => (
        <button
          key={f.id}
          className={`finding-card finding-${f.layer}`}
          onClick={() => onFinding(f.id)}
        >
          <span className="finding-label">
            {layerNames[f.layer]} · {f.status}
          </span>
          <q>{f.quote}</q>
          <span>{f.explanation}</span>
          <ChevronRight size={14} />
        </button>
      ))}
      {run.status === 'review' && !findings.length && (
        <p className="small muted">
          No findings returned in the reviewed scope. This does not establish that the passage is
          free of contradictions or stylistic issues.
        </p>
      )}
    </div>
  )
}
export function FindingDialog({
  run,
  findingId,
  onClose,
}: {
  run: ManuscriptRun
  findingId: string
  onClose: () => void
}) {
  const store = useStore(),
    p = store.project!,
    f = run.findings.find((f) => f.id === findingId)!
  const [replacement, setReplacement] = useState(f.replacement || f.quote),
    [decision, setDecision] = useState(''),
    [canon, setCanon] = useState(false)
  const stale = runIsStale(p, run),
    canEdit = run.kind === 'review' && !stale && run.status === 'review'
  const decide = (status: ManuscriptFinding['status']) => {
    if (
      store.mutate((p) => {
        const r = p.studio.runs.find((r) => r.id === run.id)!
        if (runIsStale(p, r)) throw new Error('Review current sources before deciding.')
        const finding = r.findings.find((v) => v.id === f.id)!
        finding.status = status
        finding.decision = decision
        r.boundaries.push({
          id: uid(),
          actor: 'author',
          kind: 'decision',
          text: `${status}: ${f.quote}\n${decision}`,
          createdAt: now(),
        })
      })
    )
      onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title={layerNames[f.layer]}
      description="A source-linked suggestion for your review, with no automatic changes."
    >
      <blockquote className="finding-quote">{f.quote}</blockquote>
      <p>{f.explanation}</p>
      {f.sourceIds.map((id) => {
        const source = run.sources.find((s) => s.id === id)
        return source ? (
          <details key={id} open>
            <summary>
              {source.kind}: {source.title}
            </summary>
            <SourceEvidence source={source} />
          </details>
        ) : null
      })}
      {stale && (
        <p role="alert">
          This finding predates a text, world, or voice change. Start a new review.
        </p>
      )}
      {canEdit && (
        <>
          <Field label="Replacement passage">
            <textarea
              rows={4}
              value={replacement}
              maxLength={3000}
              onChange={(e) => setReplacement(e.target.value)}
            />
          </Field>
          <Button
            size="sm"
            onClick={() => {
              if (
                store.mutate((p) => {
                  const r = p.studio.runs.find((r) => r.id === run.id)!
                  if (runIsStale(p, r)) throw new Error('The passage changed. Review it again.')
                  const s = p.scenes.find((s) => s.id === r.sceneId)!
                  const start = r.start + f.start,
                    end = r.start + f.end
                  if (s.text.slice(start, end) !== f.quote)
                    throw new Error('This highlight no longer matches the text.')
                  checkpointScene(p, s, 'Before reviewed passage edit', r.id)
                  s.text = s.text.slice(0, start) + replacement + s.text.slice(end)
                  s.updatedAt = now()
                  r.findings.find((v) => v.id === f.id)!.status = 'resolved'
                  r.boundaries.push({
                    id: uid(),
                    actor: 'author',
                    kind: 'decision',
                    text: `Replaced ${f.quote}\nwith ${replacement}`,
                    createdAt: now(),
                  })
                }, 'assisted')
              )
                onClose()
            }}
          >
            Apply passage edit
          </Button>
        </>
      )}
      {f.layer === 'canon' && canEdit && (
        <Button variant="secondary" size="sm" onClick={() => setCanon(true)}>
          Propose canon update
        </Button>
      )}
      <Field label="Decision note">
        <textarea
          rows={2}
          maxLength={500}
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          placeholder="A deliberate lie, a dream, an unreliable narrator…"
        />
      </Field>
      <div className="dialog-actions">
        <Button variant="ghost" disabled={stale} onClick={() => decide('dismissed')}>
          Dismiss
        </Button>
        <Button
          variant="secondary"
          disabled={stale || !decision.trim()}
          onClick={() => decide('intentional')}
        >
          Mark intentional
        </Button>
      </div>
      {canon && (
        <CanonDialog
          sceneId={run.sceneId!}
          runId={run.id}
          findingId={f.id}
          quote={f.quote}
          onClose={() => setCanon(false)}
        />
      )}
    </Dialog>
  )
}
export function CanonDialog({
  sceneId,
  runId,
  findingId,
  quote,
  onClose,
}: {
  sceneId: string
  runId?: string
  findingId?: string
  quote: string
  onClose: () => void
}) {
  const store = useStore(),
    p = store.project!,
    run = p.studio.runs.find((r) => r.id === runId),
    finding = run?.findings.find((f) => f.id === findingId),
    fact = p.facts.find((f) => finding?.sourceIds.includes(f.id))
  const [edit, setEdit] = useState<CanonEdit>({
      kind: fact ? 'fact' : 'entity',
      subjectId:
        fact?.subjectId ||
        p.scenes.find((s) => s.id === sceneId)?.viewpointId ||
        p.entities[0]?.id ||
        '',
      name: fact?.predicate || '',
      value: quote.slice(0, 500),
      entityType: 'Character',
      replaceId: fact?.id || '',
      atEventId: '',
      reason: '',
    }),
    [preview, setPreview] = useState<ReturnType<typeof previewCanonEdit>>(),
    [ack, setAck] = useState(false),
    [error, setError] = useState('')
  const change = (values: Partial<CanonEdit>) => {
    setEdit({ ...edit, ...values })
    setPreview(undefined)
    setAck(false)
    setError('')
  }
  const currentTicket = canonTicket(p, sceneId, edit)
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title="Bring a detail into the world"
      description="Review the exact change. Existing canonical records and the author’s approval are preserved."
    >
      <div className="form-stack">
        <Field label="Canon change kind">
          <select
            value={edit.kind}
            onChange={(e) =>
              change({ kind: e.target.value as CanonEdit['kind'], replaceId: '', atEventId: '' })
            }
          >
            <option value="entity">Create world entry</option>
            <option value="fact">Add or update a fact</option>
            <option value="event">Add timeline event</option>
          </select>
        </Field>
        {edit.kind === 'entity' && (
          <Field label="New entry type">
            <select
              value={edit.entityType}
              onChange={(e) => change({ entityType: e.target.value as CanonEdit['entityType'] })}
            >
              {entityTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        )}
        {edit.kind === 'fact' && (
          <>
            <Field label="Fact belongs to">
              <select
                value={edit.subjectId}
                onChange={(e) => change({ subjectId: e.target.value, replaceId: '' })}
              >
                {p.entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Existing fact to update">
              <select
                value={edit.replaceId}
                onChange={(e) => {
                  const f = p.facts.find((f) => f.id === e.target.value)
                  change({ replaceId: e.target.value, name: f?.predicate || edit.name })
                }}
              >
                <option value="">Add a new fact</option>
                {p.facts
                  .filter((f) => f.subjectId === edit.subjectId && f.status === 'Canon')
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.predicate}: {f.object}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="When does this change take effect?">
              <select
                value={edit.atEventId}
                onChange={(e) => change({ atEventId: e.target.value })}
              >
                <option value="">Correction to canon (retain previous version)</option>
                {p.events
                  .filter((e) => e.status === 'Canon' && e.order !== undefined)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      From {e.title}
                    </option>
                  ))}
              </select>
            </Field>
          </>
        )}
        <Field label={edit.kind === 'fact' ? 'Fact predicate' : 'Entry or event name'}>
          <input
            value={edit.name}
            maxLength={500}
            onChange={(e) => change({ name: e.target.value })}
          />
        </Field>
        <Field label="Proposed canonical text">
          <textarea
            value={edit.value}
            maxLength={500}
            rows={4}
            onChange={(e) => change({ value: e.target.value })}
          />
        </Field>
        {edit.kind === 'event' && (
          <Field label="Timeline order (optional)">
            <input
              type="number"
              value={edit.order ?? ''}
              onChange={(e) =>
                change({ order: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </Field>
        )}
        <Field label="Reason for canon change">
          <textarea
            value={edit.reason}
            maxLength={500}
            rows={2}
            onChange={(e) => change({ reason: e.target.value })}
          />
        </Field>
        <Button
          variant="secondary"
          onClick={() => {
            try {
              setPreview(previewCanonEdit(p, sceneId, edit))
              setError('')
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            }
          }}
        >
          Preview canon change
        </Button>
        {error && <p role="alert">{error}</p>}
        {preview && (
          <section aria-label="Canon change preview">
            <h3>Before</h3>
            <p>
              {preview.receipt.before
                ? `${JSON.parse(preview.receipt.before).predicate}: ${JSON.parse(preview.receipt.before).object}`
                : 'No existing record.'}
            </p>
            <h3>After</h3>
            <p>
              <strong>{edit.name}</strong>: {edit.value}
            </p>
            <p className="small muted">
              {edit.kind === 'fact'
                ? `${p.entities.find((e) => e.id === edit.subjectId)?.name} · ${edit.atEventId ? `Effective from ${p.events.find((e) => e.id === edit.atEventId)?.title}` : 'Canonical correction; the previous fact remains in history.'}`
                : edit.kind === 'event'
                  ? `New timeline event${edit.order === undefined ? '' : ` at order ${edit.order}`}.`
                  : `New ${edit.entityType.toLowerCase()} entry.`}
            </p>
            <p className="small muted">
              References to this scene and the reviewed passage will be saved with your decision.
              Other manuscript passages may need a new review.
            </p>
            {preview.findings.map((f) => (
              <p key={f.id}>{f.message}</p>
            ))}
            {preview.findings.length > 0 && (
              <label className="studio-check">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />I
                reviewed these graph findings and accept this change
              </label>
            )}
            <Button
              disabled={currentTicket !== preview.ticket || (preview.findings.length > 0 && !ack)}
              onClick={async () => {
                if (
                  store.mutate((p) =>
                    commitCanonEdit(p, sceneId, edit, preview.ticket, ack, runId, findingId),
                  )
                ) {
                  try {
                    await flushSaves()
                    store.notify('Canon updated with its previous version and approval preserved.')
                    onClose()
                  } catch (e) {
                    store.notify(e instanceof Error ? e.message : String(e))
                  }
                }
              }}
            >
              Approve canon change
            </Button>
          </section>
        )}
      </div>
    </Dialog>
  )
}
export function ManuscriptHistory({ scene, onClose }: { scene: Scene; onClose: () => void }) {
  const store = useStore(),
    p = store.project!,
    revisions = p.studio.revisions
      .filter((r) => r.sceneId === scene.id)
      .slice()
      .reverse()
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title="Manuscript history"
      description="Restore a saved version. The current text is saved before restoration."
    >
      <Button
        variant="secondary"
        onClick={() =>
          store.mutate((p) =>
            checkpointScene(
              p,
              p.scenes.find((s) => s.id === scene.id)!,
              'Author checkpoint',
            ),
          )
        }
      >
        <History size={15} />
        Save a checkpoint
      </Button>
      {!revisions.length && (
        <p>
          No saved revisions yet. AI insertions and reviewed edits create a checkpoint
          automatically.
        </p>
      )}
      {revisions.map((r) => (
        <details key={r.id}>
          <summary>
            {r.reason} · {new Date(r.createdAt).toLocaleString()}
          </summary>
          <pre>{r.text || '(Empty scene)'}</pre>
          <Button
            size="sm"
            onClick={() => {
              if (
                store.mutate((p) => {
                  const s = p.scenes.find((s) => s.id === scene.id)!
                  checkpointScene(p, s, 'Before restoring a revision')
                  s.text = r.text
                  s.updatedAt = now()
                }, 'imported')
              ) {
                store.notify('Previous text restored.')
                onClose()
              }
            }}
          >
            Restore this version
          </Button>
        </details>
      ))}
    </Dialog>
  )
}
