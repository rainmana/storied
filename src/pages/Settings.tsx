import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Cpu,
  Database,
  Download,
  HardDrive,
  LoaderCircle,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useStore, flushSaves } from '../lib/store'
import { useModels, indexProject } from '../lib/models'
import { STORY_MODELS } from '../lib/model-catalog'
import { MAX_PROJECT_BYTES, parseProject, serializeProject } from '../domain/project-file'
import { download } from '../lib/utils'
import { entityTypes, uid, type EntityType } from '../domain/schema'
import { Badge, Field, PageHeading } from '../components/common'
import { Button } from '../components/ui/button'
import { Dialog } from '../components/ui/dialog'
import { ProviderSettings } from '../components/ProviderSettings'
import { AppearanceSettings } from '../components/AppearanceSettings'

export function Settings() {
  const store = useStore(),
    p = store.project,
    models = useModels(),
    fileInput = useRef<HTMLInputElement>(null)
  const [gpu, setGpu] = useState<boolean | null>(null),
    [storage, setStorage] = useState('Checking local storage…'),
    [persistent, setPersistent] = useState(false),
    [deleting, setDeleting] = useState(false),
    [confirmation, setConfirmation] = useState(''),
    [indexing, setIndexing] = useState(''),
    [templateName, setTemplateName] = useState(''),
    [templateType, setTemplateType] = useState<EntityType>('Character'),
    [templateFields, setTemplateFields] = useState('')
  useEffect(() => {
    void models.refresh()
    type GPUCapability = { requestAdapter: () => Promise<unknown> }
    const browserGpu = (navigator as Navigator & { gpu?: GPUCapability }).gpu
    if (browserGpu)
      void browserGpu
        .requestAdapter()
        .then((adapter) => setGpu(!!adapter))
        .catch(() => setGpu(false))
    else setGpu(false)
    void navigator.storage
      ?.estimate()
      .then((s) =>
        setStorage(
          `${((s.usage || 0) / 1024 / 1024).toFixed(1)} MB used · ${((s.quota || 0) / 1024 / 1024 / 1024).toFixed(1)} GB available to this origin`,
        ),
      )
    void navigator.storage?.persisted().then(setPersistent)
  }, [])
  async function importFile(file: File) {
    try {
      if (file.size > MAX_PROJECT_BYTES) throw new Error('Choose a project smaller than 32 MB.')
      const project = parseProject(await file.text())
      await store.openProject(project)
      store.notify('Your world is restored, and ready to edit.')
    } catch (e) {
      store.notify(String(e))
    }
  }
  return (
    <div className="settings-page">
      <PageHeading
        eyebrow="A studio on your device"
        title="Make yourself at home."
        description="Your tools, your worlds, your way of working."
      />
      <AppearanceSettings />
      <ProviderSettings />
      <section className="settings-section" id="local-models">
        <div className="settings-section-title">
          <Cpu size={22} />
          <div>
            <h2>Your local creative tools</h2>
            <p>Choose what to download. Everything they create stays with you.</p>
          </div>
          <Badge variant={gpu ? 'canon' : ''}>
            {gpu === null ? 'Checking device' : gpu ? 'WebGPU available' : 'WebGPU unavailable'}
          </Badge>
        </div>
        <div className="model-grid">
          {STORY_MODELS.map((m, i) => (
            <article className="model-card" key={m.id}>
              <div className="model-card-header">
                <span className="model-symbol">
                  <Sparkles size={23} strokeWidth={1.3} />
                </span>
                <div>
                  <div className="eyebrow">STORYTELLER · {i ? 'MORE CAPABLE' : 'START SMALL'}</div>
                  <h3>{m.name}</h3>
                </div>
              </div>
              <p>{m.description}</p>
              <div className="model-specs">
                <span>
                  <Download size={13} />
                  {m.size} download
                </span>
                <span>{m.memory}</span>
                <span>{m.license}</span>
              </div>
              <div className="model-status">
                <span className={models.loadedId === m.id ? 'status-ready' : 'muted'}>
                  {models.loadedId === m.id
                    ? '● Loaded on this device'
                    : models.cached.includes(m.id)
                      ? 'Downloaded · not loaded'
                      : 'Not downloaded'}
                </span>
              </div>
              <div className="button-row">
                {models.loadedId === m.id ? (
                  <Button size="sm" variant="secondary" disabled>
                    <Check size={15} />
                    Ready to tell stories
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => models.load(m.id, !models.cached.includes(m.id))}
                    disabled={!gpu || models.busy}
                  >
                    <Download size={15} />
                    {models.cached.includes(m.id) ? 'Load from device' : 'Download & load'}
                  </Button>
                )}
                {models.cached.includes(m.id) && (
                  <>
                    <button
                      className="icon-button"
                      title="Remove model files"
                      aria-label={`Remove ${m.name}`}
                      disabled={models.busy}
                      onClick={() => models.remove(m.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                    {models.loadedId !== m.id && (
                      <button
                        className="text-button small"
                        disabled={!gpu || models.busy}
                        onClick={() => models.load(m.id, true)}
                      >
                        Repair download
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
        {gpu === false && (
          <p className="small muted">
            Local storytelling needs a browser and device with WebGPU support. Writing,
            worldbuilding, and CPU-based semantic search work independently.
          </p>
        )}
        <article className="embedding-card">
          <span className="model-symbol">
            <Database size={22} strokeWidth={1.4} />
          </span>
          <div>
            <h3>A little help finding things</h3>
            <p>
              MiniLM L6 · semantic search · approximately 23 MB · Apache-2.0
              <br />
              Find related ideas even when the words are different. Runs locally on the CPU.
            </p>
            <span className="small muted">
              {models.embeddingReady
                ? 'Loaded on this device'
                : models.embeddingCached
                  ? 'Downloaded · not loaded'
                  : 'Not downloaded'}
            </span>
          </div>
          <div className="button-row">
            {!models.embeddingReady && (
              <Button
                size="sm"
                variant="secondary"
                disabled={models.busy}
                onClick={() => models.loadEmbeddings(!models.embeddingCached)}
              >
                <Download size={14} />
                {models.embeddingCached ? 'Load search model' : 'Download search model'}
              </Button>
            )}
            {models.embeddingReady && p && (
              <Button
                size="sm"
                variant="secondary"
                disabled={!!indexing || models.busy}
                onClick={async () => {
                  setIndexing('Preparing…')
                  try {
                    await flushSaves()
                    await indexProject(p, setIndexing)
                    store.notify('Your local search index is ready.')
                  } catch (e) {
                    store.notify(String(e))
                  } finally {
                    setIndexing('')
                  }
                }}
              >
                <Database size={14} />
                Build search index
              </Button>
            )}
            {models.embeddingCached && (
              <button
                className="icon-button"
                aria-label="Remove search model"
                disabled={models.busy || !!indexing}
                onClick={() => models.removeEmbeddings()}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </article>
        {(models.progress || indexing) && (
          <div className="download-progress" role="status">
            <LoaderCircle size={17} className="spin" />
            <div>
              {models.progress || indexing}
              {models.progress && (
                <small>Downloading model only. Your project is not being uploaded.</small>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={models.cancel}>
              Cancel
            </Button>
          </div>
        )}
        {models.error && (
          <p className="error-message" role="alert">
            {models.error}
          </p>
        )}
      </section>
      {p && (
        <section className="settings-section">
          <div className="settings-section-title">
            <LockKeyhole size={22} />
            <div>
              <h2>A world you can take with you</h2>
              <p>The complete editable project, in one .storyworld file.</p>
            </div>
          </div>
          <div className="project-transfer">
            <div>
              <h3>{p.title}</h3>
              <p>
                {p.entities.length} world elements · {p.scenes.length} scenes ·{' '}
                {p.adventures.length} adventures
              </p>
              <small>
                Includes canon, branches, memories, notes, templates, and attached images. Search
                indexes can be rebuilt.
              </small>
            </div>
            <Button
              onClick={() => {
                try {
                  download(
                    `${p.title.replace(/[^a-z0-9 -]/gi, '') || 'world'}.storyworld`,
                    serializeProject(p),
                  )
                  store.notify('Project exported. Keep a copy somewhere safe.')
                } catch (e) {
                  store.notify(String(e))
                }
              }}
            >
              <ArrowDownToLine size={16} />
              Export project
            </Button>
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              <ArrowUpFromLine size={16} />
              Import project
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".storyworld,.json"
              className="sr-only"
              aria-label="Import .storyworld project"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void importFile(file)
                e.target.value = ''
              }}
            />
          </div>
          <div className="settings-fields">
            <Field label="World title">
              <input
                value={p.title}
                maxLength={500}
                onChange={(e) => {
                  if (e.target.value)
                    store.mutate((p) => {
                      p.title = e.target.value
                    })
                }}
              />
            </Field>
            <Field label="A few words about this world">
              <input
                value={p.description}
                onChange={(e) =>
                  store.mutate((p) => {
                    p.description = e.target.value
                  })
                }
              />
            </Field>
            <Field label="Genre or feeling">
              <input
                value={p.genre}
                maxLength={500}
                onChange={(e) =>
                  store.mutate((p) => {
                    p.genre = e.target.value
                  })
                }
              />
            </Field>
            <Field
              label="Your storyteller’s guiding instructions"
              hint="These instructions are always included in generation. Do not put secrets here."
            >
              <textarea
                rows={3}
                value={p.settings.authorInstructions}
                onChange={(e) =>
                  store.mutate((p) => {
                    p.settings.authorInstructions = e.target.value
                  })
                }
              />
            </Field>
          </div>
        </section>
      )}
      {p && (
        <section className="settings-section">
          <div className="settings-section-title">
            <Plus size={21} />
            <div>
              <h2>A starting shape for your ideas</h2>
              <p>Save a set of attributes for newly created world elements.</p>
            </div>
          </div>
          <form
            className="template-form"
            onSubmit={(e) => {
              e.preventDefault()
              store.mutate((p) => {
                p.templates = p.templates.filter((t) => t.type !== templateType)
                p.templates.push({
                  id: uid(),
                  name: templateName,
                  type: templateType,
                  fields: templateFields
                    .split(',')
                    .map((v) => v.trim())
                    .filter(Boolean),
                })
              })
              store.notify('Template saved for new elements.')
              setTemplateName('')
              setTemplateFields('')
            }}
          >
            <Field label="Template name">
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                required
              />
            </Field>
            <Field label="Kind">
              <select
                value={templateType}
                onChange={(e) => setTemplateType(e.target.value as EntityType)}
              >
                {entityTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Attributes, separated by commas">
              <input
                value={templateFields}
                onChange={(e) => setTemplateFields(e.target.value)}
                placeholder="Desire, Flaw, Occupation"
                required
              />
            </Field>
            <Button size="sm" variant="secondary">
              Save template
            </Button>
          </form>
          <div className="tag-list">
            {p.templates.map((t) => (
              <Badge key={t.id}>
                {t.name} · {t.type}
              </Badge>
            ))}
          </div>
        </section>
      )}
      <section className="settings-section storage-section">
        <div className="settings-section-title">
          <HardDrive size={22} />
          <div>
            <h2>Right here, on this device</h2>
            <p>{storage}</p>
          </div>
        </div>
        <div className="storage-info">
          <ShieldCheck size={22} />
          <div>
            <strong>
              {persistent ? 'Persistent storage granted' : 'Ask your browser to keep this studio'}
            </strong>
            <p>
              Browser storage can be cleared by you or your browser. Export regularly to keep a
              separate backup.
            </p>
          </div>
          {!persistent && (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const result = await navigator.storage.persist()
                setPersistent(result)
                store.notify(
                  result
                    ? 'The browser granted persistent storage.'
                    : 'The browser did not grant persistent storage. Regular exports are still available.',
                )
              }}
            >
              Request persistent storage
            </Button>
          )}
        </div>
        {p && (
          <div className="delete-project">
            <span>Remove only “{p.title}” from this browser.</span>
            <Button variant="ghost" size="sm" onClick={() => setDeleting(true)}>
              <Trash2 size={14} />
              Delete local project
            </Button>
          </div>
        )}
      </section>
      <div className="about-storied">
        <span className="wordmark">
          storied<span>✳</span>
        </span>
        <p>Open source. Local by design. Made for the worlds only you can imagine.</p>
        <small>
          v0.6.0 · GPL-3.0-or-later · No Storied accounts or analytics · Optional API connections
        </small>
        <p>
          <a
            href="/third-party-notices.txt"
            target="_blank"
            rel="noopener noreferrer"
            className="text-button small"
          >
            Open-source licenses
          </a>
          {' · '}
          <a href="/storied-source-v0.6.0.zip" download className="text-button small">
            Download source
          </a>
        </p>
      </div>
      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Remove this world from the device?"
        description="This removes the local project and its search index. A .storyworld export can restore it."
      >
        <Field label={`Type ${p?.title} to confirm`}>
          <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoFocus />
        </Field>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setDeleting(false)}>
            Keep the world
          </Button>
          <Button
            variant="destructive"
            disabled={confirmation !== p?.title}
            onClick={async () => {
              try {
                await store.deleteProject()
                setDeleting(false)
              } catch (e) {
                store.notify(String(e))
              }
            }}
          >
            Delete project
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
