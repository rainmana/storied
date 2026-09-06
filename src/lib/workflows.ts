import { useStore, flushSaves } from './store'
import { completeLocally, embedTexts, useModels } from './models'
import { database } from './database'
import { emitRepair, workflowIsStale } from '../domain/coordination'
import { stepWorkflow, branchMatches } from '../domain/execution-graph'
import type { Workflow } from '../domain/workflow-schema'

const running = new Set<string>()
export async function runWorkflow(projectId: string, id: string) {
  if (running.has(id)) return
  running.add(id)
  const project = () => {
    const p = useStore.getState().project
    if (p?.id !== projectId) throw new Error('Workflow paused because the active project changed.')
    return p
  }
  try {
    for (let count = 0; count < 40; count++) {
      const p = project(),
        w = p.workflows.find((w) => w.id === id)
      if (!w || !['ready', 'running'].includes(w.status)) break
      if (
        !useStore.getState().mutate((p) => {
          const next = p.workflows.find((w) => w.id === id)!
          next.status = 'running'
          if (
            ['storyteller', 'extractProposedChanges'].includes(next.node) &&
            next.intent !== 'Story'
          )
            next.model = useModels.getState().loadedId || next.model
        })
      )
        break
      await flushSaves() // The input/checkpoint is durable before invoking a probabilistic node.
      const snapshot = project()
      const result = await stepWorkflow(
        snapshot,
        snapshot.workflows.find((w) => w.id === id)!,
        {
          complete: (prompt, role, schema) => completeLocally(prompt, role, schema),
          retrieve: useModels.getState().embeddingReady
            ? async (input, allowedIds) => {
                const [vector] = await embedTexts([input])
                return (await database.semantic(projectId, vector, { allowedIds })).map((d) => d.id)
              }
            : undefined,
        },
      )
      const current = project()
      // A user can edit while a worker runs. Preserve its output, then stop before review/commit.
      if (workflowIsStale(current, result.workflow) || !branchMatches(current, result.workflow))
        emitRepair(
          result.workflow,
          'asymmetric-state',
          'The world, branch, or direction changed while this step was running. Synchronize before using its result.',
          'synchronize',
        )
      if (
        !useStore.getState().mutate((p) => {
          const existing = p.workflows.find((w) => w.id === id)!
          // Never overwrite a newer human direction or a discard while a model was busy.
          if (existing.status === 'discarded') return
          if (existing.coordination.version !== result.workflow.coordination.version) {
            result.workflow.coordination = structuredClone(existing.coordination)
            const ids = new Set(result.workflow.boundaries.map((b) => b.id))
            result.workflow.boundaries.push(...existing.boundaries.filter((b) => !ids.has(b.id)))
            emitRepair(
              result.workflow,
              'asymmetric-state',
              'Your direction changed during this step. Synchronize the new direction before continuing.',
              'synchronize',
            )
          }
          p.workflows[p.workflows.findIndex((w) => w.id === id)] = result.workflow
          if (result.proposals && result.workflow.status !== 'repair')
            p.proposals.push(...result.proposals)
          else if (result.proposals) result.workflow.proposalIds = []
        })
      )
        break
      await flushSaves()
      if (result.proposals?.length)
        useStore
          .getState()
          .notify(`${result.proposals.length} suggested world changes are ready to review.`)
    }
  } catch (error) {
    useStore.getState().notify(error instanceof Error ? error.message : String(error))
  } finally {
    running.delete(id)
  }
}
export function updateWorkflow(id: string, fn: (w: Workflow) => void) {
  return useStore.getState().mutate((p) => {
    const w = p.workflows.find((w) => w.id === id)
    if (!w) throw new Error('The local checkpoint is missing.')
    fn(w)
  })
}
