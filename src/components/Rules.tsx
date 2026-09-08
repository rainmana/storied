import { useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useStore } from '../lib/store'
import { download } from '../lib/utils'
import { type Adventure } from '../domain/schema'
import { type CheckInput, type MechanicalFrame, type RuleSystem } from '../domain/rules-schema'
import {
  MAX_RULESET_BYTES,
  parseRuleSystem,
  installRuleSystem,
  setRuleSystemEnabled,
  removeRuleSystem,
  activateRuleSystem,
  activeRuleSystem,
  mechanicalPosition,
  mechanicalFrame,
  initialRuleValues,
  derivedRuleValue,
  saveMechanicalValues,
  exampleRuleSystem,
  mechanicalTicket,
  previewMechanicalCheck,
  resolveMechanicalCheck,
} from '../domain/rules'
import { Field } from './common'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'

export function RuleSettings() {
  const store = useStore(),
    p = store.project,
    file = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<RuleSystem | null>(null),
    [error, setError] = useState(''),
    [removing, setRemoving] = useState('')
  if (!p) return null
  return (
    <section className="settings-section" aria-label="Optional rule layers">
      <div className="settings-section-title">
        <SlidersHorizontal size={22} />
        <div>
          <h2>Optional rule layers</h2>
          <p>Add a few constraints to an experience. Your world needs no ruleset to work.</p>
        </div>
      </div>
      <p className="small muted">
        Install a portable .storysystem file, enable it for this world, then choose it explicitly in
        Play. Rulesets provide numeric attributes, resources, and simple derived values. Play offers
        an optional six-sided check using those values. Imported files never run code.
      </p>
      <div className="button-row">
        <Button variant="secondary" onClick={() => file.current?.click()}>
          Import ruleset
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            download('small-steps.storysystem', JSON.stringify(exampleRuleSystem, null, 2))
          }
        >
          Download example ruleset
        </Button>
        <a className="text-button" href="/rules/lantern-crossing.storysystem" download>
          Download Lantern crossing
        </a>
      </div>
      <input
        ref={file}
        className="sr-only"
        type="file"
        accept=".storysystem,.json"
        aria-label="Ruleset file"
        onChange={async (e) => {
          const selected = e.target.files?.[0]
          e.target.value = ''
          if (!selected) return
          const projectId = p.id
          setError('')
          try {
            if (selected.size > MAX_RULESET_BYTES)
              throw new Error('Choose a ruleset smaller than 64 KB.')
            const definition = parseRuleSystem(await selected.text())
            if (useStore.getState().project?.id === projectId) setPreview(definition)
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
          }
        }}
      />
      {error && <p role="alert">{error}</p>}
      {p.ruleSystems.map((binding) => (
        <article className="rule-binding" key={binding.definition.id}>
          <h3>
            {binding.definition.name} <small className="muted">{binding.definition.version}</small>
          </h3>
          <p>{binding.definition.description}</p>
          <label className="studio-check">
            <input
              type="checkbox"
              checked={binding.enabled}
              onChange={(e) =>
                store.mutate(
                  (p) => setRuleSystemEnabled(p, binding.definition.id, e.target.checked),
                  'none',
                )
              }
            />{' '}
            Enable {binding.definition.name} in this world
          </label>
          <div className="button-row">
            <Button size="sm" variant="ghost" onClick={() => setPreview(binding.definition)}>
              Inspect ruleset
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                download(
                  `${binding.definition.id}.storysystem`,
                  JSON.stringify(binding.definition, null, 2),
                )
              }
            >
              Export ruleset
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRemoving(binding.definition.id)}>
              Remove ruleset
            </Button>
          </div>
        </article>
      ))}
      {!p.ruleSystems.length && (
        <p className="small muted">No rulesets installed. Play remains freeform.</p>
      )}
      <Dialog
        open={!!preview}
        onOpenChange={(v) => !v && setPreview(null)}
        title="Inspect ruleset"
        description="This is validated data. Importing it makes no network request and does not activate mechanics."
      >
        {preview && (
          <div className="form-stack">
            <h3>
              {preview.name} · {preview.version}
            </h3>
            <p>{preview.description}</p>
            <p className="small muted">
              {preview.id} · {preview.author} · {preview.license}
            </p>
            <ul>
              {preview.fields.map((f) => (
                <li key={f.id}>
                  <strong>{f.label}</strong> ({f.id}):{' '}
                  {f.kind === 'derived'
                    ? `${f.attribute} + ${f.amount}`
                    : f.kind === 'resource'
                      ? `${f.initial} / ${f.max}`
                      : `${f.min} to ${f.max}; starts at ${f.initial}`}
                </li>
              ))}
            </ul>
            {!p.ruleSystems.some((s) => s.definition.id === preview.id) && (
              <Button
                onClick={() => {
                  if (store.mutate((p) => installRuleSystem(p, preview), 'none')) {
                    setPreview(null)
                    store.notify('Ruleset installed, disabled. Enable it when you want to use it.')
                  }
                }}
              >
                Install in this world
              </Button>
            )}
          </div>
        )}
      </Dialog>
      <Dialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving('')}
        title="Remove this ruleset?"
        description="Your world, writing, history, and mechanical snapshots stay in the project. Saved state remains readable. Reinstall the exact original ruleset to edit it again."
      >
        <Button
          onClick={() => {
            if (store.mutate((p) => removeRuleSystem(p, removing), 'none')) setRemoving('')
          }}
        >
          Remove and keep saved state
        </Button>
      </Dialog>
    </section>
  )
}

