import {
  mechanicsSchema,
  ruleSystemSchema,
  ruleSystemsSchema,
  checkInputSchema,
  mechanicalCheckSchema,
  type CheckInput,
  type MechanicalCheck,
  type MechanicalFrame,
  type RuleSystem,
} from './rules-schema'
import { now, uid, type Adventure, type Project } from './schema'

export const MAX_RULESET_BYTES = 64 * 1024
export function parseRuleSystem(text: string): RuleSystem {
  if (new TextEncoder().encode(text).byteLength > MAX_RULESET_BYTES)
    throw new Error('Choose a ruleset smaller than 64 KB.')
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('This is not a ruleset JSON file.')
  }
  const parsed = ruleSystemSchema.safeParse(data)
  if (!parsed.success)
    throw new Error(`Unsupported or invalid ruleset: ${parsed.error.issues[0]?.message}`)
  return parsed.data
}
export function mechanicalPosition(a: Adventure) {
  if (!a.headId) return a
  const turn = a.turns.find((t) => t.id === a.headId)
  if (!turn) throw new Error('The mechanical state has no story position.')
  return turn
}
export const sameSystem = (a: RuleSystem, b: RuleSystem) => JSON.stringify(a) === JSON.stringify(b)
export const mechanicalFrame = (a: Adventure, systemId: string) =>
  mechanicalPosition(a).mechanics?.find(
    (s) => s.system.id === systemId && s.eventId === a.currentEventId,
  )
export function activeRuleSystem(p: Project, a: Adventure) {
  const binding = p.ruleSystems.find((s) => s.definition.id === a.activeRuleSystemId && s.enabled)
  const frame = a.activeRuleSystemId && mechanicalFrame(a, a.activeRuleSystemId)
  return binding && (!frame || sameSystem(frame.system, binding.definition))
    ? binding.definition
    : undefined
}
export function installRuleSystem(p: Project, input: RuleSystem) {
  const definition = ruleSystemSchema.parse(input)
  if (p.ruleSystems.some((s) => s.definition.id === definition.id))
    throw new Error(
      'This ruleset is already installed. Remove it before importing another version.',
    )
  if (p.ruleSystems.length >= 8) throw new Error('A world can install up to eight rulesets.')
  for (const a of p.adventures)
    for (const position of [a, ...a.turns])
      for (const frame of position.mechanics || []) {
        if (frame.system.id === definition.id && !sameSystem(frame.system, definition))
          throw new Error(
            'Saved state uses a different definition. Reinstall the exact original; ruleset upgrades need an explicit migration.',
          )
      }
  p.ruleSystems.push({ definition, enabled: false })
}
export function setRuleSystemEnabled(p: Project, id: string, enabled: boolean) {
  const binding = p.ruleSystems.find((s) => s.definition.id === id)
  if (!binding) throw new Error('The ruleset is missing.')
  binding.enabled = enabled
  if (!enabled)
    for (const a of p.adventures) if (a.activeRuleSystemId === id) delete a.activeRuleSystemId
}
export function removeRuleSystem(p: Project, id: string) {
  setRuleSystemEnabled(p, id, false)
  p.ruleSystems = p.ruleSystems.filter((s) => s.definition.id !== id)
}
export function activateRuleSystem(p: Project, adventureId: string, id?: string) {
  const a = p.adventures.find((a) => a.id === adventureId)
  if (!a) throw new Error('Choose an adventure.')
  if (id && !p.ruleSystems.some((s) => s.definition.id === id && s.enabled))
    throw new Error('Enable this ruleset in Settings before activating it.')
  if (id) a.activeRuleSystemId = id
  else delete a.activeRuleSystemId
}
export function initialRuleValues(system: RuleSystem) {
  return Object.fromEntries(
    system.fields.filter((f) => f.kind !== 'derived').map((f) => [f.id, f.initial]),
  )
}
function validateValues(system: RuleSystem, values: Record<string, number>) {
  const fields = system.fields.filter((f) => f.kind !== 'derived')
  if (Object.keys(values).length !== fields.length)
    throw new Error('Mechanical values must match the ruleset fields.')
  for (const f of fields) {
    const value = values[f.id]
    if (!Number.isInteger(value) || value < (f.kind === 'resource' ? 0 : f.min) || value > f.max)
      throw new Error(`${f.label} is outside its allowed bounds.`)
  }
}
export function mechanicalTicket(p: Project, a: Adventure) {
  const system = activeRuleSystem(p, a)
  if (!system) throw new Error('Activate an available ruleset first.')
  return {
    projectId: p.id,
    adventureId: a.id,
    worldRevision: p.worldRevision,
    system: JSON.stringify(system),
    headId: a.headId,
    eventId: a.currentEventId,
    frame: JSON.stringify(mechanicalFrame(a, system.id) || null),
  }
}
function checkedMechanicalState(
  p: Project,
  adventureId: string,
  expected: ReturnType<typeof mechanicalTicket>,
) {
  const a = p.adventures.find((a) => a.id === adventureId)
  if (
    p.id !== expected.projectId ||
    adventureId !== expected.adventureId ||
    !a ||
    a.headId !== expected.headId ||
    a.currentEventId !== expected.eventId
  )
    throw new Error('The story position changed. Reopen the mechanical editor.')
  const system = activeRuleSystem(p, a)
  if (!system)
    throw new Error('Explicitly activate an available ruleset before changing mechanical state.')
  if (JSON.stringify(system) !== expected.system)
    throw new Error('The active ruleset changed. Reopen the editor.')
  const existing = mechanicalFrame(a, system.id)
  if (JSON.stringify(existing || null) !== expected.frame)
    throw new Error('Mechanical state changed. Reopen the editor before saving.')
  if (p.worldRevision !== expected.worldRevision)
    throw new Error('The world changed. Reopen the editor to review the current context.')
  return { a, system, existing }
}
/** Called only by an explicit author save. The model port has no mechanical mutation operation. */
export function saveMechanicalValues(
  p: Project,
  adventureId: string,
  entityId: string,
  values: Record<string, number>,
  expected: ReturnType<typeof mechanicalTicket>,
) {
  const { a, system, existing } = checkedMechanicalState(p, adventureId, expected)
  if (!p.entities.some((e) => e.id === entityId))
    throw new Error('Choose an existing world entity.')
  validateValues(system, values)
  const frame: MechanicalFrame = structuredClone(
    existing || { system, eventId: a.currentEventId, entities: [] },
  )
  const item = { entityId, values: { ...values }, actor: 'author' as const, updatedAt: now() }
  frame.entities = [...frame.entities.filter((e) => e.entityId !== entityId), item]
  const frames = [
    ...(mechanicalPosition(a).mechanics || []).filter(
      (f) => !(f.system.id === system.id && f.eventId === a.currentEventId),
    ),
    frame,
  ]
  mechanicalPosition(a).mechanics = mechanicsSchema.parse(frames)
}
export function derivedRuleValue(
  system: RuleSystem,
  fieldId: string,
  values: Record<string, number>,
) {
  const field = system.fields.find((f) => f.id === fieldId)
  if (!field || field.kind !== 'derived') throw new Error('Choose a derived field.')
  validateValues(system, values)
  return values[field.attribute] + field.amount
}

