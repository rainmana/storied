import {
  CreateMLCEngine,
  hasModelInCache,
  deleteModelAllInfoInCache,
  prebuiltAppConfig,
  type MLCEngine,
} from '@mlc-ai/web-llm'
import { STORY_MODELS } from '../lib/model-catalog'
import { installAssetGate } from './network-policy'
import { writingSystem } from '../domain/writing-style'

const gate = installAssetGate()
const appConfig = {
  ...prebuiltAppConfig,
  model_list: prebuiltAppConfig.model_list.filter((m) =>
    STORY_MODELS.some((s) => s.id === m.model_id),
  ),
}
let engine: MLCEngine | undefined,
  modelId = '',
  busy = false
self.onmessage = async ({
  data,
}: MessageEvent<{
  id: number
  type: string
  payload: {
    modelId?: string
    allowDownload?: boolean
    prompt?: string
    role?: string
    responseSchema?: Record<string, unknown>
  }
}>) => {
  const { id, type, payload = {} } = data
  if (type === 'cancel') {
    engine?.interruptGenerate()
    return
  }
  if (busy) {
    self.postMessage({ id, error: 'The local model is busy. Let the current operation finish.' })
    return
  }
  busy = true
  try {
    let result: unknown
    if (type === 'status')
      result = await Promise.all(
        STORY_MODELS.map(async (m) => ({
          id: m.id,
          cached: await hasModelInCache(m.id, appConfig),
          loaded: modelId === m.id,
        })),
      )
    else if (type === 'load') {
      if (!STORY_MODELS.some((m) => m.id === payload.modelId))
        throw new Error('Unknown model. Imported model URLs are never used.')
      gate.allowDownloads(payload.allowDownload === true)
      await engine?.unload()
      engine = undefined
      modelId = ''
      engine = await CreateMLCEngine(
        payload.modelId!,
        { appConfig, initProgressCallback: (progress) => self.postMessage({ id, progress }) },
        { context_window_size: 4096 },
      )
      modelId = payload.modelId!
      result = true
    } else if (type === 'complete') {
      if (!engine) throw new Error('Load a local storyteller in Local models first.')
      gate.allowDownloads(false)
      const output = await engine.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: writingSystem(payload.role || 'storyteller'),
          },
          { role: 'user', content: payload.prompt || '' },
        ],
        temperature: payload.role === 'extractor' ? 0.1 : 0.8,
        ...(payload.responseSchema
          ? {
              response_format: {
                type: 'json_object' as const,
                schema: JSON.stringify(payload.responseSchema),
              },
            }
          : {}),
        max_tokens: 550,
      })
      result = output.choices[0]?.message.content || ''
      if (!result)
        throw new Error('The model returned no text. Try a shorter context or reload the model.')
    } else if (type === 'remove') {
      if (!STORY_MODELS.some((m) => m.id === payload.modelId)) throw new Error('Unknown model.')
      if (modelId === payload.modelId) {
        await engine?.unload()
        engine = undefined
        modelId = ''
      }
      await deleteModelAllInfoInCache(payload.modelId!, appConfig)
      result = true
    } else if (type === 'unload') {
      await engine?.unload()
      engine = undefined
      modelId = ''
      result = true
    } else throw new Error('Unknown local model operation.')
    self.postMessage({ id, result })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  } finally {
    gate.allowDownloads(false)
    busy = false
  }
}
