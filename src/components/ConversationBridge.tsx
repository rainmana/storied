import { memo, useRef, useState } from 'react'
import { BookOpen, Plus, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { branchPath } from '../domain/story'
import { keepConversation } from '../domain/conversation'
import { practiceLabels, type ConversationClip } from '../domain/practice-schema'
import type { Adventure, Turn } from '../domain/schema'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { Field } from './common'

type SourceSelection = { turnId: string; field: 'input' | 'text'; start: number; end: number }
// Keep source controls mounted and untouched when the selection preview changes.
const SourcePassage = memo(function SourcePassage({
  turnId,
  field,
  text,
  onKeep,
}: {
  turnId: string
  field: 'input' | 'text'
  text: string
  onKeep: (selection: SourceSelection) => void
}) {
  const source = useRef<HTMLTextAreaElement>(null)
  const [hint, setHint] = useState('')
  return (
    <>
      <textarea
        ref={source}
        id={`clip-${turnId}-${field}`}
        readOnly
        rows={Math.min(7, Math.max(2, Math.ceil(text.length / 100)))}
        value={text}
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          const area = source.current
          if (!area || area.selectionStart === area.selectionEnd) {
            setHint('Highlight the words to keep, then use this button.')
            return
          }
          onKeep({ turnId, field, start: area.selectionStart, end: area.selectionEnd })
          setHint('')
        }}
      >
        <Plus size={13} /> Keep selected text
      </Button>
      {hint && (
        <p role="status" className="small muted">
          {hint}
        </p>
      )}
    </>
  )
})

