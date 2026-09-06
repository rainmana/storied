import { now, uid, type Project, type Turn } from './schema'
import { branchPath } from './story'
import {
  type CoordinationState,
  type RepairOperation,
  type RepairSignal,
  type Workflow,
} from './workflow-schema'

export const MCW_SOURCE = {
  framework: '0.2',
  constitution: '1.1',
  revision: '8365d220f2676f248c934e20f23e427e01cf3ce8',
} as const
export function addBoundary(
  w: Workflow,
  actor: Workflow['boundaries'][number]['actor'],
  kind: Workflow['boundaries'][number]['kind'],
  text: string,
  sourceId?: string,
) {
  const record = {
    id: uid(),
    actor,
    kind,
    text,
    sourceId,
    createdAt: now(),
    worldRevision: w.worldRevision,
    coordinationVersion: w.coordination.version,
    model: actor === 'storyteller' || actor === 'extractor' ? w.model : undefined,
  }
  w.boundaries.push(record)
  return record
}
export function createWorkflow(
  p: Project,
  adventureId: string,
  input: string,
  intent: Turn['intent'],
  model: string,
  goal?: string,
): Workflow {
  const a = p.adventures.find((a) => a.id === adventureId)
  if (!a) throw new Error('Choose an existing adventure.')
  const ancestry = new Set(branchPath(a).map((t) => t.id))
  const previous = p.workflows
    .filter((w) => w.adventureId === a.id && w.turnId && ancestry.has(w.turnId))
    .at(-1)
  const coordination: CoordinationState = previous
    ? structuredClone(previous.coordination)
    : { version: 0, goal: '', constraints: [], salient: [], interpretations: [], items: [] }
  const sourceIds = new Set([
    ...coordination.items.map((i) => i.sourceBoundaryId),
    ...coordination.interpretations.map((i) => i.sourceBoundaryId),
  ])
  const w: Workflow = {
    id: uid(),
    adventureId,
    parentId: a.headId,
    createdAt: now(),
    updatedAt: now(),
    node: 'captureBoundary',
    status: 'ready',
    worldRevision: p.worldRevision,
    coordinationVersion: coordination.version,
    input,
    intent,
    model: intent === 'Story' ? 'Author' : model,
    draft: '',
    boundaries:
      previous?.boundaries.filter((b) => sourceIds.has(b.id)).map((b) => structuredClone(b)) || [],
    coordination,
    signals: [],
    repairs: [],
    semanticIds: [],
    graphIds: [],
    proposalIds: [],
    error: '',
    trace: [],
  }
  const boundary = addBoundary(w, 'human', 'input', input)
  if (a.scenario.practiceMode)
    addBoundary(
      w,
      'application',
      'directive',
      `Session mode: ${a.scenario.practiceMode}. ${a.scenario.practiceMode === 'interview' ? 'The human is the author; the selected character is the interviewee. This conversation cannot establish world events or character memories.' : 'The human plays the viewpoint character. Fictional outcomes stay on this adventure branch until reviewed.'}`,
      'session-mode',
    )
  for (const item of coordination.items) if (item.kind === 'intent') item.active = false
  coordination.interpretations = []
  coordination.items.push({
    id: uid(),
    kind: 'intent',
    content: input,
    sourceBoundaryId: boundary.id,
    sourceActor: 'human',
    active: true,
    supersedes: [],
  })
  if (goal !== undefined && goal !== coordination.goal)
    setDirection(w, goal, coordination.constraints)
  w.coordinationVersion = coordination.version
  return w
}
export function setDirection(
  w: Workflow,
  goal: string,
  constraints: string[],
  salient = w.coordination.salient,
) {
  if (
    goal.length > 500 ||
    [...constraints, ...salient].some((s) => s.length > 500) ||
    constraints.length > 30 ||
    salient.length > 30
  )
    throw new Error(
      'Keep each direction under 500 characters and use at most 30 constraints or priorities.',
    )
  const boundary = addBoundary(
    w,
    'human',
    'directive',
    JSON.stringify({ goal, constraints, salient }),
  )
  const old = w.coordination.items.filter(
    (i) => i.active && ['goal', 'constraint', 'salience'].includes(i.kind),
  )
  for (const i of old) i.active = false
  for (const [kind, values] of [
    ['goal', [goal]],
    ['constraint', constraints],
    ['salience', salient],
  ] as const)
    for (const content of values.filter(Boolean))
      w.coordination.items.push({
        id: uid(),
        kind,
        content,
        sourceBoundaryId: boundary.id,
        sourceActor: 'human',
        active: true,
        supersedes: old.filter((i) => i.kind === kind).map((i) => i.id),
      })
  w.coordination.goal = goal
  w.coordination.constraints = [...constraints]
  w.coordination.salient = [...salient]
  w.coordination.version++
}
export function emitRepair(
  w: Workflow,
  kind: RepairSignal['kind'],
  message: string,
  operation: RepairOperation,
) {
  if (!w.signals.some((s) => !s.resolved && s.message === message))
    w.signals.push({
      id: uid(),
      kind,
      message: message.slice(0, 500),
      operation,
      sourceNode: w.node,
      resolved: false,
    })
  if (w.node !== 'repair') w.resumeNode = w.node
  w.node = 'repair'
  w.status = 'repair'
}
export function interpretBoundary(w: Workflow) {
  if (w.coordination.interpretations.length) return
  const source = [...w.boundaries].reverse().find((b) => b.kind === 'input')!
  // Narrow, declared application heuristic: consequential euphemisms can hide incompatible actions.
  if (
    w.intent === 'Do' &&
    /\b(take care of|deal with|remove) (the )?(guard|witness|prisoner|rival)\b/i.test(w.input)
  ) {
    w.coordination.interpretations = [
      'Resolve this through conversation or assistance.',
      'Use force or remove this person from the scene.',
    ].map((text) => ({ id: uid(), text, sourceBoundaryId: source.id, selected: false }))
  }
}
export function checkCoordination(w: Workflow, candidate = '') {
  const interpretations = w.coordination.interpretations
  if (interpretations.length > 1 && !interpretations.some((i) => i.selected)) {
    emitRepair(
      w,
      'false-alignment',
      'This action has consequential competing interpretations. Choose or describe what you mean.',
      'disambiguate',
    )
    return
  }
  const directions = [w.coordination.goal, ...w.coordination.constraints].join(' ')
  const forbidsViolence =
    /\b(without|no|avoid)\s+(?:any\s+)?(violence|combat|fighting)\b|\bnonviolent\b/i.test(
      directions,
    )
  const affirmative = candidate.replace(/\b(no|without|avoid)\s+(violence|combat|fighting)\b/gi, '')
  if (forbidsViolence && /\b(combat|attacks?|stab(?:s|bed)?|kills?|shoots?)\b/i.test(affirmative))
    emitRepair(
      w,
      'drift',
      'Possible direction conflict: this interpretation or draft introduces force while your direction asks for no violence. Review the meaning before continuing.',
      'reground',
    )
}
export function workflowIsStale(p: Project, w: Workflow) {
  return w.worldRevision !== p.worldRevision || w.coordinationVersion !== w.coordination.version
}

