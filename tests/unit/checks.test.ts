import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createDemo } from '../../src/domain/seed'
import { parseProject, restorableJSON, serializeProject } from '../../src/domain/project-file'
import { addTurn, forkAt, undoTurn, redoTurn, startAdventure } from '../../src/domain/story'
import { compileContext } from '../../src/domain/context'
import { buildWorldGraph, materialState } from '../../src/domain/world-graph'
import type { CheckInput } from '../../src/domain/rules-schema'
import {
  parseRuleSystem,
  installRuleSystem,
  setRuleSystemEnabled,
  activateRuleSystem,
  activeRuleSystem,
  initialRuleValues,
  mechanicalFrame,
  mechanicalTicket,
  saveMechanicalValues,
  previewMechanicalCheck,
  resolveMechanicalCheck,
  removeRuleSystem,
} from '../../src/domain/rules'

const file = readFileSync(
  new URL('../../public/rules/lantern-crossing.storysystem', import.meta.url),
  'utf8',
)
const system = parseRuleSystem(file)
function setup() {
  const p = createDemo(),
    a = p.adventures[0],
    entityId = a.scenario.characterId
  installRuleSystem(p, parseRuleSystem(file))
  setRuleSystemEnabled(p, system.id, true)
  activateRuleSystem(p, a.id, system.id)
  saveMechanicalValues(p, a.id, entityId, initialRuleValues(system), mechanicalTicket(p, a))
  const input: CheckInput = {
    entityId,
    attributeId: 'footing',
    target: 6,
    approach: 'Follow the channel markers.',
    onSuccess: 'Reach the lantern before the path floods.',
    onSetback: 'Find another route.',
    cost: { resourceId: 'supplies', amount: 1 },
  }
  return { p, a, input }
}
const frame = (a: ReturnType<typeof setup>['a']) => mechanicalFrame(a, system.id)!
const passage = (text: string) => ({
  input: text,
  text,
  intent: 'Story' as const,
  model: 'Author',
  context: '',
})
function random(...samples: number[]) {
  let i = 0
  return vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint32Array) => {
    array[0] = samples[Math.min(i++, samples.length - 1)]
    return array
  }) as typeof crypto.getRandomValues)
}
afterEach(() => vi.restoreAllMocks())

