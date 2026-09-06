import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Compass,
  Feather,
  MapPin,
  Plus,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { createDemo } from '../domain/seed'
import { newProject, newEntity, now, uid } from '../domain/schema'
import { parseProject } from '../domain/project-file'
import { wordCount } from '../lib/utils'
import { Badge, EntityIcon, Field, PageHeading } from '../components/common'
import { Button } from '../components/ui/button'
import { Dialog } from '../components/ui/dialog'
export function NewWorld({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const store = useStore()
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title="A world of your own"
      description="You don’t need all the answers. Just a beginning."
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            const p = newProject(title)
            p.description = description
            await store.openProject(p)
            onClose()
          } catch (e) {
            setError(String(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        <Field label="World name">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            placeholder="What will you call this place?"
            required
            maxLength={500}
          />
        </Field>
        <Field label="The seed of an idea (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="A feeling, a question, a place you keep returning to…"
          />
        </Field>
        {error && <p className="error-message">{error}</p>}
        <div className="dialog-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy}>
            Create world <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
export function Welcome({ onNewWorld }: { onNewWorld: () => void }) {
  const store = useStore(),
    input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  async function begin(mode: 'write' | 'play' | 'demo') {
    setBusy(true)
    try {
      const p = mode === 'demo' ? createDemo() : newProject('Untitled world')
      if (mode === 'write')
        p.scenes.push({
          id: uid(),
          title: 'A beginning',
          book: 'Untitled manuscript',
          chapter: 'Chapter one',
          text: '',
          notes: '',
          entityIds: [],
          updatedAt: now(),
        })
      if (mode === 'play')
        p.entities.push(
          newEntity('Character', 'Your character', 'Someone at the beginning of a story.'),
          newEntity(
            'Location',
            'The starting place',
            'A place where something is about to change.',
          ),
        )
      await store.openProject(p)
      store.navigate(mode === 'write' ? 'Write' : mode === 'play' ? 'Play' : 'Home')
    } catch (e) {
      store.notify(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="welcome">
      <div className="welcome-art" aria-hidden="true" />
      <span className="eyebrow">A little room for a whole universe</span>
      <h1>
        Every world begins
        <br />
        with a possibility.
      </h1>
      <p>
        Build a place. Find a voice. Step into a story.
        <br />
        Whatever you make here belongs to you.
      </p>
      <div className="welcome-choices">
        <button onClick={onNewWorld}>
          <GlobeMark />
          <h3>Create a world</h3>
          <p>People, places, and the threads between them.</p>
          <ArrowRight size={19} />
        </button>
        <button onClick={() => begin('write')} disabled={busy}>
          <Feather size={25} strokeWidth={1.4} />
          <h3>Start writing</h3>
          <p>A quiet page. A first sentence. See where it goes.</p>
          <ArrowRight size={19} />
        </button>
        <button onClick={() => begin('play')} disabled={busy}>
          <Compass size={25} strokeWidth={1.4} />
          <h3>Start an adventure</h3>
          <p>Become a character in a world that responds.</p>
          <ArrowRight size={19} />
        </button>
      </div>
      <div className="welcome-bottom">
        <span>Or borrow a beginning.</span>
        <Button variant="secondary" onClick={() => begin('demo')} disabled={busy}>
          Explore The Quiet Tide <ArrowRight size={16} />
        </Button>
        <Button variant="ghost" onClick={() => input.current?.click()}>
          <ArrowDownToLine size={16} /> Import a world
        </Button>
        <input
          ref={input}
          className="sr-only"
          aria-label="Import project"
          type="file"
          accept=".storyworld,.json"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f)
              try {
                await store.openProject(parseProject(await f.text()))
              } catch (e) {
                store.notify(String(e))
              }
          }}
        />
      </div>
      <p className="welcome-footnote">
        No account required. Local by default. Your imagination, your choice.
      </p>
    </div>
  )
}
function GlobeMark() {
  return (
    <span className="globe-mark">
      <Compass size={27} strokeWidth={1.3} />
    </span>
  )
}
export function Home({ onCreate }: { onCreate: (type?: 'Character' | 'Location') => void }) {
  const store = useStore(),
    p = store.project!
  const scene = [...p.scenes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  const adventure = p.adventures.at(-1)
  const questions = p.journal.filter((j) => j.kind === 'question').slice(0, 3)
  const pending = p.proposals.filter((v) => v.status === 'pending').length
  return (
    <div className="home-page">
      <PageHeading
        eyebrow="Your creative space"
        title="Welcome back to your world."
        description="Pick up a thread. See where it takes you."
        actions={
          <Button variant="secondary" onClick={() => onCreate()}>
            <Plus size={16} /> Create something
          </Button>
        }
      />
      <section className="world-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="tiny-dot" /> YOUR CURRENT WORLD
          </div>
          <h2>{p.title}</h2>
          <p>
            {p.description ||
              'A place for all the people, possibilities, and stories you haven’t met yet.'}
          </p>
          <div className="hero-meta">{p.genre}</div>
          <Button onClick={() => store.navigate('World')}>
            Enter your world <ArrowRight size={16} />
          </Button>
        </div>
        <div
          className="hero-art"
          role="img"
          aria-label="An original illustration of a quiet coast, a distant lighthouse, and a moonlit sea"
        >
          <span className="art-coordinate">A WORLD IN THE MAKING</span>
        </div>
      </section>
      <div className="world-counts">
        <span>
          <UserRound size={15} />
          <strong>{p.entities.filter((e) => e.type === 'Character').length}</strong> characters
        </span>
        <span>
          <MapPin size={15} />
          <strong>{p.entities.filter((e) => e.type === 'Location').length}</strong> places
        </span>
        <span>
          <BookOpen size={15} />
          <strong>
            {p.scenes.reduce((n, s) => n + wordCount(s.text), 0).toLocaleString()}
          </strong>{' '}
          words written
        </span>
        <span className="count-last">
          <span className="tiny-dot" />A little more alive with every visit
        </span>
      </div>
      <div className="home-columns">
        <div className="home-main">
          <div className="section-heading">
            <h2>Pick up where you left off</h2>
            <span className="muted small">Your stories are waiting</span>
          </div>
          <div className="continue-grid">
            <button className="continue-card" onClick={() => store.navigate('Write', scene?.id)}>
              <span className="card-label">
                <Feather size={15} /> MANUSCRIPT
              </span>
              <h3>{scene?.title || 'Your first sentence'}</h3>
              <p>
                {scene?.text.slice(0, 122) ||
                  'There’s a story only you can tell. Give it a little room.'}
                {scene && '…'}
              </p>
              <div className="card-bottom">
                <span>
                  {scene
                    ? `${scene.chapter} · ${wordCount(scene.text)} words`
                    : 'A blank page awaits'}
                </span>
                <ArrowRight size={18} />
              </div>
            </button>
            <button
              className="continue-card adventure-card"
              onClick={() => store.navigate('Play', adventure?.id)}
            >
              <span className="card-label">
                <Compass size={16} /> ADVENTURE
              </span>
              <h3>{adventure?.title || 'Step into the unknown'}</h3>
              <p>
                {adventure?.scenario.opening.slice(0, 120) ||
                  'Choose a character, find a place, and let the next moment unfold.'}
                {adventure && '…'}
              </p>
              <div className="card-bottom">
                <span>
                  {adventure
                    ? `Playing as ${p.entities.find((e) => e.id === adventure.scenario.characterId)?.name}`
                    : 'Make a new beginning'}
                </span>
                <ArrowRight size={18} />
              </div>
            </button>
          </div>
          <div className="section-heading recent-heading">
            <h2>In your world</h2>
            <button className="text-button" onClick={() => store.navigate('World')}>
              View all <ArrowRight size={14} />
            </button>
          </div>
          <div className="recent-list">
            {[...p.entities]
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .slice(0, 4)
              .map((e) => (
                <button
                  key={e.id}
                  className="recent-row"
                  onClick={() => store.navigate('World', e.id)}
                >
                  <EntityIcon type={e.type} small />
                  <div>
                    <strong>{e.name}</strong>
                    <span>
                      {e.summary.slice(0, 80)}
                      {e.summary.length > 80 && '…'}
                    </span>
                  </div>
                  <Badge>{e.type}</Badge>
                  <ChevronRight size={16} />
                </button>
              ))}
            {!p.entities.length && (
              <button className="recent-row" onClick={() => onCreate()}>
                <Plus size={20} />
                <div>
                  <strong>Who lives here?</strong>
                  <span>Create your first character or place.</span>
                </div>
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
        <aside className="home-aside">
          <div className="section-heading">
            <h2>Loose threads</h2>
            <Sparkles size={17} />
          </div>
          <div className="threads-card">
            <span className="eyebrow">Room to wonder</span>
            {questions.length ? (
              questions.map((q) => (
                <button
                  key={q.id}
                  onClick={() => store.navigate('Journal')}
                  className="question-link"
                >
                  <span className="question-dot" />
                  <span>{q.title}</span>
                  <ArrowRight size={15} />
                </button>
              ))
            ) : (
              <p className="small muted">What is still waiting to be discovered in this world?</p>
            )}
            <button className="text-button" onClick={() => store.navigate('Journal')}>
              <Plus size={14} /> Capture a question
            </button>
          </div>
          {pending > 0 && (
            <button className="pending-note" onClick={() => store.navigate('Play')}>
              <Sparkles size={18} />
              <span>
                <strong>
                  {pending} world {pending === 1 ? 'change' : 'changes'} to review
                </strong>
                <small>Your story has opened a possibility.</small>
              </span>
              <ChevronRight size={15} />
            </button>
          )}
          <div className="section-heading history-heading">
            <h2>The world remembers</h2>
          </div>
          <div className="mini-timeline">
            {p.events.slice(-3).map((e, i) => (
              <button key={e.id} onClick={() => store.navigate('Timeline')}>
                <span className={`timeline-mark mark-${i}`} />
                <div>
                  <span className="small muted">{e.date}</span>
                  <p>{e.title}</p>
                </div>
              </button>
            ))}
            {!p.events.length && (
              <p className="small muted">History starts with a moment worth keeping.</p>
            )}
          </div>
          <button className="text-button" onClick={() => store.navigate('Timeline')}>
            Open timeline <ArrowRight size={14} />
          </button>
          <div className="margin-note">
            <span>“</span>
            <p>You don’t have to know the whole story to write the next line.</p>
            <div>A SMALL REMINDER</div>
          </div>
        </aside>
      </div>
    </div>
  )
}
