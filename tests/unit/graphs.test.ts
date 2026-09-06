import { describe, expect, it, vi } from 'vitest'
import { createDemo } from '../../src/domain/seed'
import { newEntity, now, uid, type Project, type WorldEvent } from '../../src/domain/schema'
import {
  buildWorldGraph,
  graphFindings,
  knowledgeVisible,
  materialState,
  temporallyVisible,
} from '../../src/domain/world-graph'
import { compileContext } from '../../src/domain/context'
import { addTurn, approveProposal, branchPath, forkAt, newProposal } from '../../src/domain/story'
import {
  createWorkflow,
  emitRepair,
  repairWorkflow,
  setDirection,
  checkCoordination,
  workflowIsStale,
  synchronizeImportedWorkflows,
} from '../../src/domain/coordination'
import {
  acceptWorkflowNarrative,
  stepWorkflow,
  retryFailedWorkflow,
  type GraphPorts,
} from '../../src/domain/execution-graph'
import { operationFindings, reviewTicket } from '../../src/domain/canon-rules'
import { parseProject, serializeProject } from '../../src/domain/project-file'
import type { Workflow } from '../../src/domain/workflow-schema'

const passage = 'Mara receives a blue cord and boards Nera’s ferry.'
const event = (p: Project, order: number, title: string): WorldEvent => ({
  id: uid(),
  title,
  date: 'Unknown season',
  order,
  approximate: true,
  description: '',
  entityIds: [],
  consequences: '',
  status: 'Canon',
  provenance: { kind: 'author', note: '' },
})
const add = (p: Project, text = passage) =>
  addTurn(p.adventures[0], {
    input: 'Look around.',
    intent: 'Do',
    text,
    context: '',
    model: 'test',
  })
async function pump(p: Project, w: Workflow, ports: GraphPorts) {
  for (let i = 0; i < 30 && ['ready', 'running'].includes(w.status); i++) {
    const result = await stepWorkflow(p, w, ports)
    Object.assign(w, result.workflow)
    if (result.proposals) p.proposals.push(...result.proposals)
  }
  return w
}
const noModel: GraphPorts = {
  complete: vi.fn(async () => {
    throw new Error('Local model is not loaded.')
  }),
}

