import { useState } from 'react'
import { Check, FileText, Plus, Sparkles, Square, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { useInferenceStatus } from '../lib/inference'
import { runManuscript, stopStudioRun, useStudioActivity } from '../lib/manuscript-runner'
import { createManuscriptRun, runIsStale, studioRequest } from '../domain/manuscript'
import { now, uid } from '../domain/schema'
import type { ManuscriptRun } from '../domain/manuscript-schema'
import { RunInspector } from '../components/ManuscriptStudio'
import { Button } from '../components/ui/button'
import { Dialog } from '../components/ui/dialog'
import { Empty, Field, PageHeading } from '../components/common'

export function Voice() {
  const store = useStore(),
    p = store.project!,
    inference = useInferenceStatus(),
    activity = useStudioActivity()
  const [selected, setSelected] = useState(''),
    [create, setCreate] = useState(false),
    [name, setName] = useState(''),
    [sampleName, setSampleName] = useState(''),
    [sampleText, setSampleText] = useState(''),
    [showPreview, setPreview] = useState(false)
  const profile = p.studio.profiles.find((v) => v.id === selected) || p.studio.profiles[0]
  const samples = p.studio.samples.filter((s) => s.profileId === profile?.id)
  const runs = p.studio.runs
      .filter((r) => r.profileId === profile?.id)
      .slice()
      .reverse(),
    run = runs[0]
  const addSample = (name: string, text: string) => {
    if (!profile) return
    if (!text.trim() || text.length > 100000) {
      store.notify('Add 1–100,000 characters per sample.')
      return
    }
    if (
      store.mutate((p) =>
        p.studio.samples.push({
          id: uid(),
          profileId: profile.id,
          name: name.trim() || 'Writing sample',
          text,
          createdAt: now(),
        }),
      )
    ) {
      setSampleText('')
      setSampleName('')
      store.notify('Writing sample saved on this device.')
    }
  }
  const upload = async (files: FileList | null) => {
    if (!files || !profile) return
    const profileId = profile.id,
      projectId = p.id
    for (const file of Array.from(files)) {
      if (file.size > 400000 || !/\.(txt|md|markdown)$/i.test(file.name)) {
        store.notify(
          'Choose a TXT or Markdown file under 400 KB, or paste text from another document.',
        )
        continue
      }
      const text = await file.text()
      if (useStore.getState().project?.id !== projectId) break
      if (!text.trim() || text.length > 100000 || text.includes('\0')) {
        store.notify('The sample must contain readable text, up to 100,000 characters.')
        continue
      }
      store.mutate((p) => {
        if (!p.studio.profiles.some((v) => v.id === profileId))
          throw new Error('The profile changed while importing.')
        p.studio.samples.push({
          id: uid(),
          profileId,
          name: file.name.slice(0, 500),
          text,
          createdAt: now(),
        })
      })
    }
  }
  const makeRun = () =>
    createManuscriptRun(p, undefined, {
      mode: 'analyze',
      profileId: profile!.id,
      direction: profile!.description,
      start: 0,
      end: 0,
      includePrivate: false,
      includeSamples: true,
      layers: [],
    })
  let analysisPreview: ManuscriptRun | undefined,
    previewError = ''
  if (showPreview && samples.length) {
    try {
      analysisPreview = makeRun()
    } catch (e) {
      previewError = e instanceof Error ? e.message : String(e)
    }
  }
  return (
    <div className="voice-page">
      <PageHeading
        eyebrow="The way you tell it"
        title="Your voice, in your words."
        description="Writing from any topic can help. You decide which observed habits belong in your fiction."
        actions={
          <Button onClick={() => setCreate(true)}>
            <Plus size={16} />
            New voice profile
          </Button>
        }
      />
      {!profile ? (
        <Empty
          title="Bring a few pages of yourself."
          description="Add an essay, a story, a letter, or another sample. Observations stay provisional until you approve them."
          action="Create a voice profile"
          onAction={() => setCreate(true)}
        />
      ) : (
        <>
          <div className="voice-toolbar">
            <Field label="Voice profile">
              <select
                value={profile.id}
                onChange={(e) => {
                  setSelected(e.target.value)
                  setPreview(false)
                }}
              >
                {p.studio.profiles.map((v) => (
                  <option value={v.id} key={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
            <p>
              Samples and profiles are stored in this project’s local backup. They never establish
              fictional facts.
            </p>
          </div>
          <div className="voice-columns">
            <section className="voice-samples panel">
              <h2>Writing samples</h2>
              <Field label="Profile name">
                <input
                  value={profile.name}
                  maxLength={500}
                  onChange={(e) => {
                    if (e.target.value.trim())
                      store.mutate((p) => {
                        const v = p.studio.profiles.find((v) => v.id === profile.id)!
                        v.name = e.target.value
                        v.updatedAt = now()
                      })
                  }}
                />
              </Field>
              <Field label="What should this voice capture?">
                <textarea
                  value={profile.description}
                  maxLength={500}
                  rows={2}
                  onChange={(e) =>
                    store.mutate((p) => {
                      const v = p.studio.profiles.find((v) => v.id === profile.id)!
                      v.description = e.target.value
                      v.updatedAt = now()
                    })
                  }
                  placeholder="My fiction voice: dry humor, close observation, spare dialogue."
                />
              </Field>
              <label className="sample-upload">
                <FileText size={20} />
                <span>Import TXT or Markdown</span>
                <input
                  aria-label="Upload writing samples"
                  type="file"
                  accept=".txt,.md,.markdown,text/plain,text/markdown"
                  multiple
                  onChange={(e) => {
                    void upload(e.target.files)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
              <details>
                <summary>Paste a sample from another document</summary>
                <Field label="Sample title">
                  <input
                    value={sampleName}
                    maxLength={500}
                    onChange={(e) => setSampleName(e.target.value)}
                  />
                </Field>
                <Field label="Writing sample">
                  <textarea
                    rows={7}
                    maxLength={100000}
                    value={sampleText}
                    onChange={(e) => setSampleText(e.target.value)}
                  />
                </Field>
                <Button
                  size="sm"
                  disabled={!sampleText.trim()}
                  onClick={() => addSample(sampleName, sampleText)}
                >
                  Save writing sample
                </Button>
              </details>
              {samples.map((s) => (
                <details className="sample-card" key={s.id}>
                  <summary>
                    {s.name} · {s.text.length.toLocaleString()} characters
                  </summary>
                  <pre>{s.text}</pre>
                  <p className="small muted">
                    Removing a sample also removes this profile’s analysis history and preferences
                    supported by this sample. Other manuscript runs may retain excerpts previously
                    sent in their recorded requests.
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!!activity.runId}
                    onClick={() =>
                      store.mutate((p) => {
                        p.studio.samples = p.studio.samples.filter((v) => v.id !== s.id)
                        p.studio.profiles.find((v) => v.id === profile.id)!.traits =
                          p.studio.profiles
                            .find((v) => v.id === profile.id)!
                            .traits.filter((t) => !t.evidence.some((e) => e.sampleId === s.id))
                        p.studio.runs = p.studio.runs.filter((r) => r.profileId !== profile.id)
                      })
                    }
                  >
                    <Trash2 size={14} />
                    Remove sample and derived analysis
                  </Button>
                </details>
              ))}
            </section>
            <section className="voice-preferences panel">
              <h2>Notice, then choose.</h2>
              <p className="small muted">
                Analysis proposes tendencies with exact excerpts. Your approved instructions guide
                generation; they do not train a model or certify authorship.
              </p>
              <p>
                {inference.label || 'No model loaded'} · {inference.origin}
              </p>
              <p className="small muted">
                Analyze samples sends the previewed excerpts to this destination. Nothing is sent
                when you import or paste a sample.
              </p>
              <div className="button-row">
                <Button
                  disabled={
                    !samples.length || !inference.ready || inference.busy || !!activity.runId
                  }
                  onClick={() => {
                    try {
                      const next = makeRun()
                      if (store.mutate((p) => p.studio.runs.push(next)))
                        void runManuscript(p.id, next.id)
                    } catch (e) {
                      store.notify(String(e))
                    }
                  }}
                >
                  <Sparkles size={15} />
                  Analyze samples
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!samples.length}
                  onClick={() => setPreview(!showPreview)}
                >
                  Preview analysis request
                </Button>
              </div>
              {!inference.ready && (
                <button className="text-button" onClick={() => store.navigate('Settings')}>
                  Choose or load a model in Settings
                </button>
              )}
              {previewError && <p role="alert">{previewError}</p>}
              {analysisPreview && (
                <details open>
                  <summary>Exact analysis input</summary>
                  <pre>{studioRequest(analysisPreview, !inference.connection).system}</pre>
                  <pre>{studioRequest(analysisPreview, !inference.connection).prompt}</pre>
                  {analysisPreview.omissions.map((note, i) => (
                    <p key={i}>{note}</p>
                  ))}
                </details>
              )}
              {run && (
                <section aria-label="Voice analysis result">
                  <p className="eyebrow">Analysis · {run.status}</p>
                  {activity.runId === run.id && (
                    <Button size="sm" onClick={() => stopStudioRun(run.id)}>
                      <Square size={14} />
                      Stop analysis
                    </Button>
                  )}
                  {run.error && <p role="alert">{run.error}</p>}
                  {runIsStale(p, run) && run.status !== 'accepted' && (
                    <p className="review-coverage">
                      The samples or project changed. Analyze again to use current sources.
                    </p>
                  )}
                  {!runIsStale(p, run) &&
                    ['paused', 'running', 'ready'].includes(run.status) &&
                    activity.runId !== run.id && (
                      <Button
                        size="sm"
                        disabled={!inference.ready || inference.busy}
                        onClick={() => {
                          if (
                            store.mutate((p) => {
                              p.studio.runs.find((r) => r.id === run.id)!.status = 'ready'
                            })
                          )
                            void runManuscript(p.id, run.id)
                        }}
                      >
                        Resume voice analysis
                      </Button>
                    )}
                  {run.status === 'review' && <ObservationChoices key={run.id} run={run} />}
                  <RunInspector run={run} />
                </section>
              )}
              <h3>Approved and saved preferences</h3>
              {!profile.traits.length && (
                <p className="small muted">
                  No preferences yet. Analyze a sample, or add an instruction yourself.
                </p>
              )}
              {profile.traits.map((t) => (
                <details className="voice-trait" key={t.id}>
                  <summary>
                    {t.instruction} · {t.status}
                  </summary>
                  <Field label="Voice instruction">
                    <textarea
                      rows={3}
                      value={t.instruction}
                      maxLength={500}
                      onChange={(e) => {
                        if (e.target.value.trim())
                          store.mutate((p) => {
                            p.studio.profiles
                              .find((v) => v.id === profile.id)!
                              .traits.find((v) => v.id === t.id)!.instruction = e.target.value
                          })
                      }}
                    />
                  </Field>
                  <Field label="Preference status">
                    <select
                      value={t.status}
                      onChange={(e) =>
                        store.mutate((p) => {
                          p.studio.profiles
                            .find((v) => v.id === profile.id)!
                            .traits.find((v) => v.id === t.id)!.status = e.target
                            .value as typeof t.status
                        })
                      }
                    >
                      <option value="approved">Approved</option>
                      <option value="suggested">Provisional</option>
                      <option value="rejected">Do not use</option>
                    </select>
                  </Field>
                  {t.evidence.map((e, i) => (
                    <blockquote key={i}>
                      <q>{e.quote}</q>
                      <cite>{samples.find((s) => s.id === e.sampleId)?.name}</cite>
                    </blockquote>
                  ))}
                </details>
              ))}
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  store.mutate((p) =>
                    p.studio.profiles
                      .find((v) => v.id === profile.id)!
                      .traits.push({
                        id: uid(),
                        category: 'other',
                        instruction: 'Write an instruction in your own words.',
                        status: 'suggested',
                        evidence: [],
                      }),
                  )
                }
              >
                <Plus size={14} />
                Add my own preference
              </Button>
              <details className="voice-graph">
                <summary>Explore the prose graph</summary>
                <p className="small muted">
                  These links describe evidence and your choices. They are separate from story
                  canon.
                </p>
                <ul>
                  {profile.traits.map((t) => (
                    <li key={t.id}>
                      <div className="voice-graph-node">
                        <span className="eyebrow">Profile</span>
                        <strong>{profile.name}</strong>
                      </div>
                      <div className="voice-graph-node">
                        <span className="eyebrow">
                          {t.status} · {t.category}
                        </span>
                        <span>{t.instruction}</span>
                      </div>
                      <div className="voice-graph-node">
                        <span className="eyebrow">Evidence</span>
                        {t.evidence.length ? (
                          t.evidence.map((e, i) => (
                            <div key={i}>
                              <q>{e.quote}</q>
                              <br />
                              <strong>{samples.find((s) => s.id === e.sampleId)?.name}</strong>
                            </div>
                          ))
                        ) : (
                          <span>Your own instruction</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          </div>
        </>
      )}
      <Dialog
        open={create}
        onOpenChange={setCreate}
        title="A voice for this work"
        description="Keep different genres or projects in separate profiles."
      >
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault()
            const id = uid()
            if (
              store.mutate((p) =>
                p.studio.profiles.push({
                  id,
                  name: name.trim(),
                  description: '',
                  traits: [],
                  updatedAt: now(),
                }),
              )
            ) {
              setSelected(id)
              setCreate(false)
              setName('')
            }
          }}
        >
          <Field label="New voice profile name">
            <input
              value={name}
              maxLength={500}
              required
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Button disabled={!name.trim()}>Create profile</Button>
        </form>
      </Dialog>
    </div>
  )
}
function ObservationChoices({ run }: { run: ManuscriptRun }) {
  const store = useStore(),
    p = store.project!,
    [choices, setChoices] = useState(
      run.observations.map((o) => ({ ...o, status: 'approved' as 'approved' | 'rejected' })),
    )
  return (
    <div>
      {choices.map((o, i) => (
        <div className="voice-observation" key={o.id}>
          <label className="studio-check">
            <input
              type="checkbox"
              checked={o.status === 'approved'}
              onChange={(e) =>
                setChoices(
                  choices.map((v, j) =>
                    j === i ? { ...v, status: e.target.checked ? 'approved' : 'rejected' } : v,
                  ),
                )
              }
            />
            Use this {o.category} preference
          </label>
          <Field label={`Proposed preference ${i + 1}`}>
            <textarea
              value={o.instruction}
              maxLength={500}
              rows={2}
              onChange={(e) =>
                setChoices(
                  choices.map((v, j) => (j === i ? { ...v, instruction: e.target.value } : v)),
                )
              }
            />
          </Field>
          {o.evidence.map((e, i) => (
            <blockquote key={i}>
              <q>{e.quote}</q>
              <cite>{run.sources.find((s) => s.id === e.sampleId)?.title}</cite>
            </blockquote>
          ))}
        </div>
      ))}
      {!choices.length ? (
        <p>
          No supported tendencies returned. Try additional examples or add your own preferences.
        </p>
      ) : (
        <Button
          disabled={runIsStale(p, run) || choices.some((o) => !o.instruction.trim())}
          onClick={() => {
            if (
              store.mutate((p) => {
                const current = p.studio.runs.find((r) => r.id === run.id)!
                if (current.status !== 'review' || runIsStale(p, current))
                  throw new Error('The analysis is stale. Analyze current samples again.')
                const profile = p.studio.profiles.find((v) => v.id === run.profileId)!
                profile.traits.push(...choices)
                profile.updatedAt = now()
                current.status = 'accepted'
                current.boundaries.push({
                  id: uid(),
                  actor: 'author',
                  kind: 'decision',
                  text: JSON.stringify(choices),
                  createdAt: now(),
                })
              })
            )
              store.notify('Your selected voice preferences are saved.')
          }}
        >
          <Check size={14} />
          Save selected preferences
        </Button>
      )}
    </div>
  )
}
