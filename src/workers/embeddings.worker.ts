import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'
import { EMBEDDING_CACHE, EMBEDDING_MODEL } from '../lib/model-catalog'
import { installAssetGate } from './network-policy'
import ortWasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url'
import ortModuleUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url'

const gate = installAssetGate()
env.allowLocalModels = false
env.useBrowserCache = false
env.useCustomCache = true
env.customCache = {
  match: async (key: string) => (await caches.open(EMBEDDING_CACHE)).match(key),
  put: async (key: string, response: Response) => {
    await (await caches.open(EMBEDDING_CACHE)).put(key, response)
  },
}
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = {
    wasm: new URL(ortWasmUrl, self.location.origin).href,
    mjs: new URL(ortModuleUrl, self.location.origin).href,
  }
  env.backends.onnx.wasm.numThreads = 1
  env.backends.onnx.wasm.proxy = false
}
let extractor: FeatureExtractionPipeline | undefined,
  busy = false
self.onmessage = async ({ data }) => {
  const { id, type, payload } = data
  if (busy) {
    self.postMessage({ id, error: 'Local search is busy.' })
    return
  }
  busy = true
  try {
    let result: unknown
    if (type === 'load') {
      gate.allowDownloads(payload?.allowDownload === true)
      // CPU/WASM makes retrieval available without WebGPU; generation uses WebGPU separately.
      const createExtractor = pipeline as unknown as (
        task: string,
        model: string,
        options: Record<string, unknown>,
      ) => Promise<FeatureExtractionPipeline>
      extractor = await createExtractor('feature-extraction', EMBEDDING_MODEL, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (progress: unknown) => self.postMessage({ id, progress }),
      })
      result = true
    } else if (type === 'embed') {
      if (!extractor) throw new Error('Load the local search model first.')
      gate.allowDownloads(false)
      const output = await extractor(payload.texts, { pooling: 'mean', normalize: true })
      result = output.tolist()
    } else if (type === 'remove') {
      await extractor?.dispose()
      extractor = undefined
      await caches.delete(EMBEDDING_CACHE)
      result = true
    } else throw new Error('Unknown embedding operation.')
    self.postMessage({ id, result })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  } finally {
    gate.allowDownloads(false)
    busy = false
  }
}
