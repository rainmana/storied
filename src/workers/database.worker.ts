import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { projectSchema, type Project } from '../domain/schema'
import { validateReferences, restorableJSON } from '../domain/project-file'
import { searchDocuments } from '../domain/search'
import { DATABASE_SCHEMA, SEMANTIC_QUERY } from '../lib/database-schema'
import { buildWorldGraph } from '../domain/world-graph'

const db = new PGlite({
  dataDir: 'idb://storied-v1',
  extensions: { vector },
  relaxedDurability: false,
})
const ready = (async () => {
  await db.waitReady
  await db.exec(DATABASE_SCHEMA)
})()
async function handle(type: string, payload: unknown) {
  await ready
  if (type === 'list')
    return (
      await db.query<{ body: Project }>('SELECT body FROM projects ORDER BY updated_at DESC')
    ).rows.map((r) => r.body)
  if (type === 'save') {
    const p = validateReferences(projectSchema.parse(payload))
    const body = restorableJSON(p)
    await db.transaction(async (tx) => {
      await tx.query(
        'INSERT INTO projects VALUES ($1,$2,$3) ON CONFLICT(id) DO UPDATE SET body=$2, updated_at=$3',
        [p.id, body, p.updatedAt],
      )
      await tx.query('DELETE FROM documents WHERE project_id=$1', [p.id])
      await tx.query(
        `INSERT INTO documents SELECT $1,id,kind,title,body,target,tags FROM jsonb_to_recordset($2::jsonb) AS x(id text,kind text,title text,body text,target text,tags jsonb)`,
        [p.id, JSON.stringify(searchDocuments(p))],
      )
      await tx.query('DELETE FROM relationships WHERE project_id=$1', [p.id])
      const graph = buildWorldGraph(p)
      await tx.query('DELETE FROM world_nodes WHERE project_id=$1', [p.id])
      await tx.query(
        `INSERT INTO world_nodes SELECT $1,x->>'id',x->>'kind',x->>'sourceId',x->'body' FROM jsonb_array_elements($2::jsonb) x`,
        [p.id, JSON.stringify(graph.nodes)],
      )
      await tx.query('DELETE FROM world_edges WHERE project_id=$1', [p.id])
      await tx.query(
        `INSERT INTO world_edges SELECT $1,x->>'id',x->>'from',x->>'to',x->>'kind',x->>'sourceId' FROM jsonb_array_elements($2::jsonb) x`,
        [p.id, JSON.stringify(graph.edges)],
      )
      await tx.query('DELETE FROM workflow_checkpoints WHERE project_id=$1', [p.id])
      await tx.query(
        `INSERT INTO workflow_checkpoints SELECT $1,x->>'id',x->>'adventureId',x->>'parentId',x->>'node',x->>'status',x FROM jsonb_array_elements($2::jsonb) x`,
        [p.id, JSON.stringify(p.workflows)],
      )
      await tx.query(
        `INSERT INTO relationships SELECT $1,x->>'id',x->>'from',x->>'to',x->>'label',x FROM jsonb_array_elements($2::jsonb) x`,
        [p.id, JSON.stringify(p.relationships)],
      )
      await tx.query(
        'DELETE FROM embeddings e WHERE project_id=$1 AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.project_id=e.project_id AND d.id=e.id AND d.body=e.source)',
        [p.id],
      )
    })
    // PGlite 0.5.8 commits while its internal inTransaction flag is still true.
    // Explicitly await the IndexedDB durability barrier before acknowledging a save.
    await db.syncToFs()
    return true
  }
  if (type === 'delete') {
    await db.query('DELETE FROM projects WHERE id=$1', [String(payload)])
    return true
  }
  if (type === 'embed') {
    const data = payload as {
      projectId: string
      items: { id: string; source: string; vector: number[] }[]
    }
    await db.transaction(async (tx) => {
      for (const item of data.items) {
        if (item.vector.length !== 384 || item.vector.some((x) => !Number.isFinite(x)))
          throw new Error('Invalid local embedding.')
        await tx.query(
          'INSERT INTO embeddings VALUES ($1,$2,$3,$4::vector) ON CONFLICT(project_id,id) DO UPDATE SET source=$3, embedding=$4::vector',
          [data.projectId, item.id, item.source, JSON.stringify(item.vector)],
        )
      }
    })
    await db.syncToFs()
    return true
  }
  if (type === 'semantic') {
    const data = payload as {
      projectId: string
      vector: number[]
      allowedIds?: string[]
      kind?: string
      tag?: string
    }
    if (data.vector.length !== 384 || data.vector.some((x) => !Number.isFinite(x)))
      throw new Error('Invalid query embedding.')
    return (
      await db.query(SEMANTIC_QUERY, [
        data.projectId,
        JSON.stringify(data.vector),
        data.allowedIds ?? null,
        data.kind || null,
        data.tag ? `%${data.tag}%` : null,
      ])
    ).rows
  }
  throw new Error('Unknown database operation.')
}
// Serialize commands, including delete after a pending save. Never replay a failed mutation.
let queue: Promise<unknown> = Promise.resolve()
self.onmessage = (event: MessageEvent<{ id: number; type: string; payload: unknown }>) => {
  const { id, type, payload } = event.data
  queue = queue
    .catch(() => {})
    .then(async () => {
      try {
        self.postMessage({ id, result: await handle(type, payload) })
      } catch (error) {
        self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
      }
    })
}
