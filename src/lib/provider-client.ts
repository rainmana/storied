import { z } from 'zod'

export const providerIds = [
  'openai',
  'anthropic',
  'openrouter',
  'venice',
  'lmstudio',
  'ollama',
  'custom',
] as const
export type ProviderId = (typeof providerIds)[number]
export const providers: Record<
  ProviderId,
  {
    name: string
    baseUrl: string
    protocol: 'responses' | 'messages' | 'chat'
    keyRequired: boolean
  }
> = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'responses',
    keyRequired: true,
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    protocol: 'messages',
    keyRequired: true,
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    protocol: 'chat',
    keyRequired: true,
  },
  venice: {
    name: 'Venice',
    baseUrl: 'https://api.venice.ai/api/v1',
    protocol: 'chat',
    keyRequired: true,
  },
  lmstudio: {
    name: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    protocol: 'chat',
    keyRequired: false,
  },
  ollama: {
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    protocol: 'chat',
    keyRequired: false,
  },
  custom: { name: 'Custom endpoint', baseUrl: '', protocol: 'chat', keyRequired: false },
}
export const connectionSchema = z
  .object({
    provider: z.enum(providerIds),
    baseUrl: z.string().max(2000),
    model: z.string().trim().max(200),
    protocol: z.enum(['responses', 'messages', 'chat']),
    maxTokens: z.number().int().min(128).max(32768),
    structured: z.enum(['prompt', 'json_object', 'json_schema']),
  })
  .strict()
