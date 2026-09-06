import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { DATABASE_SCHEMA, SEMANTIC_QUERY } from '../../src/lib/database-schema'
let db: PGlite
const embedding = JSON.stringify([1, ...Array(383).fill(0)])
beforeAll(async () => {
  db = new PGlite({ extensions: { vector } })
  await db.waitReady
  await db.exec(DATABASE_SCHEMA)
  await db.query('INSERT INTO projects VALUES ($1,$2,$3)', ['one', { title: 'First' }, '2026'])
  await db.query('INSERT INTO projects VALUES ($1,$2,$3)', ['two', { title: 'Other' }, '2026'])
})
afterAll(async () => {
  await db?.close()
})
async function document(project: string, id: string, kind = 'Character', tags = ['coast']) {
  await db.query('INSERT INTO documents VALUES ($1,$2,$3,$4,$5,$6,$7)', [
    project,
    id,
    kind,
    id,
    `Content ${id}`,
    id,
    tags,
  ])
  await db.query('INSERT INTO embeddings VALUES ($1,$2,$3,$4::vector)', [
    project,
    id,
    `Content ${id}`,
    embedding,
  ])
}
describe('embedded relational persistence and vector boundaries', () => {
  it('applies the database migration idempotently', async () => {
    await db.exec(DATABASE_SCHEMA)
    expect((await db.query('SELECT * FROM migrations')).rows).toEqual([{ version: 1 }])
  })
  it('rolls back an entire project mutation on failure', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query('UPDATE projects SET body=$1 WHERE id=$2', [{ title: 'Broken' }, 'one'])
        throw new Error('Rejected import')
      }),
    ).rejects.toThrow()
    expect(
      (
        await db.query<{ body: { title: string } }>('SELECT body FROM projects WHERE id=$1', [
          'one',
        ])
      ).rows[0].body.title,
    ).toBe('First')
  })
  it('filters hidden vector candidates before limiting and never crosses projects', async () => {
    for (let i = 0; i < 35; i++) await document('one', `hidden-${i}`)
    await document('one', 'visible')
    await document('two', 'other-project')
    const result = await db.query<{ id: string }>(SEMANTIC_QUERY, [
      'one',
      embedding,
      ['visible'],
      null,
      null,
    ])
    expect(result.rows.map((r) => r.id)).toEqual(['visible'])
    expect((await db.query(SEMANTIC_QUERY, ['one', embedding, [], null, null])).rows).toEqual([])
  })
  it('combines type and tag filters and excludes stale embeddings', async () => {
    await document('one', 'scene', 'Manuscript', ['chapter-one'])
    expect(
      (
        await db.query<{ id: string }>(SEMANTIC_QUERY, [
          'one',
          embedding,
          null,
          'Manuscript',
          '%chapter%',
        ])
      ).rows.map((r) => r.id),
    ).toEqual(['scene'])
    await db.query('UPDATE documents SET body=$1 WHERE id=$2 AND project_id=$3', [
      'Edited scene',
      'scene',
      'one',
    ])
    expect(
      (await db.query(SEMANTIC_QUERY, ['one', embedding, ['scene'], null, null])).rows,
    ).toEqual([])
  })
  it('keeps directed relationships queryable from either endpoint', async () => {
    await db.query('INSERT INTO relationships VALUES ($1,$2,$3,$4,$5,$6)', [
      'one',
      'r1',
      'person',
      'place',
      'lives in',
      {},
    ])
    const result = await db.query(
      'SELECT label FROM relationships WHERE project_id=$1 AND (from_id=$2 OR to_id=$2)',
      ['one', 'place'],
    )
    expect(result.rows).toEqual([{ label: 'lives in' }])
  })
  it('deleting a project cascades derived rows without affecting other worlds', async () => {
    await db.query('DELETE FROM projects WHERE id=$1', ['one'])
    expect((await db.query('SELECT id FROM documents WHERE project_id=$1', ['one'])).rows).toEqual(
      [],
    )
    expect((await db.query('SELECT id FROM embeddings WHERE project_id=$1', ['one'])).rows).toEqual(
      [],
    )
    expect((await db.query('SELECT id FROM documents WHERE project_id=$1', ['two'])).rows).toEqual([
      { id: 'other-project' },
    ])
  })
})
