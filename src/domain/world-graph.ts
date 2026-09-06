import type { Adventure, Project, Relationship } from './schema'
import { branchPath } from './story'

export type GraphNode = { id: string; kind: string; sourceId: string; body: unknown }
export type GraphEdge = { id: string; from: string; to: string; kind: string; sourceId: string }
export type Finding = { id: string; message: string; sourceIds: string[] }
export type Temporal = {
  validFrom?: number
  validUntil?: number
  establishedByEventId?: string
  endedByEventId?: string
}
export function eventOrder(p: Project, id?: string) {
  return p.events.find((e) => e.id === id && e.status === 'Canon')?.order
}
export function temporalBounds(p: Project, item: Temporal) {
  return {
    from: item.validFrom ?? eventOrder(p, item.establishedByEventId),
    until: item.validUntil ?? eventOrder(p, item.endedByEventId),
  }
}
export function temporallyVisible(p: Project, a: Adventure, item: Temporal): boolean {
  const bounded =
    item.validFrom !== undefined ||
    item.validUntil !== undefined ||
    !!item.establishedByEventId ||
    !!item.endedByEventId
  if (!bounded) return true
  const current = eventOrder(p, a.currentEventId),
    { from, until } = temporalBounds(p, item)
  if (
    current === undefined ||
    (item.establishedByEventId && from === undefined) ||
    (item.endedByEventId && until === undefined)
  )
    return false
  return (from === undefined || current >= from) && (until === undefined || current < until)
}
export function sourceOnBranch(a: Adventure, source?: { adventureId?: string; turnId?: string }) {
  return (
    !source?.adventureId ||
    (source.adventureId === a.id &&
      !!source.turnId &&
      branchPath(a).some((t) => t.id === source.turnId))
  )
}
export function knowledgeVisible(p: Project, a: Adventure, k: Project['knowledge'][number]) {
  if (k.entityId !== a.scenario.characterId || !sourceOnBranch(a, k.provenance)) return false
  if (!k.learnedAtEventId) return true
  const learned = eventOrder(p, k.learnedAtEventId),
    current = eventOrder(p, a.currentEventId)
  return learned !== undefined && current !== undefined && current >= learned
}
export function relationKind(r: Relationship) {
  if (r.relationType) return r.relationType
  const label = r.label.trim().toLowerCase()
  return label === 'owned by'
    ? 'ownership'
    : ['inside', 'located inside'].includes(label)
      ? 'containment'
      : 'connection'
}

