import { z } from 'zod'

const id = z.string().min(1).max(100)
const short = z.string().max(500)
const text = z.string().max(500000)
export const studioRoles = [
  'manuscript-writer',
  'continuity-reviewer',
  'prose-reviewer',
  'voice-reviewer',
  'voice-analyst',
] as const
export type StudioRole = (typeof studioRoles)[number]
export const voiceTraitSchema = z
  .object({
    id,
    instruction: short.min(1),
    category: z.enum([
      'rhythm',
      'vocabulary',
      'paragraphs',
      'imagery',
      'dialogue',
      'distance',
      'humor',
      'other',
    ]),
    status: z.enum(['suggested', 'approved', 'rejected']),
    evidence: z
      .array(z.object({ sampleId: id, quote: z.string().min(1).max(700) }).strict())
      .max(8),
  })
  .strict()
export const voiceProfileSchema = z
  .object({
    id,
    name: short.min(1),
    description: short,
    traits: z.array(voiceTraitSchema).max(100),
    updatedAt: short,
  })
  .strict()
export const studioSourceSchema = z
  .object({
    id,
    kind: z.enum(['entity', 'fact', 'relationship', 'event', 'belief', 'voice', 'sample']),
    title: short,
    text: z.string().max(2500),
    writerAllowed: z.boolean().default(true),
  })
  .strict()
export const manuscriptFindingSchema = z
  .object({
    id,
    layer: z.enum(['canon', 'prose', 'voice']),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    quote: z.string().min(1).max(2000),
    explanation: z.string().min(1).max(1200),
    replacement: z.string().max(3000),
    sourceIds: z.array(id).max(12),
    status: z.enum(['open', 'dismissed', 'intentional', 'resolved']),
    decision: short,
  })
  .strict()
export const manuscriptRunSchema = z
  .object({
    id,
    kind: z.enum(['draft', 'review', 'profile']),
    sceneId: id.optional(),
    profileId: id.optional(),
    parentId: id.optional(),
    createdAt: short,
    worldRevision: z.number().int().nonnegative(),
    mode: z.enum(['opening', 'continue', 'dialogue', 'revise', 'review', 'analyze']),
    direction: z.string().max(5000),
    sceneText: text,
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    candidate: text,
    context: z.string().max(18000),
    sources: z.array(studioSourceSchema).max(100),
    omissions: z.array(short).max(100),
    includePrivate: z.boolean(),
    includeSamples: z.boolean(),
    layers: z.array(z.enum(['canon', 'prose', 'voice'])).max(3),
    node: z.enum(['draft', 'continuity', 'prose', 'voice', 'analyze', 'humanReview']),
    status: z.enum(['ready', 'running', 'paused', 'repair', 'review', 'accepted', 'discarded']),
    error: z.string().max(2000),
    steps: z
      .array(
        z
          .object({
            id,
            role: z.enum(studioRoles),
            system: z.string().max(8000),
            prompt: z.string().max(30000),
            schema: z.string().max(16000),
            raw: text,
            model: short,
            destination: short,
            settings: z.string().max(3000),
            status: z.enum(['pending', 'complete', 'failed']),
            createdAt: short,
          })
          .strict(),
      )
      .max(25),
    findings: z.array(manuscriptFindingSchema).max(100),
    observations: z.array(voiceTraitSchema).max(20),
    boundaries: z
      .array(
        z
          .object({
            id,
            actor: z.enum(['author', 'application']),
            kind: z.enum(['direction', 'correction', 'repair', 'decision']),
            text,
            createdAt: short,
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
export const studioSchema = z
  .object({
    samples: z
      .array(
        z
          .object({
            id,
            profileId: id,
            name: short.min(1),
            text: z.string().min(1).max(100000),
            createdAt: short,
          })
          .strict(),
      )
      .max(100),
    profiles: z.array(voiceProfileSchema).max(30),
    runs: z.array(manuscriptRunSchema).max(1000),
    revisions: z
      .array(
        z
          .object({
            id,
            sceneId: id,
            text,
            title: short,
            reason: short,
            createdAt: short,
            runId: id.optional(),
          })
          .strict(),
      )
      .max(1000),
    canonChanges: z
      .array(
        z
          .object({
            id,
            sceneId: id,
            runId: id.optional(),
            findingId: id.optional(),
            kind: z.enum(['fact', 'entity', 'event']),
            recordId: id,
            previousId: id.optional(),
            before: text,
            after: text,
            passage: text,
            worldRevision: z.number().int().nonnegative(),
            createdAt: short,
            reason: short,
          })
          .strict(),
      )
      .max(10000),
  })
  .strict()
export const emptyStudio = (): z.infer<typeof studioSchema> => ({
  samples: [],
  profiles: [],
  runs: [],
  revisions: [],
  canonChanges: [],
})
export type ManuscriptRun = z.infer<typeof manuscriptRunSchema>
export type ManuscriptFinding = z.infer<typeof manuscriptFindingSchema>
export type StudioSource = z.infer<typeof studioSourceSchema>
export type VoiceProfile = z.infer<typeof voiceProfileSchema>
