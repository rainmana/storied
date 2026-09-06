import { useState } from 'react'
import { Sparkles, Plus, Check } from 'lucide-react'
import { entityTypes, newEntity, type EntityType } from '../domain/schema'
import { useStore } from '../lib/store'
import { completeLocally, useModels } from '../lib/models'
import { z } from 'zod'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Field } from './common'

export function CreateEntity({
  open,
  onClose,
  initialType = 'Character',
}: {
  open: boolean
  onClose: () => void
  initialType?: EntityType
}) {
  const [type, setType] = useState<EntityType>(initialType),
    [name, setName] = useState(''),
    [summary, setSummary] = useState(''),
    [idea, setIdea] = useState(''),
    [error, setError] = useState(''),
    [proposal, setProposal] = useState<{ name: string; summary: string } | null>(null)
  const [acceptName, setAcceptName] = useState(true),
    [acceptSummary, setAcceptSummary] = useState(true)
  const store = useStore(),
    models = useModels()
  async function suggest() {
    setError('')
    try {
      const raw = await completeLocally(
        `Propose a ${type} for this worldbuilding idea: ${idea}. Return ONLY JSON with keys name and summary. A concise name, and a 2 sentence summary.`,
        'worldbuilder',
      )
      const parsed = z
        .object({ name: z.string().min(1).max(500), summary: z.string().max(5000) })
        .strict()
        .parse(JSON.parse(raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')))
      setProposal(parsed)
    } catch (e) {
      setError(`The suggestion could not be read. ${String(e)}`)
    }
  }
  function save(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    const entity = newEntity(type, name, summary)
    const template = store.project?.templates.find((t) => t.type === type)
    if (template) entity.fields = Object.fromEntries(template.fields.map((f) => [f, '']))
    store.mutate((p) => p.entities.unshift(entity))
    store.navigate('World', entity.id)
    store.notify(`${name} added to your world.`)
    onClose()
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
      title="Make something new"
      description="A person, a place, a possibility. Start small; let it grow."
    >
      <form onSubmit={save} className="form-stack">
        <div className="field-row">
          <Field label="What are you making?">
            <select value={type} onChange={(e) => setType(e.target.value as EntityType)}>
              {entityTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Name">
            <input
              autoFocus
              value={name}
              maxLength={500}
              placeholder={type === 'Character' ? 'Someone worth knowing' : 'Give it a name'}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
        </div>
        <Field
          label="In a few words"
          hint="This summary is in-world information. Private notes and secrets have their own space."
        >
          <textarea
            rows={4}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What makes this part of your world interesting?"
          />
        </Field>
        <details className="idea-disclosure">
          <summary>
            <Sparkles size={16} /> Start from an idea
          </summary>
          <Field label="Describe what you have in mind">
            <textarea
              rows={3}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="A river city built vertically into black cliffs…"
            />
          </Field>
          {models.loadedId ? (
            <Button
              type="button"
              variant="secondary"
              onClick={suggest}
              disabled={!idea.trim() || models.busy}
            >
              <Sparkles size={15} /> Propose with local AI
            </Button>
          ) : (
            <p className="muted small">
              Load a storyteller in Local models to turn an idea into an editable proposal.
            </p>
          )}
        </details>
        {proposal && (
          <div className="proposal-card">
            <h4>A possibility, for your review</h4>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={acceptName}
                onChange={(e) => setAcceptName(e.target.checked)}
              />
              {proposal.name}
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={acceptSummary}
                onChange={(e) => setAcceptSummary(e.target.checked)}
              />
              {proposal.summary}
            </label>
            <div className="button-row">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (acceptName) setName(proposal.name)
                  if (acceptSummary) setSummary(proposal.summary)
                  setProposal(null)
                }}
              >
                <Check size={14} />
                Use selected fields
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setProposal(null)}>
                Discard
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            <Plus size={16} /> Add to world
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