/** Relational graph projection. Edges establish structure, never inferred fictional causation. */
export function buildWorldGraph(p: Project): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [],
    edges: GraphEdge[] = []
  const node = <T extends { id: string }>(kind: string, value: T) =>
    nodes.push({ id: `${kind}:${value.id}`, kind, sourceId: value.id, body: value })
  const edge = (from: string, kind: string, to: string, sourceId: string) =>
    edges.push({ id: JSON.stringify([from, kind, to, sourceId]), from, to, kind, sourceId })
  const turnKey = (adventureId: string | undefined, turnId: string) =>
    `turn:${JSON.stringify([adventureId, turnId])}`
  for (const e of p.entities) node('entity', e)
  for (const r of p.relationships) {
    node('relationship', r)
    edge(`entity:${r.from}`, relationKind(r), `entity:${r.to}`, r.id)
  }
  for (const f of p.facts) {
    node('fact', f)
    edge(`entity:${f.subjectId}`, 'has-fact', `fact:${f.id}`, f.id)
  }
  for (const k of p.knowledge) {
    node('claim', k)
    edge(`entity:${k.entityId}`, k.stance, `claim:${k.id}`, k.id)
    if (k.factId) edge(`claim:${k.id}`, 'about-not-asserting', `fact:${k.factId}`, k.id)
    if (k.learnedAtEventId) edge(`event:${k.learnedAtEventId}`, 'learned-at', `claim:${k.id}`, k.id)
  }
  for (const e of p.events) {
    node('event', e)
    for (const id of e.entityIds) edge(`event:${e.id}`, 'participant', `entity:${id}`, e.id)
    if (e.locationId) edge(`event:${e.id}`, 'occurs-at', `entity:${e.locationId}`, e.id)
    for (const id of e.deathOf || []) edge(`event:${e.id}`, 'death-of', `entity:${id}`, e.id)
  }
  for (const a of p.adventures)
    for (const t of a.turns) {
      nodes.push({ id: turnKey(a.id, t.id), kind: 'turn', sourceId: t.id, body: t })
      if (t.parentId) edge(turnKey(a.id, t.parentId), 'next-turn', turnKey(a.id, t.id), t.id)
    }
  for (const s of p.scenes) {
    node('scene', s)
    for (const id of s.entityIds) edge(`scene:${s.id}`, 'references', `entity:${id}`, s.id)
    if (s.viewpointId) edge(`scene:${s.id}`, 'viewpoint', `entity:${s.viewpointId}`, s.id)
    if (s.locationId) edge(`scene:${s.id}`, 'set-at', `entity:${s.locationId}`, s.id)
    if (s.eventId) edge(`scene:${s.id}`, 'scene-time', `event:${s.eventId}`, s.id)
    if (s.voiceProfileId)
      edge(`scene:${s.id}`, 'uses-voice', `voice-profile:${s.voiceProfileId}`, s.id)
  }
  for (const profile of p.studio.profiles) {
    node('voice-profile', profile)
    for (const trait of profile.traits) {
      node('voice-trait', trait)
      edge(`voice-profile:${profile.id}`, trait.status, `voice-trait:${trait.id}`, trait.id)
      for (const [index, e] of trait.evidence.entries()) {
        const id = `${trait.id}:${index}`
        node('voice-excerpt', { ...e, id })
        edge(`voice-trait:${trait.id}`, 'supported-by', `voice-excerpt:${id}`, trait.id)
        edge(`voice-excerpt:${id}`, 'quoted-from', `writing-sample:${e.sampleId}`, e.sampleId)
      }
    }
  }
  for (const sample of p.studio.samples) {
    node('writing-sample', sample)
    edge(
      `writing-sample:${sample.id}`,
      'sample-for',
      `voice-profile:${sample.profileId}`,
      sample.id,
    )
  }
  for (const revision of p.studio.revisions) {
    node('manuscript-revision', revision)
    edge(`scene:${revision.sceneId}`, 'revision', `manuscript-revision:${revision.id}`, revision.id)
  }
  for (const run of p.studio.runs) {
    node('manuscript-run', run)
    for (const source of run.sources) {
      const id = `${run.id}:${source.id}`
      node('manuscript-source', { ...source, originalId: source.id, id })
      edge(`manuscript-run:${run.id}`, 'compiled-from', `manuscript-source:${id}`, source.id)
    }
    if (run.sceneId) edge(`scene:${run.sceneId}`, 'reviewed-in', `manuscript-run:${run.id}`, run.id)
    if (run.parentId)
      edge(`manuscript-run:${run.parentId}`, 'repaired-by', `manuscript-run:${run.id}`, run.id)
    let previous = `manuscript-run:${run.id}`
    for (const step of run.steps) {
      node('specialist-step', step)
      edge(previous, 'next-step', `specialist-step:${step.id}`, step.id)
      previous = `specialist-step:${step.id}`
    }
    for (const finding of run.findings) {
      node('manuscript-finding', finding)
      edge(`manuscript-run:${run.id}`, 'reports', `manuscript-finding:${finding.id}`, finding.id)
      for (const id of finding.sourceIds)
        edge(
          `manuscript-finding:${finding.id}`,
          'supported-by',
          `manuscript-source:${run.id}:${id}`,
          finding.id,
        )
    }
  }
  for (const change of p.studio.canonChanges) {
    node('manuscript-approval', change)
    edge(
      `scene:${change.sceneId}`,
      'author-approved',
      `manuscript-approval:${change.id}`,
      change.id,
    )
    if (change.runId)
      edge(
        `manuscript-run:${change.runId}`,
        'source-review',
        `manuscript-approval:${change.id}`,
        change.id,
      )
    const target = `${change.kind}:${change.recordId}`
    if (nodes.some((n) => n.id === target))
      edge(`manuscript-approval:${change.id}`, 'establishes', target, change.id)
    if (change.previousId && nodes.some((n) => n.id === `fact:${change.previousId}`))
      edge(`manuscript-approval:${change.id}`, 'supersedes', `fact:${change.previousId}`, change.id)
  }
  for (const v of p.proposals) {
    node('proposal', v)
    edge(turnKey(v.adventureId, v.turnId), 'proposes', `proposal:${v.id}`, v.id)
  }
  for (const approval of p.approvals) {
    node('approval', approval)
    edge(`proposal:${approval.proposalId}`, approval.action, `approval:${approval.id}`, approval.id)
  }
  for (const [kind, items] of [
    ['fact', p.facts],
    ['relationship', p.relationships],
    ['event', p.events],
    ['claim', p.knowledge],
  ] as const) {
    for (const item of items) {
      if (item.provenance?.turnId)
        edge(
          turnKey(item.provenance.adventureId, item.provenance.turnId),
          'source',
          `${kind}:${item.id}`,
          item.id,
        )
      if (item.provenance?.approvalId)
        edge(`approval:${item.provenance.approvalId}`, 'establishes', `${kind}:${item.id}`, item.id)
    }
  }
  for (const [kind, items] of [
    ['fact', p.facts],
    ['relationship', p.relationships],
  ] as const)
    for (const item of items) {
      if (item.establishedByEventId)
        edge(`event:${item.establishedByEventId}`, 'establishes', `${kind}:${item.id}`, item.id)
      if (item.endedByEventId)
        edge(`event:${item.endedByEventId}`, 'ends', `${kind}:${item.id}`, item.id)
    }
  return { nodes, edges: [...new Map(edges.map((e) => [e.id, e])).values()] }
}

