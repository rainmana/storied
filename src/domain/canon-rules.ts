import { proposalSchema, type Project, type Proposal } from './schema'
import { branchPath } from './story'
import { graphFindings, type Finding } from './world-graph'

export type ReviewTicket = {
  proposal: string
  worldRevision: number
  coordinationVersion: number
  acknowledgedFindings: string[]
}
export const CanonCommitGraph = {
  validateOperations: { authority: 'read', next: 'checkWorldConsistency' },
  checkWorldConsistency: { authority: 'read', next: 'checkCoordinationConsistency' },
  checkCoordinationConsistency: { authority: 'read', next: 'humanCanonReview' },
  humanCanonReview: { authority: 'review', next: 'commitAcceptedChanges', interrupt: true },
  commitAcceptedChanges: { authority: 'commit', next: 'checkpoint' },
  checkpoint: { authority: 'derive', next: 'END' },
} as const

/** Follow the declared subgraph to its commit boundary for one explicit author approval. */
export function validateCanonCommit(p: Project, v: Proposal, ticket: ReviewTicket) {
  type Node = keyof typeof CanonCommitGraph
  let node: Node = 'validateOperations'
  let findings: Finding[] = []
  const visited: Node[] = []
  while (node !== 'commitAcceptedChanges') {
    visited.push(node)
    if (node === 'validateOperations') validateOperation(p, v)
    if (node === 'checkWorldConsistency') findings = operationFindings(p, v)
    if (node === 'checkCoordinationConsistency') assertReviewCurrent(p, v, ticket)
    if (node === 'humanCanonReview') {
      const w = p.workflows.find((w) => w.id === v.workflowId)
      if (w && (w.status !== 'review' || w.node !== 'humanCanonReview'))
        throw new Error('Wait for the validation and coordination checks before accepting canon.')
      if (findings.some((f) => !ticket.acknowledgedFindings.includes(f.id)))
        throw new Error('Review the possible contradictions before accepting this change.')
    }
    node = CanonCommitGraph[node].next as Node
  }
  return { findings, visited: [...visited, node] }
}

export function validateOperation(p: Project, input: Proposal): Proposal {
  const v = proposalSchema.parse(input),
    a = p.adventures.find((a) => a.id === v.adventureId)
  if (!a || !a.turns.some((t) => t.id === v.turnId))
    throw new Error('The proposal has no source story turn.')
  if (a.scenario.practiceMode === 'interview')
    throw new Error(
      'An interview is rehearsal. Develop a chosen idea in the world editor or manuscript canon review instead of treating the conversation as an event.',
    )
  if (v.status !== 'pending') throw new Error('This proposal has already been reviewed.')
  if (!branchPath(a).some((t) => t.id === v.turnId))
    throw new Error('Switch to the source branch before reviewing this change.')
  if (!p.entities.some((e) => e.id === v.subjectId)) throw new Error('Choose an existing subject.')
  if (v.kind === 'relationship' && !p.entities.some((e) => e.id === v.targetId))
    throw new Error('Choose an existing relationship target.')
  if (v.kind === 'knowledge' && p.entities.find((e) => e.id === v.subjectId)?.type !== 'Character')
    throw new Error('Only a character can receive a knowledge claim.')
  if (v.kind === 'entity') throw new Error('Review new entities in the world editor.')
  const w = p.workflows.find((w) => w.id === v.workflowId)
  if (v.workflowId && !w) throw new Error('The proposal workflow is missing.')
  if (w?.signals.some((s) => !s.resolved))
    throw new Error('Resolve the story direction check before changing canon.')
  if (
    w &&
    (w.worldRevision !== p.worldRevision || w.coordinationVersion !== w.coordination.version)
  )
    throw new Error(
      'The checkpoint predates the current world or direction. Synchronize before approving.',
    )
  return v
}
export function reviewTicket(
  p: Project,
  v: Proposal,
  acknowledgedFindings: string[] = [],
): ReviewTicket {
  const w = p.workflows.find((w) => w.id === v.workflowId)
  return {
    proposal: JSON.stringify(v),
    worldRevision: p.worldRevision,
    coordinationVersion: w?.coordination.version || 0,
    acknowledgedFindings,
  }
}
export function assertReviewCurrent(p: Project, v: Proposal, ticket: ReviewTicket) {
  const current = reviewTicket(p, v)
  if (
    ticket.proposal !== current.proposal ||
    ticket.worldRevision !== current.worldRevision ||
    ticket.coordinationVersion !== current.coordinationVersion
  )
    throw new Error(
      'This review predates a world or direction change. Review the current proposal again.',
    )
}

/** A read-only preview. Fictional inconsistencies require acknowledgement, not forced repair. */
export function operationFindings(p: Project, v: Proposal): Finding[] {
  const copy = structuredClone(p)
  if (v.kind === 'relationship' && v.targetId)
    copy.relationships.push({
      id: v.id,
      from: v.subjectId,
      to: v.targetId,
      label: v.predicate,
      description: v.value,
      visibility: v.visibility,
      knownTo: [],
      status: 'Canon',
      start: '',
      end: '',
      confidence: 1,
      provenance: { kind: 'author', note: 'Uncommitted preview' },
    })
  const previous = new Set(graphFindings(p).map((f) => f.id))
  const findings = graphFindings(copy).filter((f) => f.id === 'review-limit' || !previous.has(f.id))
  if (v.kind === 'fact')
    for (const f of p.facts)
      if (
        f.status === 'Canon' &&
        f.subjectId === v.subjectId &&
        f.predicate.toLowerCase() === v.predicate.toLowerCase() &&
        f.object.toLowerCase() !== v.value.toLowerCase()
      )
        findings.push({
          id: `accounts:${v.id}:${f.id}`,
          message:
            'This fact differs from an existing canonical account. Both accounts will remain.',
          sourceIds: [f.id, v.id],
        })
  return findings
}
