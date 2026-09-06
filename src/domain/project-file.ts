import { projectSchema, type Project } from './schema'

export const MAX_PROJECT_BYTES = 32 * 1024 * 1024
export function restorableJSON(project: Project): string {
  const text = JSON.stringify(project)
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES)
    throw new Error(
      'This world has reached the 32 MB project limit. The last change was not applied. Export this world and continue in a new project, or remove an attached image.',
    )
  return text
}
export function validateReferences(p: Project): Project {
  for (const collection of [
    p.entities,
    p.relationships,
    p.facts,
    p.knowledge,
    p.scenes,
    p.scenarios,
    p.adventures,
    p.events,
    p.memories,
    p.proposals,
    p.journal,
    p.assets,
    p.templates,
    p.workflows,
    p.approvals,
  ]) {
    if (new Set(collection.map((x) => x.id)).size !== collection.length)
      throw new Error('This project contains duplicate identifiers.')
  }
  const entities = new Set(p.entities.map((e) => e.id))
  const facts = new Set(p.facts.map((f) => f.id))
  const assets = new Set(p.assets.map((a) => a.id))
  const requireEntity = (value: string) => {
    if (!entities.has(value)) throw new Error(`A world reference is missing: ${value}`)
  }
  p.entities.forEach((e) => {
    e.knownTo.forEach(requireEntity)
    e.assetIds.forEach((a) => {
      if (!assets.has(a)) throw new Error('Missing image reference.')
    })
  })
  p.relationships.forEach((r) => {
    requireEntity(r.from)
    requireEntity(r.to)
    r.knownTo.forEach(requireEntity)
  })
  p.facts.forEach((f) => {
    requireEntity(f.subjectId)
    f.knownTo.forEach(requireEntity)
  })
  p.knowledge.forEach((k) => {
    requireEntity(k.entityId)
    if (k.factId && !facts.has(k.factId)) throw new Error('Missing fact reference.')
    if (k.learnedAtEventId && !p.events.some((e) => e.id === k.learnedAtEventId))
      throw new Error('Missing event reference.')
  })
  p.scenes.forEach((s) => s.entityIds.forEach(requireEntity))
  const checkScenario = (s: Project['scenarios'][number]) => {
    requireEntity(s.characterId)
    requireEntity(s.locationId)
    s.activeEntityIds.forEach(requireEntity)
    if (
      p.entities.find((e) => e.id === s.characterId)?.type !== 'Character' ||
      p.entities.find((e) => e.id === s.locationId)?.type !== 'Location'
    )
      throw new Error('A scenario needs a character and a location.')
  }
  p.scenarios.forEach(checkScenario)
  p.adventures.forEach((a) => {
    checkScenario(a.scenario)
    const turns = new Set<string>()
    // Parents must occur first: rejects cycles, missing parents, and duplicate turns.
    for (const t of a.turns) {
      if (turns.has(t.id) || (t.parentId && !turns.has(t.parentId)))
        throw new Error('The story branch history is invalid.')
      turns.add(t.id)
    }
    if (a.headId && !turns.has(a.headId)) throw new Error('Missing active story turn.')
    a.redoIds.forEach((t) => {
      if (!turns.has(t)) throw new Error('Missing redo turn.')
    })
  })
  const checkTurn = (aId: string, tId: string) => {
    if (!p.adventures.find((a) => a.id === aId)?.turns.some((t) => t.id === tId))
      throw new Error('Missing story source.')
  }
  p.memories.forEach((m) => {
    requireEntity(m.characterId)
    checkTurn(m.adventureId, m.turnId)
  })
  p.proposals.forEach((v) => {
    requireEntity(v.subjectId)
    if (v.targetId) requireEntity(v.targetId)
    checkTurn(v.adventureId, v.turnId)
  })
  p.events.forEach((e) => {
    e.entityIds.forEach(requireEntity)
    if (e.locationId) requireEntity(e.locationId)
  })
  p.assets.forEach((a) => a.pins.forEach((pin) => requireEntity(pin.entityId)))
  const requireEvent = (id?: string) => {
    if (id && !p.events.some((e) => e.id === id))
      throw new Error('Missing temporal event reference.')
  }
  for (const item of [...p.facts, ...p.relationships]) {
    requireEvent(item.establishedByEventId)
    requireEvent(item.endedByEventId)
  }
  p.events.forEach((e) => e.deathOf?.forEach(requireEntity))
  p.adventures.forEach((a) => requireEvent(a.currentEventId))
  for (const w of p.workflows) {
    const a = p.adventures.find((a) => a.id === w.adventureId)
    if (!a || (w.parentId && !a.turns.some((t) => t.id === w.parentId)))
      throw new Error('Missing workflow branch reference.')
    if (w.turnId) checkTurn(w.adventureId, w.turnId)
    if (new Set(w.boundaries.map((b) => b.id)).size !== w.boundaries.length)
      throw new Error('Duplicate boundary reference.')
    for (const item of [...w.coordination.items, ...w.coordination.interpretations])
      if (!w.boundaries.some((b) => b.id === item.sourceBoundaryId))
        throw new Error('Missing coordination boundary source.')
    w.proposalIds.forEach((id) => {
      if (!p.proposals.some((v) => v.id === id && v.adventureId === w.adventureId))
        throw new Error('Missing workflow proposal reference.')
    })
  }
  p.approvals.forEach((approval) => {
    checkTurn(approval.adventureId, approval.turnId)
    if (!p.proposals.some((v) => v.id === approval.proposalId))
      throw new Error('Missing approval proposal reference.')
  })
  return p
}

export function parseProject(text: string): Project {
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES)
    throw new Error('Project files must be smaller than 32 MB in this MVP.')
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    throw new Error('This is not a valid .storyworld JSON file.')
  }
  // v0 was the documented envelope used by the initial prototype; no SQL, code, or model URLs are restored.
  if (
    input &&
    typeof input === 'object' &&
    'format' in input &&
    input.format === 'storied' &&
    'version' in input &&
    input.version === 0 &&
    'project' in input
  )
    input = input.project
  // Additive v1 -> v2 migration preserves every existing world and its branch tree.
  // New checkpoints cannot be read by the old app, so the format version advances explicitly.
  if (input && typeof input === 'object' && 'schemaVersion' in input && input.schemaVersion === 1)
    input = { ...input, schemaVersion: 2 }
  const parsed = projectSchema.safeParse(input)
  if (!parsed.success)
    throw new Error(
      `This project format is not supported or is damaged (${parsed.error.issues[0]?.path.join('.') || 'root'}).`,
    )
  return validateReferences(parsed.data)
}
export function serializeProject(project: Project): string {
  return restorableJSON(validateReferences(projectSchema.parse(project)))
}
export function manuscriptExport(p: Project, format: 'md' | 'txt'): string {
  return p.scenes
    .map((s) =>
      format === 'md'
        ? `# ${s.book}\n\n## ${s.chapter}\n\n### ${s.title}\n\n${s.text}`
        : `${s.book}\n${s.chapter}\n${s.title}\n\n${s.text}`,
    )
    .join('\n\n---\n\n')
}
