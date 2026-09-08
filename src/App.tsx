import { useEffect, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Command,
  Compass,
  Download,
  Feather,
  GitFork,
  Globe2,
  Home as HomeIcon,
  Laptop,
  Menu,
  Plus,
  Search as SearchIcon,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Clock3,
  X,
  type LucideIcon,
} from 'lucide-react'
import { registerSW } from 'virtual:pwa-register'
import { useStore, flushSaves, type Page } from './lib/store'
import { useInferenceStatus } from './lib/inference'
import { download } from './lib/utils'
import { serializeProject } from './domain/project-file'
import type { EntityType } from './domain/schema'
import { Button } from './components/ui/button'
import { Dialog } from './components/ui/dialog'
import { CreateEntity } from './components/CreateEntity'
import { Home, NewWorld, Welcome } from './pages/Home'
import { World } from './pages/World'
import { Write } from './pages/Write'
import { Play } from './pages/Play'
import { Journal, Relationships, Search, Timeline } from './pages/Library'
import { Settings } from './pages/Settings'
import { Voice } from './pages/Voice'
import { Progress } from './pages/Progress'
import { usePracticeClock } from './components/Practice'
import './practice.css'

const navigation: { page: Page; icon: LucideIcon }[] = [
  { page: 'Home', icon: HomeIcon },
  { page: 'World', icon: Globe2 },
  { page: 'Write', icon: Feather },
  { page: 'Play', icon: Compass },
  { page: 'Timeline', icon: CalendarDays },
  { page: 'Relationships', icon: GitFork },
  { page: 'Journal', icon: StickyNote },
  { page: 'Search', icon: SearchIcon },
  { page: 'Voice', icon: Feather },
  { page: 'Progress', icon: Clock3 },
]
type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: string }>
}
export default function App() {
  usePracticeClock()
  const store = useStore(),
    inference = useInferenceStatus()
  const [create, setCreate] = useState<EntityType | null>(null),
    [newWorld, setNewWorld] = useState(false),
    [palette, setPalette] = useState(false),
    [query, setQuery] = useState(''),
    [menu, setMenu] = useState(false),
    [install, setInstall] = useState<InstallEvent | null>(null),
    [update, setUpdate] = useState<(() => Promise<void>) | null>(null),
    [offlineReady, setOfflineReady] = useState(false)
  useEffect(() => {
    void store.boot()
  }, [])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((v) => !v)
      }
      if (e.key === 'Escape') setMenu(false)
    }
    const installer = (e: Event) => {
      e.preventDefault()
      setInstall(e as InstallEvent)
    }
    document.addEventListener('keydown', handler)
    window.addEventListener('beforeinstallprompt', installer)
    const updateSW = registerSW({
      onNeedRefresh() {
        setUpdate(() => async () => {
          await flushSaves()
          await updateSW(true)
        })
      },
      onOfflineReady() {
        setOfflineReady(true)
      },
      onRegisterError(error) {
        console.warn('Offline app cache is not ready:', error)
      },
    })
    return () => {
      document.removeEventListener('keydown', handler)
      window.removeEventListener('beforeinstallprompt', installer)
    }
  }, [])
  useEffect(() => {
    setMenu(false)
    document.getElementById('main-content')?.scrollTo(0, 0)
  }, [store.page, store.selectedEntity, store.project?.id])
  if (!store.ready)
    return (
      <div className="boot-screen">
        <span className="wordmark">
          storied<span>✳</span>
        </span>
        <span className="breathing-dot" />
        <p>Making a little room for your world…</p>
      </div>
    )
  if (store.fatal)
    return (
      <div className="boot-screen">
        <ShieldCheck size={32} />
        <h1>Your world stays safe.</h1>
        <p role="alert">{store.fatal}</p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </div>
    )
  const exportProject = () => {
    const p = useStore.getState().project
    if (p) {
      try {
        download(`${p.title}.storyworld`, serializeProject(p))
        store.notify('Your complete project has been exported.')
      } catch (e) {
        store.notify(String(e))
      }
    }
  }
  const commands = [
    { label: 'Create a character', action: () => setCreate('Character') },
    { label: 'Create a location', action: () => setCreate('Location') },
    { label: 'Create a new world', action: () => setNewWorld(true) },
    { label: 'Start an adventure', action: () => store.navigate('Play') },
    { label: 'Search your world', action: () => store.navigate('Search') },
    { label: 'Open timeline', action: () => store.navigate('Timeline') },
    { label: 'Export project', action: exportProject },
    { label: 'Choose a local storyteller', action: () => store.navigate('Settings') },
  ]
  const pages: Record<Page, React.ReactNode> = {
    Progress: <Progress />,
    Home: <Home onCreate={(type) => setCreate(type || 'Character')} />,
    World: <World onCreate={setCreate} />,
    Write: <Write key={store.project?.id} />,
    Play: <Play />,
    Timeline: <Timeline />,
    Relationships: <Relationships />,
    Journal: <Journal />,
    Search: <Search />,
    Settings: <Settings />,
    Voice: <Voice key={store.project?.id} />,
  }
  return (
    <div className={`app-shell ${menu ? 'mobile-menu-open' : ''}`}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {menu && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className="sidebar">
        <button className="brand" onClick={() => store.navigate('Home')} aria-label="Storied home">
          <span className="brand-symbol">✳</span>
          <span>storied</span>
        </button>
        <div className="project-picker">
          <span className="project-monogram">{store.project?.title.slice(0, 1) || 'S'}</span>
          <div>
            <small>YOUR WORLD</small>
            <select
              aria-label="Current project"
              value={store.project?.id || ''}
              onChange={(e) => {
                if (e.target.value === 'new') setNewWorld(true)
                else void store.switchProject(e.target.value).catch((e) => store.notify(String(e)))
              }}
            >
              <option value="" disabled>
                Choose a beginning
              </option>
              {store.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
              <option value="new">+ Create a new world</option>
            </select>
          </div>
          <ChevronDown size={13} />
        </div>
        <nav aria-label="Main navigation">
          <span className="nav-label">YOUR STUDIO</span>
          {navigation.map(({ page, icon: Icon }, i) => (
            <button
              key={page}
              onClick={() => store.navigate(page)}
              disabled={!store.project && page !== 'Home'}
              className={`${store.page === page ? 'active' : ''} ${i === 4 ? 'nav-break' : ''}`}
            >
              <Icon size={18} strokeWidth={1.6} />
              <span>{page === 'Voice' ? 'Your voice' : page}</span>
              {page === 'Search' && <kbd>⌘ K</kbd>}
              {store.page === page && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="model-status-button"
            onClick={() => store.navigate('Settings')}
            disabled={!store.project}
          >
            <span className="model-mini-icon">
              <Sparkles size={17} />
            </span>
            <span>
              <strong>{inference.remote ? 'Connected storyteller' : 'Local storyteller'}</strong>
              <small>
                {inference.remote
                  ? inference.label
                  : inference.ready
                    ? 'Ready when you are'
                    : 'A little imagination, on device'}
              </small>
            </span>
            <ChevronRight size={14} />
          </button>
          <div className="sidebar-bottom-row">
            <button onClick={() => store.navigate('Settings')} disabled={!store.project}>
              <SettingsIcon size={17} />
              Settings
            </button>
            <span>v0.9.0</span>
          </div>
          <div className="sidebar-note">
            Your world. Your words.
            <br />
            Yours alone.
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu-button"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span>{store.project?.title || 'A world of your own'}</span>
            <ChevronRight size={13} />
            <strong>{store.page}</strong>
          </div>
          <div className="topbar-actions">
            {store.project && (
              <span className={`save-status save-${store.saveStatus}`} role="status">
                {store.saveStatus === 'saved' ? <Check size={13} /> : <span className="tiny-dot" />}
                {store.saveStatus === 'saved'
                  ? 'Saved on this device'
                  : store.saveStatus === 'saving'
                    ? 'Saving…'
                    : 'Save needs attention'}
              </span>
            )}
            {update && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void update().catch((e) => store.notify(String(e)))}
              >
                Update ready
              </Button>
            )}
            {install && (
              <button
                className="icon-button"
                aria-label="Install Storied"
                title="Install Storied"
                onClick={async () => {
                  await install.prompt()
                  if ((await install.userChoice).outcome === 'accepted') setInstall(null)
                }}
              >
                <Download size={16} />
              </button>
            )}
            <button
              className="privacy-pill"
              title={
                inference.remote
                  ? `AI context is sent to ${inference.origin}. Project storage and search stay in this browser.`
                  : 'Your world, writing, AI generation, and search stay on this device.'
              }
              onClick={() => store.project && store.navigate('Settings')}
            >
              <ShieldCheck size={14} />
              <span>{inference.remote ? 'API connected' : 'Local'}</span>
            </button>
            <button
              className="icon-button command-trigger"
              aria-label="Open command palette"
              onClick={() => setPalette(true)}
            >
              <Command size={16} />
            </button>
          </div>
        </header>
        {store.error && (
          <div className="save-error" role="alert">
            <span>{store.error}</span>
            <Button variant="secondary" size="sm" onClick={store.retrySave}>
              Retry save
            </Button>
            <Button size="sm" onClick={exportProject}>
              Export a backup
            </Button>
          </div>
        )}
        <main
          id="main-content"
          className={`main-content page-${store.page.toLowerCase()}`}
          tabIndex={-1}
        >
          {store.project ? pages[store.page] : <Welcome onNewWorld={() => setNewWorld(true)} />}
        </main>
        <footer className="app-footer">
          <span>
            <Laptop size={12} />
            Made for your imagination. Kept on your device.
          </span>
          <span>{offlineReady ? 'Ready for offline use' : 'YOUR NEXT CHAPTER IS YOURS'}</span>
        </footer>
      </div>
      <NewWorld open={newWorld} onClose={() => setNewWorld(false)} />
      {create && store.project && (
        <CreateEntity key={create} open initialType={create} onClose={() => setCreate(null)} />
      )}
      <Dialog
        open={palette}
        onOpenChange={setPalette}
        title="Where would you like to go?"
        description="A shortcut to your world. Ctrl or ⌘ K from anywhere."
        className="command-dialog"
      >
        <div className="search-input">
          <SearchIcon size={18} />
          <input
            autoFocus
            aria-label="Find a command"
            placeholder="Find a command or a world element…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="command-results">
          {commands
            .filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
            .map((c) => (
              <button
                key={c.label}
                disabled={!store.project && c.label !== 'Create a new world'}
                onClick={() => {
                  setPalette(false)
                  c.action()
                  setQuery('')
                }}
              >
                <ArrowRight size={15} />
                <span>{c.label}</span>
              </button>
            ))}
          {store.project?.entities
            .filter((e) => query && e.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 6)
            .map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  setPalette(false)
                  store.navigate('World', e.id)
                  setQuery('')
                }}
              >
                <Globe2 size={15} />
                <span>{e.name}</span>
                <small>{e.type}</small>
              </button>
            ))}
        </div>
      </Dialog>
      {store.toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{store.toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => useStore.setState({ toast: '' })}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
