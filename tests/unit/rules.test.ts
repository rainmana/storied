import { describe, expect, it } from 'vitest'
import { createDemo } from '../../src/domain/seed'
import { parseProject, serializeProject, restorableJSON } from '../../src/domain/project-file'
import { addTurn, forkAt, undoTurn, redoTurn, startAdventure } from '../../src/domain/story'
import { compileContext } from '../../src/domain/context'
import { buildWorldGraph, materialState } from '../../src/domain/world-graph'
import { createWorkflow } from '../../src/domain/coordination'
import { acceptWorkflowNarrative, stepWorkflow } from '../../src/domain/execution-graph'
import { type Project } from '../../src/domain/schema'
import { type RuleSystem } from '../../src/domain/rules-schema'
import {
  MAX_RULESET_BYTES,
  parseRuleSystem,
  exampleRuleSystem,
  installRuleSystem,
  setRuleSystemEnabled,
  removeRuleSystem,
  activateRuleSystem,
  activeRuleSystem,
  initialRuleValues,
  mechanicalFrame,
  saveMechanicalValues,
  derivedRuleValue,
  mechanicalTicket,
} from '../../src/domain/rules'

function setup() {
  const p = createDemo(),
    a = p.adventures[0]
  installRuleSystem(p, exampleRuleSystem)
  return { p, a, entityId: a.scenario.characterId }
}
function enable(p: Project) {
  setRuleSystemEnabled(p, exampleRuleSystem.id, true)
  activateRuleSystem(p, p.adventures[0].id, exampleRuleSystem.id)
}
function ticket(p: Project) {
  return mechanicalTicket(p, p.adventures[0])
}
function save(p: Project, resolve = 3, energy = 5) {
  const a = p.adventures[0]
  saveMechanicalValues(p, a.id, a.scenario.characterId, { resolve, energy }, ticket(p))
}
const passage = (text: string) => ({
  input: text,
  text,
  intent: 'Story' as const,
  model: 'Author',
  context: '',
})