export type Connection = z.infer<typeof connectionSchema>
export function defaultConnection(provider: ProviderId): Connection {
  return {
    provider,
    baseUrl: providers[provider].baseUrl,
    protocol: providers[provider].protocol,
    model: '',
    maxTokens: 2048,
    structured: 'prompt',
  }
}
export function isLoopback(url: URL) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}
export function validateConnection(
  input: Connection,
  key: string,
  requireModel = true,
): Connection {
  const c = connectionSchema.parse(input)
  let url: URL
  try {
    url = new URL(c.baseUrl.trim())
  } catch {
    throw new Error('Enter a complete API base URL, including https:// or http://localhost.')
  }
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      'Keep credentials in the API key field. Base URLs cannot contain credentials, queries, or fragments.',
    )
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url)))
    throw new Error(
      'Use HTTPS for remote endpoints. Plain HTTP is supported only on localhost, 127.0.0.1, or [::1].',
    )
  if (
    ['openai', 'anthropic', 'openrouter', 'venice'].includes(c.provider) &&
    url.href.replace(/\/$/, '') !== providers[c.provider].baseUrl
  )
    throw new Error('Use Custom endpoint for a different API base URL.')
  if (c.provider !== 'custom' && c.protocol !== providers[c.provider].protocol)
    throw new Error('This preset requires its documented API protocol.')
  if (requireModel && !c.model)
    throw new Error('Enter a model ID or choose one from the model list.')
  if (key.length > 4096 || /[\r\n]/.test(key)) throw new Error('The API key is invalid.')
  if (providers[c.provider].keyRequired && !key.trim())
    throw new Error('Enter your API key for this provider.')
  if (c.protocol === 'messages' && c.structured !== 'prompt')
    throw new Error('The Messages adapter uses JSON instructions with local validation.')
  return { ...c, baseUrl: url.href.replace(/\/+$/, '') }
}
export function connectionLabel(c: Connection) {
  return `${providers[c.provider].name} · ${c.model}`
}
export function connectionOrigin(c: Connection) {
  return new URL(c.baseUrl).origin
}
export function requestHeaders(c: Connection, key: string): Record<string, string> {
  return c.protocol === 'messages'
    ? {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        ...(key ? { 'x-api-key': key } : {}),
      }
    : { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }
}
export function completionRequest(
  c: Connection,
  prompt: string,
  role: string,
  schema?: Record<string, unknown>,
) {
  const system =
    role === 'extractor'
      ? 'Extract only explicitly supported proposals. Return JSON only. Do not invent facts. The author must approve all changes.'
      : 'You are a careful creative writing assistant. Follow the supplied task and respect the author’s agency.'
  const input = schema
    ? `${prompt}\nReturn only a JSON object matching this schema:\n${JSON.stringify(schema)}`
    : prompt
  if (c.protocol === 'messages')
    return {
      path: '/messages',
      body: {
        model: c.model,
        max_tokens: c.maxTokens,
        system,
        messages: [{ role: 'user', content: input }],
        stream: false,
      },
    }
  const format =
    schema && c.structured !== 'prompt'
      ? c.structured === 'json_object'
        ? { type: 'json_object' }
        : { type: 'json_schema', json_schema: { name: 'storied_proposals', strict: true, schema } }
      : undefined
  if (c.protocol === 'responses')
    return {
      path: '/responses',
      body: {
        model: c.model,
        instructions: system,
        input,
        max_output_tokens: c.maxTokens,
        store: false,
        stream: false,
        ...(format
          ? {
              text: {
                format:
                  c.structured === 'json_object'
                    ? format
                    : { type: 'json_schema', name: 'storied_proposals', strict: true, schema },
              },
            }
          : {}),
      },
    }
  return {
    path: '/chat/completions',
    body: {
      model: c.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: input },
      ],
      max_tokens: c.maxTokens,
      stream: false,
      ...(format ? { response_format: format } : {}),
      ...(c.provider === 'venice'
        ? {
            venice_parameters: {
              include_venice_system_prompt: false,
              enable_web_search: 'off',
              enable_web_scraping: false,
              enable_web_citations: false,
              enable_x_search: false,
            },
          }
        : {}),
      ...(c.provider === 'openrouter' ? { provider: { allow_fallbacks: false } } : {}),
    },
  }
}
// Bound untrusted responses before parsing. Never surface provider error bodies (they can echo keys/prompts).
async function readJSON(response: Response) {
  if (!response.ok) {
    void response.body?.cancel()
    const hint =
      response.status === 401 || response.status === 403
        ? 'Check your key and account/browser access.'
        : response.status === 429
          ? 'Check rate limits or available credit.'
          : 'Check the model ID, protocol, and output settings.'
    throw new Error(
      `Provider returned HTTP ${response.status}. ${hint} No automatic retry was made.`,
    )
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('The endpoint returned an empty response.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 2 * 1024 * 1024) {
        await reader.cancel()
        throw new Error('The endpoint response exceeds the 2 MB limit.')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const data = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.length
  }
  try {
    return JSON.parse(new TextDecoder().decode(data)) as unknown
  } catch {
    throw new Error('The endpoint did not return valid JSON. Check its API base URL and protocol.')
  }
}
export async function providerRequest(
  c: Connection,
  key: string,
  path: string,
  body: unknown | undefined,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  // Only these application-owned routes can receive a key. Redirects never forward credentials.
  if (!['/models', '/messages', '/responses', '/chat/completions'].includes(path))
    throw new Error('Unsupported API operation.')
  c = validateConnection(c, key, path !== '/models')
  let response: Response
  try {
    response = await fetcher(c.baseUrl + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: requestHeaders(c, key),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      cache: 'no-store',
      signal,
    })
  } catch {
    if (signal.aborted)
      throw new Error(
        'Request canceled or timed out. The provider may already have processed it; retry only when you choose.',
      )
    throw new Error(
      'Cannot reach this endpoint from your browser. Check CORS, local-network permission, HTTPS, and that the server is running. No proxy or fallback was used.',
    )
  }
  return readJSON(response)
}
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
export function responseText(protocol: Connection['protocol'], value: unknown): string {
  const data = object(value)
  let text = ''
  if (protocol === 'messages')
    text = array(data.content)
      .filter((v) => object(v).type === 'text')
      .map((v) => object(v).text)
      .filter((v) => typeof v === 'string')
      .join('\n')
  else if (protocol === 'responses')
    text = array(data.output)
      .filter((v) => object(v).type === 'message')
      .flatMap((v) => array(object(v).content))
      .filter((v) => object(v).type === 'output_text')
      .map((v) => object(v).text)
      .filter((v) => typeof v === 'string')
      .join('\n')
  else {
    const content = object(object(array(data.choices)[0]).message).content
    if (typeof content === 'string') text = content
  }
  if (!text.trim())
    throw new Error(
      'The model returned no usable text (it may have refused, requested a tool, or exhausted its output budget). Nothing was applied. Adjust the model or output limit before retrying.',
    )
  if (text.length > 500_000) throw new Error('The model output exceeds the passage limit.')
  return text
}
export function modelIds(value: unknown): string[] {
  const ids = array(object(value).data)
    .map((v) => object(v).id)
    .filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200)
  return [...new Set(ids)].sort().slice(0, 2000)
}