/** File import is a new external boundary, even if a saved revision number happens to match. */
export function synchronizeImportedWorkflows(p: Project) {
  const pending = p.workflows.filter((w) => !['complete', 'discarded'].includes(w.status))
  const studioPending = p.studio.runs.filter((r) => !['accepted', 'discarded'].includes(r.status))
  if (!pending.length && !studioPending.length) return
  p.worldRevision++
  for (const r of studioPending) {
    r.status = 'repair'
    r.error =
      'This manuscript checkpoint was imported. Inspect and synchronize current sources before using it.'
  }
  for (const w of pending)
    emitRepair(
      w,
      'asymmetric-state',
      'This checkpoint was restored from a project file. Synchronize its source and current world before resuming.',
      'synchronize',
    )
}
export function repairWorkflow(
  p: Project,
  w: Workflow,
  operation: RepairOperation,
  clarification = '',
) {
  if (w.draft) addBoundary(w, 'application', 'output', w.draft, 'draft-before-repair')
  const active = w.signals.filter((s) => !s.resolved)
  if (operation === 'disambiguate' && !clarification.trim())
    throw new Error('Describe the intended meaning before continuing.')
  if (operation === 'reground' && active.some((s) => s.kind === 'drift') && !clarification.trim())
    throw new Error('Restate the intended direction before continuing.')
  const boundary = clarification ? addBoundary(w, 'human', 'correction', clarification) : undefined
  if (operation === 'disambiguate' && boundary) {
    w.coordination.interpretations.forEach((i) => {
      i.selected = i.text === clarification
    })
    if (!w.coordination.interpretations.some((i) => i.selected))
      w.coordination.interpretations.push({
        id: uid(),
        text: clarification.slice(0, 500),
        selected: true,
        sourceBoundaryId: boundary.id,
      })
  }
  if (operation === 'reground' && clarification) {
    // A correction supplements the goal; it never silently removes existing constraints.
    w.coordination.salient = [clarification.slice(0, 500), ...w.coordination.salient].slice(0, 30)
  }
  if (boundary)
    w.coordination.items.push({
      id: uid(),
      kind: 'correction',
      content: clarification,
      sourceBoundaryId: boundary.id,
      sourceActor: 'human',
      active: true,
      supersedes: [],
    })
  const resolved = active.filter(
    (s) =>
      s.operation === operation || (operation === 'synchronize' && s.kind === 'asymmetric-state'),
  )
  resolved.forEach((s) => {
    s.resolved = true
  })
  w.coordination.version++
  w.repairs.push({
    id: uid(),
    operation,
    signalIds: resolved.map((s) => s.id),
    sourceIds: w.boundaries
      .filter((b) => ['input', 'directive', 'correction'].includes(b.kind))
      .map((b) => b.id),
    boundaryId: boundary?.id,
    note:
      operation === 'synchronize'
        ? `Synchronized world revision ${w.worldRevision} to ${p.worldRevision}; derived context invalidated.`
        : 'Author reviewed the source communication and repaired the stated direction.',
    createdAt: now(),
  })
  w.trace.push({
    node: `repair.${operation}`,
    authority: 'repair',
    outcome: 'Recorded source-based repair',
    createdAt: now(),
    worldRevision: p.worldRevision,
    coordinationVersion: w.coordination.version,
  })
  w.context = undefined
  w.semanticIds = []
  w.graphIds = []
  w.worldRevision = p.worldRevision
  w.coordinationVersion = w.coordination.version
  w.error = ''
  if (w.signals.some((s) => !s.resolved)) {
    w.status = 'repair'
    return
  }
  // Accepted prose stays intact. Recompile/extract from the saved source instead of regenerating it.
  w.node = w.turnId
    ? w.proposalIds.length
      ? 'checkWorldConsistency'
      : 'extractProposedChanges'
    : 'synchronizeCoordinationState'
  if (!w.turnId) w.draft = ''
  w.status = 'ready'
}