function StateValues({
  frame,
  entityId,
  evaluate,
}: {
  frame: MechanicalFrame
  entityId: string
  evaluate: boolean
}) {
  const entity = frame.entities.find((e) => e.entityId === entityId)!
  return (
    <dl className="rule-values">
      {frame.system.fields.map((f) => (
        <div key={f.id}>
          <dt>{f.label}</dt>
          <dd>
            {f.kind === 'derived'
              ? evaluate
                ? derivedRuleValue(frame.system, f.id, entity.values)
                : 'Unavailable while inactive'
              : f.kind === 'resource'
                ? `${entity.values[f.id]} / ${f.max}`
                : entity.values[f.id]}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function PlayRules({ adventure: a, busy }: { adventure: Adventure; busy: boolean }) {
  const store = useStore(),
    p = store.project!,
    frames = mechanicalPosition(a).mechanics || [],
    active = activeRuleSystem(p, a)
  const frame = active && mechanicalFrame(a, active.id)
  const [editing, setEditing] = useState(false),
    [checking, setChecking] = useState(false)
  if (!p.ruleSystems.length && !frames.length && !a.activeRuleSystemId) return null
  return (
    <section className="scene-context-card rule-panel" aria-label="Play rules">
      <details open={!!a.activeRuleSystemId}>
        <summary>
          Rules · {active ? active.name : a.activeRuleSystemId ? 'Unavailable' : 'Off'}
        </summary>
        <Field
          label="Rules for this experience"
          hint="One ruleset at a time. Selecting Off preserves every saved value."
        >
          <select
            value={a.activeRuleSystemId || ''}
            disabled={busy}
            onChange={(e) =>
              store.mutate((p) => activateRuleSystem(p, a.id, e.target.value || undefined), 'none')
            }
          >
            <option value="">Off — freeform</option>
            {p.ruleSystems
              .filter((s) => s.enabled)
              .map((s) => (
                <option key={s.definition.id} value={s.definition.id}>
                  {s.definition.name}
                </option>
              ))}
            {a.activeRuleSystemId &&
              !p.ruleSystems.some((s) => s.enabled && s.definition.id === a.activeRuleSystemId) && (
                <option value={a.activeRuleSystemId}>Unavailable ruleset</option>
              )}
          </select>
        </Field>
        {!active && (
          <p className="small muted">
            Mechanics are off or unavailable. Enable an installed ruleset in Settings to use it
            here. Freeform Play remains available.
          </p>
        )}
        {active && (
          <>
            <p className="small muted">
              These values belong to this branch position and scene time. You set them explicitly;
              the storyteller neither sees them nor changes them.
            </p>
            {frame?.entities.map((e) => (
              <div key={e.entityId} className="rule-binding">
                <button className="text-button" onClick={() => store.navigate('World', e.entityId)}>
                  {p.entities.find((v) => v.id === e.entityId)?.name}
                </button>
                <StateValues frame={frame} entityId={e.entityId} evaluate />
              </div>
            ))}
            <div className="button-row">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || !p.entities.length}
                onClick={() => setEditing(true)}
              >
                Edit mechanical state
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={
                  busy ||
                  !frame?.entities.length ||
                  !active.fields.some((f) => f.kind !== 'resource')
                }
                onClick={() => setChecking(true)}
              >
                Make a check
              </Button>
            </div>
            {frame && <CheckHistory frame={frame} adventure={a} />}
            {!frame && (
              <p className="small muted">
                No state set at this story position and time. Values in the editor are starting
                suggestions until you save.
              </p>
            )}
          </>
        )}
        {!!frames.length && (
          <details className="rule-history">
            <summary>Saved mechanical snapshots</summary>
            {frames.map((f) => (
              <article key={JSON.stringify([f.system.id, f.eventId])} className="rule-binding">
                <h4>
                  {f.system.name} · {f.system.version}
                </h4>
                <p className="small muted">
                  {f.eventId ? p.events.find((e) => e.id === f.eventId)?.title : 'Unspecified time'}{' '}
                  · {a.headId ? 'Current turn' : 'Beginning of this adventure'}
                </p>
                {f.entities.map((e) => (
                  <div key={e.entityId}>
                    <strong>{p.entities.find((v) => v.id === e.entityId)?.name}</strong>
                    <StateValues
                      frame={f}
                      entityId={e.entityId}
                      evaluate={
                        !!active && active.id === f.system.id && f.eventId === a.currentEventId
                      }
                    />
                    <small className="muted">Recorded author edit · {e.updatedAt}</small>
                  </div>
                ))}
                {f !== frame && <CheckHistory frame={f} adventure={a} />}
              </article>
            ))}
          </details>
        )}
      </details>
      {editing && active && (
        <MechanicalEditor
          key={JSON.stringify([p.id, a.id, a.headId, a.currentEventId, active.id])}
          adventure={a}
          system={active}
          onClose={() => setEditing(false)}
        />
      )}
      {checking && active && frame && (
        <CheckEditor
          key={JSON.stringify([p.id, a.id, active.id])}
          adventure={a}
          frame={frame}
          onClose={() => setChecking(false)}
        />
      )}
    </section>
  )
}

function MechanicalEditor({
  adventure: a,
  system,
  onClose,
}: {
  adventure: Adventure
  system: RuleSystem
  onClose: () => void
}) {
  const store = useStore(),
    p = store.project!,
    frame = mechanicalFrame(a, system.id)
  const [expected] = useState(() => mechanicalTicket(p, a))
  const [entityId, setEntityId] = useState(a.scenario.characterId)
  const forEntity = (id: string) =>
    Object.fromEntries(
      Object.entries(
        frame?.entities.find((e) => e.entityId === id)?.values || initialRuleValues(system),
      ).map(([k, v]) => [k, String(v)]),
    )
  const [values, setValues] = useState(forEntity(entityId))
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="Edit mechanical state"
      description="Save explicit values for this entity at the current branch position and time. This does not change canon, knowledge, or prose."
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (
            store.mutate(
              (p) =>
                saveMechanicalValues(
                  p,
                  a.id,
                  entityId,
                  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])),
                  expected,
                ),
              'none',
            )
          )
            onClose()
        }}
      >
        <Field label="World entity">
          <select
            value={entityId}
            onChange={(e) => {
              setEntityId(e.target.value)
              setValues(forEntity(e.target.value))
            }}
          >
            {p.entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        {system.fields
          .filter((f) => f.kind !== 'derived')
          .map((f) => (
            <Field
              key={f.id}
              label={f.label}
              hint={
                f.kind === 'resource' ? `Current value; capacity ${f.max}` : `${f.min} to ${f.max}`
              }
            >
              <input
                type="number"
                required
                step={1}
                min={f.kind === 'resource' ? 0 : f.min}
                max={f.max}
                value={values[f.id] ?? ''}
                onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
              />
            </Field>
          ))}
        {system.fields
          .filter((f) => f.kind === 'derived')
          .map((f) => (
            <p className="small muted" key={f.id}>
              {f.label} is calculated as {system.fields.find((s) => s.id === f.attribute)?.label} +{' '}
              {f.amount}.
            </p>
          ))}
        <Button type="submit">Save mechanical state</Button>
      </form>
    </Dialog>
  )
}

