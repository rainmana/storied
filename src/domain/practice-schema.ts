import { z } from 'zod'

const id = z.string().min(1).max(100)
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const practiceModes = ['explore', 'interview', 'staged'] as const
export type PracticeMode = (typeof practiceModes)[number]
export const practiceLabels: Record<PracticeMode, string> = {
  explore: 'World exploration',
  interview: 'Character interview',
  staged: 'Staged scene',
}
const tally = z.object({ added: count, removed: count, edits: count }).strict()
export const sessionSchema = z
  .object({
    id,
    title: z.string().min(1).max(500),
    kind: z.enum(['writing', 'worldbuilding', 'conversation']),
    sceneId: id.optional(),
    adventureId: id.optional(),
    characterId: id.optional(),
    target: z.enum(['minutes', 'words']),
    goal: z.number().int().min(1).max(1000000),
    status: z.enum(['running', 'paused', 'finished']),
    createdAt: z.string().datetime(),
    finishedAt: z.string().datetime().optional(),
    pauseReason: z.string().max(500),
    thinking: z.boolean(),
    days: z
      .array(
        z
          .object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            milliseconds: count,
            author: tally,
            assisted: tally,
            imported: tally,
          })
          .strict(),
      )
      .max(3660),
  })
  .strict()
export const activitySchema = z
  .object({
    enabled: z.boolean(),
    sessions: z.array(sessionSchema).max(10000),
  })
  .strict()
export const emptyActivity = (): z.infer<typeof activitySchema> => ({
  enabled: false,
  sessions: [],
})
export type WritingSession = z.infer<typeof sessionSchema>
export type EditOrigin = 'author' | 'assisted' | 'imported' | 'none'

export const conversationClipSchema = z
  .object({
    id,
    sceneId: id,
    adventureId: id,
    branchHeadId: id,
    mode: z.enum(practiceModes),
    title: z.string().min(1).max(500),
    createdAt: z.string().datetime(),
    method: z.enum(['exact', 'adapt']),
    excerpts: z
      .array(
        z
          .object({
            turnId: id,
            field: z.enum(['input', 'text']),
            start: count,
            end: count,
            text: z.string().min(1).max(8000),
            speaker: z.string().min(1).max(100),
            origin: z.enum(['author', 'assisted']),
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict()
export type ConversationClip = z.infer<typeof conversationClipSchema>
