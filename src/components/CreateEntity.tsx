import { useState } from 'react'
import { Plus } from 'lucide-react'
import { entityTypes, newEntity, type EntityType } from '../domain/schema'
import { useStore } from '../lib/store'
import { AuthorAssist } from './AuthorAssist'
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
    [summary, setSummary] = useState('')
  const store = useStore()
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
          <Field
            label="Name"
            action={
              <AuthorAssist
                key={type + '-name'}
                target={{ name, type, field: 'Name', value: name, maxLength: 500 }}
                onApply={setName}
              />
            }
          >
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
          action={
            <AuthorAssist
              key={type + '-summary'}
              target={{ name, type, field: 'In a few words', value: summary, maxLength: 500000 }}
              onApply={setSummary}
            />
          }
          hint="This summary is in-world information. Private notes and secrets have their own space."
        >
          <textarea
            rows={4}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What makes this part of your world interesting?"
          />
        </Field>
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
