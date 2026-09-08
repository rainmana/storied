import {
  uid,
  now,
  type Adventure,
  type Project,
  type Proposal,
  type Scenario,
  type Turn,
} from './schema'
import { graphFindings } from './world-graph'
import { mechanicalPosition } from './rules'
import {
  CanonCommitGraph,
  validateCanonCommit,
  reviewTicket,
  type ReviewTicket,
} from './canon-rules'

export function branchPath(adventure: Adventure, headId = adventure.headId): Turn[] {
  const byId = new Map(adventure.turns.map((t) => [t.id, t]))
  const result: Turn[] = [],
    seen = new Set<string>()
  let id = headId
  while (id) {
    if (seen.has(id)) throw new Error('A cycle was found in this story.')
    seen.add(id)
    const turn = byId.get(id)
    if (!turn) throw new Error('A story turn is missing.')
    result.unshift(turn)
    id = turn.parentId
  }
  return result
}
export function startAdventure(scenario: Scenario): Adventure {
  return {
    id: uid(),
    title: scenario.title,
    scenario: structuredClone(scenario),
    turns: [],
    headId: null,
    redoIds: [],
    createdAt: now(),
  }
}
export function addTurn(
  a: Adventure,
  turn: Omit<
    Turn,
    'id' | 'parentId' | 'createdAt' | 'bookmark' | 'annotation' | 'summary' | 'mechanics'
  >,
): Turn {
  const path = branchPath(a)
  const next: Turn = {
    ...turn,
    // Inherit a copy of author state; generated text cannot supply or change mechanics.
    mechanics: structuredClone(mechanicalPosition(a).mechanics),
    id: uid(),
    parentId: a.headId,
    createdAt: now(),
    bookmark: false,
    annotation: '',
    summarySourceIds: [...path.slice(-11).map((t) => t.id)],
    summary: [...path.slice(-11).map((t) => t.text.slice(0, 220)), turn.text.slice(0, 220)].join(
      '\n',
    ),
  }
  a.turns.push(next)
  next.summarySourceIds!.push(next.id)
  a.headId = next.id
  a.redoIds = []
  return next
}
export function undoTurn(a: Adventure) {
  if (a.headId) {
    const t = a.turns.find((t) => t.id === a.headId)!
    a.redoIds.push(t.id)
    a.headId = t.parentId
  }
}
export function redoTurn(a: Adventure) {
  const id = a.redoIds.pop()
  if (id) {
    const t = a.turns.find((t) => t.id === id)
    if (t?.parentId === a.headId) a.headId = id
  }
}
export function forkAt(a: Adventure, turnId: string | null) {
  if (turnId && !a.turns.some((t) => t.id === turnId))
    throw new Error('This branch point does not exist.')
  a.headId = turnId
  a.redoIds = []
}
export function approveProposal(p: Project, proposalId: string, ticket?: ReviewTicket) {
  const proposal = p.proposals.find((v) => v.id === proposalId)
  if (!proposal || proposal.status !== 'pending')
    throw new Error('This proposal has already been reviewed.')
  const review = ticket || reviewTicket(p, proposal)
  const { findings, visited } = validateCanonCommit(p, proposal, review)
  const approvalId = uid()
  const beforeIds = new Set(
    [...p.facts, ...p.events, ...p.relationships, ...p.knowledge].map((v) => v.id),
  )
  const a = p.adventures.find((a) => a.id === proposal.adventureId)
  if (!a?.turns.some((t) => t.id === proposal.turnId))
    throw new Error('The proposal has no source story turn.')
  if (!p.entities.some((e) => e.id === proposal.subjectId))
    throw new Error('Choose an existing subject.')
  const provenance = {
    kind: 'story' as const,
    adventureId: a.id,
    turnId: proposal.turnId,
    note: 'Reviewed and accepted by the author',
    proposalId: proposal.id,
    approvalId,
    workflowId: proposal.workflowId,
    worldRevision: p.worldRevision,
  }
  const knownTo = proposal.visibility === 'private' ? [a.scenario.characterId] : []
  const target = proposal.targetId
  if (proposal.kind === 'relationship' && (!target || !p.entities.some((e) => e.id === target)))
    throw new Error('Choose an existing relationship target.')
  if (proposal.kind === 'fact')
    p.facts.push({
      id: uid(),
      subjectId: proposal.subjectId,
      predicate: proposal.predicate || 'experienced',
      object: proposal.value,
      status: 'Canon',
      visibility: proposal.visibility,
      knownTo,
      provenance,
    })
  else if (proposal.kind === 'event')
    p.events.push({
      id: uid(),
      title: proposal.value,
      date: 'Undated',
      approximate: true,
      description: proposal.predicate,
      locationId: a.scenario.locationId,
      entityIds: [proposal.subjectId],
      consequences: '',
      status: 'Canon',
      provenance,
    })
  else if (proposal.kind === 'relationship')
    p.relationships.push({
      id: uid(),
      from: proposal.subjectId,
      to: target!,
      label: proposal.predicate || 'connected to',
      description: proposal.value,
      visibility: proposal.visibility,
      knownTo,
      status: 'Canon',
      start: '',
      end: '',
      confidence: 1,
      provenance,
    })
  else if (proposal.kind === 'knowledge')
    p.knowledge.push({
      id: uid(),
      entityId: proposal.subjectId,
      claim: proposal.value,
      stance: 'was_told',
      confidence: 0.7,
      source: `Adventure: ${a.title}`,
      learnedAtEventId: a.currentEventId,
      provenance,
    })
  else throw new Error('New entities should be reviewed in the world editor before promotion.')
  proposal.status = 'accepted'
  p.approvals.push({
    id: approvalId,
    proposalId: proposal.id,
    workflowId: proposal.workflowId,
    adventureId: a.id,
    turnId: proposal.turnId,
    actor: 'human',
    action: 'accepted',
    operation: review.proposal,
    worldRevision: p.worldRevision,
    coordinationVersion: review.coordinationVersion,
    createdAt: now(),
    resultIds: [...p.facts, ...p.events, ...p.relationships, ...p.knowledge]
      .filter((v) => !beforeIds.has(v.id))
      .map((v) => v.id),
    acknowledgedFindings: findings.map((f) => f.id),
  })
  const workflow = p.workflows.find((w) => w.id === proposal.workflowId)
  if (workflow) {
    workflow.boundaries.push({
      id: uid(),
      actor: 'human',
      kind: 'approval',
      text: review.proposal,
      sourceId: approvalId,
      createdAt: now(),
    })
    for (const node of visited)
      workflow.trace.push({
        node,
        authority: CanonCommitGraph[node].authority,
        outcome: `Accepted operation ${proposal.id}`,
        createdAt: now(),
        worldRevision: p.worldRevision,
        coordinationVersion: review.coordinationVersion,
      })
    workflow.worldRevision = p.worldRevision + 1
    if (
      workflow.proposalIds.every((id) => p.proposals.find((v) => v.id === id)?.status !== 'pending')
    ) {
      workflow.status = 'ready'
      workflow.node = 'updateMemory'
    }
  }
  p.journal.unshift({
    id: uid(),
    title: 'A new piece of canon',
    text: `${p.entities.find((e) => e.id === proposal.subjectId)?.name}: ${proposal.predicate} ${proposal.value}`,
    kind: 'canon',
    createdAt: now(),
  })
}
export function possibleContradictions(p: Project): string[] {
  const groups = new Map<string, Set<string>>()
  for (const f of p.facts.filter((f) => f.status === 'Canon')) {
    const key = `${f.subjectId}::${f.predicate.toLowerCase()}`
    if (!groups.has(key)) groups.set(key, new Set())
    groups.get(key)!.add(f.object.toLowerCase())
  }
  const findings: string[] = []
  for (const [key, values] of groups)
    if (values.size > 1) {
      const [id, predicate] = key.split('::')
      findings.push(
        `${p.entities.find((e) => e.id === id)?.name} has multiple accounts of “${predicate}”.`,
      )
    }
  for (const e of p.entities) {
    const birth = Number(e.fields['Birth year']),
      death = Number(e.fields['Death year'])
    if (
      e.fields['Birth year'] &&
      e.fields['Death year'] &&
      Number.isFinite(birth) &&
      Number.isFinite(death) &&
      death < birth
    )
      findings.push(`${e.name} has a death date before their birth.`)
  }
  return [...findings, ...graphFindings(p).map((f) => f.message)]
}
export function newProposal(a: Adventure, turnId: string, value: string): Proposal {
  return {
    id: uid(),
    adventureId: a.id,
    turnId,
    kind: 'event',
    subjectId: a.scenario.characterId,
    predicate: '',
    value,
    visibility: 'public',
    status: 'pending',
  }
}
