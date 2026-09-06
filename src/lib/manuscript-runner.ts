import { create } from 'zustand'
import { useStore, flushSaves } from './store'
import { cancelInference, completeWithInference, selectedInference } from './inference'
import {
  ManuscriptGraph,
  receiveStudioResult,
  runIsStale,
  studioRequest,
} from '../domain/manuscript'
import { now, uid } from '../domain/schema'
import type { ManuscriptRun } from '../domain/manuscript-schema'

export const useStudioActivity = create<{ runId: string }>(() => ({ runId: '' }))
let cancelled = false
export function stopStudioRun(id: string) {
  if (useStudioActivity.getState().runId !== id) return
  cancelled = true
  cancelInference()
  useStore.getState().mutate((p) => {
    const r = p.studio.runs.find((r) => r.id === id)
    if (r) {
      r.status = 'paused'
      r.error =
        'Stopped. Completed steps are saved; resume explicitly to retry the interrupted step.'
      r.boundaries.push({
        id: uid(),
        actor: 'author',
        kind: 'decision',
        text: 'Stopped this request.',
        createdAt: now(),
      })
    }
  })
}
/** A single local resource owner, with isolated prompt contexts for each specialist. */
export async function runManuscript(projectId: string, id: string) {
  if (useStudioActivity.getState().runId) return
  useStudioActivity.setState({ runId: id })
  cancelled = false
  const selection = selectedInference()
  const mutate = (fn: (r: ManuscriptRun) => void) => {
    if (useStore.getState().project?.id !== projectId) return false
    return useStore.getState().mutate((p) => {
      const r = p.studio.runs.find((v) => v.id === id)
      if (!r) throw new Error('The manuscript checkpoint is missing.')
      fn(r)
    })
  }
  const unsubscribe = useStore.subscribe((state) => {
    if (state.project?.id !== projectId && !cancelled) {
      cancelled = true
      cancelInference()
    }
  })
  try {
    for (let count = 0; count < 6; count++) {
      const p = useStore.getState().project
      const r = p?.studio.runs.find((v) => v.id === id)
      if (cancelled || p?.id !== projectId || !r || !['ready', 'running'].includes(r.status)) break
      if (runIsStale(p, r)) {
        mutate((r) => {
          r.status = 'repair'
          r.error =
            'The world, voice profile, or manuscript changed. Review the current sources before starting a new pass.'
        })
        break
      }
      if (r.node === 'humanReview') {
        mutate((r) => {
          r.status = 'review'
        })
        break
      }
      const layer =
        r.node === 'continuity'
          ? 'canon'
          : r.node === 'prose'
            ? 'prose'
            : r.node === 'voice'
              ? 'voice'
              : undefined
      if (
        layer &&
        (!r.layers.includes(layer) ||
          (layer === 'voice' && !r.sources.some((s) => s.kind === 'voice')))
      ) {
        mutate((r) => {
          r.node = ManuscriptGraph[r.node as Exclude<ManuscriptRun['node'], 'humanReview'>].next
          if (r.node === 'humanReview') r.status = 'review'
        })
        continue
      }
      const request = studioRequest(r, !selection.connection),
        stepId = uid()
      if (
        !mutate((r) => {
          r.status = 'running'
          r.error = ''
          r.steps.push({
            id: stepId,
            role: request.role,
            system: request.system,
            prompt: request.prompt,
            schema: JSON.stringify(request.schema),
            raw: '',
            model: selection.label || 'on-device storyteller',
            destination: selection.origin,
            settings: JSON.stringify(
              selection.connection
                ? {
                    protocol: selection.connection.protocol,
                    model: selection.connection.model,
                    maxTokens: selection.connection.maxTokens,
                    tokenLimit: selection.connection.tokenLimit,
                    structured: selection.connection.structured,
                  }
                : {
                    runtime: 'WebLLM',
                    contextWindow: 4096,
                    maxTokens: 550,
                    temperature:
                      request.role.includes('reviewer') || request.role === 'voice-analyst'
                        ? 0.1
                        : 0.8,
                  },
            ),
            status: 'pending',
            createdAt: now(),
          })
        })
      )
        break
      await flushSaves()
      try {
        const raw = await completeWithInference(
          request.prompt,
          request.role,
          request.schema,
          selection,
        )
        if (
          !mutate((r) => {
            const step = r.steps.find((s) => s.id === stepId)!
            step.raw = raw
            step.status = 'complete'
          })
        )
          break
        if (cancelled) break
        const current = useStore.getState().project!
        const currentRun = current.studio.runs.find((r) => r.id === id)!
        if (runIsStale(current, currentRun) || selectedInference().id !== selection.id) {
          mutate((r) => {
            r.status = 'repair'
            r.error =
              'Sources or the selected model changed while this specialist was working. Its response is preserved, but cannot be applied.'
          })
          break
        }
        const next = structuredClone(currentRun)
        receiveStudioResult(next, raw)
        if (!mutate((r) => Object.assign(r, next))) break
        await flushSaves()
      } catch (error) {
        mutate((r) => {
          const step = r.steps.find((s) => s.id === stepId)
          if (step) step.status = 'failed'
          if (r.status !== 'repair') r.status = 'paused'
          r.error = cancelled
            ? 'Stopped. Resume explicitly to retry the interrupted step.'
            : error instanceof Error
              ? error.message
              : String(error)
        })
        break
      }
    }
  } catch (error) {
    mutate((r) => {
      r.status = 'paused'
      r.error = error instanceof Error ? error.message : String(error)
    })
  } finally {
    unsubscribe()
    await flushSaves().catch(() => {})
    useStudioActivity.setState({ runId: '' })
  }
}
