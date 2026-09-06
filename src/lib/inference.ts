import { create } from 'zustand'
import { completeLocally, useModels } from './models'
import { readProviderKey, useProviderSettings } from './provider-settings'
import {
  completionRequest,
  connectionLabel,
  connectionOrigin,
  modelIds,
  providerRequest,
  responseText,
  validateConnection,
  type Connection,
} from './provider-client'

export const useApiActivity = create<{ busy: boolean }>(() => ({ busy: false }))
let controller: AbortController | undefined
export function selectedInference() {
  const s = useProviderSettings.getState()
  if (s.active === 'browser')
    return {
      id: `browser:${s.version}`,
      label: useModels.getState().loadedId,
      origin: 'this device',
      connection: undefined,
      version: s.version,
    }
  const connection = s.profiles[s.active]?.connection
  if (!connection) throw new Error('Choose a storyteller connection in Settings.')
  return {
    id: `${s.active}:${s.version}`,
    label: connectionLabel(connection),
    origin: connectionOrigin(connection),
    connection: structuredClone(connection),
    version: s.version,
  }
}
export function useInferenceStatus() {
  const settings = useProviderSettings(),
    local = useModels(),
    api = useApiActivity()
  const selection = selectedInference()
  let ready = !!local.loadedId
  if (selection.connection) {
    try {
      validateConnection(selection.connection, readProviderKey(selection.connection.provider))
      ready = true
    } catch {
      ready = false
    }
  }
  return {
    ...selection,
    ready,
    busy: local.busy || api.busy,
    remote: settings.active !== 'browser',
  }
}
export function cancelInference() {
  controller?.abort()
  useModels.getState().cancel()
}
export async function listProviderModels(connection: Connection, key: string) {
  const c = validateConnection(connection, key.trim(), false)
  const data = await providerRequest(
    c,
    key.trim(),
    '/models',
    undefined,
    AbortSignal.timeout(20000),
  )
  const ids = modelIds(data)
  if (!ids.length) throw new Error('No model IDs were returned. Enter an exact model ID manually.')
  return ids
}
export async function completeWithInference(
  prompt: string,
  role: 'storyteller' | 'extractor' | 'summarizer' | 'worldbuilder' = 'storyteller',
  schema?: Record<string, unknown>,
  expected = selectedInference(),
): Promise<string> {
  if (selectedInference().id !== expected.id)
    throw new Error(
      'The storyteller connection changed. Resume explicitly with the selected connection.',
    )
  if (!expected.connection) return completeLocally(prompt, role, schema)
  if (useApiActivity.getState().busy || useModels.getState().busy)
    throw new Error('A model operation is already running.')
  const c = expected.connection,
    key = readProviderKey(c.provider)
  validateConnection(c, key)
  const request = completionRequest(c, prompt, role, schema)
  const currentController = new AbortController()
  controller = currentController
  const timeout = setTimeout(() => currentController.abort(), 120000)
  useApiActivity.setState({ busy: true })
  try {
    const result = await providerRequest(
      c,
      key,
      request.path,
      request.body,
      currentController.signal,
    )
    const text = responseText(c.protocol, result)
    // A hostile/misconfigured endpoint must not echo the entered credential into project exports.
    return key ? text.split(key).join('[API key redacted]') : text
  } finally {
    clearTimeout(timeout)
    if (controller === currentController) controller = undefined
    useApiActivity.setState({ busy: false })
  }
}
