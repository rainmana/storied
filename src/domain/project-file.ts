import { projectSchema, type Project } from './schema'
import { studioSchema } from './manuscript-schema'

export const MAX_PROJECT_BYTES = 32 * 1024 * 1024
export function restorableJSON(project: Project): string {
  const studio = studioSchema.safeParse(project.studio)
  if (!studio.success)
    throw new Error(
      `This change exceeds the saved manuscript format at ${studio.error.issues[0]?.path.join('.')}. The change was not applied; shorten this entry or export a backup before clearing history.`,
    )
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
    p.studio.samples,
    p.studio.profiles,
    p.studio.runs,
    p.studio.revisions,
    p.studio.canonChanges,
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
  p.scenes.forEach((s) => {
    s.entityIds.forEach(requireEntity)
    if (s.viewpointId) {
      requireEntity(s.viewpointId)
      if (p.entities.find((e) => e.id === s.viewpointId)?.type !== 'Character')
        throw new Error('A scene viewpoint must be a character.')
    }
    if (s.locationId) {
      requireEntity(s.locationId)
      if (p.entities.find((e) => e.id === s.locationId)?.type !== 'Location')
        throw new Error('A scene setting must be a location.')
    }
    if (s.eventId && !p.events.some((e) => e.id === s.eventId))
      throw new Error('Missing scene event.')
    if (s.adventureId && !p.adventures.some((a) => a.id === s.adventureId))
      throw new Error('Missing scene branch.')
    if (
      s.branchHeadId &&
      !p.adventures.find((a) => a.id === s.adventureId)?.turns.some((t) => t.id === s.branchHeadId)
    )
      throw new Error('Missing manuscript branch head.')
    if (s.voiceProfileId && !p.studio.profiles.some((v) => v.id === s.voiceProfileId))
      throw new Error('Missing scene voice profile.')
  })
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
  for (const sample of p.studio.samples)
    if (!p.studio.profiles.some((v) => v.id === sample.profileId))
      throw new Error('Missing sample profile.')
  for (const profile of p.studio.profiles) {
    if (new Set(profile.traits.map((t) => t.id)).size !== profile.traits.length)
      throw new Error('Duplicate voice trait.')
    for (const trait of profile.traits)
      for (const evidence of trait.evidence)
        if (
          !p.studio.samples.some(
            (s) =>
              s.id === evidence.sampleId &&
              s.profileId === profile.id &&
              s.text.includes(evidence.quote),
          )
        )
          throw new Error('Voice evidence is not grounded in its sample.')
  }
  const earlierRuns = new Set<string>()
  for (const run of p.studio.runs) {
    if (run.sceneId && !p.scenes.some((s) => s.id === run.sceneId))
      throw new Error('Missing manuscript run scene.')
    if (run.profileId && !p.studio.profiles.some((v) => v.id === run.profileId))
      throw new Error('Missing analysis profile.')
    if (run.parentId && !earlierRuns.has(run.parentId)) throw new Error('Missing source run.')
    earlierRuns.add(run.id)
    if (run.start > run.end || run.end > run.sceneText.length)
      throw new Error('Invalid manuscript selection.')
    for (const items of [run.steps, run.findings, run.sources, run.boundaries, run.observations])
      if (new Set(items.map((v) => v.id)).size !== items.length)
        throw new Error('Duplicate manuscript evidence identifier.')
    for (const f of run.findings) {
      if (run.candidate.slice(f.start, f.end) !== f.quote)
        throw new Error('Review annotation no longer matches its source passage.')
      if (f.sourceIds.some((id) => !run.sources.some((s) => s.id === id)))
        throw new Error('Missing reviewer source evidence.')
      if (
        f.layer === 'canon' &&
        !f.sourceIds.some((id) =>
          run.sources.some((s) => s.id === id && !['voice', 'sample'].includes(s.kind)),
        )
      )
        throw new Error('Canon findings require world evidence.')
      if (
        f.layer === 'voice' &&
        !f.sourceIds.some((id) => run.sources.some((s) => s.id === id && s.kind === 'voice'))
      )
        throw new Error('Voice findings require profile evidence.')
    }
    for (const observation of run.observations)
      for (const e of observation.evidence)
        if (
          !run.sources.some(
            (s) => s.id === e.sampleId && s.kind === 'sample' && s.text.includes(e.quote),
          )
        )
          throw new Error('Analysis evidence is not in the inspected sample.')
  }
  for (const revision of p.studio.revisions)
    if (!p.scenes.some((s) => s.id === revision.sceneId)) throw new Error('Missing revision scene.')
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
  // v3 adds manuscript review and voice evidence without altering existing prose or canon.
  if (input && typeof input === 'object' && 'schemaVersion' in input && input.schemaVersion === 2)
    input = { ...input, schemaVersion: 3 }
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
  const key = (s: Project['scenes'][number]) => JSON.stringify([s.book, s.chapter])
  const chapters = [...new Set(p.scenes.map(key))]
  return chapters
    .flatMap((chapter) => p.scenes.filter((s) => key(s) === chapter))
    .map((s) =>
      format === 'md'
        ? `# ${s.book}\n\n## ${s.chapter}\n\n### ${s.title}\n\n${s.text}`
        : `${s.book}\n${s.chapter}\n${s.title}\n\n${s.text}`,
    )
    .join('\n\n---\n\n')
}
