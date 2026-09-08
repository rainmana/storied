import {
  mechanicsSchema,
  ruleSystemSchema,
  ruleSystemsSchema,
  type MechanicalFrame,
  type RuleSystem,
} from './rules-schema'
import { now, type Adventure, type Project } from './schema'

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
/** Called only by an explicit author save. The model port has no mechanical mutation operation. */
export function saveMechanicalValues(
  p: Project,
  adventureId: string,
  entityId: string,
  values: Record<string, number>,
  expected: {
    projectId: string
    system: string
    headId: string | null
    eventId?: string
    frame: string
  },
) {
  const a = p.adventures.find((a) => a.id === adventureId)
  if (
    p.id !== expected.projectId ||
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
  if (!p.entities.some((e) => e.id === entityId))
    throw new Error('Choose an existing world entity.')
  const existing = mechanicalFrame(a, system.id)
  if (JSON.stringify(existing || null) !== expected.frame)
    throw new Error('Mechanical state changed. Reopen the editor before saving.')
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
export function validateProjectRules(p: Project) {
  ruleSystemsSchema.parse(p.ruleSystems)
  const ids = new Set(p.ruleSystems.map((s) => s.definition.id))
  if (ids.size !== p.ruleSystems.length) throw new Error('Duplicate installed ruleset identifier.')
  const entities = new Set(p.entities.map((e) => e.id)),
    events = new Set(p.events.map((e) => e.id))
  for (const a of p.adventures) {
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
