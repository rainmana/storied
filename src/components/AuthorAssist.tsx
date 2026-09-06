import { useEffect, useRef, useState } from 'react'
import { Sparkles, Square, Undo2 } from 'lucide-react'
import {
  authorResponseSchema,
  compileAuthorContext,
  fieldEdit,
  parseAuthorIdeas,
  type AuthorExchange,
  type AuthorTarget,
} from '../domain/authoring'
import { writingNotes, writingSystem } from '../domain/writing-style'
import {
  cancelInference,
  completeWithInference,
  selectedInference,
  useInferenceStatus,
} from '../lib/inference'
import { useStore } from '../lib/store'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { Field } from './common'

export function AuthorAssist({
  target,
  onApply,
  label,
}: {
  target: AuthorTarget
  onApply: (text: string) => boolean | void
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(null)
  return (
    <span className="author-assist-actions">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`Explore ${target.field}`}
        onClick={() => setOpen(true)}
      >
        <Sparkles size={14} />
        {label || 'Explore'}
      </Button>
      {undo && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Undo suggestion for ${target.field}`}
          disabled={target.value !== undo.after}
          onClick={() => {
            if (target.value === undo.after && onApply(undo.before) !== false) setUndo(null)
          }}
        >
          <Undo2 size={13} />
          Undo
        </Button>
      )}
      {open && (
        <AuthorSession
          target={target}
          onClose={() => setOpen(false)}
          onApply={(text) => {
            const before = target.value
            if (onApply(text) === false) return false
            setUndo({ before, after: text })
            setOpen(false)
            return true
          }}
        />
      )}
    </span>
  )
}

function AuthorSession({
  target,
  onApply,
  onClose,
}: {
  target: AuthorTarget
  onApply: (text: string) => boolean
  onClose: () => void
}) {
  const p = useStore((s) => s.project)!,
    inference = useInferenceStatus()
  const [original] = useState(() => ({ ...target, projectId: p.id }))
  const [direction, setDirection] = useState(''),
    [privateContext, setPrivateContext] = useState(false)
  const [history, setHistory] = useState<AuthorExchange[]>([]),
    [selected, setSelected] = useState('')
  const [ideas, setIdeas] = useState<{ title: string; text: string }[]>([])
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [resultRevision, setResultRevision] = useState<number | null>(null)
  const [receipt, setReceipt] = useState<{
    prompt: string
    system: string
    model: string
    origin: string
  } | null>(null)
  const serial = useRef(0),
    ownsRequest = useRef(false),
    live = useRef(true)
  const directionInput = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
      ++serial.current
      if (ownsRequest.current) cancelInference()
    }
  }, [])
  const stale =
    p.id !== original.projectId ||
    target.value !== original.value ||
    (resultRevision !== null && resultRevision !== p.worldRevision)
  let context: ReturnType<typeof compileAuthorContext> | undefined
  try {
    context = compileAuthorContext(p, original, direction, privateContext, history, selected)
  } catch {
    /* The empty seed is explained next to the control. */
  }
  async function generate() {
    if (
      !context ||
      busy ||
      inference.busy ||
      p.id !== original.projectId ||
      target.value !== original.value
    )
      return
    const token = ++serial.current,
      snapshot = p.worldRevision,
      connection = selectedInference()
    const compiled = context
    ownsRequest.current = true
    setBusy(true)
    setError('')
    setReceipt({
      prompt: compiled.prompt,
      system: writingSystem('worldbuilder'),
      model: connection.label || 'On-device storyteller',
      origin: connection.origin,
    })
    try {
      const raw = await completeWithInference(
        compiled.prompt,
        'worldbuilder',
        authorResponseSchema,
        connection,
      )
      if (!live.current || serial.current !== token) return
      if (selectedInference().id !== connection.id)
        throw new Error(
          'The connection changed. Choose Generate explicitly with the new connection.',
        )
      const parsed = parseAuthorIdeas(raw, original.maxLength)
      setIdeas(parsed)
      setResultRevision(snapshot)
      setHistory((h) =>
        [...h, { direction: direction || 'Expand the existing text.', ideas: parsed }].slice(-4),
      )
      setDirection('')
      setSelected('')
    } catch (e) {
      if (live.current && serial.current === token)
        setError(e instanceof Error ? e.message : 'The request failed. Your field is unchanged.')
    } finally {
      ownsRequest.current = false
      if (live.current && serial.current === token) setBusy(false)
    }
  }
  function insert(text: string, mode: 'replace' | 'append') {
    setError('')
    try {
      if (stale || useStore.getState().project?.worldRevision !== resultRevision)
        throw new Error(
          'The world or field changed. Reopen Explore to review fresh context before inserting.',
        )
      if (!text.trim()) throw new Error('Add text before inserting this idea.')
      onApply(fieldEdit(target.value, original.value, text, mode, original.maxLength))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The idea could not be inserted.')
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title={`Explore ${original.field}`}
      description={`${original.name || `New ${original.type.toLowerCase()}`} · A few possibilities, shaped by you.`}
      className="author-assistant"
    >
      <div className="form-stack">
        <p className="small muted">
          Start with your words or a direction. Refine an idea, edit it, then choose what belongs in
          this field. Closing this panel discards the conversation.
        </p>
        <details>
          <summary>Your current field</summary>
          <p className="preserve-lines assistant-original">
            {original.value || 'Nothing here yet.'}
          </p>
        </details>
        <div className="assistant-context">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={privateContext}
              disabled={busy}
              onChange={(e) => {
                setPrivateContext(e.target.checked)
                setHistory([])
                setIdeas([])
                setSelected('')
                setReceipt(null)
                setResultRevision(null)
              }}
            />
            Include private world notes, attributes, secrets, and beliefs
          </label>
          <p className="small muted">
            {inference.remote
              ? `Requests go directly to ${inference.origin}.`
              : 'Your selected storyteller runs on this device.'}{' '}
            Your field and direction are included. Other private details stay out unless selected.
          </p>
          {context && (
            <details>
              <summary>
                Preview next request · about {context.approximateTokens} input tokens
              </summary>
              <p className="small muted">
                {context.included.length} world/history records. {context.omitted} records omitted
                for space. Long descriptions are marked as excerpts. Private records are excluded
                unless selected; branch records and manuscripts are excluded.
              </p>
              <pre>
                {writingSystem('worldbuilder')}
                {'\n\n'}
                {context.prompt}
              </pre>
            </details>
          )}
        </div>
        {history.length > 0 && (
          <details>
            <summary>Earlier directions ({history.length})</summary>
            {history.map((h, i) => (
              <div className="assistant-history" key={i}>
                <strong>You: {h.direction}</strong>
                {h.ideas.map((idea, j) => (
                  <p key={j}>
                    {idea.title}: {idea.text}
                  </p>
                ))}
              </div>
            ))}
          </details>
        )}
        {selected && <p className="assistant-selected small">Developing: {selected}</p>}
        <Field
          label="What would you like to explore?"
          hint={
            original.value.trim()
              ? 'Your existing text is enough to start. A direction helps shape the result.'
              : 'Give a small starting point: a motive, a custom, a contradiction, or a question.'
          }
        >
          <textarea
            ref={directionInput}
            rows={3}
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            maxLength={1000}
            disabled={busy}
            placeholder={
              history.length
                ? 'Keep the river ritual, but make it less solemn…'
                : 'A ferryman who remembers every passenger, except one…'
            }
          />
        </Field>
        <div className="button-row">
          <Button
            type="button"
            onClick={() => void generate()}
            disabled={!context || !inference.ready || inference.busy || busy || stale}
          >
            <Sparkles size={15} />
            {busy
              ? 'Finding possibilities…'
              : history.length
                ? 'Explore further'
                : 'Find possibilities'}
          </Button>
          {busy && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                ++serial.current
                cancelInference()
                ownsRequest.current = false
                setBusy(false)
                setError('Stopped. Your field is unchanged.')
              }}
            >
              <Square size={13} />
              Stop
            </Button>
          )}
        </div>
        {!inference.ready && (
          <p className="small muted">
            Choose an API connection in Settings or load an on-device storyteller in Local models,
            then return here.
          </p>
        )}
        {stale && (
          <p className="error-message" role="alert">
            The world or field changed. Close and reopen Explore to use its latest version.
          </p>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {ideas.map((idea, i) => (
          <section className="assistant-idea" key={i} aria-label={`Idea ${i + 1}`}>
            <h3>{idea.title}</h3>
            <Field label={`Edit idea ${i + 1}`}>
              <textarea
                rows={4}
                maxLength={original.maxLength}
                value={idea.text}
                onChange={(e) =>
                  setIdeas((list) =>
                    list.map((v, j) => (j === i ? { ...v, text: e.target.value } : v)),
                  )
                }
              />
            </Field>
            {writingNotes(idea.text).map((note) => (
              <p className="small assistant-style-note" key={note}>
                {note}
              </p>
            ))}
            <div className="button-row">
              <Button
                type="button"
                size="sm"
                disabled={busy || stale || !idea.text.trim()}
                onClick={() => insert(idea.text, 'replace')}
              >
                {original.value ? 'Replace field' : 'Use in field'}
              </Button>
              {original.value && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy || stale}
                  onClick={() => insert(idea.text, 'append')}
                >
                  Append to field
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy || stale}
                onClick={() => {
                  setSelected(idea.text)
                  directionInput.current?.focus()
                }}
              >
                Refine this idea
              </Button>
            </div>
          </section>
        ))}
        {receipt && (
          <details>
            <summary>Last request · {receipt.model}</summary>
            <p className="small muted">
              Destination: {receipt.origin}. Suggestions are not world records until you choose an
              insertion.
            </p>
            <pre>
              {receipt.system}
              {'\n\n'}
              {receipt.prompt}
            </pre>
          </details>
        )}
        <p className="small muted">
          Inserted descriptions become visible wherever that field is used. Private notes remain
          author reference. New facts, relationships, and beliefs still need Save detail. You can
          undo the insertion beside the field.
        </p>
      </div>
    </Dialog>
  )
}
