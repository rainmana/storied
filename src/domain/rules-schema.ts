import { z } from 'zod'

const key = z
  .string()
  .regex(/^[a-z][a-z0-9.-]{0,63}$/)
  .refine((v) => !['constructor', 'prototype'].includes(v), 'Reserved identifier')
const label = z.string().min(1).max(120)
const integer = z.number().int().min(-1_000_000).max(1_000_000)
const fieldSchema = z.discriminatedUnion('kind', [
  z
    .object({
      id: key,
      label,
      kind: z.literal('number'),
      min: integer,
      max: integer,
      initial: integer,
    })
    .strict(),
  z
    .object({
      id: key,
      label,
      kind: z.literal('resource'),
      max: integer.nonnegative(),
      initial: integer.nonnegative(),
    })
    .strict(),
  z
    .object({
      id: key,
      label,
      kind: z.literal('derived'),
      operation: z.literal('add'),
      attribute: key,
      amount: integer,
    })
    .strict(),
])
export const ruleSystemSchema = z
  .object({
    format: z.literal('storied-system'),
    schemaVersion: z.literal(1),
    id: key,
    version: z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/),
    name: label,
    description: z.string().max(2000),
    author: label,
    license: label,
    fields: z.array(fieldSchema).min(1).max(16),
  })
  .strict()
  .superRefine((s, ctx) => {
    const error = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (new Set(s.fields.map((f) => f.id)).size !== s.fields.length)
      error('Duplicate field identifier.')
    for (const f of s.fields) {
      if (f.kind === 'derived') {
        // ponytail: one-hop addition only; a bounded expression DAG needs a new format and explicit cycle limits.
        const source = s.fields.find((v) => v.id === f.attribute && v.kind === 'number')
        if (!source || source.kind !== 'number')
          error('Derived values must reference a numeric attribute, never another derived value.')
        else if (source.min + f.amount < -1_000_000 || source.max + f.amount > 1_000_000)
          error('Derived value exceeds numeric bounds.')
      } else if (
        (f.kind === 'number' && f.min > f.max) ||
        f.initial > f.max ||
        (f.kind === 'number' && f.initial < f.min)
      )
        error('Invalid field bounds or initial value.')
    }
  })
export const ruleSystemsSchema = z
  .array(z.object({ definition: ruleSystemSchema, enabled: z.boolean() }).strict())
  .max(8)
const id = z.string().min(1).max(100)
const direction = z.string().trim().min(1).max(1000)
export const checkInputSchema = z
  .object({
    entityId: id,
    attributeId: key,
    target: z.number().int().min(-1_000_000).max(1_000_006),
    approach: direction,
    onSuccess: direction,
    onSetback: direction,
    cost: z.object({ resourceId: key, amount: integer.positive() }).strict().optional(),
  })
  .strict()
export const mechanicalCheckSchema = z
  .object({
    id,
    method: z.literal('d6-plus-attribute-v1'),
    sourceTurnId: id.nullable(),
    entityName: z.string().min(1).max(500),
    input: checkInputSchema,
    before: z.record(key, integer),
    after: z.record(key, integer),
    die: z.number().int().min(1).max(6),
    modifier: integer,
    total: z.number().int().min(-1_000_000).max(1_000_006),
    outcome: z.enum(['met', 'missed']),
    actor: z.literal('author'),
    createdAt: z.string().datetime(),
  })
  .strict()
export const mechanicsSchema = z
  .array(
    z
      .object({
        system: ruleSystemSchema,
        eventId: id.optional(),
        // ponytail: copy bounded receipts with existing snapshots; shared immutable history needs a later migration if archives grow too large.
        checks: z.array(mechanicalCheckSchema).max(100).optional(),
        entities: z
          .array(
            z
              .object({
                entityId: id,
                values: z.record(key, integer),
                actor: z.literal('author'),
                updatedAt: z.string().datetime(),
              })
              .strict(),
          )
          .max(100),
      })
      .strict(),
  )
  .max(32)
export type RuleSystem = z.infer<typeof ruleSystemSchema>
export type MechanicalFrame = z.infer<typeof mechanicsSchema>[number]
export type CheckInput = z.infer<typeof checkInputSchema>
export type MechanicalCheck = z.infer<typeof mechanicalCheckSchema>
