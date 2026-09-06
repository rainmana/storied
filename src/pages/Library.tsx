import { useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  Check,
  GitFork,
  Globe2,
  HelpCircle,
  LockKeyhole,
  Plus,
  Search as SearchIcon,
  Sparkles,
  StickyNote,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { uid, now, entityTypes, type WorldEvent } from '../domain/schema'
import { possibleContradictions } from '../domain/story'
import { textSearch, type SearchDoc } from '../domain/search'
import { embedTexts, indexProject, useModels } from '../lib/models'
import { database } from '../lib/database'
import { flushSaves } from '../lib/store'
import { Badge, Empty, EntityIcon, Field, PageHeading } from '../components/common'
import { Button } from '../components/ui/button'
import { Dialog } from '../components/ui/dialog'
import { prettyDate } from '../lib/utils'

export function Timeline() {
  const store = useStore(),
    p = store.project!
  const [add, setAdd] = useState(false),
    [title, setTitle] = useState(''),
    [date, setDate] = useState(''),
    [description, setDescription] = useState(''),
    [approximate, setApproximate] = useState(false),
    [participant, setParticipant] = useState(''),
    [filter, setFilter] = useState('All')
  const events = p.events
    .filter((e) => filter === 'All' || e.status === filter)
    .sort((a, b) => a.date.localeCompare(b.date, undefined, { numeric: true }))
  return (
    <div>
      <PageHeading
        eyebrow="The shape of history"
        title="Every world has a before."
        description="Keep the moments that changed things. Leave room for disputed histories."
        actions={
          <Button onClick={() => setAdd(true)}>
            <Plus size={16} />
            Add a moment
          </Button>
        }
      />
      <div className="tabs timeline-tabs">
        {['All', 'Canon', 'Proposed', 'Unknown'].map((v) => (
          <button key={v} className={filter === v ? 'active' : ''} onClick={() => setFilter(v)}>
            {v === 'All' ? 'All moments' : v}
          </button>
        ))}
      </div>
      <div className="timeline-full">
        {events.map((e) => (
          <article key={e.id} className="timeline-event">
            <div className="event-date">
              <span>
                {e.approximate ? 'c. ' : ''}
                {e.date || 'Undated'}
              </span>
            </div>
            <span className="event-node" />
            <div className="event-content">
              <div className="event-top">
                <h2>{e.title}</h2>
                <Badge variant={e.status}>{e.status}</Badge>
              </div>
              <p>{e.description}</p>
              {e.consequences && (
                <p className="event-consequence">What changed: {e.consequences}</p>
              )}
              <div className="event-entities">
                {e.entityIds.map((id) => {
                  const entity = p.entities.find((v) => v.id === id)
                  return (
                    entity && (
                      <button key={id} onClick={() => store.navigate('World', id)}>
                        <EntityIcon type={entity.type} small />
                        {entity.name}
                      </button>
                    )
                  )
                })}
              </div>
              <div className="event-footer">
                <span>
                  {e.provenance.kind === 'story'
                    ? 'From a story, approved by you'
                    : 'Written into the world'}
                </span>
                <select
                  aria-label={`Status of ${e.title}`}
                  value={e.status}
                  onChange={(v) =>
                    store.mutate((p) => {
                      p.events.find((x) => x.id === e.id)!.status = v.target
                        .value as WorldEvent['status']
                    })
                  }
                >
                  {['Canon', 'Proposed', 'Unknown', 'Deprecated', 'Contradicted'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!events.length && (
        <Empty
          icon={CalendarDays}
          title="History is still unwritten."
          description="A founding, a disappearance, a meeting that changed everything. What happened here?"
          action="Add a moment"
          onAction={() => setAdd(true)}
        />
      )}
      <Dialog
        open={add}
        onOpenChange={setAdd}
        title="A moment worth remembering"
        description="Dates can be exact, approximate, or in your world’s own language."
      >
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault()
            store.mutate((p) =>
              p.events.push({
                id: uid(),
                title,
                date: date || 'Undated',
                description,
                approximate,
                entityIds: participant ? [participant] : [],
                consequences: '',
                status: 'Canon',
                provenance: { kind: 'author', note: '' },
              }),
            )
            setAdd(false)
            setTitle('')
            setDescription('')
          }}
        >
          <Field label="What happened?">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={500}
            />
          </Field>
          <div className="field-row">
            <Field label="When?">
              <input
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="1924, the first winter, or unknown"
                maxLength={500}
              />
            </Field>
            <Field label="Connected to">
              <select value={participant} onChange={(e) => setParticipant(e.target.value)}>
                <option value="">No one in particular</option>
                {p.entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={approximate}
              onChange={(e) => setApproximate(e.target.checked)}
            />
            An approximate date
          </label>
          <Field label="Tell a little of the story">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </Field>
          <div className="dialog-actions">
            <Button>
              <Check size={16} />
              Keep this moment
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
export function Relationships() {
  const store = useStore(),
    p = store.project!
  const [selected, setSelected] = useState(''),
    [view, setView] = useState<'graph' | 'list'>('graph')
  const links = p.relationships.filter((r) => !selected || r.from === selected || r.to === selected)
  const linkedIds = new Set(links.flatMap((r) => [r.from, r.to]))
  const nodes = p.entities.filter((e) => linkedIds.has(e.id)).slice(0, 18)
  const positions = new Map(
    nodes.map((e, i) => {
      const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2
      return [e.id, { x: 450 + Math.cos(angle) * 285, y: 250 + Math.sin(angle) * 178 }]
    }),
  )
  return (
    <div>
      <PageHeading
        eyebrow="Nothing exists alone"
        title="Follow the threads."
        description="Every connection is another way into the story."
        actions={
          <div className="tabs">
            <button className={view === 'graph' ? 'active' : ''} onClick={() => setView('graph')}>
              Map
            </button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
              Connections
            </button>
          </div>
        }
      />
      <div className="graph-toolbar">
        <select
          aria-label="Focus relationships on an entity"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">See the whole world</option>
          {p.entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <span className="small muted">
          {links.length} connections · Select an element to explore or edit
        </span>
      </div>
      {view === 'graph' && nodes.length > 0 && (
        <div className="relationship-graph">
          <svg
            viewBox="0 0 900 500"
            role="img"
            aria-label="World relationship map. The connections are also listed below."
          >
            <defs>
              <pattern id="graph-dots" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="12" cy="12" r="0.7" fill="#354039" />
              </pattern>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,1 L7,4 L0,7" fill="none" stroke="#788a78" />
              </marker>
            </defs>
            <rect width="900" height="500" fill="url(#graph-dots)" />
            {links.map((r) => {
              const from = positions.get(r.from),
                to = positions.get(r.to)
              if (!from || !to) return null
              const dx = to.x - from.x,
                dy = to.y - from.y,
                len = Math.sqrt(dx * dx + dy * dy) || 1
              return (
                <g key={r.id}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x - (dx / len) * 39}
                    y2={to.y - (dy / len) * 39}
                    stroke={r.visibility === 'private' ? '#937d6b' : '#566859'}
                    strokeWidth="1.2"
                    strokeDasharray={r.visibility === 'private' ? '5 5' : undefined}
                    markerEnd="url(#arrow)"
                  />
                  <rect
                    x={(from.x + to.x) / 2 - 42}
                    y={(from.y + to.y) / 2 - 10}
                    width="84"
                    height="20"
                    rx="7"
                    fill="#1c221e"
                  />
                  <text
                    x={(from.x + to.x) / 2}
                    y={(from.y + to.y) / 2 + 4}
                    fill="#a5b2a7"
                    textAnchor="middle"
                    fontSize="10"
                  >
                    {r.label}
                  </text>
                </g>
              )
            })}
            {nodes.map((e) => {
              const pos = positions.get(e.id)!
              return (
                <g
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${e.name}`}
                  onClick={() => store.navigate('World', e.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      store.navigate('World', e.id)
                    }
                  }}
                  className="graph-node"
                >
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r="35"
                    fill={
                      e.type === 'Character'
                        ? '#35463b'
                        : e.type === 'Location'
                          ? '#30454b'
                          : '#493e34'
                    }
                    stroke="#71846f"
                    strokeWidth="1"
                  />
                  <text
                    x={pos.x}
                    y={pos.y + 6}
                    textAnchor="middle"
                    fill="#d7dfcd"
                    fontSize="18"
                    fontFamily="Newsreader,serif"
                  >
                    {e.name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')}
                  </text>
                  <rect
                    x={pos.x - 76}
                    y={pos.y + 40}
                    width="152"
                    height="23"
                    fill="#1c221e"
                    rx="8"
                  />
                  <text x={pos.x} y={pos.y + 56} textAnchor="middle" fill="#dedfd6" fontSize="12">
                    {e.name}
                  </text>
                </g>
              )
            })}
          </svg>
          <span className="graph-caption">
            Solid lines: public connections · Dashed lines: private connections
            {linkedIds.size > 18 &&
              ' · Showing the first 18 elements; focus or use Connections for the full world'}
          </span>
        </div>
      )}
      <div className="connections-list">
        {links.map((r) => (
          <button
            key={r.id}
            className="connection-card"
            onClick={() => store.navigate('World', r.from)}
          >
            <GitFork size={18} />
            <strong>{p.entities.find((e) => e.id === r.from)?.name}</strong>
            <Badge>{r.label}</Badge>
            <strong>{p.entities.find((e) => e.id === r.to)?.name}</strong>
            {r.visibility === 'private' && <LockKeyhole size={13} />}
            <ArrowRight size={15} />
          </button>
        ))}
      </div>
      {!links.length && (
        <Empty
          icon={GitFork}
          title="Who belongs to whom?"
          description="Open a world element and add a relationship. The connection will appear here, in both directions."
          action="Explore your world"
          onAction={() => store.navigate('World')}
        />
      )}
    </div>
  )
}
export function Journal() {
  const store = useStore(),
    p = store.project!
  const [tab, setTab] = useState('Everything'),
    [add, setAdd] = useState(false),
    [title, setTitle] = useState(''),
    [text, setText] = useState(''),
    [kind, setKind] = useState<'note' | 'question'>('note')
  const contradictions = possibleContradictions(p)
  const entries = p.journal.filter(
    (j) =>
      tab === 'Everything' ||
      (tab === 'Questions' && j.kind === 'question') ||
      (tab === 'Canon changes' && j.kind === 'canon'),
  )
  return (
    <div>
      <PageHeading
        eyebrow="Notes from the making"
        title="Leave a little room to wonder."
        description="Questions, discoveries, and the history of a world becoming itself."
        actions={
          <Button onClick={() => setAdd(true)}>
            <Plus size={16} />A note to remember
          </Button>
        }
      />
      <div className="tabs journal-tabs">
        {['Everything', 'Questions', 'Canon changes', 'Behind the scenes'].map((v) => (
          <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>
            {v}
          </button>
        ))}
      </div>
      {tab === 'Behind the scenes' ? (
        <div className="journal-grid">
          {p.facts
            .filter((f) => f.visibility === 'private')
            .map((f) => (
              <article key={f.id} className="journal-card">
                <span className="card-label">
                  <LockKeyhole size={14} />
                  AUTHOR KNOWLEDGE
                </span>
                <h3>
                  {p.entities.find((e) => e.id === f.subjectId)?.name} · {f.predicate}
                </h3>
                <p>{f.object}</p>
                <small>
                  {f.knownTo.length
                    ? `Known to ${f.knownTo.map((id) => p.entities.find((e) => e.id === id)?.name).join(', ')}`
                    : 'No character knows this yet'}
                </small>
              </article>
            ))}
          {p.knowledge.map((k) => (
            <article key={k.id} className="journal-card">
              <span className="card-label">CHARACTER’S ACCOUNT</span>
              <h3>
                {p.entities.find((e) => e.id === k.entityId)?.name} {k.stance.replace('_', ' ')}
              </h3>
              <p>{k.claim}</p>
              <small>{k.source}</small>
            </article>
          ))}
        </div>
      ) : (
        <div className="journal-grid">
          {entries.map((j) => (
            <article className={`journal-card journal-${j.kind}`} key={j.id}>
              <span className="card-label">
                {j.kind === 'question' ? (
                  <HelpCircle size={14} />
                ) : j.kind === 'canon' ? (
                  <Check size={14} />
                ) : (
                  <StickyNote size={14} />
                )}
                {j.kind === 'question'
                  ? 'AN OPEN QUESTION'
                  : j.kind === 'canon'
                    ? 'THE WORLD CHANGED'
                    : 'A NOTE IN THE MARGIN'}
              </span>
              <input
                className="journal-title"
                aria-label={`Title of ${j.title}`}
                value={j.title}
                onChange={(e) => {
                  if (e.target.value)
                    store.mutate((p) => {
                      p.journal.find((v) => v.id === j.id)!.title = e.target.value
                    })
                }}
              />
              <textarea
                aria-label={`Note text for ${j.title}`}
                rows={4}
                value={j.text}
                onChange={(e) =>
                  store.mutate((p) => {
                    p.journal.find((v) => v.id === j.id)!.text = e.target.value
                  })
                }
              />
              <div className="card-bottom">
                <span>{prettyDate(j.createdAt)}</span>
                {j.kind === 'question' && (
                  <button
                    className="text-button"
                    onClick={() =>
                      store.mutate((p) => {
                        p.journal.find((v) => v.id === j.id)!.kind = 'discovery'
                      })
                    }
                  >
                    <Check size={13} />
                    Mark explored
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {contradictions.length > 0 && (
        <section className="contradiction-notes">
          <h3>Possible contradictions</h3>
          <p className="small muted">
            Different accounts can be intentional. These are invitations to look closer.
          </p>
          {contradictions.map((c) => (
            <p key={c}>
              <HelpCircle size={15} />
              {c}
            </p>
          ))}
        </section>
      )}
      {entries.length === 0 && tab !== 'Behind the scenes' && (
        <Empty
          icon={StickyNote}
          title="Catch a thought before it goes."
          description="An open question can be just as valuable as an answer."
          action="Write a note"
          onAction={() => setAdd(true)}
        />
      )}
      <Dialog
        open={add}
        onOpenChange={setAdd}
        title="A thought worth keeping"
        description="These notes belong to the author’s workspace."
      >
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault()
            store.mutate((p) =>
              p.journal.unshift({ id: uid(), title, text, kind, createdAt: now() }),
            )
            setAdd(false)
            setTitle('')
            setText('')
          }}
        >
          <Field label="Kind">
            <select value={kind} onChange={(e) => setKind(e.target.value as 'note' | 'question')}>
              <option value="note">A note</option>
              <option value="question">An open question</option>
            </select>
          </Field>
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
              maxLength={500}
            />
          </Field>
          <Field label="What’s on your mind?">
            <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <div className="dialog-actions">
            <Button>Keep this thought</Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
export function Search() {
  const store = useStore(),
    p = store.project!,
    models = useModels()
  const [query, setQuery] = useState(''),
    [type, setType] = useState('All'),
    [tag, setTag] = useState(''),
    [semantic, setSemantic] = useState(false),
    [results, setResults] = useState<SearchDoc[]>([]),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [error, setError] = useState('')
  const visible = semantic
    ? results
    : query || type !== 'All' || tag
      ? textSearch(p, query, type, tag)
      : []
  async function search() {
    if (!semantic) return
    setBusy(true)
    setError('')
    try {
      await flushSaves()
      await indexProject(p, setProgress)
      const [vector] = await embedTexts([query])
      setResults(
        await database.semantic(p.id, vector, { kind: type === 'All' ? undefined : type, tag }),
      )
      setProgress('')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  function open(d: SearchDoc) {
    if (['Manuscript'].includes(d.kind)) store.navigate('Write', d.target)
    else if (['Adventure', 'Memory'].includes(d.kind)) store.navigate('Play', d.target)
    else if (d.kind === 'Journal') store.navigate('Journal')
    else if (d.kind === 'Timeline') store.navigate('Timeline')
    else store.navigate('World', d.target)
  }
  return (
    <div className="search-page">
      <PageHeading
        eyebrow="It’s all here, somewhere"
        title="Find the thread you’re looking for."
        description="Search across your world, writing, adventures, memories, and notes. Entirely here."
      />
      <form
        className="global-search-form"
        onSubmit={(e) => {
          e.preventDefault()
          void search()
        }}
      >
        <SearchIcon size={22} />
        <input
          aria-label="Search your whole world"
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setResults([])
          }}
          placeholder={
            semantic
              ? 'The person who knows the way across the water…'
              : 'A name, a detail, a half-remembered sentence…'
          }
        />
        <Button disabled={busy || !query.trim() || (semantic && !models.embeddingReady)}>
          {busy ? 'Finding…' : 'Search'}
          <ArrowRight size={16} />
        </Button>
      </form>
      <div className="search-options">
        <div className="tabs">
          <button className={!semantic ? 'active' : ''} onClick={() => setSemantic(false)}>
            Words & phrases
          </button>
          <button className={semantic ? 'active' : ''} onClick={() => setSemantic(true)}>
            <Sparkles size={14} />
            Meaning
          </button>
        </div>
        <select
          aria-label="Search type"
          value={type}
          onChange={(e) => {
            setType(e.target.value)
            setResults([])
          }}
        >
          <option>All</option>
          {[
            ...entityTypes,
            'Manuscript',
            'Adventure',
            'Memory',
            'Fact',
            'Knowledge',
            'Relationship',
            'Journal',
            'Timeline',
            'Author note',
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <input
          className="tag-filter"
          aria-label="Filter by tag"
          placeholder="Filter by tag…"
          value={tag}
          onChange={(e) => {
            setTag(e.target.value)
            setResults([])
          }}
        />
      </div>
      {semantic && !models.embeddingReady && (
        <div className="inline-notice">
          <Sparkles size={18} />
          <p>Search by meaning uses a small local model. Download it once in Local models.</p>
          <Button size="sm" variant="secondary" onClick={() => store.navigate('Settings')}>
            Set up local search
          </Button>
        </div>
      )}
      {busy && (
        <p role="status" className="muted">
          {progress}
        </p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="search-results">
        {visible.length > 0 && <span className="eyebrow">{visible.length} threads found</span>}
        {visible.map((d) => (
          <button key={d.id} className="search-result" onClick={() => open(d)}>
            <Badge>{d.kind}</Badge>
            <h3>{d.title}</h3>
            <p>
              {d.body.slice(0, 240)}
              {d.body.length > 240 && '…'}
            </p>
            <ArrowRight size={17} />
          </button>
        ))}
      </div>
      {!visible.length && !busy && (
        <Empty
          icon={Globe2}
          title={query ? 'Nothing found just yet.' : 'Every part of your world is connected.'}
          description={
            query
              ? semantic
                ? 'Run a meaning search, or try a different detail.'
                : 'Try fewer words or another tag.'
              : 'Find the person, passage, or possibility you want to return to.'
          }
        />
      )}
    </div>
  )
}