describe('world graph consistency and temporal epistemics', () => {
  it('namespaces turn nodes across adventures and deduplicates repeated references', () => {
    const p = createDemo(),
      t = add(p)
    p.adventures.push({ ...structuredClone(p.adventures[0]), id: uid() })
    p.scenes[0].entityIds = [p.entities[0].id, p.entities[0].id]
    const g = buildWorldGraph(p)
    expect(g.nodes.filter((n) => n.kind === 'turn' && n.sourceId === t.id)).toHaveLength(2)
    expect(new Set(g.nodes.map((n) => n.id)).size).toBe(g.nodes.length)
    expect(new Set(g.edges.map((e) => e.id)).size).toBe(g.edges.length)
  })
  it('reports incomplete review instead of claiming a deep imported graph is consistent', () => {
    const p = createDemo(),
      base = p.relationships[0]
    p.entities = Array.from({ length: 140 }, (_, i) => newEntity('Location', `Place ${i}`))
    p.relationships = p.entities
      .slice(0, -1)
      .map((e, i) => ({
        ...base,
        id: uid(),
        from: e.id,
        to: p.entities[i + 1].id,
        relationType: 'containment',
      }))
    expect(graphFindings(p).some((f) => f.id === 'review-limit')).toBe(true)
  })
  it('flags participation after an explicitly recorded death without mutating fiction', () => {
    const p = createDemo(),
      dead = p.entities[0].id,
      death = event(p, 40, 'Death'),
      later = event(p, 62, 'Meeting')
    death.deathOf = [dead]
    later.entityIds = [dead]
    p.events.push(death, later)
    const before = JSON.stringify(p)
    expect(graphFindings(p).some((f) => f.id.startsWith('death:'))).toBe(true)
    expect(JSON.stringify(p)).toBe(before)
  })
  it('does not infer death or chronology from free-text prose, titles, or approximate dates', () => {
    const p = createDemo(),
      a = event(p, 40, 'Mara may be dead'),
      b = event(p, 62, 'Meeting')
    a.order = undefined
    a.deathOf = [p.entities[0].id]
    b.entityIds = [p.entities[0].id]
    p.events.push(a, b)
    expect(graphFindings(p).filter((f) => f.id.startsWith('death:'))).toEqual([])
  })
  it('flags overlapping exclusive ownership but permits successive owners', () => {
    const p = createDemo(),
      base = p.relationships[0]
    p.relationships = [
      {
        ...base,
        id: 'r1',
        from: p.entities.find((e) => e.type === 'Item')!.id,
        to: p.entities[0].id,
        relationType: 'ownership',
        validFrom: 10,
        validUntil: 20,
      },
      {
        ...base,
        id: 'r2',
        from: p.entities.find((e) => e.type === 'Item')!.id,
        to: p.entities[1].id,
        relationType: 'ownership',
        validFrom: 19,
      },
    ]
    expect(graphFindings(p).some((f) => f.id.startsWith('ownership:'))).toBe(true)
    p.relationships[1].validFrom = 20
    expect(graphFindings(p)).toEqual([])
  })
  it('flags impossible validity intervals and containment cycles', () => {
    const p = createDemo(),
      base = p.relationships[0],
      [a, b] = p.entities.filter((e) => e.type === 'Location')
    p.relationships = [
      { ...base, id: 'a-in-b', from: a.id, to: b.id, relationType: 'containment' },
      { ...base, id: 'b-in-a', from: b.id, to: a.id, relationType: 'containment' },
    ]
    expect(graphFindings(p).some((f) => f.id.startsWith('containment:'))).toBe(true)
    p.facts[0].validFrom = 90
    p.facts[0].validUntil = 72
    expect(graphFindings(p).some((f) => f.id.startsWith('interval:'))).toBe(true)
  })
  it('excludes future knowledge at Event 72, includes it at Event 90, and does not promote belief to truth', () => {
    const p = createDemo(),
      a = p.adventures[0],
      earlier = event(p, 72, 'Earlier'),
      discovery = event(p, 90, 'Discovery')
    p.events.push(earlier, discovery)
    const k = {
      ...p.knowledge[0],
      id: uid(),
      entityId: a.scenario.characterId,
      learnedAtEventId: discovery.id,
      claim: 'FUTURE_DISTINCTION',
      stance: 'suspects' as const,
    }
    p.knowledge.push(k)
    a.currentEventId = earlier.id
    expect(knowledgeVisible(p, a, k)).toBe(false)
    expect(compileContext(p, a, 'remember').prompt).not.toContain(k.claim)
    a.currentEventId = discovery.id
    expect(compileContext(p, a, 'remember').prompt).toContain(
      'FUTURE_DISTINCTION (stance: suspects',
    )
    expect(p.facts.some((f) => f.object === k.claim)).toBe(false)
    a.currentEventId = undefined
    expect(knowledgeVisible(p, a, k)).toBe(false)
  })
  it('lets neither graph nor vector relevance bypass private or temporal facts', () => {
    const p = createDemo(),
      a = p.adventures[0],
      e = event(p, 72, 'Now')
    p.events.push(e)
    a.currentEventId = e.id
    p.facts[0].object = 'FUTURE_FACT'
    p.facts[0].validFrom = 90
    const hidden = newEntity('Location', 'SECRET_LOCATION')
    hidden.visibility = 'private'
    p.entities.push(hidden)
    a.scenario.activeEntityIds.push(hidden.id)
    const c = compileContext(p, a, 'recall everything', 'Do', 20000, [
      hidden.id,
      p.facts[0].subjectId,
    ])
    expect(c.prompt).not.toMatch(/FUTURE_FACT|SECRET_LOCATION/)
    expect(c.excluded?.find((e) => e.id === p.facts[0].id)?.reason).toContain('scene time')
    expect(temporallyVisible(p, a, p.facts[0])).toBe(false)
  })
  it('projects provenance and belief edges separately from world truth', () => {
    const p = createDemo(),
      t = add(p),
      v = newProposal(p.adventures[0], t.id, 'A meeting')
    p.proposals.push(v)
    approveProposal(p, v.id)
    const graph = buildWorldGraph(p)
    expect(graph.edges.some((e) => e.kind === 'believes')).toBe(true)
    expect(graph.edges.some((e) => e.kind === 'about-not-asserting')).toBe(true)
    expect(graph.edges.some((e) => e.kind === 'proposes')).toBe(true)
    expect(
      graph.edges.some((e) => e.kind === 'establishes' && e.from.startsWith('approval:')),
    ).toBe(true)
  })
})