function CheckHistory({ frame, adventure }: { frame: MechanicalFrame; adventure: Adventure }) {
  if (!frame.checks?.length) return null
  return (
    <details className="rule-history" open>
      <summary>Check history ({frame.checks.length})</summary>
      {[...frame.checks].reverse().map((check) => (
        <article className="rule-binding" key={check.id} aria-label="Recorded check">
          <h4>
            {check.entityName} · {check.outcome === 'met' ? 'Target met' : 'Below target'}
          </h4>
          <p>{check.input.approach}</p>
          <p className="check-result">
            {check.die} + {check.modifier} = {check.total} · target {check.input.target}
          </p>
          <p className="small">
            Agreed {check.outcome === 'met' ? 'success' : 'setback'}:{' '}
            {check.outcome === 'met' ? check.input.onSuccess : check.input.onSetback}
          </p>
          {check.input.cost && (
            <p className="small">
              {frame.system.fields.find((f) => f.id === check.input.cost!.resourceId)?.label}:{' '}
              {check.before[check.input.cost.resourceId]} →{' '}
              {check.after[check.input.cost.resourceId]} · agreed cost {check.input.cost.amount}
            </p>
          )}
          <details className="small">
            <summary>Recorded inputs and source</summary>
            <p>
              {frame.system.name} {frame.system.version} · one six-sided roll +{' '}
              {frame.system.fields.find((f) => f.id === check.input.attributeId)?.label}
            </p>
            <p>On success: {check.input.onSuccess}</p>
            <p>On setback: {check.input.onSetback}</p>
            <p>
              {check.sourceTurnId
                ? `Source turn: ${check.sourceTurnId}`
                : 'Source: beginning of this adventure'}
              {check.sourceTurnId !== adventure.headId ? ' · inherited copy' : ''}
            </p>
            <p>
              Author initiated · {check.createdAt} · {check.id}
            </p>
            <p>
              Saved outcome; viewing it never rolls again. This record does not establish canon.
            </p>
          </details>
        </article>
      ))}
    </details>
  )
}

