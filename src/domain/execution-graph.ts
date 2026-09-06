import { compileContext, visibleEntities } from './context'
import { extractionRequest, parseExtractedProposals } from './extraction'
import {
  addBoundary,
  checkCoordination,
  emitRepair,
  interpretBoundary,
  workflowIsStale,
} from './coordination'
import { addTurn, branchPath } from './story'
import { graphFindings, temporallyVisible } from './world-graph'
import { validateOperation } from './canon-rules'
import { now, uid, type Project, type Proposal } from './schema'
import { workflowSchema, type Workflow, type WorkflowNode } from './workflow-schema'

type Authority = Workflow['trace'][number]['authority']
type Node = { authority: Authority; next: WorkflowNode; subgraph?: string; interrupt?: boolean }
export const AdventureTurnGraph: Record<WorkflowNode, Node> = {
  captureBoundary: { authority: 'read', next: 'interpretIntent' },
  interpretIntent: { authority: 'interpret', next: 'synchronizeCoordinationState' },
  synchronizeCoordinationState: {
    authority: 'repair',
    next: 'graphRetrieve',
    subgraph: 'Coordination',
  },
  graphRetrieve: { authority: 'read', next: 'semanticRetrieve', subgraph: 'Retrieval' },
  semanticRetrieve: { authority: 'read', next: 'epistemicFilter', subgraph: 'Retrieval' },
  epistemicFilter: { authority: 'read', next: 'temporalFilter', subgraph: 'Retrieval' },
  temporalFilter: { authority: 'read', next: 'coordinationCheck', subgraph: 'Retrieval' },
  coordinationCheck: { authority: 'read', next: 'compileContext', subgraph: 'Coordination' },
  compileContext: { authority: 'read', next: 'storyteller' },
  storyteller: { authority: 'generate', next: 'humanNarrativeReview' },
  humanNarrativeReview: { authority: 'review', next: 'acceptNarrative', interrupt: true },
  acceptNarrative: { authority: 'commit', next: 'extractProposedChanges', interrupt: true },
  extractProposedChanges: { authority: 'propose', next: 'validateOperations' },
  validateOperations: {
    authority: 'read',
    next: 'checkWorldConsistency',
    subgraph: 'CanonCommitGraph',
  },
  checkWorldConsistency: {
    authority: 'read',
    next: 'checkCoordinationConsistency',
    subgraph: 'CanonCommitGraph',
  },
  checkCoordinationConsistency: {
    authority: 'read',
    next: 'humanCanonReview',
    subgraph: 'CanonCommitGraph',
  },
  humanCanonReview: {
    authority: 'review',
    next: 'commitAcceptedChanges',
    interrupt: true,
    subgraph: 'CanonCommitGraph',
  },
  commitAcceptedChanges: {
    authority: 'commit',
    next: 'updateMemory',
    interrupt: true,
    subgraph: 'CanonCommitGraph',
  },
  updateMemory: {
    authority: 'derive',
    next: 'updateDerivedIndexes',
    subgraph: 'MemoryMaintenance',
  },
  updateDerivedIndexes: { authority: 'derive', next: 'checkpoint', subgraph: 'MemoryMaintenance' },
  checkpoint: { authority: 'derive', next: 'END' },
  repair: {
    authority: 'repair',
    next: 'synchronizeCoordinationState',
    interrupt: true,
    subgraph: 'MCWRepairGraph',
  },
  END: { authority: 'read', next: 'END' },
}
// Model ports accept only text/schema, never project objects, stores, database handles, or tools.
export type GraphPorts = {
  complete: (
    prompt: string,
    role: 'storyteller' | 'extractor',
    schema?: Record<string, unknown>,
  ) => Promise<string>
  retrieve?: (input: string, allowedIds: string[]) => Promise<string[]>
}
export type StepResult = { workflow: Workflow; proposals?: Proposal[] }
export function traceNode(w: Workflow, node: WorkflowNode, outcome: string) {
  w.trace.push({
    node,
    authority: AdventureTurnGraph[node].authority,
    outcome: outcome.slice(0, 500),
    createdAt: now(),
    worldRevision: w.worldRevision,
    coordinationVersion: w.coordination.version,
  })
  w.updatedAt = now()
}
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    Object.values(value).forEach(frozen)
  }
  return value
}
export function branchMatches(p: Project, w: Workflow) {
  const a = p.adventures.find((a) => a.id === w.adventureId)
  if (!a) return false
  return w.turnId ? branchPath(a).some((t) => t.id === w.turnId) : a.headId === w.parentId
}

