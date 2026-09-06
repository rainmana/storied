import { describe, expect, it, vi } from 'vitest'
import {
  completionRequest,
  defaultConnection,
  connectionSchema,
  modelIds,
  providerIds,
  providerRequest,
  requestHeaders,
  responseText,
  validateConnection,
} from '../../src/lib/provider-client'

describe('optional inference providers', () => {
  it('upgrades saved profiles to Automatic and omits limits for OpenAI chat-latest aliases', () => {
    for (const model of ['chat-latest', 'gpt-5.3-chat-latest']) {
      const { tokenLimit: _oldMissing, ...legacy } = { ...defaultConnection('openai'), model }
      const c = connectionSchema.parse(legacy)
      expect(c.tokenLimit).toBe('auto')
      const body = completionRequest(c, 'passage', 'storyteller').body
      expect(body).not.toHaveProperty('max_output_tokens')
      expect(body).not.toHaveProperty('max_tokens')
      expect(body).not.toHaveProperty('max_completion_tokens')
      expect(
        completionRequest({ ...c, tokenLimit: 'custom', maxTokens: 4096 }, 'p', 'storyteller').body,
      ).toHaveProperty('max_output_tokens', 4096)
    }
  })
  it('omits output limits for either optional protocol and retains required Messages limits', () => {
    for (const protocol of ['chat', 'responses'] as const) {
      const c = {
        ...defaultConnection('custom'),
        baseUrl: 'https://example.test/v1',
        model: 'm',
        protocol,
        tokenLimit: 'provider' as const,
      }
      const body = completionRequest(validateConnection(c, ''), 'source', 'extractor', {
        type: 'object',
      }).body
      expect(body).not.toHaveProperty('max_tokens')
      expect(body).not.toHaveProperty('max_output_tokens')
      expect(body).not.toHaveProperty('max_completion_tokens')
    }
    expect(
      completionRequest(defaultConnection('anthropic'), 'p', 'storyteller').body,
    ).toHaveProperty('max_tokens', 2048)
    expect(() =>
      validateConnection(
        { ...defaultConnection('anthropic'), model: 'm', tokenLimit: 'provider' },
        'fake',
      ),
    ).toThrow('requires an output-token limit')
    expect(
      completionRequest(
        { ...defaultConnection('openai'), model: 'other-model' },
        'p',
        'storyteller',
      ).body,
    ).toHaveProperty('max_output_tokens', 2048)
  })
  it.each(providerIds)('validates the %s preset and its protocol', (provider) => {
    const c = { ...defaultConnection(provider), model: 'chosen-model' }
    if (provider === 'custom') c.baseUrl = 'https://example.test/api/v1'
    expect(validateConnection(c, 'test-key').provider).toBe(provider)
  })
  it.each([
    'http://remote.example/v1',
    'https://user:password@example.test/v1',
    'https://example.test/v1?api_key=secret',
    'https://example.test/v1#secret',
    'file:///models',
    'http://localhost.evil.test/v1',
  ])('rejects unsafe endpoint %s', (baseUrl) => {
    expect(() =>
      validateConnection({ ...defaultConnection('custom'), baseUrl, model: 'model' }, ''),
    ).toThrow()
  })
  it('accepts IPv4/IPv6 loopback and blocks silently redirecting a preset key elsewhere', () => {
    for (const baseUrl of ['http://127.0.0.1:1234/v1', 'http://[::1]:11434/v1'])
      expect(
        validateConnection({ ...defaultConnection('custom'), baseUrl, model: 'm' }, '').baseUrl,
      ).toBe(baseUrl)
    expect(() =>
      validateConnection(
        { ...defaultConnection('openai'), baseUrl: 'https://other.example/v1', model: 'm' },
        'k',
      ),
    ).toThrow('Custom endpoint')
  })
  it('uses stateless OpenAI Responses with optional native schema and no tools', () => {
    const c = {
      ...defaultConnection('openai'),
      model: 'chosen',
      structured: 'json_schema' as const,
    }
    const r = completionRequest(c, 'visible context', 'extractor', { type: 'object' })
    expect(r.path).toBe('/responses')
    expect(r.body).toMatchObject({
      model: 'chosen',
      store: false,
      stream: false,
      text: { format: { type: 'json_schema', strict: true } },
    })
    expect(r.body).not.toHaveProperty('tools')
  })
  it('uses Anthropic headers and its top-level system parameter', () => {
    const c = defaultConnection('anthropic'),
      r = completionRequest(c, 'source', 'storyteller')
    expect(requestHeaders(c, 'fake')).toMatchObject({
      'x-api-key': 'fake',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    })
    expect(r.path).toBe('/messages')
    expect(r.body).toMatchObject({
      system: expect.any(String),
      messages: [{ role: 'user', content: 'source' }],
    })
  })
  it('keeps Venice system/web additions off and OpenRouter automatic fallbacks off', () => {
    expect(completionRequest(defaultConnection('venice'), 'p', 'storyteller').body).toMatchObject({
      venice_parameters: {
        include_venice_system_prompt: false,
        enable_web_search: 'off',
        enable_web_scraping: false,
        enable_x_search: false,
      },
    })
    expect(
      completionRequest(defaultConnection('openrouter'), 'p', 'storyteller').body,
    ).toMatchObject({ provider: { allow_fallbacks: false } })
  })
  it('extracts only public text blocks, ignoring reasoning and tool calls', () => {
    expect(
      responseText('responses', {
        output: [
          { type: 'reasoning', text: 'private' },
          { type: 'message', content: [{ type: 'output_text', text: 'story' }] },
        ],
      }),
    ).toBe('story')
    expect(
      responseText('messages', {
        content: [
          { type: 'thinking', thinking: 'private' },
          { type: 'text', text: 'story' },
        ],
      }),
    ).toBe('story')
    expect(() =>
      responseText('chat', {
        choices: [{ message: { tool_calls: [{ function: { name: 'commitCanon' } }] } }],
      }),
    ).toThrow('no usable text')
    expect(() =>
      responseText('chat', { choices: [{ message: { content: { operation: 'commit' } } }] }),
    ).toThrow()
  })
  it('sends only to the configured route without cookies, referrers, redirects, or retry', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'one' }] })))
    const c = { ...defaultConnection('custom'), baseUrl: 'https://example.test/v1', model: 'm' }
    const result = await providerRequest(
      c,
      'fake',
      '/models',
      undefined,
      new AbortController().signal,
      fetcher,
    )
    expect(modelIds(result)).toEqual(['one'])
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      'https://example.test/v1/models',
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake' },
      }),
    )
    await expect(
      providerRequest(c, 'fake', '/unexpected', {}, new AbortController().signal, fetcher),
    ).rejects.toThrow('Unsupported')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('redacts error bodies and does not retry unauthorized/paid requests', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('secret-key and private story echoed', { status: 401 }))
    await expect(
      providerRequest(
        { ...defaultConnection('openai'), model: 'm' },
        'secret-key',
        '/responses',
        {},
        new AbortController().signal,
        fetcher,
      ),
    ).rejects.toThrow('HTTP 401')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('rejects oversized and non-JSON responses', async () => {
    const c = { ...defaultConnection('ollama'), model: 'm' }
    for (const text of ['not JSON', 'x'.repeat(2 * 1024 * 1024 + 1)]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(text))
      await expect(
        providerRequest(c, '', '/chat/completions', {}, new AbortController().signal, fetcher),
      ).rejects.toThrow()
    }
  })
})