export function graphFindings(p: Project): Finding[] {
  const findings: Finding[] = []
  let work = 0
  const exceeded = () => {
    if (++work <= 20000 && findings.length < 200) return false
    findings.push({
      id: 'review-limit',
      message:
        'This graph exceeds the bounded consistency review. Some possible contradictions have not been checked; review a smaller affected neighborhood.',
      sourceIds: [],
    })
    return true
  }
  const name = (id: string) => p.entities.find((e) => e.id === id)?.name || id
  const events = p.events.filter((e) => e.status === 'Canon' && e.order !== undefined)
  for (const death of events)
    for (const id of death.deathOf || [])
      for (const later of events) {
        if (exceeded()) return findings
        if (later.order! > death.order! && later.entityIds.includes(id))
          findings.push({
            id: `death:${death.id}:${later.id}:${id}`,
            message: `${name(id)} participates in “${later.title}” after their canonical death.`,
            sourceIds: [death.id, later.id, id],
          })
      }
  for (const item of [...p.facts, ...p.relationships].filter((v) => v.status === 'Canon')) {
    const { from, until } = temporalBounds(p, item)
    if (from !== undefined && until !== undefined && until <= from)
      findings.push({
        id: `interval:${item.id}`,
        message: 'A validity interval ends before it begins (or has no duration).',
        sourceIds: [item.id],
      })
  }
  const owners = p.relationships.filter(
    (r) => r.status === 'Canon' && relationKind(r) === 'ownership',
  )
  for (let i = 0; i < owners.length; i++)
    for (let j = i + 1; j < owners.length; j++) {
      if (exceeded()) return findings
      const a = owners[i],
        b = owners[j],
        x = temporalBounds(p, a),
        y = temporalBounds(p, b)
      if (
        a.from === b.from &&
        a.to !== b.to &&
        Math.max(x.from ?? -Infinity, y.from ?? -Infinity) <
          Math.min(x.until ?? Infinity, y.until ?? Infinity)
      )
        findings.push({
          id: `ownership:${a.id}:${b.id}`,
          message: `${name(a.from)} has overlapping exclusive ownership claims. Unknown bounds are treated as possibly overlapping.`,
          sourceIds: [a.id, b.id],
        })
    }
  const containment = p.relationships.filter(
    (r) => r.status === 'Canon' && relationKind(r) === 'containment',
  )
  const outgoing = new Map<string, Relationship[]>()
  for (const r of containment) outgoing.set(r.from, [...(outgoing.get(r.from) || []), r])
  const reported = new Set<string>()
  for (const start of containment) {
    const bounds = temporalBounds(p, start)
    const stack = [
      {
        id: start.to,
        route: [start],
        seen: new Set([start.from]),
        from: bounds.from ?? -Infinity,
        until: bounds.until ?? Infinity,
      },
    ]
    while (stack.length) {
      if (exceeded()) return findings
      const state = stack.pop()!
      if (state.id === start.from) {
        const ids = state.route.map((r) => r.id).sort(),
          key = ids.join(':')
        if (!reported.has(key)) {
          reported.add(key)
          findings.push({
            id: `containment:${ids[0]}:${ids.length}`,
            message: `A containment cycle includes ${name(start.from)}. Review whether this is an intentional paradox.`,
            sourceIds: ids,
          })
        }
        continue
      }
      if (state.seen.has(state.id) || state.route.length >= p.entities.length) continue
      if (state.route.length >= 128) {
        work = 20000
        exceeded()
        return findings
      }
      for (const next of outgoing.get(state.id) || []) {
        if (exceeded()) return findings
        const b = temporalBounds(p, next),
          from = Math.max(state.from, b.from ?? -Infinity),
          until = Math.min(state.until, b.until ?? Infinity)
        if (from < until)
          stack.push({
            id: next.to,
            route: [...state.route, next],
            seen: new Set([...state.seen, state.id]),
            from,
            until,
          })
      }
    }
  }
  return findings
}

/** Only material story state advances the revision; checkpoint writes do not invalidate themselves. */
export function materialState(p: Project) {
  return JSON.stringify({
    title: p.title,
    entities: p.entities,
    relationships: p.relationships,
    facts: p.facts,
    knowledge: p.knowledge,
    events: p.events,
    scenarios: p.scenarios,
    settings: p.settings,
    voiceProfiles: p.studio.profiles,
    writingSamples: p.studio.samples,
    scenes: p.scenes,
    conversationClips: p.studio.clips,
    adventures: p.adventures.map((a) => ({
      id: a.id,
      scenario: a.scenario,
      currentEventId: a.currentEventId,
      headId: a.headId,
      turns: a.turns.map((t) => ({
        id: t.id,
        parentId: t.parentId,
        text: t.text,
        input: t.input,
        intent: t.intent,
      })),
    })),
  })
}
