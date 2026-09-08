import { z } from 'zod'
import { approvalSchema, workflowSchema } from './workflow-schema'
import { studioSchema, emptyStudio } from './manuscript-schema'
import { activitySchema, emptyActivity, practiceModes } from './practice-schema'
import { mechanicsSchema, ruleSystemsSchema } from './rules-schema'

export const entityTypes = [
  'Character',
  'Location',
  'Faction',
  'Culture',
  'Species',
  'Item',
  'Event',
  'Religion',
  'System',
  'Concept',
  'Encyclopedia',
] as const
export const canonStates = ['Canon', 'Proposed', 'Deprecated', 'Contradicted', 'Unknown'] as const
export const stances = ['knows', 'believes', 'suspects', 'doubts', 'denies', 'was_told'] as const
const id = z.string().min(1).max(100)
const short = z.string().max(500)
const prose = z.string().max(500_000)
const ids = z.array(id).max(10000)
const status = z.enum(canonStates)
const visibility = z.enum(['public', 'private'])
export const provenanceSchema = z
  .object({
    kind: z.enum(['author', 'story', 'import']),
    adventureId: id.optional(),
    turnId: id.optional(),
    proposalId: id.optional(),
    approvalId: id.optional(),
    workflowId: id.optional(),
    manuscriptChangeId: id.optional(),
    worldRevision: z.number().int().nonnegative().optional(),
    note: short.default(''),
  })
  .strict()
export const entitySchema = z
  .object({
    id,
    type: z.enum(entityTypes),
    name: short.min(1),
    aliases: z.array(short).max(100),
    summary: prose,
    notes: prose,
    tags: z.array(short).max(100),
    status,
    visibility,
    knownTo: ids,
    fields: z.record(z.string().max(100), short),
    panelOrder: z
      .array(
        z.enum([
          'about',
          'attributes',
          'relationships',
          'facts',
          'knowledge',
          'notes',
          'references',
          'images',
        ]),
      )
      .max(8),
    assetIds: ids,
    updatedAt: short,
  })
  .strict()
export const relationshipSchema = z
  .object({
    id,
    from: id,
    to: id,
    label: short.min(1),
    description: prose,
    visibility,
    knownTo: ids,
    status,
    start: short,
    end: short,
    confidence: z.number().min(0).max(1),
    relationType: z.enum(['connection', 'ownership', 'containment']).optional(),
    validFrom: z.number().finite().optional(),
    validUntil: z.number().finite().optional(),
    establishedByEventId: id.optional(),
    endedByEventId: id.optional(),
    provenance: provenanceSchema,
  })
  .strict()
export const factSchema = z
  .object({
    id,
    subjectId: id,
    predicate: short.min(1),
    object: short.min(1),
    status,
    visibility,
    knownTo: ids,
    validFrom: z.number().finite().optional(),
    validUntil: z.number().finite().optional(),
    establishedByEventId: id.optional(),
    endedByEventId: id.optional(),
    provenance: provenanceSchema,
  })
  .strict()
export const knowledgeSchema = z
  .object({
    id,
    entityId: id,
    factId: id.optional(),
    claim: short.min(1),
    stance: z.enum(stances),
    confidence: z.number().min(0).max(1),
    source: short,
    learnedAtEventId: id.optional(),
    provenance: provenanceSchema.optional(),
  })
  .strict()
export const sceneSchema = z
  .object({
    id,
    book: short,
    chapter: short,
    title: short.min(1),
    text: prose,
    notes: prose,
    entityIds: ids,
    purpose: short.optional(),
    viewpointId: id.optional(),
    locationId: id.optional(),
    eventId: id.optional(),
    adventureId: id.optional(),
    branchHeadId: id.optional(),
    perspective: z.enum(['first', 'third', 'omniscient']).optional(),
    voiceProfileId: id.optional(),
    updatedAt: short,
  })
  .strict()
export const scenarioSchema = z
  .object({
    id,
    practiceMode: z.enum(practiceModes).optional(),
    title: short.min(1),
    characterId: id,
    locationId: z.string().max(100),
    opening: prose,
    instructions: prose,
    tone: short,
    perspective: z.enum(['second', 'first', 'third']),
    activeEntityIds: ids,
  })
  .strict()
export const turnSchema = z
  .object({
    id,
    mechanics: mechanicsSchema.optional(),
    parentId: id.nullable(),
    intent: z.enum(['Do', 'Say', 'Story', 'Director']),
    input: prose,
    text: prose,
    createdAt: short,
    bookmark: z.boolean(),
    annotation: prose,
    context: prose,
    model: short,
    summary: prose,
    summarySourceIds: ids.optional(),
    workflowId: id.optional(),
  })
  .strict()
export const adventureSchema = z
  .object({
    id,
    activeRuleSystemId: id.optional(),
    mechanics: mechanicsSchema.optional(),
    title: short,
    scenario: scenarioSchema,
    turns: z.array(turnSchema).max(100000),
    headId: id.nullable(),
    redoIds: ids,
    createdAt: short,
    currentEventId: id.optional(),
  })
  .strict()
export const eventSchema = z
  .object({
    id,
    title: short.min(1),
    date: short,
    approximate: z.boolean(),
    order: z.number().finite().optional(),
    deathOf: ids.optional(),
    description: prose,
    locationId: id.optional(),
    entityIds: ids,
    consequences: prose,
    status,
    provenance: provenanceSchema,
  })
  .strict()
