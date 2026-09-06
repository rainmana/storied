import { useState } from 'react'
import { useStore } from '../lib/store'
import { updateWorkflow } from '../lib/workflows'
import { repairWorkflow, setDirection, workflowIsStale } from '../domain/coordination'
import { branchMatches, retryFailedWorkflow } from '../domain/execution-graph'
import type { Workflow } from '../domain/workflow-schema'
import { Button } from './ui/button'
import { Field } from './common'

export function WorkflowPanel({
  workflow: w,
  onResume,
  busy,
}: {
  workflow: Workflow
  onResume: () => Promise<void>
  busy: boolean
}) {
  const store = useStore(),
    p = store.project!
  const [goal, setGoal] = useState(w.coordination.goal),
    [constraints, setConstraints] = useState(w.coordination.constraints.join('\n')),
    [clarification, setClarification] = useState(''),
    [error, setError] = useState('')
  const stale = workflowIsStale(p, w),
    signal = w.signals.find((s) => !s.resolved)
  const repair = async () => {
    setError('')
    try {
      if (!branchMatches(p, w))
        throw new Error('Return to the source branch before resuming this checkpoint.')
      const operation = stale ? 'synchronize' : signal?.operation || 'reground'
      let failure = ''
      const saved = store.mutate((p) => {
        try {
          repairWorkflow(
            p,
            p.workflows.find((v) => v.id === w.id)!,
            operation,
            clarification,
          )
        } catch (e) {
          failure = String(e)
          throw e
        }
      })
      if (!saved) throw new Error(failure || 'The checkpoint could not be saved.')
      setClarification('')
      await onResume()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <section className="workflow-panel" aria-label="Story process">
      <div className="section-heading">
        <h3>Story process</h3>
        <span className="small muted">
          {busy ? 'Working locally' : w.status === 'complete' ? 'Saved' : 'Checkpoint saved'}
        </span>
      </div>
      {w.status === 'failed' ? (
        <>
          <p className="error-message" role="alert">
            {w.error}
          </p>
          <p className="small muted">
            {w.turnId
              ? 'Your accepted passage is safe. Retry resumes the failed step.'
              : 'Your original input is saved. Load a local model or correct the limit, then retry.'}
          </p>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              if (
                store.mutate((p) =>
                  retryFailedWorkflow(
                    p,
                    p.workflows.find((v) => v.id === w.id)!,
                  ),
                )
              )
                await onResume()
            }}
          >
            Retry failed step
          </Button>
        </>
      ) : stale || signal || w.status === 'repair' ? (
        <>
          <p className="small" role="status">
            {stale ? 'The world or your direction changed since this checkpoint.' : signal?.message}
          </p>
          {!!w.coordination.interpretations.length && (
            <div className="form-stack">
              {w.coordination.interpretations.map((i) => (
                <button
                  type="button"
                  className="text-button small"
                  key={i.id}
                  onClick={() => setClarification(i.text)}
                >
                  {i.text}
                </button>
              ))}
            </div>
          )}
          {!stale && (
            <Field label="Clarify your direction">
              <textarea
                rows={3}
                value={clarification}
                maxLength={500}
                onChange={(e) => setClarification(e.target.value)}
              />
            </Field>
          )}
          <Button size="sm" disabled={busy} onClick={repair}>
            {stale ? 'Synchronize & resume' : 'Repair & resume'}
          </Button>
        </>
      ) : !busy && ['running', 'ready'].includes(w.status) ? (
        <Button size="sm" onClick={onResume}>
          Resume saved step
        </Button>
      ) : (
        <p className="small muted">
          {w.node === 'humanNarrativeReview'
            ? 'Review the draft. The original model output remains in the record.'
            : w.node === 'humanCanonReview'
              ? 'Proposals are waiting for your review. Nothing becomes canon automatically.'
              : 'Input, source passages, and processing steps stay on this device.'}
        </p>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <details>
        <summary>Story direction</summary>
        <div className="form-stack">
          <Field label="Current goal">
            <textarea
              rows={3}
              maxLength={500}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </Field>
          <Field
            label="Keep in mind"
            hint="One constraint per line. These directions are visible to the storyteller."
          >
            <textarea
              rows={3}
              maxLength={5000}
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
            />
          </Field>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              updateWorkflow(w.id, (w) =>
                setDirection(
                  w,
                  goal,
                  constraints
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .slice(0, 30),
                ),
              )
            }}
          >
            Save direction
          </Button>
        </div>
      </details>
      <details>
        <summary>How this passage was made</summary>
        <p className="small muted">
          Application records and source communication, not private model reasoning.
        </p>
        <ol className="workflow-trace">
          {w.trace.map((t, i) => (
            <li key={i}>
              <strong>{t.node}</strong>
              <small>
                {t.authority} · world {t.worldRevision} · direction {t.coordinationVersion}
              </small>
              <span>{t.outcome}</span>
            </li>
          ))}
        </ol>
        {w.boundaries.map((b) => (
          <details key={b.id}>
            <summary>
              {b.actor} · {b.kind}
            </summary>
            <pre>{b.text}</pre>
          </details>
        ))}
        {w.repairs.map((r) => (
          <p className="small" key={r.id}>
            Repair: {r.operation} · {r.note}
          </p>
        ))}
      </details>
    </section>
  )
}