export function ConversationBridge({
  adventure,
  onClose,
}: {
  adventure: Adventure
  onClose: () => void
}) {
  const store = useStore(),
    p = store.project!,
    path = branchPath(adventure)
  const [head] = useState(adventure.headId!),
    [title, setTitle] = useState(adventure.title),
    [sceneId, setSceneId] = useState('')
  const [method, setMethod] = useState<'exact' | 'adapt'>('exact'),
    [excerpts, setExcerpts] = useState<ConversationClip['excerpts']>([])
  const [error, setError] = useState('')
  const mode = adventure.scenario.practiceMode || 'explore'
  function excerpt(
    turn: Turn,
    field: 'input' | 'text',
    start = 0,
    end = turn[field].length,
  ): ConversationClip['excerpts'][number] {
    return {
      turnId: turn.id,
      field,
      start,
      end,
      text: turn[field].slice(start, end),
      speaker:
        field === 'input'
          ? mode === 'interview'
            ? 'Author'
            : p.entities.find((e) => e.id === adventure.scenario.characterId)?.name ||
              'Your character'
          : mode === 'interview'
            ? p.entities.find((e) => e.id === adventure.scenario.characterId)?.name || 'Character'
            : 'Narration / check speakers',
      origin: field === 'input' || turn.model === 'Author' ? 'author' : 'assisted',
    }
  }
  function add(incoming: ConversationClip['excerpts']) {
    setExcerpts((existing) => {
      const next = [...existing]
      for (const item of incoming.filter((e) => e.text.trim()))
        if (
          !next.some(
            (e) =>
              e.turnId === item.turnId &&
              e.field === item.field &&
              e.start < item.end &&
              e.end > item.start,
          )
        )
          next.push(item)
      return next.sort(
        (a, b) =>
          path.findIndex((t) => t.id === a.turnId) - path.findIndex((t) => t.id === b.turnId) ||
          (a.field === b.field ? a.start - b.start : a.field === 'input' ? -1 : 1),
      )
    })
  }
  const length = excerpts.reduce((n, e) => n + e.text.length, 0)
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title="Bring this conversation to the page"
      description="Select passages from this branch, check who is speaking, and choose how to use them."
      className="wide-dialog"
    >
      <div className="conversation-bridge">
        <p className="conversation-mode-note">
          {practiceLabels[mode]} ·{' '}
          {mode === 'interview'
            ? 'An interview is rehearsal, not an event or a character memory.'
            : 'Adventure events remain on their source branch until separately promoted.'}
        </p>
        <div className="conversation-picker" aria-label="Conversation source passages">
          {path.map((turn, i) => (
            <section key={turn.id}>
              <div className="section-heading">
                <strong>Exchange {i + 1}</strong>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    add([
                      ...(turn.intent !== 'Story' ? [excerpt(turn, 'input')] : []),
                      excerpt(turn, 'text'),
                    ])
                  }
                >
                  Use whole exchange
                </Button>
              </div>
              {(['input', 'text'] as const)
                .filter((field) => field !== 'input' || turn.intent !== 'Story')
                .map((field) => (
                  <div key={field}>
                    <label className="small muted" htmlFor={`clip-${turn.id}-${field}`}>
                      {field === 'input'
                        ? `Your ${turn.intent === 'Say' ? 'dialogue' : 'input / direction'}`
                        : 'Accepted passage'}
                    </label>
                    <SourcePassage
                      turnId={turn.id}
                      field={field}
                      text={turn[field]}
                      onKeep={(selected) =>
                        add([excerpt(turn, field, selected.start, selected.end)])
                      }
                    />
                  </div>
                ))}
            </section>
          ))}
        </div>
        <section className="conversation-selection" aria-label="Selected conversation excerpts">
          <h3>Your selected excerpts</h3>
          {!excerpts.length && (
            <p className="small muted">Highlight a line above, or keep a whole exchange.</p>
          )}
          {excerpts.map((e, i) => (
            <article key={`${e.turnId}-${e.field}-${e.start}`}>
              <div className="field-row">
                <Field label={`Speaker for excerpt ${i + 1}`}>
                  <input
                    maxLength={100}
                    required
                    value={e.speaker}
                    onChange={(event) =>
                      setExcerpts((all) =>
                        all.map((v, n) => (n === i ? { ...v, speaker: event.target.value } : v)),
                      )
                    }
                  />
                </Field>
                <button
                  className="icon-button"
                  aria-label={`Remove excerpt ${i + 1}`}
                  onClick={() => setExcerpts((all) => all.filter((_, n) => n !== i))}
                >
                  <X size={16} />
                </button>
              </div>
              <p className="preserve-lines">{e.text}</p>
            </article>
          ))}
          <p className="small muted">
            {length.toLocaleString()} characters · Keep up to 8,000 exactly, or adapt up to 4,000
            per pass. For mixed narration, select separate lines and confirm their speakers.
            Overlapping selections are kept once.
          </p>
        </section>
        <div className="field-row">
          <Field label="Destination scene">
            <select value={sceneId} onChange={(e) => setSceneId(e.target.value)}>
              <option value="">Create a new scene</option>
              {p.scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="How to use these excerpts">
            <select value={method} onChange={(e) => setMethod(e.target.value as 'exact' | 'adapt')}>
              <option value="exact">Keep exact wording</option>
              <option value="adapt">Adapt into a scene</option>
            </select>
          </Field>
        </div>
        <Field label={sceneId ? 'Source clip title' : 'New scene title'}>
          <input
            maxLength={500}
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <p className="small muted">
          {method === 'exact'
            ? 'Append the selected text unchanged, separated by paragraph breaks. Speaker labels stay with the source record.'
            : 'Save the excerpts beside your scene, then describe your intent in the writing assistant. Choose perspective, participants, and voice in scene setup before generating.'}{' '}
          Bringing material into a manuscript does not approve world changes.
        </p>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              !excerpts.length ||
              excerpts.length > 40 ||
              !title.trim() ||
              excerpts.some((e) => !e.speaker.trim()) ||
              length > (method === 'adapt' ? 4000 : 8000)
            }
            onClick={() => {
              setError('')
              let destination = ''
              const ok = store.mutate((p) => {
                const clip = keepConversation(
                  p,
                  {
                    adventureId: adventure.id,
                    branchHeadId: head,
                    mode,
                    title: title.trim(),
                    method,
                    excerpts,
                  },
                  sceneId || undefined,
                )
                destination = clip.sceneId
              }, 'imported')
              if (ok) {
                onClose()
                store.navigate('Write', destination)
                store.notify(
                  method === 'exact'
                    ? 'Exact excerpts added. Their source is saved beside the page.'
                    : 'Conversation saved. Set the scene and give the writer your direction.',
                )
              } else
                setError(
                  'The excerpts could not be saved. Check the source and project limits, then try again.',
                )
            }}
          >
            <BookOpen size={15} />
            {method === 'exact' ? 'Add excerpts to manuscript' : 'Prepare scene adaptation'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
export function ConversationSources({
  sceneId,
  onAdapt,
}: {
  sceneId: string
  onAdapt?: () => void
}) {
  const store = useStore(),
    clips = store.project!.studio.clips.filter((c) => c.sceneId === sceneId)
  if (!clips.length) return null
  return (
    <section className="conversation-sources">
      <h3>
        <BookOpen size={15} /> From your conversations
      </h3>
      {clips.map((clip) => (
        <details key={clip.id}>
          <summary>
            {clip.title} · {practiceLabels[clip.mode]}
          </summary>
          <p className="small muted">
            {clip.method === 'exact' ? 'Kept exact wording' : 'Source for adaptation'} · Original
            excerpts preserved below.
          </p>
          {clip.excerpts.map((e, i) => (
            <div key={i}>
              <strong>{e.speaker}</strong>
              <p className="preserve-lines">{e.text}</p>
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => store.navigate('Play', clip.adventureId)}
          >
            Open source adventure
          </Button>
        </details>
      ))}
      {onAdapt && (
        <button className="text-button small" onClick={onAdapt}>
          Adapt an excerpt with the writing assistant
        </button>
      )}
    </section>
  )
}
