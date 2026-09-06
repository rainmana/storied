import { z } from 'zod'
import { visibleEntities } from './context'
import { uid, type Adventure, type Project, type Proposal } from './schema'

// Short, constrained handles are easier for compact models to reproduce than UUIDs.
// The model never receives private facts or backstage notes during extraction.
export function extractionEntities(p: Project, a: Adventure) {
  const active = [a.scenario.characterId, a.scenario.locationId, ...a.scenario.activeEntityIds]
  return visibleEntities(p, a.scenario.characterId)
    .filter((e) => active.includes(e.id))
    .map((e, index) => ({ handle: `e${index}`, id: e.id, name: e.name }))
}
export type ExtractionEntity = ReturnType<typeof extractionEntities>[number]

export function extractionRequest(p: Project, a: Adventure, passage: string) {
  const entities = extractionEntities(p, a)
  return {
    entities,
    schema: extractionResponseSchema(entities),
    prompt: `Extract 1 to 4 durable changes explicitly present in the passage. Use short entity handles exactly as listed: ${JSON.stringify(entities.map((e) => ({ id: e.handle, name: e.name })))}. A fact describes a changed possession or state; an event describes an action that occurred; knowledge means a character explicitly learned something; a relationship connects two listed entities. Use targetId "" except for relationships. Use a short predicate and a specific value describing the change. Do not invent death, knowledge, or new entities. Return {"proposals":[]} if nothing changed.\nPASSAGE:\n${passage.slice(0, 6000)}`,
  }
}

export function extractionResponseSchema(entities: ExtractionEntity[]) {
  const handles = entities.map((e) => e.handle)
  return {
    type: 'object',
    additionalProperties: false,
    required: ['proposals'],
    properties: {
      proposals: {
        type: 'array',
        maxItems: 4,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'subjectId', 'targetId', 'predicate', 'value'],
          properties: {
            kind: { type: 'string', enum: ['fact', 'event', 'relationship', 'knowledge'] },
            subjectId: { type: 'string', enum: handles },
            targetId: { type: 'string', enum: ['', ...handles] },
            predicate: { type: 'string' },
            value: { type: 'string' },
          },
        },
      },
    },
  }
}
const resultSchema = z
  .object({
    proposals: z
      .array(
        z
          .object({
            kind: z.enum(['fact', 'event', 'relationship', 'knowledge']),
            subjectId: z.string(),
            targetId: z.string().optional(),
            predicate: z.string().trim().min(1).max(500),
            value: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .max(4),
  })
  .strict()

export function parseExtractedProposals(
  text: string,
  entities: ExtractionEntity[],
  adventureId: string,
  turnId: string,
): Proposal[] {
  const parsed = resultSchema.parse(JSON.parse(text.trim()))
  return parsed.proposals.flatMap((proposal) => {
    const subject = entities.find((e) => e.handle === proposal.subjectId)
    const target = entities.find((e) => e.handle === proposal.targetId)
    if (!subject || (proposal.kind === 'relationship' && !target)) return []
    return [
      {
        ...proposal,
        subjectId: subject.id,
        targetId: target?.id,
        id: uid(),
        adventureId,
        turnId,
        status: 'pending' as const,
        visibility: 'private' as const,
      },
    ]
  })
}
