import { describe, expect, it } from 'vitest'
import {
  extractionEntities,
  extractionResponseSchema,
  parseExtractedProposals,
} from '../../src/domain/extraction'
import { createDemo } from '../../src/domain/seed'
import { newEntity } from '../../src/domain/schema'

describe('constrained local extraction', () => {
  it('maps model handles into pending private proposals without mutating the world', () => {
    const p = createDemo(),
      a = p.adventures[0],
      before = JSON.stringify(p)
    const allowed = extractionEntities(p, a)
    const proposals = parseExtractedProposals(
      JSON.stringify({
        proposals: [
          {
            kind: 'fact',
            subjectId: allowed[0].handle,
            targetId: '',
            predicate: 'owns',
            value: 'A blue cord',
          },
        ],
      }),
      allowed,
      a.id,
      'source-turn',
    )
    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toMatchObject({
      subjectId: allowed[0].id,
      status: 'pending',
      visibility: 'private',
      turnId: 'source-turn',
    })
    expect(proposals[0].targetId).toBeUndefined()
    expect(JSON.stringify(p)).toBe(before)
  })
  it('never gives the extractor a hidden active entity name or its notes', () => {
    const p = createDemo(),
      a = p.adventures[0]
    const hidden = newEntity('Character', 'The secret usurper', 'Backstage only')
    hidden.visibility = 'private'
    p.entities.push(hidden)
    a.scenario.activeEntityIds.push(hidden.id)
    const allowed = extractionEntities(p, a)
    expect(JSON.stringify(allowed)).not.toMatch(/usurper|Backstage/)
    expect(JSON.stringify(extractionResponseSchema(allowed))).not.toContain(hidden.id)
  })
  it('rejects invented identifiers and relationships without valid targets', () => {
    const p = createDemo(),
      a = p.adventures[0],
      allowed = extractionEntities(p, a)
    const proposals = parseExtractedProposals(
      JSON.stringify({
        proposals: [
          { kind: 'fact', subjectId: 'unknown', predicate: 'owns', value: 'The harbor' },
          {
            kind: 'relationship',
            subjectId: allowed[0].handle,
            targetId: 'unknown',
            predicate: 'owns',
            value: 'A boat',
          },
        ],
      }),
      allowed,
      a.id,
      'source-turn',
    )
    expect(proposals).toEqual([])
  })
  it('fails closed on truncated JSON and unsupported mutations', () => {
    const p = createDemo(),
      a = p.adventures[0],
      allowed = extractionEntities(p, a)
    expect(() => parseExtractedProposals('{"proposals":[', allowed, a.id, 'turn')).toThrow()
    expect(() =>
      parseExtractedProposals(
        '{"proposals":[],"sql":"DELETE FROM projects"}',
        allowed,
        a.id,
        'turn',
      ),
    ).toThrow()
  })
})