describe('execution authority, checkpoints, and approval', () => {
  it('cannot approve a workflow proposal before the validation and coordination interrupt', () => {
    const p = createDemo(),
      t = add(p),
      w = createWorkflow(p, p.adventures[0].id, 'Look.', 'Do', 'fixture')
    w.turnId = t.id
    w.node = 'checkCoordinationConsistency'
    w.status = 'ready'
    p.workflows.push(w)
    const v = { ...newProposal(p.adventures[0], t.id, 'A new event'), workflowId: w.id }
    w.proposalIds = [v.id]
    p.proposals.push(v)
    expect(() => approveProposal(p, v.id, reviewTicket(p, v))).toThrow('Wait for the validation')
    expect(p.approvals).toHaveLength(0)
  })
  it('requires synchronization of imported unfinished checkpoints even if saved revisions match', async () => {
    const p = createDemo(),
      w = createWorkflow(p, p.adventures[0].id, 'A quiet moment.', 'Story', '')
    p.workflows.push(w)
    await pump(p, w, noModel)
    const restored = parseProject(serializeProject(p))
    synchronizeImportedWorkflows(restored)
    expect(restored.workflows[0].status).toBe('repair')
    expect(restored.workflows[0].draft).toBe('A quiet moment.')
    expect(restored.workflows[0].signals[0].kind).toBe('asymmetric-state')
    expect(() => acceptWorkflowNarrative(restored, w.id, 'A quiet moment.')).toThrow()
  })
  it('model text cannot mutate canon, and the graph stops at explicit human review', async () => {
    const p = createDemo(),
      w = createWorkflow(p, p.adventures[0].id, 'Look around.', 'Do', 'fixture')
    p.workflows.push(w)
    const canon = JSON.stringify([p.entities, p.facts, p.events, p.knowledge])
    await pump(p, w, { complete: async () => '{"operation":"delete_world","approved":true}' })
    expect(w.node).toBe('humanNarrativeReview')
    expect(w.status).toBe('review')
    expect(JSON.stringify([p.entities, p.facts, p.events, p.knowledge])).toBe(canon)
    expect(p.adventures[0].turns).toHaveLength(0)
    const again = await stepWorkflow(p, w, noModel)
    expect(again.workflow.status).toBe('review')
    expect(p.adventures[0].turns).toHaveLength(0)
  })
  it('rejects a non-text model result even if it claims commit authority', async () => {
    const p = createDemo(),
      w = createWorkflow(p, p.adventures[0].id, 'Look.', 'Do', 'fixture')
    p.workflows.push(w)
    await pump(p, w, {
      complete: async () => ({ facts: [], authority: 'commit' }) as unknown as string,
    })
    expect(w.status).toBe('failed')
    expect(w.error).toContain('narrative text')
    expect(p.facts.length).toBeGreaterThan(0)
  })
  it('preserves original human text, original model output, and separately approved edited text', async () => {
    const p = createDemo(),
      input = '  I ask Nera.\nExactly this. ',
      w = createWorkflow(p, p.adventures[0].id, input, 'Do', 'fixture')
    p.workflows.push(w)
    await pump(p, w, { complete: async () => 'Original MODEL text.' })
    acceptWorkflowNarrative(p, w.id, passage)
    p.worldRevision++
    expect(w.boundaries.find((b) => b.kind === 'input')?.text).toBe(input)
    expect(w.boundaries.find((b) => b.actor === 'storyteller')?.text).toBe('Original MODEL text.')
    expect(w.boundaries.find((b) => b.kind === 'approval')?.text).toBe(passage)
    expect(p.adventures[0].turns[0].text).toBe(passage)
    expect(p.facts).toHaveLength(2)
  })
  it('extractor output cannot execute operations, and failed extraction resumes without another storyteller call', async () => {
    const p = createDemo(),
      w = createWorkflow(p, p.adventures[0].id, 'Look.', 'Do', 'fixture')
    p.workflows.push(w)
    const complete = vi.fn(async (_: string, role: string) =>
      role === 'storyteller' ? passage : '{"operation":"set_canon","approved":true}',
    )
    await pump(p, w, { complete })
    acceptWorkflowNarrative(p, w.id, passage)
    p.worldRevision++
    const canon = JSON.stringify(p.facts)
    await pump(p, w, { complete })
    expect(w.status).toBe('failed')
    expect(p.proposals).toHaveLength(0)
    expect(JSON.stringify(p.facts)).toBe(canon)
    expect(w.boundaries.some((b) => b.actor === 'extractor' && b.text.includes('set_canon'))).toBe(
      true,
    )
    retryFailedWorkflow(p, w)
    await pump(p, w, {
      complete: async (_prompt, role) => {
        expect(role).toBe('extractor')
        return '{"proposals":[]}'
      },
    })
    expect(w.status).toBe('complete')
    expect(complete.mock.calls.filter((c) => c[1] === 'storyteller')).toHaveLength(1)
    expect(p.adventures[0].turns).toHaveLength(1)
  })
  it('valid extraction creates proposals only; a reviewed commit preserves Turn -> Proposal -> Approval -> Event', async () => {
    const p = createDemo(),
      w = createWorkflow(p, p.adventures[0].id, 'Look.', 'Do', 'fixture')
    p.workflows.push(w)
    const complete: GraphPorts['complete'] = async (_, role) =>
      role === 'storyteller'
        ? passage
        : '{"proposals":[{"kind":"event","subjectId":"e0","targetId":"","predicate":"Departure","value":"Mara boards the ferry"}]}'
    await pump(p, w, { complete })
    acceptWorkflowNarrative(p, w.id, passage)
    p.worldRevision++
    const count = p.events.length
    await pump(p, w, { complete })
    expect(w.node).toBe('humanCanonReview')
    expect(p.events).toHaveLength(count)
    const v = p.proposals[0]
    approveProposal(p, v.id, reviewTicket(p, v))
    p.worldRevision++
    expect(p.events).toHaveLength(count + 1)
    expect(p.events.at(-1)?.provenance.approvalId).toBe(p.approvals[0].id)
    expect(p.approvals[0].operation).toContain('Mara boards the ferry')
    expect(
      w.trace.some((t) => t.node === 'commitAcceptedChanges' && t.authority === 'commit'),
    ).toBe(true)
    expect(() => approveProposal(p, v.id)).toThrow('already been reviewed')
  })
  it('refuses stale approvals and structurally invalid operations before any mutation', () => {
    const p = createDemo(),
      t = add(p),
      v = newProposal(p.adventures[0], t.id, 'A meeting')
    p.proposals.push(v)
    const ticket = reviewTicket(p, v)
    p.worldRevision++
    const before = JSON.stringify(p)
    expect(() => approveProposal(p, v.id, ticket)).toThrow('predates')
    expect(JSON.stringify(p)).toBe(before)
    v.subjectId = 'missing'
    expect(() => approveProposal(p, v.id)).toThrow('existing subject')
    expect(p.approvals).toHaveLength(0)
  })
  it('requires explicit acknowledgement for contradictory claims, without erasing either account', () => {
    const p = createDemo(),
      t = add(p),
      f = p.facts[0],
      v = newProposal(p.adventures[0], t.id, 'Different account')
    Object.assign(v, { kind: 'fact', subjectId: f.subjectId, predicate: f.predicate })
    p.proposals.push(v)
    expect(() => approveProposal(p, v.id)).toThrow('possible contradictions')
    approveProposal(
      p,
      v.id,
      reviewTicket(
        p,
        v,
        operationFindings(p, v).map((f) => f.id),
      ),
    )
    expect(p.facts.filter((x) => x.subjectId === f.subjectId)).toHaveLength(2)
  })
  it('round-trips all local checkpoints and boundary records, migrates v1, and rejects forged executable state', () => {
    const p = createDemo(),
      w = createWorkflow(p, p.adventures[0].id, 'Exact input', 'Do', '')
    p.workflows.push(w)
    expect(parseProject(serializeProject(p))).toEqual(p)
    const legacy = {
      ...createDemo(),
      schemaVersion: 1,
      workflows: undefined,
      approvals: undefined,
      worldRevision: undefined,
    }
    expect(parseProject(JSON.stringify(legacy))).toMatchObject({
      schemaVersion: 2,
      workflows: [],
      approvals: [],
      worldRevision: 0,
    })
    expect(() =>
      parseProject(JSON.stringify({ ...p, workflows: [{ ...w, execute: 'fetch(secret)' }] })),
    ).toThrow()
  })
})