/** Runs one declared node. Returns state/proposals only: no caller's world can be mutated here. */
export async function stepWorkflow(
  project: Project,
  checkpoint: Workflow,
  ports: GraphPorts,
): Promise<StepResult> {
  const p = frozen(structuredClone(project)),
    w = workflowSchema.parse(structuredClone(checkpoint))
  const a = p.adventures.find((a) => a.id === w.adventureId)
  if (!a) throw new Error('The workflow adventure is missing.')
  if (['complete', 'discarded', 'repair'].includes(w.status)) return { workflow: w }
  if (!branchMatches(p, w)) {
    emitRepair(
      w,
      'asymmetric-state',
      'The active branch changed. Return to this workflow’s source branch before resuming.',
      'synchronize',
    )
    return { workflow: w }
  }
  if (
    workflowIsStale(p, w) &&
    !['captureBoundary', 'interpretIntent', 'synchronizeCoordinationState'].includes(w.node)
  ) {
    emitRepair(
      w,
      'asymmetric-state',
      'The world or your direction changed after this checkpoint. Synchronize before continuing.',
      'synchronize',
    )
    return { workflow: w }
  }
  if (w.signals.some((s) => !s.resolved)) {
    // Repair always outranks the ordinary directed edge, regardless of which node raised it.
    w.resumeNode = w.node
    w.node = 'repair'
    w.status = 'repair'
    return { workflow: w }
  }
  const node = w.node,
    definition = AdventureTurnGraph[node]
  let proposals: Proposal[] | undefined,
    outcome = 'Completed'
  try {
    if (definition.interrupt) {
      w.status = 'review'
      return { workflow: w }
    }
    switch (node) {
      case 'captureBoundary':
        if (
          !w.boundaries.some((b) => b.actor === 'human' && b.kind === 'input' && b.text === w.input)
        )
          throw new Error('The original human boundary record is missing.')
        break
      case 'interpretIntent':
        interpretBoundary(w)
        break
      case 'synchronizeCoordinationState':
        w.worldRevision = p.worldRevision
        w.coordinationVersion = w.coordination.version
        break
      case 'graphRetrieve': {
        const visible = new Set(visibleEntities(p, a.scenario.characterId).map((e) => e.id))
        const ids = new Set(
          [a.scenario.characterId, a.scenario.locationId, ...a.scenario.activeEntityIds].filter(
            (id) => visible.has(id),
          ),
        )
        for (const r of p.relationships)
          if (
            r.status === 'Canon' &&
            (r.visibility === 'public' || r.knownTo.includes(a.scenario.characterId)) &&
            temporallyVisible(p, a, r) &&
            visible.has(r.from) &&
            visible.has(r.to) &&
            (r.from === a.scenario.characterId || r.to === a.scenario.characterId)
          ) {
            ids.add(r.from)
            ids.add(r.to)
          }
        w.graphIds = [...ids]
        break
      }
      case 'semanticRetrieve':
        w.semanticIds = ports.retrieve
          ? (
              await ports.retrieve(
                w.input,
                visibleEntities(p, a.scenario.characterId).map((e) => e.id),
              )
            ).slice(0, 100)
          : []
        outcome = ports.retrieve
          ? 'Retrieved semantic candidates; no truth or visibility granted'
          : 'Exact and graph retrieval available; semantic model is not loaded'
        break
      case 'epistemicFilter': {
        const allowed = new Set(visibleEntities(p, a.scenario.characterId).map((e) => e.id))
        w.semanticIds = w.semanticIds.filter((id) => allowed.has(id))
        w.graphIds = w.graphIds.filter((id) => allowed.has(id))
        break
      }
      case 'temporalFilter':
        outcome =
          'Explicit event order and discovery gates are enforced again during context compilation'
        break
      case 'coordinationCheck':
        checkCoordination(
          w,
          w.coordination.interpretations
            .filter((i) => i.selected)
            .map((i) => i.text)
            .join(' '),
        )
        break
      case 'compileContext':
        w.context = compileContext(p, a, w.input, w.intent, 8500, w.semanticIds, w.coordination)
        if (w.context.warnings?.length)
          emitRepair(w, 'constraint-opacity', w.context.warnings.join(' '), 'reweight')
        break
      case 'storyteller': {
        if (!w.context) throw new Error('Context must be compiled before generation.')
        if (w.intent === 'Story') w.draft = w.input
        else {
          const source = addBoundary(
            w,
            'application',
            'directive',
            w.context.prompt,
            'storyteller-context',
          )
          const output = await ports.complete(w.context.prompt, 'storyteller')
          if (typeof output !== 'string')
            throw new Error(
              'The storyteller must return narrative text, not executable operations.',
            )
          addBoundary(w, 'storyteller', 'output', output, source.id)
          w.draft = output
          checkCoordination(w, output)
        }
        break
      }
      case 'extractProposedChanges': {
        if (!w.turnId) throw new Error('Accept the narrative before extracting world proposals.')
        const turn = a.turns.find((t) => t.id === w.turnId)!
        if (w.intent === 'Story') {
          w.node = 'updateMemory'
          break
        }
        const request = extractionRequest(p, a, turn.text)
        if (!request.entities.length) {
          w.node = 'updateMemory'
          break
        }
        const source = addBoundary(
          w,
          'application',
          'directive',
          request.prompt,
          'extractor-context',
        )
        const raw = await ports.complete(request.prompt, 'extractor', request.schema)
        if (typeof raw !== 'string')
          throw new Error('The extractor must return a JSON text proposal.')
        addBoundary(w, 'extractor', 'output', raw, source.id)
        break
      }
      case 'validateOperations': {
        const raw = [...w.boundaries]
          .reverse()
          .find((b) => b.actor === 'extractor' && b.kind === 'output')
        if (!raw || !w.turnId) throw new Error('The extraction source is missing.')
        const parsed = parseExtractedProposals(
          raw.text,
          extractionRequest(p, a, '').entities,
          a.id,
          w.turnId,
        )
        proposals = parsed.map((v) => ({ ...v, workflowId: w.id }))
        for (const v of proposals) validateOperation(p, v)
        w.proposalIds = proposals.map((v) => v.id)
        break
      }
      case 'checkWorldConsistency':
        outcome = `${graphFindings(p).length} possible world contradictions; each new operation is checked again at approval`
        break
      case 'checkCoordinationConsistency':
        checkCoordination(
          w,
          p.proposals
            .filter((v) => w.proposalIds.includes(v.id))
            .map((v) => `${v.predicate} ${v.value}`)
            .join(' '),
        )
        if (!w.proposalIds.length) w.node = 'updateMemory'
        break
      case 'updateMemory':
        outcome =
          'Source-linked narrative and episodic memory are saved at acceptance; summaries cannot establish facts'
        break
      case 'updateDerivedIndexes':
        outcome =
          'Transactional search projections updated; stale vectors excluded until local reindexing'
        break
      case 'checkpoint':
        w.status = 'complete'
        break
      case 'END':
        w.status = 'complete'
        break
    }
    traceNode(w, node, outcome)
    if (w.signals.some((s) => !s.resolved)) {
      if (w.node !== 'repair') w.resumeNode = node
      w.node = 'repair'
      w.status = 'repair'
    } else if (w.node === node) {
      w.node = definition.next
      w.status =
        w.node === 'END' ? 'complete' : AdventureTurnGraph[w.node].interrupt ? 'review' : 'ready'
    } else w.status = 'ready'
    return { workflow: w, proposals }
  } catch (error) {
    w.error = (error instanceof Error ? error.message : String(error)).slice(0, 500)
    traceNode(w, node, `Stopped: ${w.error}`)
    w.status = 'failed'
    // Failure is visible and retryable at this node. Raw model output and prior checkpoints survive.
    w.signals.push({
      id: uid(),
      kind: 'constraint-opacity',
      message: w.error,
      operation: 'reground',
      sourceNode: node,
      resolved: false,
    })
    w.resumeNode = node
    return { workflow: w }
  }
}

