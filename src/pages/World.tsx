import { useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  ImagePlus,
  Link2,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import {
  canonStates,
  entityTypes,
  stances,
  uid,
  now,
  type Entity,
  type EntityType,
  type Fact,
  type Knowledge,
  type Relationship,
} from '../domain/schema'
import { useStore } from '../lib/store'
import { completeLocally, useModels } from '../lib/models'
import { Badge, Empty, EntityIcon, Field, PageHeading } from '../components/common'
import { Button } from '../components/ui/button'
import { Dialog } from '../components/ui/dialog'

export function World({ onCreate }: { onCreate: () => void }) {
  const store = useStore(),
    p = store.project!
  const [type, setType] = useState('All'),
    [query, setQuery] = useState('')
  const selected = p.entities.find((e) => e.id === store.selectedEntity)
  if (selected) return <EntityPage key={selected.id} entity={selected} />
  const items = p.entities.filter(
    (e) =>
      (type === 'All' || e.type === type) &&
      `${e.name} ${e.summary} ${e.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <div>
      <PageHeading
        eyebrow="The story bible"
        title="A world, taking shape."
        description="The people, places, and possibilities that make it yours."
        actions={
          <Button onClick={onCreate}>
            <Plus size={16} /> New world element
          </Button>
        }
      />
      <div className="workspace-toolbar">
        <div className="tabs" role="group" aria-label="Filter world elements">
          {['All', 'Character', 'Location', 'Faction'].map((t) => (
            <button key={t} className={type === t ? 'active' : ''} onClick={() => setType(t)}>
              {t === 'All' ? 'Everything' : `${t}s`}
              <span>
                {t === 'All' ? p.entities.length : p.entities.filter((e) => e.type === t).length}
              </span>
            </button>
          ))}
          <select
            aria-label="More entity types"
            value={['All', 'Character', 'Location', 'Faction'].includes(type) ? '' : type}
            onChange={(e) => setType(e.target.value || 'All')}
          >
            <option value="">More…</option>
            {entityTypes
              .filter((t) => !['Character', 'Location', 'Faction'].includes(t))
              .map((t) => (
                <option key={t}>{t}</option>
              ))}
          </select>
        </div>
        <div className="search-input">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find something in your world"
            aria-label="Find world elements"
          />
        </div>
      </div>
      <div className="entity-grid">
        {items.map((e) => (
          <button
            className={`entity-card card-${e.type.toLowerCase()}`}
            key={e.id}
            onClick={() => store.navigate('World', e.id)}
          >
            <div className="entity-card-top">
              <EntityIcon type={e.type} />
              <Badge>{e.type}</Badge>
            </div>
            <h3>{e.name}</h3>
            <p>{e.summary || 'Every detail is a new possibility. Add a few words to begin.'}</p>
            <div className="entity-card-bottom">
              <div className="tag-list">
                {e.tags.slice(0, 2).map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </div>
              {e.visibility === 'private' ? (
                <EyeOff size={14} aria-label="Private" />
              ) : (
                <ChevronRight size={16} />
              )}
            </div>
          </button>
        ))}
      </div>
      {!items.length && (
        <Empty
          title={query ? 'No matching threads' : 'There’s room for someone here.'}
          description={
            query
              ? 'Try another name, description, or tag.'
              : 'Start with one person or one place. The connections will follow.'
          }
          action="Create a world element"
          onAction={onCreate}
        />
      )}
    </div>
  )
}
function EntityPage({ entity: e }: { entity: Entity }) {
  const store = useStore(),
    p = store.project!,
    model = useModels()
  const [adding, setAdding] = useState<'fact' | 'relationship' | 'knowledge' | null>(null),
    [fieldName, setFieldName] = useState(''),
    [aiText, setAiText] = useState(''),
    [busy, setBusy] = useState(false)
  const imageInput = useRef<HTMLInputElement>(null)
  const update = (fn: (e: Entity) => void) =>
    store.mutate((p) => {
      const target = p.entities.find((v) => v.id === e.id)!
      fn(target)
      target.updatedAt = now()
    })
  const relations = p.relationships.filter((r) => r.from === e.id || r.to === e.id)
  async function help() {
    setBusy(true)
    try {
      setAiText(
        await completeLocally(
          `Help the author deepen this fictional ${e.type}. Give three distinct possibilities and one useful unanswered question. Do not assert new canon.\nName: ${e.name}\nSummary: ${e.summary}\nAuthor notes: ${e.notes}`,
          'worldbuilder',
        ),
      )
    } catch (error) {
      store.notify(String(error))
    } finally {
      setBusy(false)
    }
  }
  async function importImage(file: File) {
    if (
      file.size > 6 * 1024 * 1024 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
    ) {
      store.notify('Choose a PNG, JPEG, or WebP image smaller than 6 MB.')
      return
    }
    try {
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height)),
        canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      const asset = {
        id: uid(),
        name: file.name,
        data: canvas.toDataURL('image/webp', 0.85),
        pins: [],
      }
      store.mutate((p) => {
        p.assets.push(asset)
        p.entities.find((x) => x.id === e.id)!.assetIds.push(asset.id)
      })
      store.notify('Image saved on this device.')
    } catch {
      store.notify('This image could not be read.')
    }
  }
  const panels: Record<Entity['panelOrder'][number], React.ReactNode> = {
    about: (
      <>
        <Field
          label="In-world description"
          hint="Only this description, name, aliases, and tags describe the entity to the storyteller. Keep hidden motives in private notes or facts."
        >
          <textarea
            rows={4}
            value={e.summary}
            onChange={(v) =>
              update((e) => {
                e.summary = v.target.value
              })
            }
          />
        </Field>
        <div className="field-row">
          <Field label="Also known as">
            <input
              value={e.aliases.join(', ')}
              onChange={(v) =>
                update((e) => {
                  e.aliases = v.target.value.split(',').map((v) => v.trim())
                })
              }
              placeholder="Aliases, separated by commas"
            />
          </Field>
          <Field label="Tags">
            <input
              value={e.tags.join(', ')}
              onChange={(v) =>
                update((e) => {
                  e.tags = v.target.value.split(',').map((v) => v.trim())
                })
              }
              placeholder="Themes, places, connections"
            />
          </Field>
        </div>
      </>
    ),
    attributes: (
      <>
        <div className="attribute-grid">
          {Object.entries(e.fields).map(([key, value]) => (
            <Field key={key} label={key}>
              <input
                value={value}
                onChange={(v) =>
                  update((e) => {
                    e.fields[key] = v.target.value
                  })
                }
                placeholder="Still to be discovered"
                maxLength={500}
              />
            </Field>
          ))}
        </div>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (fieldName.trim()) {
              update((e) => {
                e.fields[fieldName.trim()] = ''
              })
              setFieldName('')
            }
          }}
        >
          <input
            aria-label="New attribute name"
            value={fieldName}
            onChange={(e) => setFieldName(e.target.value)}
            placeholder="Add an attribute…"
            maxLength={100}
          />
          <Button type="submit" size="sm" variant="ghost" disabled={!fieldName.trim()}>
            <Plus size={15} />
            Add
          </Button>
        </form>
        <small className="muted">
          Attributes are author reference. Add important in-world truths as facts.
        </small>
      </>
    ),
    relationships: (
      <>
        {relations.map((r) => {
          const other = p.entities.find((x) => x.id === (r.from === e.id ? r.to : r.from))!
          return (
            <div className="relationship-row" key={r.id}>
              <EntityIcon type={other.type} small />
              <div>
                <button className="text-button" onClick={() => store.navigate('World', other.id)}>
                  {other.name}
                </button>
                <span className="small muted">
                  {r.from === e.id
                    ? `${e.name} ${r.label} ${other.name}`
                    : `${other.name} ${r.label} ${e.name}`}
                </span>
              </div>
              <Badge variant={r.status}>{r.label}</Badge>
              <button
                className="icon-button"
                aria-label={`Remove relationship with ${other.name}`}
                onClick={() =>
                  store.mutate((p) => {
                    p.relationships = p.relationships.filter((v) => v.id !== r.id)
                  })
                }
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
        <Button variant="ghost" size="sm" onClick={() => setAdding('relationship')}>
          <Link2 size={15} />
          Connect to someone or something
        </Button>
      </>
    ),
    facts: (
      <>
        {p.facts
          .filter((f) => f.subjectId === e.id)
          .map((f) => (
            <div className="fact-card" key={f.id}>
              <div className="fact-title">
                <strong>{f.predicate}</strong>
                <Badge variant={f.status}>{f.status}</Badge>
              </div>
              <p>{f.object}</p>
              <div className="fact-controls">
                <label>
                  <span className="sr-only">Canon status for {f.predicate}</span>
                  <select
                    value={f.status}
                    onChange={(v) =>
                      store.mutate((p) => {
                        p.facts.find((x) => x.id === f.id)!.status = v.target
                          .value as Fact['status']
                      })
                    }
                  >
                    {canonStates.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <span className="small muted">
                  {f.visibility === 'private' ? <EyeOff size={13} /> : <Eye size={13} />}
                  {f.visibility === 'private' ? 'Private knowledge' : 'Public in-world knowledge'}
                </span>
              </div>
              {f.visibility === 'private' && (
                <div className="known-to">
                  <span>Who knows this?</span>
                  {p.entities
                    .filter((x) => x.type === 'Character')
                    .map((c) => (
                      <label key={c.id} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={f.knownTo.includes(c.id)}
                          onChange={(v) =>
                            store.mutate((p) => {
                              const fact = p.facts.find((x) => x.id === f.id)!
                              fact.knownTo = v.target.checked
                                ? [...fact.knownTo, c.id]
                                : fact.knownTo.filter((id) => id !== c.id)
                            })
                          }
                        />
                        {c.name}
                      </label>
                    ))}
                </div>
              )}
            </div>
          ))}
        <Button variant="ghost" size="sm" onClick={() => setAdding('fact')}>
          <Plus size={15} />
          Add a fact or a secret
        </Button>
      </>
    ),
    knowledge: (
      <>
        {p.knowledge
          .filter((k) => k.entityId === e.id)
          .map((k) => (
            <div className="knowledge-row" key={k.id}>
              <Badge variant="belief">{k.stance.replace('_', ' ')}</Badge>
              <div>
                <p>{k.claim}</p>
                <small>
                  {k.source || 'A personal account'} · {Math.round(k.confidence * 100)}% confidence
                </small>
              </div>
            </div>
          ))}
        <p className="small muted">
          A belief can be sincere without being true. These accounts stay separate from canon.
        </p>
        <Button variant="ghost" size="sm" onClick={() => setAdding('knowledge')}>
          <Plus size={15} />
          Add something {e.type === 'Character' ? 'they believe' : 'known'}
        </Button>
      </>
    ),
    notes: (
      <Field
        label="Only for the author"
        hint="These notes are never included in a player’s story context."
      >
        <textarea
          rows={5}
          value={e.notes}
          onChange={(v) =>
            update((e) => {
              e.notes = v.target.value
            })
          }
          placeholder="Hidden motives, future plans, questions you aren’t ready to answer…"
        />
      </Field>
    ),
    references: (
      <>
        <div className="reference-links">
          {p.scenes
            .filter((s) => s.entityIds.includes(e.id) || s.text.includes(`@${e.name}`))
            .map((s) => (
              <button key={s.id} onClick={() => store.navigate('Write', s.id)}>
                <BookOpen size={16} />
                <span>{s.title}</span>
                <ChevronRight size={14} />
              </button>
            ))}
          {p.adventures
            .filter(
              (a) =>
                a.scenario.activeEntityIds.includes(e.id) ||
                a.scenario.characterId === e.id ||
                a.turns.some((t) => t.text.includes(e.name)),
            )
            .map((a) => (
              <button key={a.id} onClick={() => store.navigate('Play', a.id)}>
                <Sparkles size={16} />
                <span>{a.title}</span>
                <ChevronRight size={14} />
              </button>
            ))}
          {p.events
            .filter((t) => t.entityIds.includes(e.id))
            .map((t) => (
              <button key={t.id} onClick={() => store.navigate('Timeline')}>
                <span className="muted small">{t.date}</span>
                <span>{t.title}</span>
                <ChevronRight size={14} />
              </button>
            ))}
        </div>
        <p className="small muted">
          References from manuscripts, adventures, and the timeline appear here.
        </p>
      </>
    ),
    images: (
      <>
        <div className="asset-grid">
          {e.assetIds
            .map((id) => p.assets.find((a) => a.id === id))
            .filter((a) => !!a)
            .map((a) => (
              <figure key={a.id}>
                <img src={a.data} alt={a.name} />
                <figcaption>{a.name}</figcaption>
              </figure>
            ))}
        </div>
        <input
          ref={imageInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label="Attach image"
          onChange={(e) => {
            if (e.target.files?.[0]) void importImage(e.target.files[0])
          }}
        />
        <Button variant="ghost" size="sm" onClick={() => imageInput.current?.click()}>
          <ImagePlus size={15} />
          Attach an image or map
        </Button>
      </>
    ),
  }
  const titles = {
    about: 'A few defining words',
    attributes: 'The details',
    relationships: 'Connected to',
    facts: 'Facts & secrets',
    knowledge: 'What they believe',
    notes: 'Behind the scenes',
    references: 'Threads through your work',
    images: 'Images & maps',
  }
  return (
    <div className="entity-page">
      <button className="text-button back-link" onClick={() => store.navigate('World')}>
        <ArrowLeft size={15} />
        All world elements
      </button>
      <div className="entity-page-header">
        <EntityIcon type={e.type} />
        <div>
          <div className="eyebrow">{e.type}</div>
          <input
            className="title-input"
            aria-label="Entity name"
            value={e.name}
            maxLength={500}
            onChange={(v) => {
              if (v.target.value)
                update((e) => {
                  e.name = v.target.value
                })
            }}
          />
        </div>
        <Button
          variant="secondary"
          onClick={help}
          disabled={!model.loadedId || busy || model.busy}
          title={
            !model.loadedId
              ? 'Load a local storyteller to explore possibilities'
              : 'Get editable suggestions'
          }
        >
          <Sparkles size={16} />
          {busy ? 'Thinking locally…' : 'Explore possibilities'}
        </Button>
      </div>
      <div className="entity-status-row">
        <label>
          World status
          <select
            value={e.status}
            onChange={(v) =>
              update((e) => {
                e.status = v.target.value as Entity['status']
              })
            }
          >
            {canonStates.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Visibility
          <select
            value={e.visibility}
            onChange={(v) =>
              update((e) => {
                e.visibility = v.target.value as Entity['visibility']
              })
            }
          >
            <option value="public">Known in the world</option>
            <option value="private">Hidden from characters</option>
          </select>
        </label>
        <span className="muted small">Edits save as you write</span>
      </div>
      {e.visibility === 'private' && (
        <div className="known-to">
          <span>Who knows this entity exists?</span>
          {p.entities
            .filter((c) => c.type === 'Character')
            .map((c) => (
              <label key={c.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={e.knownTo.includes(c.id)}
                  onChange={(v) =>
                    update((e) => {
                      e.knownTo = v.target.checked
                        ? [...e.knownTo, c.id]
                        : e.knownTo.filter((id) => id !== c.id)
                    })
                  }
                />
                {c.name}
              </label>
            ))}
        </div>
      )}
      {aiText && (
        <div className="proposal-card">
          <h3>A few possibilities</h3>
          <p className="preserve-lines">{aiText}</p>
          <div className="button-row">
            <Button
              size="sm"
              onClick={() => {
                update((e) => {
                  e.notes += `\n\nPossibilities (not canon):\n${aiText}`
                })
                setAiText('')
              }}
            >
              Keep in author notes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAiText('')}>
              Discard
            </Button>
          </div>
        </div>
      )}
      <div className="entity-panels">
        {e.panelOrder.map((panel, index) => (
          <section className={`entity-panel panel-${panel}`} key={panel}>
            <div className="section-heading">
              <h2>{titles[panel]}</h2>
              {index > 0 && (
                <button
                  className="icon-button"
                  title="Move panel up"
                  aria-label={`Move ${titles[panel]} up`}
                  onClick={() =>
                    update((e) => {
                      ;[e.panelOrder[index - 1], e.panelOrder[index]] = [
                        e.panelOrder[index],
                        e.panelOrder[index - 1],
                      ]
                    })
                  }
                >
                  <ArrowUp size={14} />
                </button>
              )}
            </div>
            {panels[panel]}
          </section>
        ))}
      </div>
      {adding && (
        <AddDetail key={adding} kind={adding} entity={e} onClose={() => setAdding(null)} />
      )}
    </div>
  )
}
function AddDetail({
  kind,
  entity,
  onClose,
}: {
  kind: 'fact' | 'relationship' | 'knowledge'
  entity: Entity
  onClose: () => void
}) {
  const store = useStore(),
    p = store.project!
  const [label, setLabel] = useState(''),
    [value, setValue] = useState(''),
    [target, setTarget] = useState(p.entities.find((e) => e.id !== entity.id)?.id || ''),
    [visibility, setVisibility] = useState<'public' | 'private'>('private'),
    [stance, setStance] = useState<Knowledge['stance']>('believes')
  function save(event: React.FormEvent) {
    event.preventDefault()
    store.mutate((p) => {
      if (kind === 'fact')
        p.facts.push({
          id: uid(),
          subjectId: entity.id,
          predicate: label,
          object: value,
          visibility,
          knownTo: [],
          status: 'Canon',
          provenance: { kind: 'author', note: '' },
        })
      if (kind === 'relationship')
        p.relationships.push({
          id: uid(),
          from: entity.id,
          to: target,
          label,
          description: value,
          visibility,
          knownTo: [],
          status: 'Canon',
          confidence: 1,
          start: '',
          end: '',
          provenance: { kind: 'author', note: '' },
        } satisfies Relationship)
      if (kind === 'knowledge')
        p.knowledge.push({
          id: uid(),
          entityId: entity.id,
          claim: value,
          stance,
          confidence: 0.8,
          source: label,
        })
    })
    onClose()
    store.notify('A new detail saved.')
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title={
        kind === 'fact'
          ? 'A truth, or a secret'
          : kind === 'relationship'
            ? 'Make a connection'
            : 'A character’s account'
      }
      description={`A new detail for ${entity.name}.`}
    >
      <form className="form-stack" onSubmit={save}>
        {kind === 'relationship' && (
          <Field label="Connected to">
            <select value={target} onChange={(e) => setTarget(e.target.value)} required>
              <option value="" disabled>
                Choose a world element
              </option>
              {p.entities
                .filter((e) => e.id !== entity.id)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {kind === 'knowledge' && (
          <Field label="How do they hold this belief?">
            <select
              value={stance}
              onChange={(e) => setStance(e.target.value as Knowledge['stance'])}
            >
              {stances.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field
          label={
            kind === 'fact'
              ? 'About'
              : kind === 'relationship'
                ? 'Relationship'
                : 'Source (optional)'
          }
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={
              kind === 'fact'
                ? 'Hidden motive, current role, origin…'
                : kind === 'relationship'
                  ? 'lives in, friend of, serves…'
                  : 'A letter, a conversation, a memory…'
            }
            required={kind !== 'knowledge'}
            autoFocus
            maxLength={500}
          />
        </Field>
        <Field
          label={
            kind === 'knowledge'
              ? 'What do they believe?'
              : kind === 'relationship'
                ? 'A little context (optional)'
                : 'The fact'
          }
        >
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            required={kind !== 'relationship'}
            maxLength={500}
          />
        </Field>
        {kind !== 'knowledge' && (
          <Field label="Who can know this?">
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
            >
              <option value="private">A secret — author only, until explicitly shared</option>
              <option value="public">Public knowledge in this world</option>
            </select>
          </Field>
        )}
        <div className="dialog-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button>
            <Check size={16} />
            Save detail
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
