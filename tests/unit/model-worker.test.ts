import { describe, expect, it, vi } from 'vitest'
import { ModelWorker } from '../../src/lib/models'

function fakeWorker() {
  const messages: { id: number; type: string; payload: unknown }[] = []
  const transport = {
    onmessage: undefined as ((event: { data: unknown }) => void) | undefined,
    onerror: undefined,
    postMessage: (message: (typeof messages)[number]) => messages.push(message),
    terminate: vi.fn(),
  }
  return { transport, messages, reply: (data: unknown) => transport.onmessage!({ data }) }
}
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
describe('local model operation ordering', () => {
  it('waits for cache inspection before an immediate load request', async () => {
    const f = fakeWorker(),
      client = new ModelWorker(() => f.transport as unknown as Worker)
    const inspecting = client.call('status'),
      loading = client.call('load', { modelId: 'local' })
    await settle()
    expect(f.messages.map((m) => m.type)).toEqual(['status'])
    f.reply({ id: f.messages[0].id, result: [] })
    await inspecting
    await settle()
    expect(f.messages.map((m) => m.type)).toEqual(['status', 'load'])
    f.reply({ id: f.messages[1].id, result: true })
    await expect(loading).resolves.toBe(true)
  })
  it('cancels active and queued work without replaying it in a new worker', async () => {
    const first = fakeWorker(),
      second = fakeWorker()
    const factory = vi
      .fn()
      .mockReturnValueOnce(first.transport)
      .mockReturnValueOnce(second.transport)
    const client = new ModelWorker(factory)
    const pending = Promise.allSettled([client.call('status'), client.call('load')])
    await settle()
    client.stop()
    expect((await pending).every((r) => r.status === 'rejected')).toBe(true)
    expect(first.transport.terminate).toHaveBeenCalledOnce()
    expect(first.messages.map((m) => m.type)).toEqual(['status'])
    const next = client.call('status')
    await settle()
    expect(second.messages.map((m) => m.type)).toEqual(['status'])
    second.reply({ id: second.messages[0].id, result: [] })
    await next
  })
  it('allows a following explicit request after a failed cache inspection', async () => {
    const f = fakeWorker(),
      client = new ModelWorker(() => f.transport as unknown as Worker)
    const inspecting = client.call('status').catch((e) => e.message),
      loading = client.call('load')
    await settle()
    f.reply({ id: f.messages[0].id, error: 'Cache unavailable' })
    expect(await inspecting).toBe('Cache unavailable')
    await settle()
    expect(f.messages[1].type).toBe('load')
    f.reply({ id: f.messages[1].id, result: true })
    await expect(loading).resolves.toBe(true)
  })
  it('does not start another operation when only a progress event arrives', async () => {
    const f = fakeWorker(),
      progress = vi.fn(),
      client = new ModelWorker(() => f.transport as unknown as Worker)
    const loading = client.call('load', {}, progress),
      inspecting = client.call('status')
    await settle()
    f.reply({ id: f.messages[0].id, progress: { text: 'Loading weights' } })
    expect(progress).toHaveBeenCalledWith({ text: 'Loading weights' })
    expect(f.messages).toHaveLength(1)
    f.reply({ id: f.messages[0].id, result: true })
    await loading
    await settle()
    f.reply({ id: f.messages[1].id, result: [] })
    await inspecting
  })
})