/** The explicit human narrative interrupt; creates story/memory only, never canon. */
export function acceptWorkflowNarrative(p: Project, id: string, text: string) {
  const w = p.workflows.find((w) => w.id === id)
  if (!w || w.node !== 'humanNarrativeReview' || w.status !== 'review' || w.turnId)
    throw new Error('This passage is not awaiting acceptance.')
  if (!text.trim()) throw new Error('Write a passage before accepting.')
  if (!branchMatches(p, w) || workflowIsStale(p, w))
    throw new Error('The world or direction changed. Synchronize and review a fresh draft first.')
  if (w.signals.some((s) => !s.resolved))
    throw new Error('Resolve the direction check before accepting.')
  const a = p.adventures.find((a) => a.id === w.adventureId)!
  addBoundary(w, 'human', 'approval', text)
  const turn = addTurn(a, {
    input: w.input,
    intent: w.intent,
    text,
    model: w.model,
    context: w.context?.prompt || '',
    workflowId: w.id,
  })
  w.turnId = turn.id
  w.draft = ''
  w.node = 'extractProposedChanges'
  w.status = 'ready'
  w.worldRevision = p.worldRevision + 1
  traceNode(w, 'acceptNarrative', 'Human accepted this exact text; canon unchanged')
  p.memories.push({
    id: uid(),
    adventureId: a.id,
    turnId: turn.id,
    characterId: a.scenario.characterId,
    text: turn.text.slice(0, 1200),
    createdAt: now(),
  })
  return turn
}

export function retryFailedWorkflow(p: Project, w: Workflow) {
  if (w.status !== 'failed' || !w.resumeNode)
    throw new Error('This workflow has no failed node to retry.')
  if (workflowIsStale(p, w)) {
    emitRepair(
      w,
      'asymmetric-state',
      'This failed checkpoint predates a world or direction edit. Synchronize first.',
      'synchronize',
    )
    return
  }
  addBoundary(w, 'human', 'correction', `Retry ${w.resumeNode} after reviewing: ${w.error}`)
  w.signals
    .filter((s) => s.sourceNode === w.resumeNode && s.kind === 'constraint-opacity')
    .forEach((s) => {
      s.resolved = true
    })
  // Bad extraction text must be regenerated; generation itself need not be rerun.
  w.node = w.resumeNode === 'validateOperations' ? 'extractProposedChanges' : w.resumeNode
  w.status = 'ready'
  w.error = ''
}
