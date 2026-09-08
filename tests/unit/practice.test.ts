import { describe, it, expect, vi } from 'vitest'
import { createDemo } from '../../src/domain/seed'
import { addTurn, forkAt, newProposal } from '../../src/domain/story'
import { keepConversation } from '../../src/domain/conversation'
import {
  startSession,
  recordPracticeEdits,
  sessionTotals,
  sessionProgress,
  pauseSessions,
  addSessionTime,
  dayKey,
} from '../../src/domain/practice'
import { parseProject, serializeProject, restorableJSON } from '../../src/domain/project-file'
import { createManuscriptRun, studioRequest, runIsStale } from '../../src/domain/manuscript'
import { createWorkflow } from '../../src/domain/coordination'
import { acceptWorkflowNarrative, stepWorkflow } from '../../src/domain/execution-graph'
import { validateOperation } from '../../src/domain/canon-rules'
import { compileContext } from '../../src/domain/context'
import { materialState } from '../../src/domain/world-graph'
import type { ConversationClip } from '../../src/domain/practice-schema'

function conversation(mode: 'interview' | 'staged' | 'explore' = 'interview') {
  const p = createDemo(),
    a = p.adventures[0]
  a.scenario.practiceMode = mode
  const t = addTurn(a, {
    input: 'What did the ferry mean to you?',
    text: 'I kept the last ticket. Nobody ever asked for it.',
    intent: 'Say',
    context: '',
    model: 'Test model',
  })
  const input: Omit<ConversationClip, 'id' | 'sceneId' | 'createdAt'> = {
    adventureId: a.id,
    branchHeadId: t.id,
    mode,
    title: 'The last ticket',
    method: 'exact',
    excerpts: [
      {
        turnId: t.id,
        field: 'text',
        start: 0,
        end: 23,
        text: t.text.slice(0, 23),
        speaker: 'Mara',
        origin: 'assisted',
      },
    ],
  }
  return { p, a, t, input }
}
describe('local practice history', () => {
  it('migrates old projects with opt-in history, preserving creative content', () => {
    const p = createDemo(),
      legacy = {
        ...p,
        schemaVersion: 3,
        activity: undefined,
        studio: { ...p.studio, clips: undefined },
      }
    const result = parseProject(JSON.stringify(legacy))
    expect(result.schemaVersion).toBe(6)
    expect(result.activity).toEqual({ enabled: false, sessions: [] })
    expect(result.studio.clips).toEqual([])
    expect(result.scenes).toEqual(p.scenes)
    expect(result.facts).toEqual(p.facts)
  })
  it('starts at zero, keeps assisted/imported edits separate, and records revision without rewarding it as new words', () => {
    let p = createDemo()
    const scene = p.scenes[0]
    scene.text = 'Existing words'
    const s = startSession(p, { title: 'Practice', kind: 'writing', goal: 5, target: 'words' })
    expect(sessionProgress(s)).toBe(0)
    const change = (text: string, origin: 'author' | 'assisted' | 'imported' = 'author') => {
      const after = structuredClone(p)
      after.scenes[0].text = text
      recordPracticeEdits(p, after, origin)
      p = after
    }
    change('Existing words and three more')
    expect(sessionTotals(p.activity.sessions[0]).author).toBe(3)
    change('Existing words and three more with generated dialogue', 'assisted')
    change('Existing words and three more with generated dialogue and source excerpts', 'imported')
    expect(sessionTotals(p.activity.sessions[0])).toMatchObject({
      author: 3,
      assisted: 3,
      imported: 3,
    })
    change('Revised words and three more with generated dialogue and source excerpts')
    expect(sessionTotals(p.activity.sessions[0])).toMatchObject({ author: 3, edits: 2 })
    pauseSessions(p, 'Rest')
    change('')
    expect(sessionTotals(p.activity.sessions[0]).author).toBe(3)
    expect(JSON.stringify(p.activity)).not.toContain('Existing words')
    expect(parseProject(serializeProject(p)).activity).toEqual(p.activity)
  })
  it('counts removed scenes, entries, and attributes as word decreases', () => {
    const p = createDemo()
    p.scenes = [p.scenes[0]]
    p.scenes[0].text = 'A deleted scene'
    startSession(p, { title: 'Revise', kind: 'writing', goal: 5, target: 'words' })
    const after = structuredClone(p)
    after.scenes = []
    recordPracticeEdits(p, after)
    expect(sessionTotals(after.activity.sessions[0]).author).toBe(-3)
    p.activity.sessions[0].kind = 'worldbuilding'
    p.entities = [p.entities[0], p.entities[1]]
    for (const entity of p.entities) {
      entity.summary = 'A description'
      entity.notes = ''
      entity.fields = { custom: 'A custom attribute' }
    }
    const revised = structuredClone(p)
    revised.entities.pop()
    delete revised.entities[0].fields.custom
    recordPracticeEdits(p, revised)
    expect(sessionTotals(revised.activity.sessions[0]).author).toBe(-8)
  })
  it('separates accepted player input from character replies without double-counting Story text', () => {
    const { p, a } = conversation()
    startSession(p, {
      title: 'Interview',
      kind: 'conversation',
      goal: 10,
      target: 'minutes',
      adventureId: a.id,
    })
    const after = structuredClone(p)
    addTurn(after.adventures[0], {
      input: 'Why not?',
      text: 'I was afraid.',
      intent: 'Say',
      context: '',
      model: 'fixture',
    })
    addTurn(after.adventures[0], {
      input: 'My own passage.',
      text: 'My own passage.',
      intent: 'Story',
      context: '',
      model: 'Author',
    })
    recordPracticeEdits(p, after)
    expect(sessionTotals(after.activity.sessions[0])).toMatchObject({ author: 5, assisted: 3 })
  })
  it('limits one open session, and clock updates do not stale manuscript work', () => {
    const p = createDemo()
    const run = createManuscriptRun(p, p.scenes[0].id, {
      mode: 'opening',
      direction: 'Begin.',
      start: 0,
      end: 0,
      includePrivate: false,
      includeSamples: false,
      layers: [],
    })
    const state = materialState(p)
    const s = startSession(p, { title: 'Writing', kind: 'writing', goal: 1, target: 'minutes' })
    expect(() =>
      startSession(p, { title: 'Other', kind: 'writing', goal: 1, target: 'minutes' }),
    ).toThrow('Finish')
    const start = new Date(2026, 8, 6, 23, 59, 58).getTime()
    addSessionTime(s, start, start + 5000)
    expect(s.days.map((d) => d.milliseconds)).toEqual([2000, 3000])
    expect(s.days[0].date).toBe(dayKey(start))
    addSessionTime(s, start + 5000, start + 60 * 60 * 1000)
    expect(sessionTotals(s).milliseconds).toBe(20000)
    pauseSessions(p, 'Paused')
    addSessionTime(s, start, start + 1000)
    expect(sessionTotals(s).milliseconds).toBe(20000)
    expect(materialState(p)).toBe(state)
    expect(runIsStale(p, run)).toBe(false)
    expect(() => restorableJSON(p)).not.toThrow()
  })
})
describe('conversation to manuscript authority', () => {
  it('keeps exact partial text and source attribution through export without promoting interview events', () => {
    const { p, input, t } = conversation()
    const facts = structuredClone(p.facts),
      memories = structuredClone(p.memories)
    const clip = keepConversation(p, input),
      scene = p.scenes.find((s) => s.id === clip.sceneId)!
    expect(scene.text).toBe(t.text.slice(0, 23))
    expect(scene.adventureId).toBeUndefined()
    expect(scene.viewpointId).toBeUndefined()
    expect(p.facts).toEqual(facts)
    expect(p.memories).toEqual(memories)
    const result = parseProject(serializeProject(p))
    expect(result.studio.clips[0]).toEqual(clip)
    expect(result.studio.revisions[0].text).toBe('')
  })
  it('preserves an explicitly selected branch and rejects mismatched or forged excerpts', () => {
    const { p, a, t, input } = conversation('staged')
    forkAt(a, null)
    const sibling = addTurn(a, {
      input: 'Other',
      text: 'An unrelated branch.',
      intent: 'Story',
      context: '',
      model: 'Author',
    })
    const clip = keepConversation(p, input)
    expect(p.scenes.find((s) => s.id === clip.sceneId)?.branchHeadId).toBe(t.id)
    expect(() => keepConversation(p, { ...input, branchHeadId: sibling.id })).toThrow('source')
    expect(() =>
      keepConversation(p, { ...input, excerpts: [{ ...input.excerpts[0], text: 'Invented' }] }),
    ).toThrow('source')
    expect(() =>
      keepConversation(p, { ...input, excerpts: [{ ...input.excerpts[0], origin: 'author' }] }),
    ).toThrow('origin')
    const forged = structuredClone(p)
    expect(() =>
      keepConversation(p, {
        ...input,
        excerpts: [{ ...input.excerpts[0], end: t.text.length + 1, text: t.text }],
      }),
    ).toThrow('source')
    forged.studio.clips[0].excerpts[0].end = t.text.length + 1
    forged.studio.clips[0].excerpts[0].text = t.text
    expect(() => parseProject(JSON.stringify(forged))).toThrow('source branch')
    forged.studio.clips[0].excerpts[0].text = 'Altered'
    expect(() => parseProject(JSON.stringify(forged))).toThrow('source branch')
  })
  it('passes whole selected sources to independent adaptation contexts with rehearsal limits and prose rules', () => {
    const { p, input } = conversation()
    input.method = 'adapt'
    const clip = keepConversation(p, input)
    const scene = p.scenes.find((s) => s.id === clip.sceneId)!
    expect(scene.text).toBe('')
    const run = createManuscriptRun(p, clip.sceneId, {
      mode: 'adapt',
      clipId: clip.id,
      direction: 'Use the ticket line in a guarded scene.',
      start: 0,
      end: 0,
      includePrivate: false,
      includeSamples: false,
      layers: ['canon', 'prose', 'voice'],
    })
    expect(JSON.parse(run.context).conversationSource.excerpts).toEqual(clip.excerpts)
    const writer = studioRequest(run)
    expect(writer.prompt).toContain('An interview is rehearsal')
    expect(writer.system).toContain('PROSE STYLE')
    run.node = 'continuity'
    const reviewer = studioRequest(run)
    expect(reviewer.prompt).toContain('outside the fictional timeline')
    expect(reviewer.prompt).toContain(input.excerpts[0].text)
    expect(run.clipId).toBe(clip.id)
  })
  it('does not request extraction or create episodic memory for an interview', async () => {
    const { p, a } = conversation()
    const memories = structuredClone(p.memories)
    const w = createWorkflow(p, a.id, 'Tell me more.', 'Say', 'fixture')
    w.node = 'humanNarrativeReview'
    w.status = 'review'
    p.workflows.push(w)
    const t = acceptWorkflowNarrative(p, w.id, 'I kept it for my sister.')
    p.worldRevision++
    const complete = vi.fn()
    const result = await stepWorkflow(p, w, { complete })
    expect(complete).not.toHaveBeenCalled()
    expect(result.workflow.node).toBe('updateMemory')
    expect(p.memories).toEqual(memories)
    expect(() => validateOperation(p, newProposal(a, t.id, 'Interview happened'))).toThrow(
      'rehearsal',
    )
    expect(w.boundaries.some((b) => b.sourceId === 'session-mode')).toBe(true)
  })
  it('filters unknown secrets during character interviews and supports an interview without a location', () => {
    const { p, a } = conversation()
    a.scenario.locationId = ''
    const context = compileContext(p, a, 'What happened?', 'Say')
    const hidden = p.facts.find(
      (f) => f.visibility === 'private' && !f.knownTo.includes(a.scenario.characterId),
    )!
    expect(hidden).toBeTruthy()
    expect(context.prompt).not.toContain(hidden.object)
    expect(context.prompt).toContain('human is the author')
    expect(context.warnings).toEqual([])
    expect(() => serializeProject(p)).not.toThrow()
  })
})
