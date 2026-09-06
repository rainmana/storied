import { describe, expect, it } from 'vitest'
import {
  compileAuthorContext,
  fieldEdit,
  parseAuthorIdeas,
  type AuthorTarget,
} from '../../src/domain/authoring'
import { createDemo } from '../../src/domain/seed'
import { newEntity } from '../../src/domain/schema'
import { completionRequest, defaultConnection } from '../../src/lib/provider-client'
import { writingNotes, writingSystem } from '../../src/domain/writing-style'

const target = (entityId?: string): AuthorTarget => ({
  entityId,
  name: 'Mara Vale',
  type: 'Character',
  field: 'Desire',
  value: 'Wants a place to stay.',
  maxLength: 500,
  privateField: true,
})
describe('author-directed field assistance', () => {
  it('excludes private data by default and includes it only in an explicit author context', () => {
    const p = createDemo(),
      e = p.entities[0]
    e.notes = 'PRIVATE-NOTE-SENTINEL'
    e.fields.Desire = 'PRIVATE-ATTRIBUTE-SENTINEL'
    const hidden = newEntity('Religion', 'PRIVATE-ENTITY-SENTINEL')
    hidden.visibility = 'private'
    p.entities.push(hidden)
    p.facts.push({
      id: 'secret',
      subjectId: e.id,
      predicate: 'motive',
      object: 'PRIVATE-FACT-SENTINEL',
      visibility: 'private',
      knownTo: [],
      status: 'Canon',
      provenance: { kind: 'author', note: '' },
    })
    p.knowledge.push({
      id: 'belief',
      entityId: e.id,
      claim: 'BELIEF-SENTINEL',
      stance: 'believes',
      confidence: 0.3,
      source: 'A rumor',
    })
    const normal = compileAuthorContext(p, target(e.id), '').prompt
    for (const secret of [
      'PRIVATE-NOTE-SENTINEL',
      'PRIVATE-ATTRIBUTE-SENTINEL',
      'PRIVATE-ENTITY-SENTINEL',
      'PRIVATE-FACT-SENTINEL',
      'BELIEF-SENTINEL',
    ])
      expect(normal).not.toContain(secret)
    const author = compileAuthorContext(p, target(e.id), '', true, [], '', 16000).prompt
    for (const secret of [
      'PRIVATE-NOTE-SENTINEL',
      'PRIVATE-ATTRIBUTE-SENTINEL',
      'PRIVATE-ENTITY-SENTINEL',
      'PRIVATE-FACT-SENTINEL',
      'BELIEF-SENTINEL',
    ])
      expect(author).toContain(secret)
    expect(author).toContain('subjective_account')
    expect(author).toContain('believes')
  })
  it('does not blend branch records or proposed facts into the bible, even with private access', () => {
    const p = createDemo(),
      e = p.entities[0]
    p.facts.push(
      ...(['branch', 'proposal'] as const).map((kind) => ({
        id: kind,
        subjectId: e.id,
        predicate: 'test',
        object: `${kind}-SENTINEL`,
        visibility: 'public' as const,
        knownTo: [],
        status: kind === 'proposal' ? ('Proposed' as const) : ('Canon' as const),
        provenance: {
          kind: 'author' as const,
          note: '',
          ...(kind === 'branch' ? { adventureId: 'elsewhere', turnId: 'other' } : {}),
        },
      })),
    )
    p.scenes[0].text = 'MANUSCRIPT-SENTINEL'
    const prompt = compileAuthorContext(p, target(e.id), '', true).prompt
    for (const value of ['branch-SENTINEL', 'proposal-SENTINEL', 'MANUSCRIPT-SENTINEL'])
      expect(prompt).not.toContain(value)
  })
  it('requires human direction and bounds large worlds while retaining the selected field', () => {
    const p = createDemo()
    expect(() => compileAuthorContext(p, { ...target(), value: ' ' }, '')).toThrow(
      'Add a few words',
    )
    for (let i = 0; i < 80; i++)
      p.entities.push(newEntity('Concept', `Concept ${i}`, 'Long description. '.repeat(200)))
    const c = compileAuthorContext(p, target(), 'Keep the original motive.', false, [], '', 5000)
    expect(c.prompt.length).toBeLessThanOrEqual(5000)
    expect(c.omitted).toBeGreaterThan(0)
    expect(c.prompt).toContain('Keep the original motive.')
    expect(c.prompt).toContain('Wants a place to stay.')
    expect(c.prompt).toContain('"excerpt":true')
  })
  it('keeps facts complete and preserves temporal qualifications', () => {
    const p = createDemo(),
      e = p.entities[0],
      event = p.events[0]
    event.date = 'Winter 1902'
    p.facts.unshift({
      id: 'time',
      subjectId: e.id,
      predicate: 'home',
      object: 'The west bank',
      visibility: 'public',
      knownTo: [],
      status: 'Canon',
      endedByEventId: event.id,
      provenance: { kind: 'author', note: '' },
    })
    const c = compileAuthorContext(p, target(e.id), '')
    expect(c.prompt).toContain('"endedAt":"Winter 1902"')
    for (const line of c.prompt.split('\n').slice(1)) expect(() => JSON.parse(line)).not.toThrow()
  })
  it('keeps refinement explicitly non-canonical and does not mutate source data', () => {
    const p = createDemo(),
      before = JSON.stringify(p)
    const c = compileAuthorContext(
      p,
      target(),
      'Make it quieter.',
      false,
      [{ direction: 'An old ritual', ideas: [{ title: 'River', text: 'They leave a shell.' }] }],
      'They leave a shell.',
    )
    expect(c.prompt).toContain('Unaccepted possibilities')
    expect(c.prompt).toContain('developing')
    expect(c.prompt).toContain('Make it quieter.')
    expect(JSON.stringify(p)).toBe(before)
  })
  it('rejects malformed, oversized and extra-field suggestions before insertion', () => {
    expect(
      parseAuthorIdeas(
        '```json\n{"ideas":[{"title":"A motive","text":"She wants to return."}]}\n```',
        500,
      ),
    ).toHaveLength(1)
    for (const raw of [
      'oops',
      '{"ideas":[]}',
      '{"ideas":[{"title":"A","text":"Long text"}],"commit":true}',
      JSON.stringify({ ideas: [{ title: 'Long', text: 'x'.repeat(501) }] }),
    ])
      expect(() => parseAuthorIdeas(raw, 500)).toThrow('did not return usable')
  })
  it('prevents stale replacement and enforces append limits without dropping original words', () => {
    expect(fieldEdit('  My words.\n', '  My words.\n', 'New thought.', 'append', 500)).toBe(
      '  My words.\n\n\nNew thought.',
    )
    expect(() => fieldEdit('Changed', 'Original', 'New', 'replace', 500)).toThrow('changed')
    expect(() => fieldEdit('Original', 'Original', 'New', 'append', 10)).toThrow('Shorten')
  })
  it('uses the same prose policy across all API protocols and flags limited editorial issues', () => {
    for (const provider of ['openai', 'anthropic', 'custom'] as const) {
      const body = JSON.stringify(
        completionRequest(defaultConnection(provider), 'seed', 'worldbuilder').body,
      )
      expect(body).toContain('PROSE STYLE')
      expect(body).toContain('No chatbot preambles')
    }
    expect(writingSystem('extractor')).toContain('Return JSON only')
    expect(
      writingNotes('It is a testament to courage—not just hope, but strength.').length,
    ).toBeGreaterThan(0)
    expect(writingNotes('She counts the empty chairs before she sits.')).toEqual([])
  })
})
