import { afterEach, describe, expect, it, vi } from 'vitest'
import { installAssetGate } from '../../src/workers/network-policy'
afterEach(() => vi.unstubAllGlobals())
function setup() {
  const fetch = vi.fn(async (_input: RequestInfo | URL) => new Response('asset'))
  const scope = { fetch, location: { origin: 'https://storied.test' } }
  vi.stubGlobal('self', scope)
  const gate = installAssetGate()
  return { scope, gate, fetch }
}
describe('model asset network gate', () => {
  it('blocks remote requests without explicit download consent', async () => {
    const { scope, fetch } = setup()
    await expect(scope.fetch('https://huggingface.co/model')).rejects.toThrow('not cached')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('allows only approved model asset hosts while downloading', async () => {
    const { scope, gate, fetch } = setup()
    gate.allowDownloads(true)
    await scope.fetch('https://huggingface.co/model')
    expect(fetch).toHaveBeenCalledOnce()
    await expect(scope.fetch('https://remote-inference.example/chat')).rejects.toThrow()
    await expect(scope.fetch('https://huggingface.co.evil.example/model')).rejects.toThrow()
  })
  it('blocks all request bodies and network writes even during a download', async () => {
    const { scope, gate, fetch } = setup()
    gate.allowDownloads(true)
    await expect(
      scope.fetch(
        new Request('https://huggingface.co/model', { method: 'POST', body: 'PRIVATE_STORY' }),
      ),
    ).rejects.toThrow('writes are disabled')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('permits same-origin application assets and seals remote access after loading', async () => {
    const { scope, gate, fetch } = setup()
    await scope.fetch('https://storied.test/runtime/engine.wasm')
    expect(fetch).toHaveBeenCalledOnce()
    gate.allowDownloads(true)
    gate.allowDownloads(false)
    await expect(scope.fetch('https://huggingface.co/model')).rejects.toThrow()
    const request = fetch.mock.calls[0]?.[0] as unknown as Request
    expect(request.credentials).toBe('omit')
    expect(request.referrerPolicy).toBe('no-referrer')
  })
})