export function previewMechanicalCheck(
  system: RuleSystem,
  values: Record<string, number>,
  input: CheckInput,
) {
  const choice = checkInputSchema.parse(input)
  validateValues(system, values)
  const attribute = system.fields.find((f) => f.id === choice.attributeId && f.kind !== 'resource')
  if (!attribute) throw new Error('Choose a numeric attribute or derived value for the check.')
  const modifier =
    attribute.kind === 'derived'
      ? derivedRuleValue(system, attribute.id, values)
      : values[attribute.id]
  const after = { ...values }
  if (choice.cost) {
    const resource = system.fields.find(
      (f) => f.id === choice.cost!.resourceId && f.kind === 'resource',
    )
    if (!resource) throw new Error('Choose a resource for the cost.')
    if (values[resource.id] < choice.cost.amount)
      throw new Error(
        'Not enough of this resource. Lower the cost or explicitly edit the saved state.',
      )
    after[resource.id] -= choice.cost.amount
  }
  validateValues(system, after)
  return { modifier, after }
}
function rollD6() {
  const sample = new Uint32Array(1)
  // Rejection sampling avoids modulo bias; a broken random source fails instead of hanging.
  for (let attempt = 0; attempt < 16; attempt++) {
    crypto.getRandomValues(sample)
    if (sample[0] < 4_294_967_292) return (sample[0] % 6) + 1
  }
  throw new Error('The device could not produce a roll. Nothing was changed.')
}
/** One author-confirmed transaction: record the roll and apply the reviewed cost, even on a miss. */
export function resolveMechanicalCheck(
  p: Project,
  adventureId: string,
  input: CheckInput,
  expected: ReturnType<typeof mechanicalTicket>,
) {
  const { a, system, existing } = checkedMechanicalState(p, adventureId, expected)
  const choice = checkInputSchema.parse(input)
  const entity = p.entities.find((e) => e.id === choice.entityId)
  const saved = existing?.entities.find((e) => e.entityId === choice.entityId)
  if (!entity || !saved || !existing)
    throw new Error('Save mechanical state for this entity before resolving a check.')
  if ((existing.checks?.length || 0) >= 100)
    throw new Error(
      'This snapshot has reached 100 checks. Export a backup and begin a new adventure to continue.',
    )
  const { modifier, after } = previewMechanicalCheck(system, saved.values, choice)
  const die = rollD6(),
    total = die + modifier,
    createdAt = now()
  const check = mechanicalCheckSchema.parse({
    id: uid(),
    method: 'd6-plus-attribute-v1',
    sourceTurnId: a.headId,
    entityName: entity.name,
    input: choice,
    before: { ...saved.values },
    after,
    die,
    modifier,
    total,
    outcome: total >= choice.target ? 'met' : 'missed',
    actor: 'author',
    createdAt,
  })
  const frames = structuredClone(mechanicalPosition(a).mechanics!)
  const frame = frames.find((f) => f.system.id === system.id && f.eventId === a.currentEventId)!
  frame.checks = [...(frame.checks || []), check]
  if (choice.cost) {
    const target = frame.entities.find((e) => e.entityId === entity.id)!
    target.values = after
    target.updatedAt = createdAt
  }
  mechanicalPosition(a).mechanics = mechanicsSchema.parse(frames)
  return check
}