describe('portable declarative rule layers', () => {
  it('migrates format 4 additively and leaves every existing surface and adventure untouched', () => {
    const old = { ...createDemo(), schemaVersion: 4, ruleSystems: undefined }
    const p = parseProject(JSON.stringify(old))
    expect(p.schemaVersion).toBe(6)
    expect(p.ruleSystems).toEqual([])
    for (const key of [
      'entities',
      'scenes',
      'journal',
      'activity',
      'studio',
      'adventures',
      'facts',
      'knowledge',
    ] as const)
      expect(p[key]).toEqual(old[key])
    expect(startAdventure(p.scenarios[0]).activeRuleSystemId).toBeUndefined()
  })
  it('validates a reusable example and rejects code, arbitrary expressions, cycles, unknown fields, and malformed bounds', () => {
    expect(parseRuleSystem(JSON.stringify(exampleRuleSystem))).toEqual(exampleRuleSystem)
    const bad: unknown[] = [
      { ...exampleRuleSystem, execute: 'fetch(secret)' },
      { ...exampleRuleSystem, schemaVersion: 2 },
      { ...exampleRuleSystem, endpoint: 'https://bad.test' },
      {
        ...exampleRuleSystem,
        fields: [
          { id: 'x', label: 'X', kind: 'derived', operation: 'eval', expression: 'process.exit()' },
        ],
      },
      {
        ...exampleRuleSystem,
        fields: [
          { id: 'x', label: 'X', kind: 'derived', operation: 'add', attribute: 'x', amount: 1 },
        ],
      },
      {
        ...exampleRuleSystem,
        fields: [
          { id: 'x', label: 'X', kind: 'derived', operation: 'add', attribute: 'y', amount: 1 },
          { id: 'y', label: 'Y', kind: 'derived', operation: 'add', attribute: 'x', amount: 1 },
        ],
      },
      { ...exampleRuleSystem, fields: [{ ...exampleRuleSystem.fields[0], min: 3, max: 2 }] },
      { ...exampleRuleSystem, fields: [{ ...exampleRuleSystem.fields[0], id: 'constructor' }] },
      { ...exampleRuleSystem, fields: [{ ...exampleRuleSystem.fields[1], initial: 7 }] },
      { ...exampleRuleSystem, fields: [...exampleRuleSystem.fields, exampleRuleSystem.fields[0]] },
    ]
    for (const value of bad) expect(() => parseRuleSystem(JSON.stringify(value))).toThrow()
    expect(() => parseRuleSystem('x'.repeat(MAX_RULESET_BYTES + 1))).toThrow('64 KB')
    expect(() => parseRuleSystem('{')).toThrow('JSON')
  })
  it('requires installation, enablement and explicit activation; deactivation preserves state and does not reactivate on enable', () => {
    const { p, a, entityId } = setup()
    expect(p.ruleSystems[0].enabled).toBe(false)
    expect(activeRuleSystem(p, a)).toBeUndefined()
    expect(() => activateRuleSystem(p, a.id, exampleRuleSystem.id)).toThrow('Enable')
    enable(p)
    save(p)
    const state = structuredClone(a.mechanics)
    activateRuleSystem(p, a.id)
    expect(a.mechanics).toEqual(state)
    expect(() =>
      saveMechanicalValues(
        p,
        a.id,
        entityId,
        { resolve: 1, energy: 1 },
        {
          projectId: p.id,
          adventureId: a.id,
          worldRevision: p.worldRevision,
          system: '',
          headId: a.headId,
          eventId: a.currentEventId,
          frame: 'null',
        },
      ),
    ).toThrow('activate')
    activateRuleSystem(p, a.id, exampleRuleSystem.id)
    setRuleSystemEnabled(p, exampleRuleSystem.id, false)
    setRuleSystemEnabled(p, exampleRuleSystem.id, true)
    expect(a.activeRuleSystemId).toBeUndefined()
    expect(a.mechanics).toEqual(state)
  })
  it('bounds attribute/resource changes and derives a deterministic value from an explicitly saved attribute', () => {
    const { p, a, entityId } = setup()
    enable(p)
    expect(initialRuleValues(exampleRuleSystem)).toEqual({ resolve: 2, energy: 6 })
    const invalidValues: Record<string, number>[] = [
      { resolve: 11, energy: 6 },
      { resolve: 2, energy: -1 },
      { resolve: 2, energy: 7 },
      { resolve: 2.5, energy: 6 },
      { resolve: 2, energy: 6, reach: 4 },
      { resolve: NaN, energy: 6 },
    ]
    for (const values of invalidValues) {
      expect(() => saveMechanicalValues(p, a.id, entityId, values, ticket(p))).toThrow()
      expect(a.mechanics).toBeUndefined()
    }
    save(p, 4, 2)
    expect(
      derivedRuleValue(
        exampleRuleSystem,
        'reach',
        mechanicalFrame(a, exampleRuleSystem.id)!.entities[0].values,
      ),
    ).toBe(6)
    expect(() => restorableJSON(p)).not.toThrow()
  })
  it('preserves independent branch snapshots through new turns, forks, undo and redo, without retroactive changes to descendants', () => {
    const { p, a } = setup()
    enable(p)
    save(p, 2, 6)
    const first = addTurn(a, passage('First route.'))
    save(p, 3, 4)
    forkAt(a, null)
    save(p, 1, 5)
    const sibling = addTurn(a, passage('Other route.'))
    expect(mechanicalFrame(a, exampleRuleSystem.id)!.entities[0].values.energy).toBe(5)
    expect(first.mechanics![0].entities[0].values.energy).toBe(4)
    undoTurn(a)
    expect(a.headId).toBe(null)
    redoTurn(a)
    expect(a.headId).toBe(sibling.id)
    forkAt(a, first.id)
    expect(mechanicalFrame(a, exampleRuleSystem.id)!.entities[0].values.energy).toBe(4)
    const other = startAdventure(a.scenario)
    expect(other.mechanics).toBeUndefined()
  })
  it('does not carry mechanical knowledge across scene times and preserves the prior time on return', () => {
    const { p, a } = setup()
    enable(p)
    save(p)
    a.currentEventId = p.events[0].id
    expect(mechanicalFrame(a, exampleRuleSystem.id)).toBeUndefined()
    save(p, 1, 1)
    delete a.currentEventId
    expect(mechanicalFrame(a, exampleRuleSystem.id)!.entities[0].values.energy).toBe(5)
    expect(parseProject(serializeProject(p)).adventures[0].mechanics).toHaveLength(2)
  })
  it('rejects stale author forms after position, state, project or active system changes', () => {
    const { p, a, entityId } = setup()
    enable(p)
    const old = ticket(p)
    save(p)
    expect(() => saveMechanicalValues(p, a.id, entityId, { resolve: 1, energy: 1 }, old)).toThrow(
      'state changed',
    )
    const fresh = ticket(p)
    addTurn(a, passage('New position.'))
    expect(() => saveMechanicalValues(p, a.id, entityId, { resolve: 1, energy: 1 }, fresh)).toThrow(
      'position',
    )
    expect(() =>
      saveMechanicalValues(
        p,
        a.id,
        entityId,
        { resolve: 1, energy: 1 },
        { ...ticket(p), projectId: 'other' },
      ),
    ).toThrow('position')
    const second: RuleSystem = { ...exampleRuleSystem, id: 'another' }
    installRuleSystem(p, second)
    setRuleSystemEnabled(p, second.id, true)
    const priorSystem = ticket(p)
    activateRuleSystem(p, a.id, second.id)
    expect(() =>
      saveMechanicalValues(p, a.id, entityId, { resolve: 1, energy: 1 }, priorSystem),
    ).toThrow('ruleset changed')
  })
  it('keeps definition snapshots and creative content when removed, exports missing bindings, and requires exact reinstall', () => {
    const { p, a } = setup()
    const original = structuredClone(p)
    enable(p)
    save(p)
    const state = structuredClone(a.mechanics)
    removeRuleSystem(p, exampleRuleSystem.id)
    expect(a.mechanics).toEqual(state)
    const restored = parseProject(serializeProject(p))
    expect(restored.adventures[0].mechanics).toEqual(state)
    for (const key of [
      'entities',
      'scenes',
      'journal',
      'studio',
      'facts',
      'knowledge',
      'events',
      'memories',
      'proposals',
      'activity',
    ] as const)
      expect(restored[key]).toEqual(original[key])
    expect(() =>
      installRuleSystem(restored, { ...exampleRuleSystem, name: 'Different meaning' }),
    ).toThrow('exact original')
    restored.adventures[0].activeRuleSystemId = exampleRuleSystem.id
    expect(activeRuleSystem(restored, restored.adventures[0])).toBeUndefined()
    expect(() => serializeProject(restored)).not.toThrow()
    delete restored.adventures[0].activeRuleSystemId
    installRuleSystem(restored, exampleRuleSystem)
    enable(restored)
    expect(mechanicalFrame(restored.adventures[0], exampleRuleSystem.id)).toEqual(state![0])
  })
  it('rejects corrupt or orphaned saved values even when no definition remains installed', () => {
    const { p, a } = setup()
    enable(p)
    save(p)
    removeRuleSystem(p, exampleRuleSystem.id)
    a.mechanics![0].entities[0].values.energy = 999
    expect(() => restorableJSON(p)).toThrow()
    expect(() => parseProject(JSON.stringify(p))).toThrow()
    a.mechanics![0].entities[0].values.energy = 3
    a.mechanics![0].entities[0].entityId = 'missing'
    expect(() => parseProject(JSON.stringify(p))).toThrow('entity reference')
  })
  it('keeps rules out of model perception and freeform context, while preserving typed mechanical graph structure', async () => {
    const { p, a } = setup()
    const context = compileContext(p, a, 'Look around.', 'Do')
    const before = materialState(p)
    enable(p)
    save(p)
    expect(compileContext(p, a, 'Look around.', 'Do')).toEqual(context)
    expect(materialState(p)).not.toBe(before)
    const graph = buildWorldGraph(p)
    expect(graph.nodes.some((n) => n.kind === 'mechanical-state')).toBe(true)
    expect(graph.edges.some((e) => e.kind === 'mechanical-facet-not-canon')).toBe(true)
    const w = createWorkflow(p, a.id, 'Look around.', 'Do', 'fixture')
    w.node = 'storyteller'
    w.context = context
    p.workflows.push(w)
    const state = structuredClone(a.mechanics),
      facts = structuredClone(p.facts)
    const response = await stepWorkflow(p, w, {
      complete: async () => '{"mechanics":{"energy":0},"canon":"approved"}',
    })
    expect(a.mechanics).toEqual(state)
    p.workflows[0] = response.workflow
    acceptWorkflowNarrative(p, w.id, 'The road slopes down.')
    expect(a.turns.at(-1)!.mechanics).toEqual(state)
    expect(p.facts).toEqual(facts)
  })
})