export const memorySchema = z
  .object({
    id,
    adventureId: id,
    turnId: id,
    characterId: id,
    text: prose,
    createdAt: short,
  })
  .strict()
export const proposalSchema = z
  .object({
    id,
    adventureId: id,
    turnId: id,
    kind: z.enum(['fact', 'event', 'relationship', 'knowledge', 'entity']),
    subjectId: id,
    targetId: id.optional(),
    predicate: short,
    value: short.min(1),
    entityType: z.enum(entityTypes).optional(),
    visibility,
    status: z.enum(['pending', 'accepted', 'rejected']),
    workflowId: id.optional(),
  })
  .strict()
export const journalSchema = z
  .object({
    id,
    title: short.min(1),
    text: prose,
    kind: z.enum(['note', 'question', 'canon', 'discovery']),
    createdAt: short,
  })
  .strict()
export const assetSchema = z
  .object({
    id,
    name: short,
    data: z
      .string()
      .max(12_000_000)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/),
    pins: z
      .array(
        z
          .object({ entityId: id, x: z.number().min(0).max(100), y: z.number().min(0).max(100) })
          .strict(),
      )
      .max(1000),
  })
  .strict()
export const projectSchema = z
  .object({
    schemaVersion: z.literal(5),
    ruleSystems: ruleSystemsSchema.default([]),
    activity: activitySchema.default(emptyActivity),
    studio: studioSchema.default(emptyStudio),
    worldRevision: z.number().int().nonnegative().default(0),
    workflows: z.array(workflowSchema).max(10000).default([]),
    approvals: z.array(approvalSchema).max(100000).default([]),
    id,
    title: short.min(1),
    description: prose,
    genre: short,
    createdAt: short,
    updatedAt: short,
    entities: z.array(entitySchema).max(10000),
    relationships: z.array(relationshipSchema).max(50000),
    facts: z.array(factSchema).max(100000),
    knowledge: z.array(knowledgeSchema).max(100000),
    scenes: z.array(sceneSchema).max(10000),
    scenarios: z.array(scenarioSchema).max(10000),
    adventures: z.array(adventureSchema).max(10000),
    events: z.array(eventSchema).max(100000),
    memories: z.array(memorySchema).max(100000),
    proposals: z.array(proposalSchema).max(100000),
    journal: z.array(journalSchema).max(100000),
    assets: z.array(assetSchema).max(1000),
    templates: z
      .array(
        z
          .object({ id, name: short, type: z.enum(entityTypes), fields: z.array(short).max(100) })
          .strict(),
      )
      .max(1000),
    settings: z
      .object({ authorInstructions: prose, wordGoal: z.number().int().min(0).max(10000000) })
      .strict(),
  })
  .strict()
export type Project = z.infer<typeof projectSchema>
export type Entity = z.infer<typeof entitySchema>
export type EntityType = Entity['type']
export type Fact = z.infer<typeof factSchema>
export type Relationship = z.infer<typeof relationshipSchema>
export type Knowledge = z.infer<typeof knowledgeSchema>
export type Scene = z.infer<typeof sceneSchema>
export type Scenario = z.infer<typeof scenarioSchema>
export type Turn = z.infer<typeof turnSchema>
export type Adventure = z.infer<typeof adventureSchema>
export type WorldEvent = z.infer<typeof eventSchema>
export type Proposal = z.infer<typeof proposalSchema>
export type Asset = z.infer<typeof assetSchema>

export const uid = () => crypto.randomUUID()
export const now = () => new Date().toISOString()
export function newProject(title: string): Project {
  return {
    schemaVersion: 5,
    ruleSystems: [],
    activity: emptyActivity(),
    studio: emptyStudio(),
    worldRevision: 0,
    workflows: [],
    approvals: [],
    id: uid(),
    title: title.trim() || 'Untitled world',
    description: '',
    genre: 'A world in the making',
    createdAt: now(),
    updatedAt: now(),
    entities: [],
    relationships: [],
    facts: [],
    knowledge: [],
    scenes: [],
    scenarios: [],
    adventures: [],
    events: [],
    memories: [],
    proposals: [],
    journal: [],
    assets: [],
    templates: [],
    settings: {
      authorInstructions:
        'Write with specificity and restraint. Leave room for the player to choose. Never decide the player character’s actions or speech.',
      wordGoal: 1000,
    },
  }
}
const defaults: Record<EntityType, Record<string, string>> = {
  Character: { Role: '', Pronouns: '', Desire: '' },
  Location: { Region: '', Atmosphere: '' },
  Faction: { Purpose: '', Influence: '' },
  Culture: { Values: '', Traditions: '' },
  Species: { Habitat: '', Traits: '' },
  Item: { Appearance: '', Origin: '' },
  Event: { Date: '', Consequences: '' },
  Religion: { Beliefs: '', Practices: '' },
  System: { Rules: '', Limitations: '' },
  Concept: {},
  Encyclopedia: {},
}
export function newEntity(type: EntityType, name: string, summary = ''): Entity {
  return {
    id: uid(),
    type,
    name: name.trim(),
    summary,
    notes: '',
    tags: [],
    aliases: [],
    status: 'Canon',
    visibility: 'public',
    knownTo: [],
    fields: { ...defaults[type] },
    panelOrder: [
      'about',
      'attributes',
      'relationships',
      'facts',
      'knowledge',
      'notes',
      'references',
      'images',
    ],
    assetIds: [],
    updatedAt: now(),
  }
}