function validateCheck(system: RuleSystem, check: MechanicalCheck) {
  const { modifier, after } = previewMechanicalCheck(system, check.before, check.input)
  validateValues(system, check.after)
  if (
    modifier !== check.modifier ||
    check.die + modifier !== check.total ||
    check.outcome !== (check.total >= check.input.target ? 'met' : 'missed') ||
    Object.keys(after).some((key) => after[key] !== check.after[key])
  )
    throw new Error('A saved check disagrees with its recorded inputs or resource cost.')
}

export function validateProjectRules(p: Project) {
  ruleSystemsSchema.parse(p.ruleSystems)
  const ids = new Set(p.ruleSystems.map((s) => s.definition.id))
  if (ids.size !== p.ruleSystems.length) throw new Error('Duplicate installed ruleset identifier.')
  const entities = new Set(p.entities.map((e) => e.id)),
    events = new Set(p.events.map((e) => e.id))
  const receipts = new Map<string, string>()
  for (const a of p.adventures) {
    const turns = new Map(a.turns.map((t) => [t.id, t]))
    for (const position of [a, ...a.turns]) {
      if (!position.mechanics) continue
      mechanicsSchema.parse(position.mechanics)
      const seen = new Set<string>()
      for (const frame of position.mechanics) {
        const key = JSON.stringify([frame.system.id, frame.eventId])
        if (seen.has(key)) throw new Error('Duplicate mechanical state at this story position.')
        seen.add(key)
        if (frame.eventId && !events.has(frame.eventId))
          throw new Error('Missing mechanical state time.')
        if (new Set(frame.entities.map((e) => e.entityId)).size !== frame.entities.length)
          throw new Error('Duplicate mechanical entity.')
        const binding = p.ruleSystems.find((s) => s.definition.id === frame.system.id)
        if (binding && !sameSystem(binding.definition, frame.system))
          throw new Error('Installed ruleset differs from its saved definition.')
        for (const entity of frame.entities) {
          if (!entities.has(entity.entityId))
            throw new Error('Missing mechanical entity reference.')
          validateValues(frame.system, entity.values)
        }
        if (new Set(frame.checks?.map((c) => c.id)).size !== (frame.checks?.length || 0))
          throw new Error('Duplicate check receipt.')
        for (const check of frame.checks || []) {
          validateCheck(frame.system, check)
          if (
            !entities.has(check.input.entityId) ||
            !frame.entities.some((e) => e.entityId === check.input.entityId)
          )
            throw new Error('Missing check entity.')
          // Receipt IDs may repeat only as identical inherited copies, including system and time.
          const fingerprint = JSON.stringify([
            a.id,
            frame.system,
            frame.eventId,
            {
              ...check,
              before: Object.entries(check.before).sort(),
              after: Object.entries(check.after).sort(),
            },
          ])
          if (receipts.has(check.id) && receipts.get(check.id) !== fingerprint)
            throw new Error('Inherited check receipts disagree.')
          receipts.set(check.id, fingerprint)
          if (check.sourceTurnId !== (position === a ? null : position.id)) {
            const parentId = position === a ? undefined : turns.get(position.id)?.parentId
            const parent = parentId === null ? a : turns.get(parentId || '')
            const inherited = parent?.mechanics?.find(
              (f) => f.system.id === frame.system.id && f.eventId === frame.eventId,
            )
            if (!inherited?.checks?.some((c) => c.id === check.id))
              throw new Error('A check comes from another branch.')
          }
          const origin = (
            check.sourceTurnId === null ? a : turns.get(check.sourceTurnId)
          )?.mechanics?.find((f) => f.system.id === frame.system.id && f.eventId === frame.eventId)
          if (!origin?.checks?.some((c) => c.id === check.id))
            throw new Error('Missing original check receipt.')
        }
      }
    }
  }
}

export const exampleRuleSystem: RuleSystem = {
  format: 'storied-system',
  schemaVersion: 1,
  id: 'storied.small-steps',
  version: '1.0.0',
  name: 'Small steps',
  description:
    'A tiny reference system for exploring a demanding journey. Values are practice state, not facts about the world.',
  author: 'Storied contributors',
  license: 'CC0-1.0',
  fields: [
    { id: 'resolve', label: 'Resolve', kind: 'number', min: 0, max: 10, initial: 2 },
    { id: 'energy', label: 'Energy', kind: 'resource', max: 6, initial: 6 },
    {
      id: 'reach',
      label: 'Reach',
      kind: 'derived',
      operation: 'add',
      attribute: 'resolve',
      amount: 2,
    },
  ],
}