describe('author-initiated checks and reusable rules', () => {
  it('uses the separately authored format-1 file in two independent worlds without new fields or adapters', () => {
    const first = setup(),
      second = setup()
    expect(system.schemaVersion).toBe(1)
    expect(first.p.id).not.toBe(second.p.id)
    expect(first.p.ruleSystems).toEqual(second.p.ruleSystems)
    random(5)
    resolveMechanicalCheck(first.p, first.a.id, first.input, mechanicalTicket(first.p, first.a))
    expect(frame(first.a).entities[0].values.supplies).toBe(2)
    expect(frame(second.a).entities[0].values.supplies).toBe(3)
    expect(frame(second.a).checks).toBeUndefined()
    for (const { p } of [first, second])
      expect(parseProject(serializeProject(p)).ruleSystems[0].definition).toEqual(
        parseRuleSystem(file),
      )
  })
  it('migrates format 5 without modifying installed definitions, activation, values, or creative records', () => {
    const { p } = setup(),
      before = structuredClone(p)
    const restored = parseProject(JSON.stringify({ ...p, schemaVersion: 5 }))
    expect(restored.schemaVersion).toBe(6)
    expect(restored.adventures).toEqual(before.adventures)
    expect(restored.ruleSystems).toEqual(before.ruleSystems)
    expect(frame(restored.adventures[0]).checks).toBeUndefined()
    expect(restored.entities).toEqual(before.entities)
    expect(restored.studio).toEqual(before.studio)
  })
  it('previews without randomness; atomically records a success and its cost; stale repeat clicks cannot reroll or spend twice', () => {
    const { p, a, input } = setup(),
      ticket = mechanicalTicket(p, a),
      before = structuredClone(p)
    const rng = random(5)
    expect(previewMechanicalCheck(system, frame(a).entities[0].values, input)).toEqual({
      modifier: 2,
      after: { wayfinding: 1, supplies: 2 },
    })
    expect(rng).not.toHaveBeenCalled()
    expect(p).toEqual(before)
    const result = resolveMechanicalCheck(p, a.id, input, ticket)
    expect(result).toMatchObject({
      die: 6,
      modifier: 2,
      total: 8,
      outcome: 'met',
      sourceTurnId: null,
      before: { supplies: 3 },
      after: { supplies: 2 },
    })
    expect(frame(a).checks).toEqual([result])
    expect(() => resolveMechanicalCheck(p, a.id, input, ticket)).toThrow('state changed')
    expect(rng).toHaveBeenCalledTimes(1)
    const restored = parseProject(serializeProject(p))
    expect(frame(restored.adventures[0]).checks).toEqual([result])
    expect(rng).toHaveBeenCalledTimes(1)
  })
  it('records a miss with the agreed attempt cost and permits checks with no cost', () => {
    const { p, a, input } = setup()
    random(0)
    const miss = resolveMechanicalCheck(p, a.id, input, mechanicalTicket(p, a))
    expect(miss).toMatchObject({ die: 1, total: 3, outcome: 'missed', after: { supplies: 2 } })
    const before = structuredClone(frame(a).entities)
    const noCost = { ...input, attributeId: 'wayfinding', target: 2, cost: undefined }
    expect(resolveMechanicalCheck(p, a.id, noCost, mechanicalTicket(p, a)).outcome).toBe('met')
    expect(frame(a).entities).toEqual(before)
  })
  it('rejects insufficient costs, wrong types, malformed stakes, and out-of-bounds targets before drawing randomness', () => {
    const { p, a, input } = setup(),
      before = structuredClone(p),
      rng = random(5)
    for (const change of [
      { cost: { resourceId: 'supplies', amount: 4 } },
      { cost: { resourceId: 'wayfinding', amount: 1 } },
      { cost: { resourceId: 'supplies', amount: -1 } },
      { attributeId: 'supplies' },
      { attributeId: 'missing' },
      { target: Infinity },
      { target: 1.5 },
      { onSetback: '   ' },
      { approach: '' },
      { endpoint: 'https://bad.test' },
    ])
      expect(() =>
        resolveMechanicalCheck(p, a.id, { ...input, ...change }, mechanicalTicket(p, a)),
      ).toThrow()
    expect(rng).not.toHaveBeenCalled()
    expect(p).toEqual(before)
  })
  it('uses unbiased die sampling and fails a broken random source without altering state', () => {
    const { p, a, input } = setup()
    const rng = random(4_294_967_295, 2)
    expect(resolveMechanicalCheck(p, a.id, input, mechanicalTicket(p, a)).die).toBe(3)
    expect(rng).toHaveBeenCalledTimes(2)
    rng.mockRestore()
    const broken = random(4_294_967_295),
      before = structuredClone(p)
    expect(() => resolveMechanicalCheck(p, a.id, input, mechanicalTicket(p, a))).toThrow(
      'could not produce',
    )
    expect(broken).toHaveBeenCalledTimes(16)
    expect(p).toEqual(before)
  })
  it('keeps receipts unchanged by later manual edits and refuses a full history before rolling', () => {
    const { p, a, input } = setup(),
      rng = random(0)
    const first = resolveMechanicalCheck(p, a.id, input, mechanicalTicket(p, a))
    const evidence = structuredClone(first)
    saveMechanicalValues(
      p,
      a.id,
      input.entityId,
      { wayfinding: 4, supplies: 4 },
      mechanicalTicket(p, a),
    )
    expect(frame(a).checks![0]).toEqual(evidence)
    for (let i = 1; i < 100; i++)
      resolveMechanicalCheck(p, a.id, { ...input, cost: undefined }, mechanicalTicket(p, a))
    const before = structuredClone(p)
    expect(() => resolveMechanicalCheck(p, a.id, input, mechanicalTicket(p, a))).toThrow(
      '100 checks',
    )
    expect(rng).toHaveBeenCalledTimes(100)
    expect(p).toEqual(before)
    expect(parseProject(serializeProject(p)).adventures[0].mechanics![0].checks).toHaveLength(100)
  })
  it('freezes inherited history, isolates sibling branches and scene times, and keeps undo/redo deterministic', () => {
    const { p, a, input } = setup()
    random(5)
    const root = resolveMechanicalCheck(p, a.id, input, mechanicalTicket(p, a))
    const first = addTurn(a, passage('First route.'))
    const child = resolveMechanicalCheck(p, a.id, input, mechanicalTicket(p, a))
    forkAt(a, null)
    const sibling = addTurn(a, passage('Second route.'))
    expect(frame(a).checks?.map((c) => c.id)).toEqual([root.id])
    expect(frame(a).entities[0].values.supplies).toBe(2)
    expect(first.mechanics![0].checks?.map((c) => c.id)).toEqual([root.id, child.id])
    undoTurn(a)
    redoTurn(a)
    expect(a.headId).toBe(sibling.id)
    const saved = structuredClone(frame(a))
    forkAt(a, null)
    resolveMechanicalCheck(p, a.id, input, mechanicalTicket(p, a))
    forkAt(a, sibling.id)
    expect(frame(a)).toEqual(saved)
    a.currentEventId = p.events[0].id
    expect(frame(a)).toBeUndefined()
    delete a.currentEventId
    expect(frame(a)).toEqual(saved)
    expect(() => serializeProject(p)).not.toThrow()
  })
  it('rejects stale position, adventure, world, frame and disabled-rule previews without rolling', () => {
    const { p, a, input } = setup(),
      ticket = mechanicalTicket(p, a),
      rng = random(0)
    const other = startAdventure(a.scenario)
    p.adventures.push(other)
    expect(() => resolveMechanicalCheck(p, other.id, input, ticket)).toThrow('position changed')
    p.worldRevision++
    expect(() => resolveMechanicalCheck(p, a.id, input, ticket)).toThrow('world changed')
    p.worldRevision--
    a.currentEventId = p.events[0].id
    expect(() => resolveMechanicalCheck(p, a.id, input, ticket)).toThrow('position changed')
    delete a.currentEventId
    setRuleSystemEnabled(p, system.id, false)
    expect(() => resolveMechanicalCheck(p, a.id, input, ticket)).toThrow('activate')
    expect(rng).not.toHaveBeenCalled()
  })
  it('validates receipts even without an installed system, preserves them on removal, and does not affect model perception or canon', () => {
    const { p, a, input } = setup(),
      before = structuredClone(p),
      context = compileContext(p, a, 'Look around.', 'Do'),
      revisionInput = materialState(p)
    const rng = random(5)
    resolveMechanicalCheck(p, a.id, input, mechanicalTicket(p, a))
    expect(materialState(p)).not.toBe(revisionInput)
    expect(compileContext(p, a, 'Look around.', 'Do')).toEqual(context)
    const graph = buildWorldGraph(p)
    expect(graph.nodes.some((n) => n.kind === 'mechanical-check')).toBe(true)
    expect(graph.edges.some((e) => e.kind === 'records-check-not-canon')).toBe(true)
    const receipts = structuredClone(frame(a).checks)
    removeRuleSystem(p, system.id)
    const restored = parseProject(serializeProject(p))
    expect(frame(restored.adventures[0]).checks).toEqual(receipts)
    expect(activeRuleSystem(restored, restored.adventures[0])).toBeUndefined()
    for (const key of [
      'entities',
      'facts',
      'knowledge',
      'events',
      'memories',
      'proposals',
      'scenes',
      'studio',
      'journal',
      'activity',
    ] as const)
      expect(restored[key]).toEqual(before[key])
    expect(rng).toHaveBeenCalledTimes(1)
  })
  it('rejects altered math, costs, references, duplicate receipts, and receipts injected across branches', () => {
    const { p, a, input } = setup()
    random(5)
    resolveMechanicalCheck(p, a.id, input, mechanicalTicket(p, a))
    removeRuleSystem(p, system.id)
    for (const mutate of [
      (c: NonNullable<ReturnType<typeof frame>['checks']>[number]) => {
        c.total++
      },
      (c: NonNullable<ReturnType<typeof frame>['checks']>[number]) => {
        c.after.supplies++
      },
      (c: NonNullable<ReturnType<typeof frame>['checks']>[number]) => {
        c.input.entityId = 'missing'
      },
      (c: NonNullable<ReturnType<typeof frame>['checks']>[number]) => {
        c.sourceTurnId = 'missing'
      },
    ]) {
      const altered = structuredClone(p)
      mutate(frame(altered.adventures[0]).checks![0])
      expect(() => parseProject(JSON.stringify(altered))).toThrow()
    }
    const repeated = structuredClone(p)
    frame(repeated.adventures[0]).checks!.push(frame(repeated.adventures[0]).checks![0])
    expect(() => restorableJSON(repeated)).toThrow('Duplicate')
    const left = addTurn(a, passage('Left'))
    forkAt(a, null)
    const right = addTurn(a, passage('Right'))
    right.mechanics![0].checks![0].sourceTurnId = left.id
    expect(() => serializeProject(p)).toThrow()
  })
})