function CheckEditor({
  adventure: a,
  frame,
  onClose,
}: {
  adventure: Adventure
  frame: MechanicalFrame
  onClose: () => void
}) {
  const store = useStore(),
    p = store.project!
  const [source] = useState(() => ({
    frame: structuredClone(frame),
    ticket: mechanicalTicket(p, a),
  }))
  const system = source.frame.system,
    attributes = system.fields.filter((f) => f.kind !== 'resource'),
    resources = system.fields.filter((f) => f.kind === 'resource')
  const [entityId, setEntityId] = useState(source.frame.entities[0].entityId),
    [attributeId, setAttributeId] = useState(attributes[0].id),
    [target, setTarget] = useState('6'),
    [approach, setApproach] = useState(''),
    [onSuccess, setOnSuccess] = useState(''),
    [onSetback, setOnSetback] = useState(''),
    [resourceId, setResourceId] = useState(''),
    [amount, setAmount] = useState('1'),
    [review, setReview] = useState<CheckInput | null>(null),
    [error, setError] = useState('')
  const values = source.frame.entities.find((e) => e.entityId === entityId)!.values
  const preview = review ? previewMechanicalCheck(system, values, review) : null
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={review ? 'Review this check' : 'Set up a check'}
      description="Choose an approach and agree on the stakes before rolling. The result and any agreed cost are saved together. No story or canon is written for you."
    >
      {review && preview ? (
        <div className="form-stack">
          <h3>{p.entities.find((e) => e.id === entityId)?.name}</h3>
          <p>{review.approach}</p>
          <p className="check-result">
            One six-sided roll + {preview.modifier} (
            {attributes.find((f) => f.id === review.attributeId)?.label}) ≥ {review.target}
          </p>
          <p>On success: {review.onSuccess}</p>
          <p>On setback: {review.onSetback}</p>
          {review.cost ? (
            <p>
              Spend {review.cost.amount}{' '}
              {resources.find((f) => f.id === review.cost!.resourceId)?.label}:{' '}
              {values[review.cost.resourceId]} → {preview.after[review.cost.resourceId]}. This cost
              applies even if the check misses its target.
            </p>
          ) : (
            <p>No resource cost.</p>
          )}
          <p className="small muted">
            Resolving accepts this cost and saves one result. Closing before resolving changes
            nothing. Start another check explicitly if you want another attempt.
          </p>
          <div className="button-row">
            <Button
              onClick={() => {
                if (
                  store.mutate((p) => {
                    resolveMechanicalCheck(p, a.id, review, source.ticket)
                  }, 'none')
                ) {
                  onClose()
                  store.notify('Check recorded. Your story and canon are unchanged.')
                }
              }}
            >
              Resolve and record check
            </Button>
            <Button variant="ghost" onClick={() => setReview(null)}>
              Change setup
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault()
            setError('')
            try {
              const input: CheckInput = {
                entityId,
                attributeId,
                target: Number(target),
                approach: approach.trim(),
                onSuccess: onSuccess.trim(),
                onSetback: onSetback.trim(),
                ...(resourceId ? { cost: { resourceId, amount: Number(amount) } } : {}),
              }
              previewMechanicalCheck(system, values, input)
              setReview(input)
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            }
          }}
        >
          <Field label="Check entity">
            <select value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              {source.frame.entities.map((e) => (
                <option key={e.entityId} value={e.entityId}>
                  {p.entities.find((v) => v.id === e.entityId)?.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Approach">
            <textarea
              required
              maxLength={1000}
              value={approach}
              onChange={(e) => setApproach(e.target.value)}
              placeholder="Follow Nera’s channel markers across the flats."
            />
          </Field>
          <div className="form-grid">
            <Field label="Check attribute">
              <select value={attributeId} onChange={(e) => setAttributeId(e.target.value)}>
                {attributes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Target" hint="Roll + attribute must meet or exceed this number.">
              <input
                type="number"
                required
                step={1}
                min={-1_000_000}
                max={1_000_006}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </Field>
          </div>
          <Field label="On success">
            <textarea
              required
              maxLength={1000}
              value={onSuccess}
              onChange={(e) => setOnSuccess(e.target.value)}
              placeholder="Reach the lantern before the path floods."
            />
          </Field>
          <Field label="On setback">
            <textarea
              required
              maxLength={1000}
              value={onSetback}
              onChange={(e) => setOnSetback(e.target.value)}
              placeholder="The channel blocks the way; seek another route."
            />
          </Field>
          <Field
            label="Resource to spend"
            hint="Optional cost for making the attempt, whatever the result."
          >
            <select value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
              <option value="">None</option>
              {resources.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label} ({values[f.id]} available)
                </option>
              ))}
            </select>
          </Field>
          {resourceId && (
            <Field label="Cost">
              <input
                type="number"
                required
                step={1}
                min={1}
                max={values[resourceId]}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
          )}
          {error && <p role="alert">{error}</p>}
          <Button type="submit">Review check</Button>
        </form>
      )}
    </Dialog>
  )
}