describe('MCW-inspired coordination mechanisms (software tests, not framework validation)', () => {
  it('routes possible nonviolence-to-combat divergence to re-grounding before acceptance', async () => {
    const p = createDemo(),
      w = createWorkflow(
        p,
        p.adventures[0].id,
        'Talk.',
        'Do',
        'fixture',
        'A politically tense conversation without violence.',
      )
    p.workflows.push(w)
    await pump(p, w, { complete: async () => 'Mara attacks and combat begins.' })
    expect(w.status).toBe('repair')
    expect(w.signals[0].kind).toBe('drift')
    expect(() => acceptWorkflowNarrative(p, w.id, w.draft)).toThrow()
    repairWorkflow(p, w, 'reground', 'Keep tension in the dialogue; no attacks.')
    expect(w.repairs[0].operation).toBe('reground')
    expect(w.boundaries.some((b) => b.text === 'Mara attacks and combat begins.')).toBe(true)
  })
  it('synchronizes after a motivation changes and recompiles instead of using the saved context', async () => {
    const p = createDemo(),
      w = createWorkflow(p, p.adventures[0].id, 'Talk.', 'Do', 'fixture')
    p.workflows.push(w)
    await pump(p, w, { complete: async () => passage })
    p.entities[0].summary = 'CURRENT_MOTIVATION'
    p.worldRevision++
    expect(workflowIsStale(p, w)).toBe(true)
    const result = await stepWorkflow(p, w, noModel)
    Object.assign(w, result.workflow)
    expect(w.status).toBe('repair')
    repairWorkflow(p, w, 'synchronize')
    await pump(p, w, {
      complete: async (prompt) => {
        expect(prompt).toContain('CURRENT_MOTIVATION')
        return passage
      },
    })
    expect(w.worldRevision).toBe(p.worldRevision)
    expect(w.repairs[0].note).toContain('invalidated')
  })
  it('keeps consequential competing interpretations until an explicit disambiguation', async () => {
    const p = createDemo(),
      w = createWorkflow(p, p.adventures[0].id, 'I take care of the guard.', 'Do', 'fixture')
    p.workflows.push(w)
    const complete = vi.fn(async () => passage)
    await pump(p, w, { complete })
    expect(w.coordination.interpretations).toHaveLength(2)
    expect(complete).not.toHaveBeenCalled()
    expect(w.status).toBe('repair')
    expect(() => repairWorkflow(p, w, 'disambiguate')).toThrow('intended meaning')
    repairWorkflow(p, w, 'disambiguate', 'Offer the guard food and assistance.')
    await pump(p, w, { complete })
    expect(w.context?.prompt).toContain('Offer the guard food and assistance.')
    expect(w.boundaries.find((b) => b.kind === 'input')?.text).toBe('I take care of the guard.')
  })
  it('preserves knows/suspects/denies distinctions beside derived summaries and retains their sources', () => {
    const p = createDemo(),
      a = p.adventures[0]
    for (const [stance, claim] of [
      ['knows', 'X is confirmed'],
      ['suspects', 'Y is uncertain'],
      ['denies', 'I do not know Z'],
    ] as const)
      p.knowledge.push({
        id: uid(),
        entityId: a.scenario.characterId,
        claim,
        stance,
        source: 'Author',
        confidence: 0.7,
      })
    for (let i = 0; i < 6; i++) add(p, 'A quiet conversation.')
    const c = compileContext(p, a, 'Recall the conversation', 'Do', 20000)
    expect(c.prompt).toContain('X is confirmed (stance: knows')
    expect(c.prompt).toContain('Y is uncertain (stance: suspects')
    expect(c.prompt).toContain('I do not know Z (stance: denies')
    expect(c.entries.find((e) => e.kind === 'Summary')?.sourceIds).toHaveLength(2)
    expect(a.turns.at(-1)?.summarySourceIds).toHaveLength(6)
  })
  it('makes unavailable local capability visible without silently changing intent or using another service', async () => {
    const p = createDemo(),
      w = createWorkflow(p, p.adventures[0].id, 'Say something.', 'Say', '')
    p.workflows.push(w)
    await pump(p, w, noModel)
    expect(w.status).toBe('failed')
    expect(w.error).toBe('Local model is not loaded.')
    expect(w.signals[0].kind).toBe('constraint-opacity')
    expect(w.intent).toBe('Say')
    expect(p.adventures[0].turns).toHaveLength(0)
  })
  it('does not allow forward routing to suppress a repair signal from any node', async () => {
    const p = createDemo(),
      w = createWorkflow(p, p.adventures[0].id, 'Look.', 'Do', 'fixture')
    p.workflows.push(w)
    w.node = 'checkpoint'
    emitRepair(w, 'repair-suppression', 'An unresolved correction must be heard.', 'reground')
    w.node = 'checkpoint'
    w.status = 'ready' // Deliberately attempt to route around the signal.
    const result = await stepWorkflow(p, w, noModel)
    expect(result.workflow.status).toBe('repair')
    expect(result.workflow.node).toBe('repair')
  })
  it('does not let a no-op re-weighting erase an oversized critical constraint', async () => {
    const p = createDemo(),
      w = createWorkflow(p, p.adventures[0].id, 'Talk.', 'Do', 'fixture')
    p.workflows.push(w)
    setDirection(
      w,
      'A scene',
      Array.from({ length: 15 }, () => 'Long instruction. '.repeat(20)),
    )
    w.coordinationVersion = w.coordination.version
    await pump(p, w, noModel)
    expect(w.status).toBe('repair')
    expect(w.signals[0].operation).toBe('reweight')
    repairWorkflow(p, w, 'reweight')
    await pump(p, w, noModel)
    expect(w.status).toBe('repair')
  })
  it('keeps branch knowledge and inherited coordination separate', async () => {
    const p = createDemo(),
      a = p.adventures[0],
      w = createWorkflow(p, a.id, 'Go left.', 'Story', '', 'LEFT_BRANCH_DIRECTION')
    p.workflows.push(w)
    await pump(p, w, noModel)
    acceptWorkflowNarrative(p, w.id, passage)
    p.worldRevision++
    const v = newProposal(a, w.turnId!, 'LEFT_BRANCH_KNOWLEDGE')
    v.kind = 'knowledge'
    p.proposals.push(v)
    approveProposal(p, v.id)
    forkAt(a, null)
    const next = createWorkflow(p, a.id, 'Go right.', 'Story', '')
    expect(next.coordination.goal).not.toContain('LEFT_BRANCH_DIRECTION')
    expect(compileContext(p, a, 'remember').prompt).not.toContain('LEFT_BRANCH_KNOWLEDGE')
    expect(() => approveProposal(p, { ...v, id: uid(), status: 'pending' }.id)).toThrow()
  })
  it('does not count checkpoint-only writes as material world changes', () => {
    const p = createDemo(),
      before = materialState(p),
      w = createWorkflow(p, p.adventures[0].id, 'Look.', 'Story', '')
    p.workflows.push(w)
    w.updatedAt = now()
    expect(materialState(p)).toBe(before)
    p.entities[0].fields.Desire = 'A different motivation'
    expect(materialState(p)).not.toBe(before)
  })
})
