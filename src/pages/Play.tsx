import { useState } from 'react'
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  CornerUpLeft,
  CornerUpRight,
  Eye,
  GitBranch,
  MessageSquare,
  Pencil,
  Play as PlayIcon,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { cancelInference, useInferenceStatus } from '../lib/inference'
import { compileContext, type CompiledContext } from '../domain/context'
import { writingNotes } from '../domain/writing-style'
import { addBoundary, createWorkflow, workflowIsStale } from '../domain/coordination'
import { acceptWorkflowNarrative } from '../domain/execution-graph'
import { operationFindings, reviewTicket } from '../domain/canon-rules'
import { runWorkflow, updateWorkflow } from '../lib/workflows'
import { WorkflowPanel } from '../components/WorkflowPanel'
import {
  addTurn,
  approveProposal,
  branchPath,
  forkAt,
  newProposal,
  redoTurn,
  startAdventure,
  undoTurn,
} from '../domain/story'
import { now, uid, type Adventure, type Proposal, type Scenario, type Turn } from '../domain/schema'
import { Button } from '../components/ui/button'
import { Dialog } from '../components/ui/dialog'
import { Badge, Empty, Field, PageHeading } from '../components/common'
import { Prose } from './Write'

export function Play() {
  const store = useStore(),
    p = store.project!
  const adventure =
    p.adventures.find((a) => a.id === store.selectedAdventure) || p.adventures.at(-1)
  const [newScenario, setNewScenario] = useState(false)
  return (
    <div className="play-page">
      <PageHeading
        eyebrow="Step inside your story"
        title="Let the next moment unfold."
        description="You are the character. You are still the author."
        actions={
          <Button variant="secondary" onClick={() => setNewScenario(true)}>
            <Plus size={16} />
            New adventure
          </Button>
        }
      />
      {p.adventures.length > 1 && (
        <select
          className="adventure-switcher"
          aria-label="Choose adventure"
          value={adventure?.id}
          onChange={(e) => store.navigate('Play', e.target.value)}
        >
          {p.adventures.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      )}
      {adventure ? (
        <AdventureView key={adventure.id} adventure={adventure} />
      ) : (
        <>
          <Empty
            icon={Compass}
            title="There’s a world waiting for you."
            description="Choose who you’ll be and where the story begins. You can write freely before loading a local storyteller."
            action="Create a scenario"
            onAction={() => setNewScenario(true)}
          />
          {p.scenarios.map((s) => (
            <button
              className="scenario-card"
              key={s.id}
              onClick={() => {
                const a = startAdventure(s)
                store.mutate((p) => p.adventures.push(a))
                store.navigate('Play', a.id)
              }}
            >
              <Compass size={20} />
              <div>
                <h3>{s.title}</h3>
                <p>{s.opening.slice(0, 120)}</p>
              </div>
              <ArrowRight size={17} />
            </button>
          ))}
        </>
      )}
      {newScenario && <ScenarioDialog onClose={() => setNewScenario(false)} />}
    </div>
  )
}
function AdventureView({ adventure: a }: { adventure: Adventure }) {
  const store = useStore(),
    p = store.project!,
    inference = useInferenceStatus()
  const [intent, setIntent] = useState<Turn['intent']>('Do'),
    [input, setInput] = useState(''),
    [working, setWorking] = useState(false),
    [error, setError] = useState(''),
    [context, setContext] = useState<CompiledContext | null>(null),
    [inspect, setInspect] = useState(false),
    [review, setReview] = useState(false),
    [edit, setEdit] = useState<Turn | null>(null),
    [annotation, setAnnotation] = useState<Turn | null>(null),
    [initialGoal, setInitialGoal] = useState('')
  const path = branchPath(a),
    ancestors = new Set(path.map((t) => t.id))
  const workflow = p.workflows
    .filter(
      (w) =>
        w.adventureId === a.id &&
        w.status !== 'discarded' &&
        (w.turnId ? ancestors.has(w.turnId) : w.parentId === a.headId),
    )
    .at(-1)
  const draft = workflow?.draft || '',
    draftIntent = workflow?.intent || intent
  const generating = working || (workflow?.status === 'running' && inference.busy)
  const pending = p.proposals.filter(
    (v) => v.adventureId === a.id && v.status === 'pending' && ancestors.has(v.turnId),
  )
  const update = (fn: (a: Adventure) => void) =>
    store.mutate((p) => fn(p.adventures.find((v) => v.id === a.id)!))
  const character = p.entities.find((e) => e.id === a.scenario.characterId),
    location = p.entities.find((e) => e.id === a.scenario.locationId)
  const terminals = a.turns.filter((t) => !a.turns.some((child) => child.parentId === t.id))
  async function resume(id: string) {
    setWorking(true)
    try {
      await runWorkflow(p.id, id)
    } finally {
      setWorking(false)
    }
  }
  async function generate(retry = false, continuation = false) {
    setError('')
    if (retry && workflow) {
      updateWorkflow(workflow.id, (w) => {
        if (w.draft) addBoundary(w, 'application', 'output', w.draft, 'draft-before-retry')
        w.draft = ''
        w.context = undefined
        w.node = 'synchronizeCoordinationState'
        w.status = 'ready'
        w.model = inference.label
        addBoundary(w, 'human', 'correction', 'Retry this draft from the same original input.')
      })
      await resume(workflow.id)
      return
    }
    const currentInput = continuation
      ? 'Continue the scene without deciding my character’s next action.'
      : input
    const currentIntent = continuation ? 'Director' : intent
    const w = createWorkflow(
      p,
      a.id,
      currentInput,
      currentIntent,
      inference.label,
      initialGoal || undefined,
    )
    if (store.mutate((p) => p.workflows.push(w))) await resume(w.id)
  }
  async function accept() {
    if (!workflow) return
    if (
      !store.mutate((p) => {
        acceptWorkflowNarrative(p, workflow.id, draft)
      })
    )
      return
    setInput('')
    store.notify('Passage accepted. Your world’s canon is unchanged.')
    await resume(workflow.id)
  }
  function propose(turn: Turn) {
    store.mutate((p) => p.proposals.push(newProposal(a, turn.id, turn.text.slice(0, 160))))
    setReview(true)
  }
  function contextOf(turn: Turn) {
    setContext(
      p.workflows.find((w) => w.id === turn.workflowId)?.context || {
        prompt: turn.context,
        entries: [],
        approximateTokens: Math.ceil(turn.context.length / 3),
        withheld: 0,
      },
    )
    setInspect(true)
  }
  return (
    <div className="play-layout">
      <section className="story-stage">
        <header className="story-stage-header">
          <div>
            <span className="eyebrow">{a.scenario.tone}</span>
            <h2>{a.title}</h2>
          </div>
          <div className="button-row">
            <button
              className="icon-button"
              aria-label="Undo story turn"
              title="Undo"
              disabled={!a.headId || !!draft || generating}
              onClick={() => update(undoTurn)}
            >
              <CornerUpLeft size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Redo story turn"
              title="Redo"
              disabled={!a.redoIds.length || !!draft || generating}
              onClick={() => update(redoTurn)}
            >
              <CornerUpRight size={17} />
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setContext(
                  workflow?.context ||
                    compileContext(p, a, input, intent, 8500, [], workflow?.coordination),
                )
                setInspect(true)
              }}
            >
              <Eye size={15} />
              Context
            </Button>
          </div>
        </header>
        <div className="story-pages">
          <div className="story-opening">
            <div className="opening-marker">
              <span />
              THE BEGINNING
              <span />
            </div>
            <Prose text={a.scenario.opening} />
          </div>
          {path.map((turn, i) => (
            <article className="story-turn" key={turn.id}>
              <div className="player-line">
                <span>{turn.intent}</span>
                <p>{turn.intent === 'Story' ? 'You took the pen.' : turn.input}</p>
              </div>
              <Prose text={turn.text} />
              <div className="turn-tools">
                <span className="turn-number">
                  {String(i + 1).padStart(2, '0')} ·{' '}
                  {turn.model === 'Author' ? 'Written by you' : 'Accepted local generation'}
                </span>
                <button
                  className={`icon-button ${turn.bookmark ? 'is-bookmarked' : ''}`}
                  title="Bookmark"
                  aria-label={`Bookmark turn ${i + 1}`}
                  onClick={() =>
                    update((a) => {
                      a.turns.find((t) => t.id === turn.id)!.bookmark = !turn.bookmark
                    })
                  }
                >
                  <Bookmark size={14} />
                </button>
                <button
                  className="icon-button"
                  title="Annotate"
                  aria-label={`Annotate turn ${i + 1}`}
                  onClick={() => setAnnotation(structuredClone(turn))}
                >
                  <MessageSquare size={14} />
                </button>
                <button
                  className="icon-button"
                  title="Edit as a new branch"
                  aria-label={`Edit turn ${i + 1}`}
                  onClick={() => setEdit(structuredClone(turn))}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="icon-button"
                  title="Branch here"
                  aria-label={`Branch at turn ${i + 1}`}
                  disabled={!!draft || generating}
                  onClick={() => {
                    update((a) => forkAt(a, turn.id))
                    store.notify('The next passage will grow from this point.')
                  }}
                >
                  <GitBranch size={14} />
                </button>
                <button
                  className="icon-button"
                  title="View exact context"
                  aria-label={`View context for turn ${i + 1}`}
                  onClick={() => contextOf(turn)}
                >
                  <Eye size={14} />
                </button>
                <button className="text-button small" onClick={() => propose(turn)}>
                  <Plus size={13} />
                  Propose change
                </button>
              </div>
              {turn.annotation && <div className="turn-annotation">{turn.annotation}</div>}
            </article>
          ))}
          {draft && (
            <div className="story-draft">
              <span className="card-label">
                <Sparkles size={14} />
                {draftIntent === 'Story' ? 'YOUR NEXT PASSAGE' : 'A POSSIBLE NEXT PASSAGE'}
              </span>
              <textarea
                value={draft}
                onChange={(e) =>
                  workflow &&
                  updateWorkflow(workflow.id, (w) => {
                    w.draft = e.target.value
                  })
                }
                aria-label="Story draft"
                maxLength={500000}
                rows={Math.max(6, Math.min(18, draft.length / 70))}
              />
              {draftIntent !== 'Story' &&
                writingNotes(draft).map((note) => (
                  <p className="small assistant-style-note" key={note}>
                    {note}
                  </p>
                ))}
              <div className="draft-actions">
                <Button
                  size="sm"
                  onClick={accept}
                  disabled={
                    !draft.trim() ||
                    generating ||
                    workflow?.status !== 'review' ||
                    workflow?.node !== 'humanNarrativeReview'
                  }
                >
                  <Check size={15} />
                  Accept passage
                </Button>
                {draftIntent !== 'Story' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => generate(true)}
                    disabled={generating || inference.busy || workflow?.status === 'repair'}
                  >
                    <RefreshCw size={14} />
                    Retry
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    workflow &&
                    updateWorkflow(workflow.id, (w) => {
                      w.draft = ''
                      w.status = 'discarded'
                    })
                  }
                  disabled={generating}
                >
                  Discard
                </Button>
              </div>
            </div>
          )}
          {generating && (
            <div className="generating" role="status">
              <span className="breathing-dot" />
              Your storyteller is finding the next words…
              <button className="text-button" onClick={cancelInference}>
                <Square size={12} />
                Stop
              </button>
            </div>
          )}
        </div>
        <div className="story-composer">
          <div className="intent-tabs" role="group" aria-label="Story input intent">
            {(['Do', 'Say', 'Story', 'Director'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setIntent(v)}
                className={intent === v ? 'active' : ''}
                disabled={!!draft || generating}
              >
                {v === 'Do' ? (
                  <PlayIcon size={14} />
                ) : v === 'Say' ? (
                  <MessageSquare size={14} />
                ) : v === 'Story' ? (
                  <Pencil size={14} />
                ) : (
                  <Compass size={14} />
                )}
                {v}
              </button>
            ))}
            <span>
              {intent === 'Do'
                ? 'What will you do?'
                : intent === 'Say'
                  ? 'What will you say?'
                  : intent === 'Story'
                    ? 'Take the pen. Write what happens.'
                    : 'A little direction for your storyteller.'}
            </span>
          </div>
          <textarea
            aria-label="Your next move"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={1200}
            placeholder={
              intent === 'Do'
                ? 'I step onto the ferry and ask Nera about the cord…'
                : intent === 'Say'
                  ? '“How long have you been waiting for me?”'
                  : intent === 'Story'
                    ? 'The bells begin ringing before she can answer.'
                    : 'Slow the scene down. Let this conversation breathe.'
            }
            rows={3}
            disabled={!!draft || generating}
            onKeyDown={(e) => {
              if (
                (e.ctrlKey || e.metaKey) &&
                e.key === 'Enter' &&
                input.trim() &&
                !draft &&
                !generating
              )
                void generate()
            }}
          />
          <div className="composer-bottom">
            <span className="small muted">
              {inference.ready ? (
                <>
                  <span className="tiny-dot" />
                  {inference.remote ? inference.label : 'Local storyteller ready'}
                </>
              ) : (
                'Write freely, or choose a storyteller in Settings'
              )}{' '}
              · Ctrl ↵
            </span>
            <div className="button-row">
              <Button
                size="sm"
                variant="ghost"
                disabled={!inference.ready || !!draft || inference.busy}
                onClick={() => generate(false, true)}
              >
                Continue
              </Button>
              <Button
                size="sm"
                onClick={() => generate()}
                disabled={!input.trim() || !!draft || generating || inference.busy}
              >
                {intent === 'Story' ? 'Review passage' : 'Send'}
                <Send size={14} />
              </Button>
            </div>
          </div>
          {inference.remote && (
            <p className="inference-notice small">
              AI actions send context to {inference.origin}. Accepting an AI passage also requests
              extraction there. Story mode stays local.
            </p>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
      <aside className="story-aside">
        {workflow ? (
          <WorkflowPanel
            key={workflow.id}
            workflow={workflow}
            onResume={() => resume(workflow.id)}
            busy={generating}
          />
        ) : (
          <details className="workflow-panel">
            <summary>Story direction</summary>
            <Field label="What matters in this scene?">
              <textarea
                value={initialGoal}
                maxLength={500}
                onChange={(e) => setInitialGoal(e.target.value)}
                placeholder="A politically tense conversation without violence…"
              />
            </Field>
          </details>
        )}
        <section className="scene-context-card">
          <span className="eyebrow">In this moment</span>
          <div className="context-person">
            <span className="avatar-circle">
              {character?.name
                .split(' ')
                .map((s) => s[0])
                .join('')
                .slice(0, 2)}
            </span>
            <div>
              <small>YOU ARE</small>
              <button onClick={() => store.navigate('World', character?.id)}>
                {character?.name}
              </button>
            </div>
          </div>
          <div className="scene-place">
            <small>SOMEWHERE IN</small>
            <button onClick={() => store.navigate('World', location?.id)}>
              {location?.name} <ArrowRight size={13} />
            </button>
          </div>
          <Field
            label="Scene time"
            hint="Ordered events gate discoveries and dated facts. Unknown time excludes dated secrets."
          >
            <select
              value={a.currentEventId || ''}
              onChange={(e) =>
                update((a) => {
                  a.currentEventId = e.target.value || undefined
                })
              }
            >
              <option value="">Unspecified</option>
              {p.events
                .filter((e) => e.status === 'Canon')
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                    {e.order !== undefined ? ` · ${e.order}` : ' · order unknown'}
                  </option>
                ))}
            </select>
          </Field>
          <div className="scene-companions">
            <small>IN THE SCENE</small>
            {a.scenario.activeEntityIds.map((id) => (
              <button key={id} onClick={() => store.navigate('World', id)}>
                {p.entities.find((e) => e.id === id)?.name}
              </button>
            ))}
          </div>
        </section>
        <section className="story-world-changes">
          <div className="section-heading">
            <h3>World changes</h3>
            <Badge variant={pending.length ? 'proposed' : ''}>{pending.length}</Badge>
          </div>
          {inference.busy && !generating && <p role="status">Looking for changes worth keeping…</p>}
          <p>
            The story can change the world.
            <br />
            You decide what stays.
          </p>
          <Button
            variant={pending.length ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setReview(true)}
          >
            <Check size={14} />
            {pending.length ? 'Review & commit to world' : 'Review canon'}
          </Button>
        </section>
        <section className="branch-panel">
          <h3>
            <GitBranch size={16} />
            Story branches
          </h3>
          <select
            aria-label="Active story branch"
            value={a.headId || ''}
            disabled={!!draft || generating}
            onChange={(e) => update((a) => forkAt(a, e.target.value || null))}
          >
            <option value="">The beginning</option>
            {[
              ...new Map(
                [...terminals, ...(a.headId ? a.turns.filter((t) => t.id === a.headId) : [])].map(
                  (t) => [t.id, t],
                ),
              ).values(),
            ].map((t, i) => (
              <option key={t.id} value={t.id}>
                {t.bookmark ? '★ ' : ''}Path {i + 1} · {t.text.slice(0, 35)}…
              </option>
            ))}
          </select>
          <small className="muted">
            Branches stay in this adventure until you choose to promote their changes.
          </small>
        </section>
        <details className="story-memory">
          <summary>
            What the story remembers <ChevronDown size={14} />
          </summary>
          <p className="small muted">
            Accepted excerpts from this branch. Other branches stay separate.
          </p>
          <p className="small preserve-lines">
            {path.at(-1)?.summary || 'Your first experience will be remembered here.'}
          </p>
        </details>
        <button
          className="context-explainer"
          onClick={() => {
            setContext(
              workflow?.context ||
                compileContext(p, a, input, intent, 8500, [], workflow?.coordination),
            )
            setInspect(true)
          }}
        >
          <Eye size={17} />
          <span>
            Why does the AI
            <br />
            know this?
          </span>
          <ArrowRight size={14} />
        </button>
        {!inference.ready && (
          <button className="model-callout" onClick={() => store.navigate('Settings')}>
            <Sparkles size={19} />
            <h3>Meet your storyteller.</h3>
            <p>Download a small model once. Keep the imagination on your device.</p>
            <span>
              Choose a local model <ArrowRight size={13} />
            </span>
          </button>
        )}
      </aside>
      <Dialog
        open={inspect}
        onOpenChange={setInspect}
        title="Why does the AI know this?"
        description="The exact local context. Hidden author notes and unknown secrets are excluded."
        className="wide-dialog"
      >
        <div className="context-inspector">
          <div className="context-stats">
            <Badge>≈ {context?.approximateTokens || 0} tokens</Badge>
            <Badge>Viewpoint: {character?.name}</Badge>
          </div>
          {context?.entries.map((entry, i) => (
            <div className="context-entry" key={`${entry.id}-${i}`}>
              <div>
                <Badge>{entry.kind}</Badge>
                <strong>{entry.title}</strong>
              </div>
              <small>{entry.reason}</small>
              {!!entry.sourceIds?.length && (
                <small>
                  Sources: {entry.sourceIds.join(', ')}
                  {entry.truncated ? ' · excerpt' : ''}
                </small>
              )}
              <p>{entry.text}</p>
            </div>
          ))}
          {!!context?.excluded?.length && (
            <details>
              <summary>
                Excluded by viewpoint, time, relevance, or budget ({context.excluded.length})
              </summary>
              {context.excluded.map((e, i) => (
                <p key={i} className="small">
                  {e.kind} · {e.id}: {e.reason}
                </p>
              ))}
            </details>
          )}
          {context?.warnings?.map((warning) => (
            <p className="error-message" key={warning}>
              {warning}
            </p>
          ))}
          <details open={!context?.entries.length}>
            <summary>Exact compiled prompt</summary>
            <pre>{context?.prompt || 'This author-written passage did not use a model.'}</pre>
          </details>
        </div>
      </Dialog>
      {review && <CanonReview adventure={a} onClose={() => setReview(false)} />}
      <Dialog
        open={!!edit}
        onOpenChange={() => setEdit(null)}
        title="Make this passage yours"
        description="Saving creates a new branch. The original passage and its descendants are preserved."
      >
        {edit && (
          <>
            <textarea
              className="full-width"
              rows={10}
              value={edit.text}
              onChange={(e) => setEdit({ ...edit, text: e.target.value })}
              aria-label="Edit story passage"
            />
            <div className="dialog-actions">
              <Button
                onClick={() => {
                  const text = edit.text
                  store.mutate((p) => {
                    const adv = p.adventures.find((v) => v.id === a.id)!
                    forkAt(adv, edit.parentId)
                    const t = addTurn(adv, {
                      intent: edit.intent,
                      input: edit.input,
                      text,
                      context: edit.context,
                      model: 'Author',
                    })
                    p.memories.push({
                      id: uid(),
                      adventureId: a.id,
                      turnId: t.id,
                      characterId: a.scenario.characterId,
                      text: text.slice(0, 1200),
                      createdAt: now(),
                    })
                  })
                  setEdit(null)
                }}
                disabled={!edit.text.trim()}
              >
                Save as a new branch
              </Button>
            </div>
          </>
        )}
      </Dialog>
      <Dialog
        open={!!annotation}
        onOpenChange={() => setAnnotation(null)}
        title="A note in the margin"
        description="Annotations are for the author and never sent to the storyteller."
      >
        {annotation && (
          <>
            <textarea
              className="full-width"
              rows={4}
              aria-label="Turn annotation"
              value={annotation.annotation}
              onChange={(e) => setAnnotation({ ...annotation, annotation: e.target.value })}
            />
            <div className="dialog-actions">
              <Button
                onClick={() => {
                  update((a) => {
                    a.turns.find((t) => t.id === annotation.id)!.annotation = annotation.annotation
                  })
                  setAnnotation(null)
                }}
              >
                Save note
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  )
}
function ScenarioDialog({ onClose }: { onClose: () => void }) {
  const store = useStore(),
    p = store.project!
  const [title, setTitle] = useState('A new beginning'),
    [characterId, setCharacterId] = useState(
      p.entities.find((e) => e.type === 'Character')?.id || '',
    ),
    [locationId, setLocationId] = useState(p.entities.find((e) => e.type === 'Location')?.id || ''),
    [opening, setOpening] = useState(''),
    [tone, setTone] = useState('Vivid, thoughtful, open to possibility'),
    [instructions, setInstructions] = useState(''),
    [perspective, setPerspective] = useState<Scenario['perspective']>('second')
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title="Where does this story begin?"
      description="This scenario is reusable. Each adventure keeps its own copy."
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          const s: Scenario = {
            id: uid(),
            title,
            characterId,
            locationId,
            opening,
            tone,
            instructions,
            perspective,
            activeEntityIds: [],
          }
          const a = startAdventure(s)
          store.mutate((p) => {
            p.scenarios.push(s)
            p.adventures.push(a)
          })
          store.navigate('Play', a.id)
          onClose()
        }}
      >
        <Field label="Adventure title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={500}
          />
        </Field>
        <div className="field-row">
          <Field label="Who will you be?">
            <select value={characterId} onChange={(e) => setCharacterId(e.target.value)} required>
              <option value="" disabled>
                Choose a character
              </option>
              {p.entities
                .filter((e) => e.type === 'Character')
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Where are you?">
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
              <option value="" disabled>
                Choose a place
              </option>
              {p.entities
                .filter((e) => e.type === 'Location')
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        {(!characterId || !locationId) && (
          <p className="small muted">Add a character and a location in World, then return here.</p>
        )}
        <Field label="The opening situation">
          <textarea
            rows={4}
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            placeholder="Where are you, and what is about to change?"
            required
          />
        </Field>
        <details>
          <summary>Shape the storytelling</summary>
          <div className="form-stack">
            <Field label="Tone">
              <input value={tone} onChange={(e) => setTone(e.target.value)} maxLength={500} />
            </Field>
            <Field label="Perspective">
              <select
                value={perspective}
                onChange={(e) => setPerspective(e.target.value as Scenario['perspective'])}
              >
                <option value="second">Second person · you</option>
                <option value="first">First person · I</option>
                <option value="third">Third person · they</option>
              </select>
            </Field>
            <Field
              label="Storyteller instructions"
              hint="Directions are sent to the model. Keep author-only secrets in private world facts."
            >
              <textarea
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </Field>
          </div>
        </details>
        <div className="dialog-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!characterId || !locationId}>
            <Compass size={16} />
            Begin adventure
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
function CanonReview({ adventure: a, onClose }: { adventure: Adventure; onClose: () => void }) {
  const store = useStore(),
    p = store.project!,
    pathIds = new Set(branchPath(a).map((t) => t.id))
  const proposals = p.proposals.filter((v) => v.adventureId === a.id)
  const [acknowledged, setAcknowledged] = useState<Record<string, string>>({})
  const update = (id: string, patch: Partial<Proposal>) =>
    store.mutate((p) => {
      Object.assign(
        p.proposals.find((v) => v.id === id)!,
        patch,
      )
    })
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title="What becomes part of your world?"
      description="Review each change. Accepting creates explicit canon; rejecting leaves the narrative intact."
      className="wide-dialog"
    >
      <div className="canon-review">
        {!proposals.length && (
          <Empty
            icon={Sparkles}
            title="No changes waiting for you."
            description="Use “Propose change” beneath an accepted passage, or let a local storyteller suggest changes after generation."
          />
        )}
        {proposals.map((v) => {
          const sourceWorkflow = p.workflows.find((w) => w.id === v.workflowId)
          const workflowReady =
            !v.workflowId ||
            !!(
              sourceWorkflow &&
              sourceWorkflow.status === 'review' &&
              sourceWorkflow.node === 'humanCanonReview' &&
              !workflowIsStale(p, sourceWorkflow) &&
              !sourceWorkflow.signals.some((s) => !s.resolved)
            )
          const findings = v.status === 'pending' ? operationFindings(p, v) : []
          const acknowledgementKey = JSON.stringify({
            revision: p.worldRevision,
            proposal: v,
            findings,
          })
          const ticket = reviewTicket(
            p,
            v,
            acknowledged[v.id] === acknowledgementKey ? findings.map((f) => f.id) : [],
          )
          return (
            <div className="proposal-card" key={v.id}>
              <div className="proposal-header">
                <Badge
                  variant={
                    v.status === 'pending' ? 'proposed' : v.status === 'accepted' ? 'canon' : ''
                  }
                >
                  {v.status}
                </Badge>
                <span className="small muted">
                  {pathIds.has(v.turnId)
                    ? 'From this branch'
                    : 'From another branch — review its source'}
                </span>
              </div>
              <details className="small">
                <summary>Read the source passage</summary>
                <p>{a.turns.find((t) => t.id === v.turnId)?.text}</p>
                {v.status === 'pending' && (
                  <button
                    className="text-button small"
                    onClick={() => {
                      store.mutate((p) =>
                        forkAt(
                          p.adventures.find((item) => item.id === a.id)!,
                          v.turnId,
                        ),
                      )
                      onClose()
                    }}
                  >
                    Open source checkpoint
                  </button>
                )}
              </details>
              <div className="field-row">
                <Field label="Kind of change">
                  <select
                    value={v.kind}
                    disabled={v.status !== 'pending'}
                    onChange={(e) => update(v.id, { kind: e.target.value as Proposal['kind'] })}
                  >
                    <option value="event">Timeline event</option>
                    <option value="fact">World fact / inventory / state</option>
                    <option value="relationship">Relationship</option>
                    <option value="knowledge">Something learned</option>
                  </select>
                </Field>
                <Field label="Who or what?">
                  <select
                    value={v.subjectId}
                    disabled={v.status !== 'pending'}
                    onChange={(e) => update(v.id, { subjectId: e.target.value })}
                  >
                    {p.entities.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {v.kind === 'relationship' && (
                <Field label="Connected to">
                  <select
                    value={v.targetId || ''}
                    onChange={(e) => update(v.id, { targetId: e.target.value })}
                    disabled={v.status !== 'pending'}
                  >
                    <option value="">Choose an element</option>
                    {p.entities.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label={v.kind === 'event' ? 'What happened?' : 'The detail'}>
                <textarea
                  rows={2}
                  value={v.value}
                  maxLength={500}
                  onChange={(e) => update(v.id, { value: e.target.value })}
                  disabled={v.status !== 'pending'}
                />
              </Field>
              <Field
                label={
                  v.kind === 'event' ? 'Description' : 'Label (for example, owns, status, lives in)'
                }
              >
                <input
                  value={v.predicate}
                  maxLength={500}
                  onChange={(e) => update(v.id, { predicate: e.target.value })}
                  disabled={v.status !== 'pending'}
                />
              </Field>
              {v.kind !== 'event' && v.kind !== 'knowledge' && (
                <Field label="Who can know this?">
                  <select
                    value={v.visibility}
                    disabled={v.status !== 'pending'}
                    onChange={(e) =>
                      update(v.id, { visibility: e.target.value as 'private' | 'public' })
                    }
                  >
                    <option value="private">Only this viewpoint character</option>
                    <option value="public">Public knowledge</option>
                  </select>
                </Field>
              )}
              {v.status === 'pending' && (
                <>
                  {!!findings.length && (
                    <div className="form-stack">
                      <strong>Possible contradictions</strong>
                      {findings.map((f) => (
                        <p key={f.id} className="small">
                          {f.message}
                        </p>
                      ))}
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={acknowledged[v.id] === acknowledgementKey}
                          onChange={(e) =>
                            setAcknowledged({
                              ...acknowledged,
                              [v.id]: e.target.checked ? acknowledgementKey : '',
                            })
                          }
                        />
                        Keep these deliberate or disputed accounts
                      </label>
                    </div>
                  )}
                  <div className="button-row">
                    <Button
                      size="sm"
                      disabled={
                        !workflowReady ||
                        !v.value.trim() ||
                        !pathIds.has(v.turnId) ||
                        (v.kind === 'relationship' && !v.targetId) ||
                        (!!findings.length && acknowledged[v.id] !== acknowledgementKey)
                      }
                      onClick={async () => {
                        if (store.mutate((p) => approveProposal(p, v.id, ticket)) && v.workflowId)
                          await runWorkflow(p.id, v.workflowId)
                      }}
                    >
                      <Check size={15} />
                      Accept into canon
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const changed = store.mutate((p) => {
                          const proposal = p.proposals.find((item) => item.id === v.id)!
                          if (proposal.status !== 'pending') return
                          p.approvals.push({
                            id: uid(),
                            proposalId: v.id,
                            workflowId: v.workflowId,
                            adventureId: a.id,
                            turnId: v.turnId,
                            actor: 'human',
                            action: 'rejected',
                            operation: JSON.stringify(proposal),
                            worldRevision: p.worldRevision,
                            coordinationVersion: ticket.coordinationVersion,
                            createdAt: now(),
                            resultIds: [],
                            acknowledgedFindings: [],
                          })
                          proposal.status = 'rejected'
                          const w = p.workflows.find((w) => w.id === v.workflowId)
                          if (
                            w &&
                            w.proposalIds.every(
                              (id) => p.proposals.find((v) => v.id === id)?.status !== 'pending',
                            )
                          ) {
                            w.status = 'ready'
                            w.node = 'updateMemory'
                          }
                        })
                        if (changed && v.workflowId) await runWorkflow(p.id, v.workflowId)
                      }}
                    >
                      <X size={14} />
                      Keep narrative-only
                    </Button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </Dialog>
  )
}
