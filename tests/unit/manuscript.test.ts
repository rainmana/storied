import { describe, it, expect } from 'vitest'
import { createDemo } from '../../src/domain/seed'
import { now, uid, type Fact } from '../../src/domain/schema'
import {
  acceptManuscript,
  commitCanonEdit,
  createManuscriptRun,
  localProseFindings,
  previewCanonEdit,
  receiveStudioResult,
  runIsStale,
  sceneBranch,
  studioRequest,
  type CanonEdit,
  type RunOptions,
} from '../../src/domain/manuscript'
import { buildWorldGraph, materialState } from '../../src/domain/world-graph'
import {
  parseProject,
  serializeProject,
  restorableJSON,
  manuscriptExport,
} from '../../src/domain/project-file'
import { synchronizeImportedWorkflows } from '../../src/domain/coordination'

function fixture() {
  const p = createDemo(),
    scene = p.scenes[0],
    character = p.entities.find((e) => e.type === 'Character')!
  scene.viewpointId = character.id
  scene.entityIds = [character.id]
  scene.text = 'Mara carried a brass compass. She waited.'
  const fact: Fact = {
    id: uid(),
    subjectId: character.id,
    predicate: 'Compass material',
    object: 'Silver',
    status: 'Canon',
    visibility: 'public',
    knownTo: [],
    provenance: { kind: 'author', note: '' },
  }
  p.facts.push(fact)
  const options: RunOptions = {
    mode: 'review',
    direction: 'Keep the scene grounded.',
    start: 0,
    end: scene.text.length,
    includePrivate: false,
    includeSamples: false,
    layers: ['canon', 'prose', 'voice'],
  }
  return { p, scene, character, fact, options }
}
const output = (quote: string, sourceIds: string[], occurrence = 0) =>
  JSON.stringify({
    findings: [
      {
        quote,
        occurrence,
        explanation: 'This differs from the supplied fact.',
        replacement: 'a silver compass',
        sourceIds,
      },
    ],
  })
