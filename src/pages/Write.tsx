import { useEffect, useRef, useState } from 'react'
import {
  AlignLeft,
  ArrowDownToLine,
  Bold,
  BookOpen,
  ChevronRight,
  Eye,
  Focus,
  Italic,
  Link2,
  Plus,
  X,
  Sparkles,
  History,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { uid, now, type Entity, type Scene } from '../domain/schema'
import { download, wordCount } from '../lib/utils'
import { manuscriptExport } from '../domain/project-file'
import { Button } from '../components/ui/button'
import { Dialog } from '../components/ui/dialog'
import { Empty, EntityIcon, Field } from '../components/common'
import {
  AnnotatedPassage,
  CanonDialog,
  FindingDialog,
  FindingList,
  ManuscriptHistory,
  ManuscriptStudio,
} from '../components/ManuscriptStudio'
import { runIsStale } from '../domain/manuscript'

export function Prose({
  text,
  entities = [],
  onEntity,
}: {
  text: string
  entities?: Entity[]
  onEntity?: (e: Entity) => void
}) {
  const names = [...entities].sort((a, b) => b.name.length - a.name.length)
  const render = (line: string) => {
    const parts: React.ReactNode[] = []
    let rest = line,
      key = 0
    while (rest) {
      let index = -1,
        entity: Entity | undefined
      for (const e of names) {
        const i = rest.indexOf(`@${e.name}`)
        if (i >= 0 && (index < 0 || i < index)) {
          index = i
          entity = e
        }
      }
      if (!entity) {
        parts.push(rest)
        break
      }
      if (index > 0) parts.push(rest.slice(0, index))
      const match = entity
      parts.push(
        <button key={key++} className="inline-entity" onClick={() => onEntity?.(match)}>
          {match.name}
        </button>,
      )
      rest = rest.slice(index + entity.name.length + 1)
    }
    return parts.flatMap<React.ReactNode>((part, index) =>
      typeof part !== 'string'
        ? [part]
        : part
            .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
            .map((fragment, j) =>
              fragment.startsWith('**') && fragment.endsWith('**') ? (
                <strong key={`strong-${index}-${j}`}>{fragment.slice(2, -2)}</strong>
              ) : fragment.startsWith('*') && fragment.endsWith('*') ? (
                <em key={`em-${index}-${j}`}>{fragment.slice(1, -1)}</em>
              ) : (
                fragment
              ),
            ),
    )
  }
  return (
    <div className="prose">
      {text
        .split(/\n\n+/)
        .map((line, i) =>
          line.startsWith('## ') ? (
            <h3 key={i}>{render(line.slice(3))}</h3>
          ) : (
            <p key={i}>{render(line)}</p>
          ),
        )}
    </div>
  )
}
function SceneSetup({ scene, onClose }: { scene: Scene; onClose: () => void }) {
  const store = useStore(),
    p = store.project!
  const update = (values: Partial<Scene>) =>
    store.mutate((p) =>
      Object.assign(
        p.scenes.find((s) => s.id === scene.id)!,
        values,
        { updatedAt: now() },
      ),
    )
  const chapterKey = (s: Scene) => JSON.stringify([s.book, s.chapter])
  const chapters = [...new Set(p.scenes.map(chapterKey))],
    chapterIndex = chapters.indexOf(chapterKey(scene))
  const moveChapter = (delta: number) =>
    store.mutate((p) => {
      const keys = [...new Set(p.scenes.map(chapterKey))],
        a = keys.indexOf(chapterKey(scene)),
        b = a + delta
      if (b < 0 || b >= keys.length) return
      ;[keys[a], keys[b]] = [keys[b], keys[a]]
      p.scenes = keys.flatMap((k) => p.scenes.filter((s) => chapterKey(s) === k))
    })
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title="Set the scene"
      description="Choose the context available to the writer and continuity reviewer."
    >
      <div className="form-stack">
        <div className="field-row">
          <Field label="Book title">
            <input
              value={scene.book}
              maxLength={500}
              onChange={(e) => update({ book: e.target.value })}
            />
          </Field>
          <Field label="Chapter title">
            <input
              value={scene.chapter}
              maxLength={500}
              onChange={(e) => update({ chapter: e.target.value })}
            />
          </Field>
        </div>
        <div className="button-row">
          <Button
            size="sm"
            variant="secondary"
            disabled={chapterIndex === 0}
            onClick={() => moveChapter(-1)}
          >
            <ArrowUp size={13} />
            Move chapter earlier
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={chapterIndex === chapters.length - 1}
            onClick={() => moveChapter(1)}
          >
            <ArrowDown size={13} />
            Move chapter later
          </Button>
        </div>
        <Field label="What needs to happen in this scene?">
          <textarea
            value={scene.purpose || ''}
            maxLength={500}
            rows={3}
            onChange={(e) => update({ purpose: e.target.value })}
          />
        </Field>
        <div className="field-row">
          <Field label="Scene viewpoint">
            <select
              value={scene.viewpointId || ''}
              onChange={(e) => update({ viewpointId: e.target.value || undefined })}
            >
              <option value="">No viewpoint selected</option>
              {p.entities
                .filter((e) => e.type === 'Character')
                .map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Narrative perspective">
            <select
              value={scene.perspective || 'third'}
              onChange={(e) => update({ perspective: e.target.value as Scene['perspective'] })}
            >
              <option value="third">Third person, limited</option>
              <option value="first">First person</option>
              <option value="omniscient">Omniscient author narration</option>
            </select>
          </Field>
        </div>
        <Field label="Scene setting">
          <select
            value={scene.locationId || ''}
            onChange={(e) => update({ locationId: e.target.value || undefined })}
          >
            <option value="">No setting selected</option>
            {p.entities
              .filter((e) => e.type === 'Location')
              .map((e) => (
                <option value={e.id} key={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Scene time">
          <select
            value={scene.eventId || ''}
            onChange={(e) => update({ eventId: e.target.value || undefined })}
          >
            <option value="">Unspecified; withhold time-restricted knowledge</option>
            {p.events
              .filter((e) => e.status === 'Canon')
              .map((e) => (
                <option value={e.id} key={e.id}>
                  {e.title}
                  {e.order === undefined ? ' (unordered)' : ''}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Source adventure (optional)">
          <select
            value={scene.adventureId || ''}
            onChange={(e) => {
              const a = p.adventures.find((a) => a.id === e.target.value)
              update({ adventureId: a?.id, branchHeadId: a?.headId || undefined })
            }}
          >
            <option value="">Independent manuscript</option>
            {p.adventures.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </Field>
        {scene.adventureId && (
          <Field label="Scene branch point">
            <select
              value={scene.branchHeadId || ''}
              onChange={(e) => update({ branchHeadId: e.target.value || undefined })}
            >
              <option value="">Before the first turn</option>
              {p.adventures
                .find((a) => a.id === scene.adventureId)
                ?.turns.map((t, i) => (
                  <option key={t.id} value={t.id}>
                    Turn {i + 1}: {t.text.slice(0, 70)}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <fieldset className="scene-participants">
          <legend>Participants and references</legend>
          {p.entities.map((e) => (
            <label key={e.id}>
              <input
                type="checkbox"
                checked={scene.entityIds.includes(e.id)}
                onChange={(v) =>
                  update({
                    entityIds: v.target.checked
                      ? [...scene.entityIds, e.id]
                      : scene.entityIds.filter((id) => id !== e.id),
                  })
                }
              />
              {e.name}
              <small>{e.type}</small>
            </label>
          ))}
        </fieldset>
        <Field label="Scene voice profile">
          <select
            value={scene.voiceProfileId || ''}
            onChange={(e) => update({ voiceProfileId: e.target.value || undefined })}
          >
            <option value="">Project prose rules only</option>
            {p.studio.profiles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <p className="small muted">
          Approved preferences guide prose. Private evidence never becomes character knowledge
          merely by being included in author review.
        </p>
        <Button onClick={onClose}>Back to writing</Button>
      </div>
    </Dialog>
  )
}
export function Write() {
  const store = useStore(),
    p = store.project!
  const scene = p.scenes.find((s) => s.id === store.selectedScene) || p.scenes[0]
  const [preview, setPreview] = useState(false),
    [focus, setFocus] = useState(false),
    [inspect, setInspect] = useState<Entity | null>(null),
    [mention, setMention] = useState(''),
    [cursor, setCursor] = useState(0),
    [showMentions, setShowMentions] = useState(false)
  const [assist, setAssist] = useState(false),
    [setup, setSetup] = useState(false),
    [history, setHistory] = useState(false),
    [canon, setCanon] = useState(false),
    [reviewId, setReviewId] = useState(''),
    [findingId, setFindingId] = useState(''),
    [selection, setSelection] = useState({ start: 0, end: 0 })
  useEffect(() => {
    setSelection({ start: 0, end: 0 })
    setReviewId('')
    setFindingId('')
    setShowMentions(false)
  }, [scene?.id])
  const review = p.studio.runs.find(
    (r) => r.id === reviewId && r.sceneId === scene?.id && r.kind === 'review',
  )
  const currentReview =
    review && !runIsStale(p, review) && review.status === 'review' ? review : undefined
  const inspected = p.entities.find((e) => e.id === inspect?.id)
  const editor = useRef<HTMLTextAreaElement>(null)
  const addScene = () => {
    const id = uid()
    store.mutate((p) =>
      p.scenes.push({
        id,
        title: 'Untitled scene',
        book: p.title,
        chapter: 'Chapter one',
        text: '',
        notes: '',
        entityIds: [],
        updatedAt: now(),
      }),
    )
    store.navigate('Write', id)
  }
  if (!scene)
    return (
      <Empty
        title="Give your story a first sentence."
        description="No setup required. A quiet page, ready when you are."
        action="Start a manuscript"
        onAction={addScene}
      />
    )
  const update = (values: Partial<typeof scene>) =>
    store.mutate((p) => {
      Object.assign(
        p.scenes.find((s) => s.id === scene.id)!,
        values,
        { updatedAt: now() },
      )
    })
  const references = p.entities.filter(
    (e) => scene.entityIds.includes(e.id) || scene.text.includes(`@${e.name}`),
  )
  const matches = p.entities
    .filter((e) => `${e.name} ${e.aliases.join(' ')}`.toLowerCase().includes(mention.toLowerCase()))
    .slice(0, 6)
  function insertMention(entity: Entity) {
    const start = scene.text.lastIndexOf('@', cursor - 1)
    update({
      text: `${scene.text.slice(0, start)}@${entity.name} ${scene.text.slice(cursor)}`,
      entityIds: [...new Set([...scene.entityIds, entity.id])],
    })
    setShowMentions(false)
    editor.current?.focus()
  }
  function format(mark: string) {
    const area = editor.current
    if (!area) return
    const start = area.selectionStart,
      end = area.selectionEnd
    update({
      text:
        scene.text.slice(0, start) +
        mark +
        scene.text.slice(start, end) +
        mark +
        scene.text.slice(end),
    })
    requestAnimationFrame(() => {
      area.focus()
      area.setSelectionRange(start + mark.length, end + mark.length)
    })
  }
  return (
    <div className={`write-workspace ${focus ? 'focus-mode' : ''} ${assist ? 'studio-open' : ''}`}>
      <aside className="manuscript-sidebar">
        <div className="section-heading">
          <span className="eyebrow">Your manuscript</span>
          <button className="icon-button" onClick={addScene} aria-label="Add scene">
            <Plus size={17} />
          </button>
        </div>
        <h3>{p.title}</h3>
        <div className="scene-list">
          {[...new Set(p.scenes.map((s) => JSON.stringify([s.book, s.chapter])))]
            .map((key) => JSON.parse(key) as [string, string])
            .map(([book, chapter]) => (
              <div key={JSON.stringify([book, chapter])}>
                <div className="chapter-label">
                  <BookOpen size={14} />
                  {book !== p.title ? `${book} / ` : ''}
                  {chapter || 'Unsorted scenes'}
                </div>
                {p.scenes
                  .filter((s) => s.chapter === chapter && s.book === book)
                  .map((s) => (
                    <div className="scene-outline-row" key={s.id}>
                      <button
                        className={s.id === scene.id ? 'active' : ''}
                        onClick={() => store.navigate('Write', s.id)}
                      >
                        <AlignLeft size={14} />
                        <span>{s.title}</span>
                        <small>{wordCount(s.text)}</small>
                      </button>
                      <div className="scene-order-actions">
                        <button
                          aria-label={`Move ${s.title} earlier`}
                          disabled={
                            p.scenes.filter((v) => v.chapter === s.chapter && v.book === s.book)[0]
                              ?.id === s.id
                          }
                          onClick={() =>
                            store.mutate((p) => {
                              const peers = p.scenes.filter(
                                (v) => v.chapter === s.chapter && v.book === s.book,
                              )
                              const previous = peers[peers.findIndex((v) => v.id === s.id) - 1]
                              if (previous) {
                                const a = p.scenes.findIndex((v) => v.id === s.id),
                                  b = p.scenes.findIndex((v) => v.id === previous.id)
                                ;[p.scenes[a], p.scenes[b]] = [p.scenes[b], p.scenes[a]]
                              }
                            })
                          }
                        >
                          <ArrowUp size={11} />
                        </button>
                        <button
                          aria-label={`Move ${s.title} later`}
                          disabled={
                            p.scenes
                              .filter((v) => v.chapter === s.chapter && v.book === s.book)
                              .at(-1)?.id === s.id
                          }
                          onClick={() =>
                            store.mutate((p) => {
                              const peers = p.scenes.filter(
                                (v) => v.chapter === s.chapter && v.book === s.book,
                              )
                              const next = peers[peers.findIndex((v) => v.id === s.id) + 1]
                              if (next) {
                                const a = p.scenes.findIndex((v) => v.id === s.id),
                                  b = p.scenes.findIndex((v) => v.id === next.id)
                                ;[p.scenes[a], p.scenes[b]] = [p.scenes[b], p.scenes[a]]
                              }
                            })
                          }
                        >
                          <ArrowDown size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            ))}
        </div>
        <Button variant="ghost" size="sm" onClick={addScene}>
          <Plus size={14} />
          Add a scene
        </Button>
        <div className="manuscript-export">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => download(`${p.title}.md`, manuscriptExport(p, 'md'), 'text/markdown')}
          >
            <ArrowDownToLine size={14} />
            Export Markdown
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => download(`${p.title}.txt`, manuscriptExport(p, 'txt'), 'text/plain')}
          >
            Export plain text
          </Button>
        </div>
      </aside>
      <section className="writing-page">
        <div className="editor-toolbar">
          <div className="button-row">
            <button
              className="icon-button"
              title="Bold (Ctrl+B)"
              aria-label="Bold"
              onClick={() => format('**')}
              disabled={preview}
            >
              <Bold size={16} />
            </button>
            <button
              className="icon-button"
              title="Italic (Ctrl+I)"
              aria-label="Italic"
              onClick={() => format('*')}
              disabled={preview}
            >
              <Italic size={16} />
            </button>
            <span className="toolbar-divider" />
            <span className="small muted">Markdown</span>
          </div>
          <div className="button-row">
            <button
              className="icon-button"
              aria-label="Scene setup"
              title="Scene setup"
              onClick={() => setSetup(true)}
            >
              <SlidersHorizontal size={15} />
            </button>
            <button
              className="icon-button"
              aria-label="Manuscript history"
              title="Manuscript history"
              onClick={() => setHistory(true)}
            >
              <History size={15} />
            </button>
            <button
              className="icon-button"
              aria-label="Writing assistant"
              title="Writing assistant"
              aria-pressed={assist}
              onClick={() => {
                setAssist(!assist)
                setFocus(false)
              }}
            >
              <Sparkles size={15} />
            </button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPreview(!preview)
                setReviewId('')
              }}
            >
              <Eye size={15} />
              {preview ? 'Edit' : 'Read'}
            </Button>
            <button
              className="icon-button"
              title={focus ? 'Leave focus mode' : 'Focus mode'}
              aria-label={focus ? 'Leave focus mode' : 'Focus mode'}
              onClick={() => setFocus(!focus)}
            >
              {focus ? <X size={17} /> : <Focus size={17} />}
            </button>
          </div>
        </div>
        <div className="paper">
          <div className="chapter-kicker">{scene.chapter}</div>
          <input
            aria-label="Scene title"
            className="scene-title"
            value={scene.title}
            maxLength={500}
            onChange={(e) => {
              if (e.target.value) update({ title: e.target.value })
            }}
          />
          {currentReview ? (
            <>
              <div className="review-mode-bar">
                <span>Review highlights</span>
                <Button size="sm" variant="ghost" onClick={() => setReviewId('')}>
                  Return to editing
                </Button>
              </div>
              <AnnotatedPassage
                text={scene.text}
                findings={currentReview.findings.filter((f) =>
                  currentReview.layers.includes(f.layer),
                )}
                offset={currentReview.start}
                onFinding={setFindingId}
              />
              <FindingList run={currentReview} onFinding={setFindingId} />
            </>
          ) : preview ? (
            <Prose text={scene.text} entities={p.entities} onEntity={setInspect} />
          ) : (
            <textarea
              ref={editor}
              className="manuscript-editor"
              aria-label="Manuscript text"
              placeholder="The first sentence doesn’t have to be perfect. It only has to begin."
              value={scene.text}
              onSelect={(event) =>
                setSelection({
                  start: event.currentTarget.selectionStart,
                  end: event.currentTarget.selectionEnd,
                })
              }
              onChange={(event) => {
                update({ text: event.target.value })
                const pos = event.target.selectionStart
                setCursor(pos)
                const before = event.target.value.slice(0, pos)
                const match = before.match(/@([^@\n]{0,40})$/)
                setShowMentions(!!match)
                setMention(match?.[1] || '')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setShowMentions(false)
                  setFocus(false)
                }
                if (showMentions && event.key === 'Enter' && matches[0]) {
                  event.preventDefault()
                  insertMention(matches[0])
                }
                if ((event.ctrlKey || event.metaKey) && ['b', 'i'].includes(event.key)) {
                  event.preventDefault()
                  format(event.key === 'b' ? '**' : '*')
                }
              }}
            />
          )}
          {showMentions && !preview && matches.length > 0 && (
            <div className="mention-menu" role="listbox" aria-label="World references">
              {matches.map((e) => (
                <button
                  key={e.id}
                  role="option"
                  aria-selected={false}
                  onClick={() => insertMention(e)}
                >
                  <EntityIcon type={e.type} small />
                  <span>{e.name}</span>
                  <small>{e.type}</small>
                </button>
              ))}
              <small>Enter inserts the first match · Escape closes</small>
            </div>
          )}
        </div>
        <div className="editor-footer">
          <span>{wordCount(scene.text).toLocaleString()} words</span>
          <span>Type @ to connect your world</span>
          <span>
            {store.saveStatus === 'saved'
              ? 'All changes saved'
              : store.saveStatus === 'saving'
                ? 'Saving…'
                : 'Save needs attention'}
          </span>
        </div>
      </section>
      {assist ? (
        <aside className="writing-assistance" aria-label="Writing assistant panel">
          <div className="assistant-panel-heading">
            <span className="eyebrow">A little help, on your terms</span>
            <button
              className="icon-button"
              aria-label="Close writing assistant"
              onClick={() => setAssist(false)}
            >
              <X size={18} />
            </button>
          </div>
          <ManuscriptStudio
            key={scene.id}
            scene={scene}
            selection={selection}
            onReview={(id) => {
              setReviewId(id)
              setPreview(false)
              setAssist(false)
            }}
          />
        </aside>
      ) : (
        <aside className="writing-notes">
          <div className="eyebrow">Beside the page</div>
          <section>
            <h3>In this scene</h3>
            <button className="text-button small" onClick={() => setSetup(true)}>
              Choose participants and setting
            </button>
            {references.map((e) => (
              <button className="reference-entity" key={e.id} onClick={() => setInspect(e)}>
                <EntityIcon type={e.type} small />
                <span>{e.name}</span>
                <ChevronRight size={14} />
              </button>
            ))}
            {!references.length && (
              <p className="small muted">Mention a world element with @ to keep it close.</p>
            )}
          </section>
          <section>
            <h3>A note to yourself</h3>
            <textarea
              aria-label="Scene notes"
              rows={6}
              value={scene.notes}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="What needs to happen here?"
            />
          </section>
          <details>
            <summary>Scene details</summary>
            <div className="form-stack">
              <Field label="Book">
                <input value={scene.book} onChange={(e) => update({ book: e.target.value })} />
              </Field>
              <Field label="Chapter">
                <input
                  value={scene.chapter}
                  onChange={(e) => update({ chapter: e.target.value })}
                />
              </Field>
              <Field label="Session word goal">
                <input
                  type="number"
                  min={0}
                  max={10000000}
                  value={p.settings.wordGoal}
                  onChange={(e) =>
                    store.mutate((p) => {
                      p.settings.wordGoal = Number(e.target.value)
                    })
                  }
                />
              </Field>
            </div>
          </details>
          <div className="word-goal">
            <span>
              {Math.min(
                100,
                Math.round((wordCount(scene.text) / (p.settings.wordGoal || 1)) * 100),
              )}
              % of your {p.settings.wordGoal.toLocaleString()} word goal
            </span>
            <div>
              <i
                style={{
                  width: `${Math.min(100, (wordCount(scene.text) / (p.settings.wordGoal || 1)) * 100)}%`,
                }}
              />
            </div>
          </div>
        </aside>
      )}
      {selection.end > selection.start && !currentReview && !preview && (
        <button
          className="selection-canon-button button button-secondary"
          onClick={() => setCanon(true)}
        >
          Bring selected detail into world
        </button>
      )}
      {setup && <SceneSetup scene={scene} onClose={() => setSetup(false)} />}
      {history && <ManuscriptHistory scene={scene} onClose={() => setHistory(false)} />}
      {canon && (
        <CanonDialog
          sceneId={scene.id}
          quote={scene.text.slice(selection.start, selection.end)}
          onClose={() => setCanon(false)}
        />
      )}
      {currentReview && findingId && (
        <FindingDialog run={currentReview} findingId={findingId} onClose={() => setFindingId('')} />
      )}
      <Dialog
        open={!!inspect}
        onOpenChange={() => setInspect(null)}
        title={inspect?.name || 'World reference'}
        description={inspect?.type}
      >
        {inspected && (
          <>
            <Prose text={inspected.summary} />
            <details>
              <summary>Edit this world entry beside the manuscript</summary>
              <Field label="Reference description">
                <textarea
                  rows={4}
                  value={inspected.summary}
                  maxLength={500000}
                  onChange={(e) =>
                    store.mutate((p) => {
                      const entity = p.entities.find((v) => v.id === inspected.id)!
                      entity.summary = e.target.value
                      entity.updatedAt = now()
                    })
                  }
                />
              </Field>
              <Field label="Reference private notes">
                <textarea
                  rows={3}
                  value={inspected.notes}
                  maxLength={500000}
                  onChange={(e) =>
                    store.mutate((p) => {
                      const entity = p.entities.find((v) => v.id === inspected.id)!
                      entity.notes = e.target.value
                      entity.updatedAt = now()
                    })
                  }
                />
              </Field>
              {Object.entries(inspected.fields).map(([key, value]) => (
                <Field key={key} label={key}>
                  <input
                    value={value}
                    maxLength={500}
                    onChange={(e) =>
                      store.mutate((p) => {
                        p.entities.find((v) => v.id === inspected.id)!.fields[key] = e.target.value
                      })
                    }
                  />
                </Field>
              ))}
            </details>
            <details>
              <summary>Canonical facts and attributed beliefs</summary>
              {p.facts
                .filter((f) => f.subjectId === inspected.id && f.status === 'Canon')
                .map((f) => (
                  <p key={f.id}>
                    <strong>{f.predicate}:</strong> {f.object} · {f.visibility}
                  </p>
                ))}
              {p.knowledge
                .filter((k) => k.entityId === inspected.id)
                .map((k) => (
                  <p key={k.id}>
                    {k.stance}: {k.claim}
                  </p>
                ))}
            </details>
            <div className="dialog-actions">
              <Button variant="secondary" onClick={() => store.navigate('World', inspected.id)}>
                <Link2 size={15} />
                Open in world
              </Button>
              <Button onClick={() => setInspect(null)}>Back to the page</Button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  )
}
