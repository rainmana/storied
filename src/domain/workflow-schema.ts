import { z } from 'zod'

// MCW-inspired application records. These are neither the MCW nor an enumeration of IUs.
const id = z.string().min(1).max(100)
const text = z.string().max(500_000)
const short = z.string().max(500)
export const repairOperations = [
  'reground',
  'decompress',
  'reweight',
  'disambiguate',
  'synchronize',
] as const
export const failureSignals = [
  'drift',
  'asymmetric-state',
  'false-alignment',
  'overcompression',
  'constraint-opacity',
  'repair-suppression',
] as const
export const boundarySchema = z
  .object({
    id,
    actor: z.enum(['human', 'storyteller', 'extractor', 'application']),
    kind: z.enum(['input', 'output', 'approval', 'correction', 'directive']),
    text,
    createdAt: short,
    sourceId: id.optional(),
    worldRevision: z.number().int().nonnegative().optional(),
    coordinationVersion: z.number().int().nonnegative().optional(),
    model: short.optional(),
  })
  .strict()
export const coordinationSchema = z
  .object({
    version: z.number().int().nonnegative(),
    goal: short,
    constraints: z.array(short).max(30),
    salient: z.array(short).max(30),
    interpretations: z
      .array(z.object({ id, text: short, sourceBoundaryId: id, selected: z.boolean() }).strict())
      .max(20),
    items: z
      .array(
        z
          .object({
            id,
            kind: z.enum(['goal', 'constraint', 'intent', 'correction', 'salience']),
            content: text,
            sourceBoundaryId: id,
            sourceActor: z.enum(['human', 'application']),
            active: z.boolean(),
            supersedes: z.array(id).max(100),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict()
export const repairSignalSchema = z
  .object({
    id,
    kind: z.enum(failureSignals),
    message: short,
    operation: z.enum(repairOperations),
    sourceNode: short,
    resolved: z.boolean(),
  })
  .strict()
export const contextEntrySchema = z
  .object({
    kind: short,
    id: short,
    title: short,
    reason: short,
    text,
    sourceIds: z.array(id).max(100).optional(),
    truncated: z.boolean().optional(),
  })
  .strict()
export const contextSchema = z
  .object({
    prompt: text,
    entries: z.array(contextEntrySchema).max(500),
    approximateTokens: z.number().nonnegative(),
    withheld: z.number().nonnegative(),
    excluded: z
      .array(z.object({ id: short, kind: short, reason: short }).strict())
      .max(200000)
      .optional(),
    warnings: z.array(short).max(100).optional(),
  })
  .strict()
export const workflowNodes = [
  'captureBoundary',
  'interpretIntent',
  'synchronizeCoordinationState',
  'graphRetrieve',
  'semanticRetrieve',
  'epistemicFilter',
  'temporalFilter',
  'coordinationCheck',
  'compileContext',
  'storyteller',
  'humanNarrativeReview',
  'acceptNarrative',
  'extractProposedChanges',
  'validateOperations',
  'checkWorldConsistency',
  'checkCoordinationConsistency',
  'humanCanonReview',
  'commitAcceptedChanges',
  'updateMemory',
  'updateDerivedIndexes',
  'checkpoint',
  'repair',
  'END',
] as const
export type WorkflowNode = (typeof workflowNodes)[number]
export const workflowSchema = z
  .object({
    id,
    adventureId: id,
    parentId: id.nullable(),
    turnId: id.optional(),
    createdAt: short,
    updatedAt: short,
    node: z.enum(workflowNodes),
    status: z.enum(['ready', 'running', 'review', 'repair', 'failed', 'complete', 'discarded']),
    resumeNode: z.enum(workflowNodes).optional(),
    worldRevision: z.number().int().nonnegative(),
    coordinationVersion: z.number().int().nonnegative(),
    input: text,
    intent: z.enum(['Do', 'Say', 'Story', 'Director']),
    model: short,
    draft: text,
    boundaries: z.array(boundarySchema).max(10000),
    coordination: coordinationSchema,
    signals: z.array(repairSignalSchema).max(1000),
    repairs: z
      .array(
        z
          .object({
            id,
            operation: z.enum(repairOperations),
            signalIds: z.array(id),
            sourceIds: z.array(id),
            boundaryId: id.optional(),
            note: short,
            createdAt: short,
          })
          .strict(),
      )
      .max(1000),
    semanticIds: z.array(id).max(100),
    graphIds: z.array(id).max(10000),
    context: contextSchema.optional(),
    proposalIds: z.array(id).max(1000),
    error: short,
    trace: z
      .array(
        z
          .object({
            node: short,
            authority: z.enum([
              'read',
              'interpret',
              'generate',
              'propose',
              'review',
              'commit',
              'derive',
              'repair',
            ]),
            outcome: short,
            createdAt: short,
            worldRevision: z.number().int().nonnegative(),
            coordinationVersion: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(10000),
  })
  .strict()
export const approvalSchema = z
  .object({
    id,
    proposalId: id,
    workflowId: id.optional(),
    adventureId: id,
    turnId: id,
    actor: z.literal('human'),
    action: z.enum(['accepted', 'rejected']),
    operation: text,
    worldRevision: z.number().int().nonnegative(),
    coordinationVersion: z.number().int().nonnegative(),
    createdAt: short,
    resultIds: z.array(id).max(100),
    acknowledgedFindings: z.array(short).max(100),
  })
  .strict()
export type Workflow = z.infer<typeof workflowSchema>
export type CoordinationState = z.infer<typeof coordinationSchema>
export type RepairSignal = z.infer<typeof repairSignalSchema>
export type RepairOperation = (typeof repairOperations)[number]
export type Approval = z.infer<typeof approvalSchema>