describe('manuscript graph boundaries', () => {
  it('uses a compact output contract on device without changing the supplied evidence', () => {
    const { p, scene, options } = fixture(),
      run = createManuscriptRun(p, scene.id, options)
    const full = studioRequest(run),
      compact = studioRequest(run, true)
    expect(compact.schema.properties.findings.maxItems).toBe(1)
    expect(compact.schema.properties.findings.items.properties.explanation.maxLength).toBe(300)
    expect(compact.prompt).toContain('COMPACT LOCAL PASS')
    expect(compact.prompt.slice(compact.prompt.indexOf('{"operation"'))).toBe(
      full.prompt.slice(full.prompt.indexOf('{"operation"')),
    )
  })
  it('migrates v2 without changing prose, secrets, or branch history', () => {
    const { p } = fixture(),
      legacy = { ...p, schemaVersion: 2, studio: undefined }
    const restored = parseProject(JSON.stringify(legacy))
    expect(restored.schemaVersion).toBe(6)
    expect(restored.scenes).toEqual(p.scenes)
    expect(restored.facts).toEqual(p.facts)
    expect(restored.adventures).toEqual(p.adventures)
    expect(restored.studio.samples).toEqual([])
  })
  it('keeps hidden canonical corrections out of limited viewpoint drafting, even with author review opt-in', () => {
    const { p, scene, character, options } = fixture()
    p.facts.push({
      id: uid(),
      subjectId: character.id,
      predicate: 'Hidden motive',
      object: 'SECRET_ONLY_THE_AUTHOR_KNOWS',
      status: 'Canon',
      visibility: 'private',
      knownTo: [],
      provenance: { kind: 'author', note: '' },
    })
    const run = createManuscriptRun(p, scene.id, {
      ...options,
      mode: 'opening',
      end: 0,
      includePrivate: true,
    })
    expect(studioRequest(run).prompt).not.toContain('SECRET_ONLY_THE_AUTHOR_KNOWS')
    receiveStudioResult(run, JSON.stringify({ text: 'She waited.' }))
    expect(studioRequest(run).prompt).toContain('SECRET_ONLY_THE_AUTHOR_KNOWS')
  })
  it('never dereferences a belief into hidden objective truth', () => {
    const { p, scene, character, fact, options } = fixture()
    fact.visibility = 'private'
    fact.object = 'SECRET_GROUND_TRUTH'
    p.knowledge.push({
      id: uid(),
      entityId: character.id,
      factId: fact.id,
      claim: 'The compass is brass.',
      stance: 'believes',
      confidence: 0.8,
      source: 'A memory',
    })
    const run = createManuscriptRun(p, scene.id, options),
      request = studioRequest(run)
    expect(request.prompt).toContain('The compass is brass.')
    expect(request.prompt).not.toContain('SECRET_GROUND_TRUTH')
  })
  it('withholds future and unknown-time facts, and pins a selected branch point', () => {
    const { p, scene, fact, options } = fixture()
    const event = { ...p.events[0], id: uid(), title: 'Later', order: 10, status: 'Canon' as const }
    p.events.push(event)
    fact.establishedByEventId = event.id
    let run = createManuscriptRun(p, scene.id, options)
    expect(run.sources.some((s) => s.id === fact.id)).toBe(false)
    scene.eventId = event.id
    run = createManuscriptRun(p, scene.id, options)
    expect(run.sources.some((s) => s.id === fact.id)).toBe(true)
    scene.adventureId = p.adventures[0].id
    scene.branchHeadId = undefined
    expect(sceneBranch(p, scene).headId).toBe(null)
  })
  it('requires explicit human direction and valid bounded selections', () => {
    const { p, scene, options } = fixture()
    expect(() =>
      createManuscriptRun(p, scene.id, { ...options, mode: 'opening', direction: '' }),
    ).toThrow(/Describe/)
    expect(() =>
      createManuscriptRun(p, scene.id, { ...options, end: scene.text.length + 1 }),
    ).toThrow(/valid passage/)
    scene.text = 'x'.repeat(8001)
    expect(() => createManuscriptRun(p, scene.id, { ...options, end: 8001 })).toThrow(/8,000/)
  })
  it('makes every reviewer independent of previous reviewers’ messages', () => {
    const { p, scene, fact, options } = fixture(),
      run = createManuscriptRun(p, scene.id, options)
    receiveStudioResult(run, output('brass compass', [fact.id]))
    run.findings[0].explanation = 'DO_NOT_PASS_THIS_REVIEWER_OPINION'
    expect(run.node).toBe('prose')
    expect(studioRequest(run).prompt).not.toContain('DO_NOT_PASS_THIS_REVIEWER_OPINION')
    expect(studioRequest(run).prompt).not.toContain(fact.id)
    expect(studioRequest(run).system).toContain('PROSE STYLE')
  })
  it('rejects invented spans and unsupported source identifiers atomically', () => {
    const { p, scene, options } = fixture(),
      run = createManuscriptRun(p, scene.id, options)
    expect(() => receiveStudioResult(run, output('absent quote', []))).toThrow(/outside/)
    expect(() => receiveStudioResult(run, output('brass compass', ['invented-fact']))).toThrow(
      /unsupported/,
    )
    expect(run.findings).toHaveLength(0)
    expect(run.node).toBe('continuity')
  })
  it('anchors repeated quotes to the specified occurrence', () => {
    const { p, scene, fact, options } = fixture()
    scene.text = 'brass compass, brass compass.'
    const run = createManuscriptRun(p, scene.id, { ...options, end: scene.text.length })
    receiveStudioResult(run, output('brass compass', [fact.id], 1))
    expect(run.findings[0].start).toBe(15)
    expect(run.candidate.slice(run.findings[0].start, run.findings[0].end)).toBe('brass compass')
  })
  it('keeps accepted voice preferences separate from samples and canon', () => {
    const { p, scene, options } = fixture(),
      profileId = uid(),
      sampleId = uid(),
      traitId = uid()
    p.studio.samples.push({
      id: sampleId,
      profileId,
      name: 'A gardening essay',
      text: 'SAMPLE_UNRELATED_TO_THIS_WORLD',
      createdAt: now(),
    })
    p.studio.profiles.push({
      id: profileId,
      name: 'Fiction',
      description: '',
      updatedAt: now(),
      traits: [
        {
          id: traitId,
          instruction: 'Vary sentence length.',
          category: 'rhythm',
          status: 'approved',
          evidence: [{ sampleId, quote: 'SAMPLE_UNRELATED_TO_THIS_WORLD' }],
        },
      ],
    })
    scene.voiceProfileId = profileId
    const run = createManuscriptRun(p, scene.id, options)
    expect(run.sources.some((s) => s.kind === 'sample')).toBe(false)
    expect(run.sources.find((s) => s.id === traitId)?.text).toBe('Vary sentence length.')
    expect(studioRequest(run).prompt).not.toContain('SAMPLE_UNRELATED_TO_THIS_WORLD')
    const graph = buildWorldGraph(p)
    expect(
      graph.edges.some((e) => e.kind === 'quoted-from' && e.to === `writing-sample:${sampleId}`),
    ).toBe(true)
    expect(p.facts.some((f) => f.object === 'SAMPLE_UNRELATED_TO_THIS_WORLD')).toBe(false)
  })
  it('requires sample excerpts to ground provisional observations', () => {
    const { p, options } = fixture(),
      profileId = uid(),
      sampleId = uid()
    p.studio.profiles.push({
      id: profileId,
      name: 'Voice',
      description: '',
      traits: [],
      updatedAt: now(),
    })
    p.studio.samples.push({
      id: sampleId,
      profileId,
      name: 'Letter',
      text: 'The room was quiet. I waited.',
      createdAt: now(),
    })
    const run = createManuscriptRun(p, undefined, {
      ...options,
      mode: 'analyze',
      profileId,
      start: 0,
      end: 0,
    })
    expect(() =>
      receiveStudioResult(
        run,
        JSON.stringify({
          observations: [
            {
              instruction: 'Use short sentences.',
              category: 'rhythm',
              evidence: [{ sampleId, quote: 'Invented sample.' }],
            },
          ],
        }),
      ),
    ).toThrow(/absent/)
    receiveStudioResult(
      run,
      JSON.stringify({
        observations: [
          {
            instruction: 'Use short sentences.',
            category: 'rhythm',
            evidence: [{ sampleId, quote: 'I waited.' }],
          },
        ],
      }),
    )
    expect(run.observations[0].status).toBe('suggested')
    expect(p.studio.profiles[0].traits).toEqual([])
  })
  it('rejects voice findings supported only by samples rather than an approved trait', () => {
    const { p, scene, options } = fixture(),
      run = createManuscriptRun(p, scene.id, options)
    run.node = 'voice'
    run.sources.push({
      id: 'sample',
      kind: 'sample',
      title: 'Example',
      text: 'Example.',
      writerAllowed: true,
    })
    expect(() => receiveStudioResult(run, output('brass compass', ['sample']))).toThrow(
      /unsupported/,
    )
  })
  it('invalidates a review on material voice changes but not checkpoint writes', () => {
    const { p, scene, options } = fixture(),
      run = createManuscriptRun(p, scene.id, options),
      before = materialState(p)
    p.studio.runs.push(run)
    expect(materialState(p)).toBe(before)
    p.studio.profiles.push({
      id: uid(),
      name: 'New voice',
      description: '',
      traits: [],
      updatedAt: now(),
    })
    expect(materialState(p)).not.toBe(before)
    p.worldRevision++
    expect(runIsStale(p, run)).toBe(true)
  })
  it('records local annotations without classifying authorship or changing text', () => {
    const text = 'A tapestry — it is worth noting.'
    const findings = localProseFindings(text)
    expect(findings.length).toBeGreaterThan(1)
    for (const f of findings) expect(text.slice(f.start, f.end)).toBe(f.quote)
    expect(JSON.stringify(findings)).not.toContain('probability')
  })
  it('accepts only human-reviewed current drafts and saves the exact previous text', () => {
    const { p, scene, options } = fixture(),
      run = createManuscriptRun(p, scene.id, { ...options, mode: 'revise', end: 4 }),
      before = scene.text
    p.studio.runs.push(run)
    expect(() => acceptManuscript(p, run.id, 'She')).toThrow(/review/)
    receiveStudioResult(run, JSON.stringify({ text: 'She' }))
    run.status = 'review'
    acceptManuscript(p, run.id, 'The cartographer')
    expect(scene.text).toBe('The cartographer' + before.slice(4))
    expect(p.studio.revisions[0].text).toBe(before)
    expect(run.candidate).toBe('She')
    expect(run.boundaries.at(-1)?.text).toBe('The cartographer')
    expect(() => acceptManuscript(p, run.id, 'Again')).toThrow()
  })
  it('blocks stale insertion after a prose edit even before revision increments', () => {
    const { p, scene, options } = fixture(),
      run = createManuscriptRun(p, scene.id, { ...options, mode: 'opening', end: 0 })
    run.status = 'review'
    p.studio.runs.push(run)
    scene.text += ' New text.'
    expect(() => acceptManuscript(p, run.id, 'Draft')).toThrow(/current/)
  })
  it('preserves canon before explicit approval, rejects changed tickets, and retains prior versions', () => {
    const { p, scene, character, fact } = fixture()
    const edit: CanonEdit = {
      kind: 'fact',
      subjectId: character.id,
      name: fact.predicate,
      value: 'Brass',
      entityType: 'Character',
      replaceId: fact.id,
      atEventId: '',
      reason: 'The author chose brass.',
    }
    const preview = previewCanonEdit(p, scene.id, edit)
    expect(fact.object).toBe('Silver')
    expect(p.studio.canonChanges).toHaveLength(0)
    expect(() =>
      commitCanonEdit(p, scene.id, { ...edit, value: 'Gold' }, preview.ticket, true),
    ).toThrow(/changed/)
    commitCanonEdit(p, scene.id, edit, preview.ticket, true)
    expect(fact.object).toBe('Silver')
    expect(fact.status).toBe('Deprecated')
    expect(p.facts.at(-1)?.object).toBe('Brass')
    expect(p.studio.canonChanges[0].before).toContain('Silver')
    expect(parseProject(serializeProject(p))).toEqual(p)
  })
  it('supports a change over time without retconning the earlier fact', () => {
    const { p, scene, character, fact } = fixture(),
      event = {
        ...p.events[0],
        id: uid(),
        title: 'Compass replaced',
        order: 20,
        status: 'Canon' as const,
      }
    p.events.push(event)
    const edit: CanonEdit = {
      kind: 'fact',
      subjectId: character.id,
      name: fact.predicate,
      value: 'Brass',
      entityType: 'Character',
      replaceId: fact.id,
      atEventId: event.id,
      reason: 'A new instrument.',
    }
    commitCanonEdit(p, scene.id, edit, previewCanonEdit(p, scene.id, edit).ticket, true)
    expect(fact.status).toBe('Canon')
    expect(fact.endedByEventId).toBe(event.id)
    expect(p.facts.at(-1)?.establishedByEventId).toBe(event.id)
  })
  it('rejects imported forged evidence and requires resynchronization after import', () => {
    const { p, scene, fact, options } = fixture(),
      run = createManuscriptRun(p, scene.id, options)
    receiveStudioResult(run, output('brass compass', [fact.id]))
    run.status = 'review'
    p.studio.runs.push(run)
    const restored = parseProject(serializeProject(p))
    synchronizeImportedWorkflows(restored)
    expect(restored.studio.runs[0].status).toBe('repair')
    run.findings[0].start++
    expect(() => parseProject(JSON.stringify(p))).toThrow(/annotation/)
  })
  it('links findings to immutable evidence and rejects a cycle in repair ancestry', () => {
    const { p, scene, fact, options } = fixture()
    const run = createManuscriptRun(p, scene.id, options)
    receiveStudioResult(run, output('brass compass', [fact.id]))
    p.studio.runs.push(run)
    const graph = buildWorldGraph(p)
    const edge = graph.edges.find(
      (e) => e.from === `manuscript-finding:${run.findings[0].id}` && e.kind === 'supported-by',
    )!
    expect(graph.nodes.find((n) => n.id === edge.to)?.body).toMatchObject({
      originalId: fact.id,
      text: expect.stringContaining('Silver'),
    })
    run.parentId = run.id
    expect(() => parseProject(JSON.stringify(p))).toThrow(/source run/)
  })
  it('refuses unportable studio records before persistence and exports the visible chapter order', () => {
    const { p, scene } = fixture()
    p.studio.profiles = Array.from({ length: 31 }, () => ({
      id: uid(),
      name: 'Voice',
      description: '',
      traits: [],
      updatedAt: now(),
    }))
    expect(() => restorableJSON(p)).toThrow(/saved manuscript format/)
    p.studio.profiles = []
    p.scenes = [
      scene,
      { ...scene, id: uid(), chapter: 'Chapter two', text: 'SECOND_CHAPTER' },
      { ...scene, id: uid(), text: 'FIRST_CHAPTER_END' },
    ]
    expect(manuscriptExport(p, 'md').indexOf('FIRST_CHAPTER_END')).toBeLessThan(
      manuscriptExport(p, 'md').indexOf('SECOND_CHAPTER'),
    )
  })
})
