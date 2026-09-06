import { useRef, useState } from 'react'
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
} from 'lucide-react'
import { useStore } from '../lib/store'
import { uid, now, type Entity } from '../domain/schema'
import { download, wordCount } from '../lib/utils'
import { manuscriptExport } from '../domain/project-file'
import { Button } from '../components/ui/button'
import { Dialog } from '../components/ui/dialog'
import { Empty, EntityIcon, Field } from '../components/common'

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
    <div className={`write-workspace ${focus ? 'focus-mode' : ''}`}>
      <aside className="manuscript-sidebar">
        <div className="section-heading">
          <span className="eyebrow">Your manuscript</span>
          <button className="icon-button" onClick={addScene} aria-label="Add scene">
            <Plus size={17} />
          </button>
        </div>
        <h3>{p.title}</h3>
        <div className="scene-list">
          {[...new Set(p.scenes.map((s) => s.chapter))].map((chapter) => (
            <div key={chapter}>
              <div className="chapter-label">
                <BookOpen size={14} />
                {chapter || 'Unsorted scenes'}
              </div>
              {p.scenes
                .filter((s) => s.chapter === chapter)
                .map((s) => (
                  <button
                    key={s.id}
                    className={s.id === scene.id ? 'active' : ''}
                    onClick={() => store.navigate('Write', s.id)}
                  >
                    <AlignLeft size={14} />
                    <span>{s.title}</span>
                    <small>{wordCount(s.text)}</small>
                  </button>
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
            <Button size="sm" variant="ghost" onClick={() => setPreview(!preview)}>
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
          {preview ? (
            <Prose text={scene.text} entities={p.entities} onEntity={setInspect} />
          ) : (
            <textarea
              ref={editor}
              className="manuscript-editor"
              aria-label="Manuscript text"
              placeholder="The first sentence doesn’t have to be perfect. It only has to begin."
              value={scene.text}
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
      <aside className="writing-notes">
        <div className="eyebrow">Beside the page</div>
        <section>
          <h3>In this scene</h3>
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
              <input value={scene.chapter} onChange={(e) => update({ chapter: e.target.value })} />
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
            {Math.min(100, Math.round((wordCount(scene.text) / (p.settings.wordGoal || 1)) * 100))}%
            of your {p.settings.wordGoal.toLocaleString()} word goal
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
      <Dialog
        open={!!inspect}
        onOpenChange={() => setInspect(null)}
        title={inspect?.name || 'World reference'}
        description={inspect?.type}
      >
        {inspect && (
          <>
            <Prose text={inspect.summary} />
            <div className="dialog-actions">
              <Button variant="secondary" onClick={() => store.navigate('World', inspect.id)}>
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
