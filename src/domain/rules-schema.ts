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
export const mechanicsSchema = z
  .array(
    z
      .object({
        system: ruleSystemSchema,
        eventId: id.optional(),
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
