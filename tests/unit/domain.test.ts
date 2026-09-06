import { describe, expect, it } from 'vitest'
import { compileContext, canSee, visibleEntities } from '../../src/domain/context'
import { createDemo } from '../../src/domain/seed'
import { newEntity, newProject, uid, now } from '../../src/domain/schema'
import { parseProject, serializeProject } from '../../src/domain/project-file'
import {
  addTurn,
  approveProposal,
  branchPath,
  forkAt,
  newProposal,
  possibleContradictions,
  redoTurn,
  startAdventure,
  undoTurn,
} from '../../src/domain/story'
import { textSearch } from '../../src/domain/search'

const narrative = (text: string) => ({
  intent: 'Do' as const,
  input: 'Look around.',
  text,
  context: 'Visible context',
  model: 'test fixture',
})
describe('the world membrane', () => {
  it('withholds the demo secret and does not disclose its hidden correction through a belief', () => {
    const p = createDemo(),
      a = p.adventures[0],
      secret = p.facts.find((f) => f.visibility === 'private')!
    const c = compileContext(p, a, 'Why did the light go out?')
    expect(c.prompt).not.toContain(secret.object)
    expect(c.prompt).not.toContain('extinguished the lantern deliberately')
    expect(c.prompt).not.toContain(secret.id)
    expect(c.prompt).toContain('no one could afford to repair it')
    expect(c.prompt).toContain('stance: believes')
  })
  it('does not reveal or imply that the king is secretly dead', () => {
    const p = createDemo(),
      a = p.adventures[0]
    const king = newEntity('Character', 'King Arden', 'A king known for his elaborate gardens.')
    p.entities.push(king)
    p.facts.push({
      id: uid(),
      subjectId: king.id,
      predicate: 'secret status',
      object: 'The king is secretly dead.',
      status: 'Canon',
      visibility: 'private',
      knownTo: [],
      provenance: { kind: 'author', note: 'Concealed from everyone' },
    })
    a.scenario.activeEntityIds.push(king.id)
    const c = compileContext(p, a, 'What is happening with the king?')
    expect(c.prompt).toContain('King Arden')
    expect(c.prompt).not.toMatch(/secretly dead|secret status|Concealed from everyone/)
  })
  it('excludes private entity names even when ranked first by semantic retrieval', () => {
    const p = createDemo(),
      a = p.adventures[0]
    const hidden = newEntity('Location', 'A hidden laboratory', 'The king is secretly dead here.')
    hidden.visibility = 'private'
    p.entities.push(hidden)
    a.scenario.activeEntityIds.push(hidden.id)
    const c = compileContext(p, a, 'Search for evidence', 'Do', 10000, [hidden.id])
    expect(c.prompt).not.toContain(hidden.name)
    expect(c.prompt).not.toContain(hidden.summary)
  })
  it('excludes secret attributes, notes, provenance, journal, and raw semantic payloads', () => {
    const p = createDemo(),
      a = p.adventures[0],
      e = p.entities[0]
    e.notes = 'SECRET_ALPHA'
    e.fields.Hidden = 'SECRET_BRAVO'
    p.journal[0].text = 'SECRET_CHARLIE'
    p.facts[0].provenance.note = 'SECRET_DELTA'
    const c = compileContext(p, a, 'Remember Mara')
    expect(c.prompt).not.toMatch(/SECRET_(ALPHA|BRAVO|CHARLIE|DELTA)/)
  })
  it('does not grant knowledge transitively through a friend or a relationship', () => {
    const p = createDemo(),
      a = p.adventures[0],
      secret = p.facts.find((f) => f.visibility === 'private')!
    p.relationships.push({
      ...p.relationships[0],
      id: uid(),
      from: a.scenario.characterId,
      to: secret.subjectId,
      label: 'best friend of',
    })
    expect(compileContext(p, a, 'Ask Ivo about his past').prompt).not.toContain(secret.object)
  })
  it('includes private facts only after an explicit grant', () => {
    const p = createDemo(),
      a = p.adventures[0],
      secret = p.facts.find((f) => f.visibility === 'private')!
    a.scenario.activeEntityIds.push(secret.subjectId)
    secret.knownTo.push(a.scenario.characterId)
    expect(compileContext(p, a, 'Ask Ivo about his past').prompt).toContain(secret.object)
  })
  it('does not let secret relationships disclose themselves or hidden endpoints', () => {
    const p = createDemo(),
      a = p.adventures[0]
    p.relationships[0].visibility = 'private'
    p.relationships[0].label = 'SECRET_ECHO'
    expect(compileContext(p, a, 'Mara').prompt).not.toContain('SECRET_ECHO')
  })
  it('excludes uncommitted and deprecated facts', () => {
    const p = createDemo(),
      a = p.adventures[0]
    p.facts[0].status = 'Proposed'
    p.facts[0].object = 'SECRET_FOXTROT'
    expect(compileContext(p, a, 'lighthouse').prompt).not.toContain('SECRET_FOXTROT')
    p.facts[0].status = 'Deprecated'
    expect(compileContext(p, a, 'lighthouse').prompt).not.toContain('SECRET_FOXTROT')
  })
  it('does not retrieve another character’s knowledge or memory', () => {
    const p = createDemo(),
      a = p.adventures[0],
      t = addTurn(a, narrative('A bell rings.'))
    p.knowledge.push({
      ...p.knowledge[0],
      id: uid(),
      entityId: p.entities[1].id,
      claim: 'SECRET_GOLF',
    })
    p.memories.push({
      id: uid(),
      adventureId: a.id,
      turnId: t.id,
      characterId: p.entities[1].id,
      text: 'SECRET_HOTEL',
      createdAt: now(),
    })
    expect(compileContext(p, a, 'Tell me everything').prompt).not.toMatch(/SECRET_(GOLF|HOTEL)/)
  })
  it('never includes memory from a sibling branch or another adventure', () => {
    const p = createDemo(),
      a = p.adventures[0],
      t = addTurn(a, narrative('SECRET_BRANCH_A'))
    p.memories.push({
      id: uid(),
      adventureId: a.id,
      turnId: t.id,
      characterId: a.scenario.characterId,
      text: 'SECRET_BRANCH_MEMORY',
      createdAt: now(),
    })
    forkAt(a, null)
    addTurn(a, narrative('A different path.'))
    const other = startAdventure(a.scenario),
      otherTurn = addTurn(other, narrative('SECRET_ADVENTURE'))
    p.adventures.push(other)
    p.memories.push({
      id: uid(),
      adventureId: other.id,
      turnId: otherTurn.id,
      characterId: a.scenario.characterId,
      text: 'SECRET_OTHER_MEMORY',
      createdAt: now(),
    })
    expect(compileContext(p, a, 'Continue').prompt).not.toMatch(/SECRET_(BRANCH|ADVENTURE|OTHER)/)
  })
  it('is deterministic and stays inside the specified character budget', () => {
    const p = createDemo(),
      a = p.adventures[0]
    p.entities[0].summary = 'Long text. '.repeat(2000)
    expect(compileContext(p, a, 'hello', 'Do', 2500)).toEqual(
      compileContext(p, a, 'hello', 'Do', 2500),
    )
    expect(compileContext(p, a, 'hello', 'Do', 2500).prompt.length).toBeLessThanOrEqual(2500)
  })
  it('filters by both explicit visibility and canonical status', () => {
    expect(canSee({ visibility: 'private', knownTo: ['a'] }, 'b')).toBe(false)
    const p = createDemo()
    p.entities[1].status = 'Proposed'
    expect(visibleEntities(p, p.entities[0].id).map((e) => e.id)).not.toContain(p.entities[1].id)
  })
})
describe('adventures and canon', () => {
  it('copies scenarios and keeps undo/redo reversible', () => {
    const p = createDemo(),
      a = startAdventure(p.scenarios[0])
    a.scenario.title = 'A different title'
    expect(p.scenarios[0].title).not.toBe(a.scenario.title)
    const t = addTurn(a, narrative('A key changes hands.'))
    undoTurn(a)
    expect(branchPath(a)).toEqual([])
    redoTurn(a)
    expect(branchPath(a)[0].id).toBe(t.id)
  })
  it('branches without deleting old history or mutating world state', () => {
    const p = createDemo(),
      a = p.adventures[0],
      before = JSON.stringify(p.facts)
    const t1 = addTurn(a, narrative('A')),
      t2 = addTurn(a, narrative('B'))
    forkAt(a, t1.id)
    const t3 = addTurn(a, narrative('C'))
    expect(branchPath(a).map((t) => t.text)).toEqual(['A', 'C'])
    expect(a.turns.map((t) => t.id)).toContain(t2.id)
    expect(t3.parentId).toBe(t1.id)
    expect(JSON.stringify(p.facts)).toBe(before)
  })
  it('only commits a reviewed proposal once, preserving the narrative source', () => {
    const p = createDemo(),
      a = p.adventures[0],
      turn = addTurn(a, narrative('Mara takes the brass key.'))
    const v = newProposal(a, turn.id, 'Brass key')
    v.kind = 'fact'
    v.predicate = 'owns'
    p.proposals.push(v)
    const count = p.facts.length
    expect(p.facts.length).toBe(count)
    approveProposal(p, v.id)
    expect(p.facts.length).toBe(count + 1)
    expect(p.facts.at(-1)?.provenance.turnId).toBe(turn.id)
    expect(() => approveProposal(p, v.id)).toThrow('already been reviewed')
  })
  it('rejecting a proposal changes no canon and preserves story text', () => {
    const p = createDemo(),
      a = p.adventures[0],
      turn = addTurn(a, narrative('A bell rings.'))
    const v = newProposal(a, turn.id, 'The bell rings')
    v.status = 'rejected'
    p.proposals.push(v)
    expect(() => approveProposal(p, v.id)).toThrow()
    expect(a.turns[0].text).toBe('A bell rings.')
    expect(p.events).toHaveLength(3)
  })
  it('promotes events, connections, and character knowledge through separate operations', () => {
    const p = createDemo(),
      a = p.adventures[0],
      turn = addTurn(a, narrative('Mara meets Nera.'))
    for (const kind of ['event', 'relationship', 'knowledge'] as const) {
      const v = newProposal(a, turn.id, 'Met Nera')
      v.kind = kind
      v.targetId = p.entities[2].id
      p.proposals.push(v)
      approveProposal(p, v.id)
    }
    expect(p.events.at(-1)?.title).toBe('Met Nera')
    expect(p.relationships.at(-1)?.to).toBe(p.entities[2].id)
    expect(p.knowledge.at(-1)?.stance).toBe('was_told')
  })
  it('does not automatically resolve contradictory canon', () => {
    const p = createDemo(),
      base = p.facts[0]
    p.facts.push({ ...base, id: uid(), object: 'A different account' })
    expect(possibleContradictions(p)[0]).toContain('multiple accounts')
    expect(p.facts.filter((f) => f.status === 'Canon')).toHaveLength(3)
  })
})
describe('portable projects, validation, and migrations', () => {
  it('round-trips the complete editable demo and branch history', () => {
    const p = createDemo(),
      a = p.adventures[0]
    addTurn(a, narrative('Something happens.'))
    undoTurn(a)
    p.templates.push({ id: uid(), name: 'A person', type: 'Character', fields: ['Desire'] })
    expect(parseProject(serializeProject(p))).toEqual(p)
  })
  it('migrates a known v0 envelope without executing project content', () => {
    const p = createDemo()
    p.entities[0].notes = '<script>fetch("https://evil.test/")</script>'
    expect(parseProject(JSON.stringify({ format: 'storied', version: 0, project: p }))).toEqual(p)
  })
  it('refuses to export an oversized world that this version could not restore', () => {
    const p = createDemo(),
      scene = p.scenes[0]
    p.scenes = Array.from({ length: 70 }, () => ({ ...scene, id: uid(), text: 'x'.repeat(490000) }))
    expect(() => serializeProject(p)).toThrow('32 MB project limit')
  })
  it('rejects future versions, arbitrary model URLs, SQL restores, and unknown properties', () => {
    const p = newProject('Test')
    for (const v of [
      { ...p, schemaVersion: 99 },
      { ...p, modelUrl: 'https://evil.test/model.wasm' },
      { ...p, sql: 'DROP TABLE projects' },
    ])
      expect(() => parseProject(JSON.stringify(v))).toThrow()
  })
  it('rejects duplicate and dangling entity references', () => {
    const p = createDemo()
    p.entities.push(p.entities[0])
    expect(() => serializeProject(p)).toThrow('duplicate')
    p.entities.pop()
    p.relationships[0].to = 'missing'
    expect(() => serializeProject(p)).toThrow('reference')
  })
  it('rejects cyclic or dangling branch histories and missing memory sources', () => {
    const p = createDemo(),
      a = p.adventures[0],
      t = addTurn(a, narrative('A'))
    t.parentId = t.id
    expect(() => serializeProject(p)).toThrow('history')
    t.parentId = null
    p.memories.push({
      id: uid(),
      adventureId: a.id,
      turnId: 'missing',
      characterId: a.scenario.characterId,
      text: 'test',
      createdAt: now(),
    })
    expect(() => serializeProject(p)).toThrow('source')
  })
  it('rejects external images, SVG scripts, arbitrary executable assets, malformed JSON, and oversized files', () => {
    const p = newProject('Test')
    for (const data of [
      'https://evil.test/a.png',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:application/wasm;base64,AAAA',
    ])
      expect(() =>
        parseProject(JSON.stringify({ ...p, assets: [{ id: uid(), name: 'x', data, pins: [] }] })),
      ).toThrow()
    expect(() => parseProject('{bad')).toThrow()
    expect(() => parseProject('x'.repeat(33 * 1024 * 1024))).toThrow('32 MB')
  })
  it('restores native image bytes, map pins, and configuration', () => {
    const p = createDemo()
    const id = uid()
    p.assets.push({
      id,
      name: 'map.png',
      data: 'data:image/png;base64,aGVsbG8=',
      pins: [{ entityId: p.entities[0].id, x: 34, y: 72 }],
    })
    p.entities[0].assetIds.push(id)
    expect(parseProject(serializeProject(p)).assets).toEqual(p.assets)
  })
})
describe('local search and relationship backlinks', () => {
  it('finds exact words across manuscripts, entities, facts, and memories', () => {
    const p = createDemo(),
      a = p.adventures[0],
      t = addTurn(a, narrative('Mara finds a silver sextant.'))
    p.memories.push({
      id: uid(),
      adventureId: a.id,
      turnId: t.id,
      characterId: a.scenario.characterId,
      text: t.text,
      createdAt: now(),
    })
    expect(textSearch(p, 'silver sextant').map((d) => d.kind)).toEqual(
      expect.arrayContaining(['Adventure', 'Memory']),
    )
    expect(textSearch(p, 'biscuit tin')[0].kind).toBe('Journal')
  })
  it('applies type and tag filters together', () => {
    const p = createDemo()
    const found = textSearch(p, '', 'Character', 'coast')
    expect(found).toHaveLength(2)
    expect(found.every((d) => d.kind === 'Character' && d.tags.includes('the coast'))).toBe(true)
  })
  it('searches relationship endpoints and labels, including backlinks', () => {
    const p = createDemo()
    expect(textSearch(p, 'Mara born Bellwether', 'Relationship')).toHaveLength(1)
  })
})
