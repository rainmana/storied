import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const nav = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name, exact: true })
    .click()
const saved = (page: Page) =>
  expect(page.locator('.save-status')).toHaveText('Saved on this device')
async function connections(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const section = page.getByRole('region', { name: 'Storyteller connections' })
  await section.getByText('Connect an API or local server', { exact: true }).click()
  return section
}

test('opt-in API inference keeps credentials out of projects, filters context, and retains canon review', async ({
  page,
}, info) => {
  const calls: { url: string; method: string; key: string | undefined; body: any }[] = []
  const origin = new URL(info.project.use.baseURL!).origin
  await page.route('https://provider.example.test/v1/**', async (route) => {
    const r = route.request()
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'content-type': 'application/json',
    }
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const body = r.postDataJSON()
    calls.push({ url: r.url(), method: r.method(), key: r.headers().authorization, body })
    if (r.method() === 'GET')
      return route.fulfill({ headers, body: JSON.stringify({ data: [{ id: 'fixture-model' }] }) })
    const extract = body.messages[0].content.includes('Extract only')
    const content = extract
      ? JSON.stringify({
          proposals: [
            {
              kind: 'event',
              subjectId: 'e0',
              targetId: '',
              predicate: 'crossing',
              value: 'Mara boards the ferry.',
            },
          ],
        })
      : 'Mara boards the ferry. Nera holds out the blue cord.'
    return route.fulfill({
      headers,
      body: JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }),
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore The Quiet Tide', exact: true }).click()
  await saved(page)
  const section = await connections(page)
  await section.getByLabel('Provider', { exact: true }).selectOption('custom')
  await section.getByLabel('API base URL', { exact: true }).fill('https://provider.example.test/v1')
  await section.getByLabel('API key', { exact: true }).fill('fixture-user-key-never-export')
  expect(calls).toHaveLength(0)
  await expect(
    section.getByRole('button', { name: 'Use this connection', exact: true }),
  ).toBeDisabled()
  await section.getByRole('button', { name: 'Fetch models', exact: true }).click()
  await expect(
    section.getByText('1 models found. Choose one below, or enter a model ID yourself.', {
      exact: true,
    }),
  ).toBeVisible()
  await section.getByLabel('Available models', { exact: true }).selectOption('fixture-model')
  await expect(section.getByLabel('Model ID', { exact: true })).toHaveValue('fixture-model')
  expect(calls[0]).toMatchObject({
    method: 'GET',
    body: null,
    key: 'Bearer fixture-user-key-never-export',
  })
  await section.getByRole('checkbox', { name: /I allow AI actions/ }).check()
  await section.getByRole('button', { name: 'Use this connection', exact: true }).click()
  await expect(page.getByRole('button', { name: 'API connected', exact: true })).toBeVisible()
  await nav(page, 'Play')
  await page.getByLabel('Your next move', { exact: true }).fill('I board the ferry.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByLabel('Story draft', { exact: true })).toHaveValue(
    'Mara boards the ferry. Nera holds out the blue cord.',
  )
  expect(calls).toHaveLength(2)
  expect(calls[1].body.messages[1].content).toContain('I board the ferry.')
  expect(calls[1].body.messages[1].content).not.toContain('extinguished the lantern deliberately')
  await page.getByRole('button', { name: 'Accept passage', exact: true }).click()
  await page.getByRole('button', { name: 'Review canon', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Accept into canon', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Accept into canon', exact: true }).click()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await saved(page)
  expect(calls).toHaveLength(3)
  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue(
    'fixture-user-key-never-export',
  )
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export project', exact: true }).click()
  const text = readFileSync((await (await downloading).path())!, 'utf8'),
    project = JSON.parse(text)
  expect(text).not.toContain('fixture-user-key-never-export')
  expect(project.approvals).toHaveLength(1)
  expect(project.events.some((e: { title: string }) => e.title === 'Mara boards the ferry.')).toBe(
    true,
  )
  expect(project.workflows[0].model).toBe('Custom endpoint · fixture-model')
  expect(
    project.workflows[0].boundaries.some((b: { text: string }) =>
      b.text.includes('https://provider.example.test'),
    ),
  ).toBe(true)
  expect(
    await page.evaluate(() =>
      Object.values(localStorage).some((v) => v.includes('fixture-user-key-never-export')),
    ),
  ).toBe(false)
  await page.getByRole('button', { name: 'Forget connection & key', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Local', exact: true })).toBeVisible()
  expect(
    await page.evaluate(() =>
      Object.values(sessionStorage).some((v) => v.includes('fixture-user-key-never-export')),
    ),
  ).toBe(false)
  expect(calls).toHaveLength(3)
})

test('provider errors stop without retry or fallback and the connection form fits mobile', async ({
  page,
}) => {
  let calls = 0
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
      })
    calls++
    expect(route.request().headers()['anthropic-dangerous-direct-browser-access']).toBe('true')
    await route.fulfill({
      status: 401,
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ error: { message: 'secret-key echoed with private story' } }),
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore The Quiet Tide', exact: true }).click()
  await saved(page)
  const section = await connections(page)
  await section.getByLabel('Provider', { exact: true }).selectOption('anthropic')
  await section.getByLabel('API key', { exact: true }).fill('secret-key')
  await section.getByLabel('Model ID', { exact: true }).fill('fixture-claude')
  await section.getByRole('checkbox', { name: /I allow AI actions/ }).check()
  await section.getByRole('button', { name: 'Use this connection', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await section
    .getByRole('heading', { name: 'Choose your storyteller', exact: true })
    .scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'docs/screenshots/providers-mobile.png', animations: 'disabled' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await nav(page, 'Play')
  await page.getByLabel('Your next move', { exact: true }).fill('I step onto the ferry.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Provider returned HTTP 401')
  await expect(page.getByRole('alert')).not.toContainText('secret-key')
  await expect(page.getByRole('button', { name: 'Retry failed step', exact: true })).toBeVisible()
  expect(calls).toBe(1)
})

test('discover OpenAI models before choosing one and generate/extract with chat-latest without a token limit', async ({
  page,
}, info) => {
  const calls: { method: string; body: any }[] = []
  const headers = {
    'access-control-allow-origin': new URL(info.project.use.baseURL!).origin,
    'access-control-allow-headers': 'authorization,content-type',
    'content-type': 'application/json',
  }
  await page.route('https://api.openai.com/v1/**', async (route) => {
    const r = route.request()
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const body = r.postDataJSON()
    calls.push({ method: r.method(), body })
    if (r.method() === 'GET')
      return route.fulfill({
        headers,
        body: JSON.stringify({ data: [{ id: 'other-model' }, { id: 'chat-latest' }] }),
      })
    if (['max_tokens', 'max_completion_tokens', 'max_output_tokens'].some((key) => key in body))
      return route.fulfill({
        status: 400,
        headers,
        body: JSON.stringify({ error: { message: 'Unsupported output limit' } }),
      })
    const text = body.instructions.includes('Extract only')
      ? '{"proposals":[]}'
      : 'Mara steps onto the ferry.'
    return route.fulfill({
      headers,
      body: JSON.stringify({
        output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
      }),
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore The Quiet Tide', exact: true }).click()
  await saved(page)
  const section = await connections(page)
  await expect(section.getByRole('button', { name: 'Fetch models', exact: true })).toBeDisabled()
  await section.getByLabel('API key', { exact: true }).fill('synthetic-openai-key')
  await expect(section.getByLabel('Model ID', { exact: true })).toHaveValue('')
  // Discovery remains independent of an unfinished generation setting.
  await section.getByLabel('Maximum output tokens', { exact: true }).fill('')
  expect(calls).toHaveLength(0)
  await section.getByRole('button', { name: 'Fetch models', exact: true }).click()
  await section.getByLabel('Filter models', { exact: true }).fill('chat')
  await expect(
    section.getByLabel('Available models', { exact: true }).locator('option'),
  ).toHaveCount(2)
  await section.getByLabel('Available models', { exact: true }).selectOption('chat-latest')
  await expect(section.getByLabel('Maximum output tokens', { exact: true })).toHaveCount(0)
  await expect(
    section.getByText('No token-limit parameter will be sent.', { exact: false }),
  ).toBeVisible()
  await page.screenshot({
    path: 'docs/screenshots/provider-model-picker.png',
    animations: 'disabled',
  })
  await section.getByRole('checkbox', { name: /I allow AI actions/ }).check()
  await section.getByRole('button', { name: 'Use this connection', exact: true }).click()
  await nav(page, 'Play')
  await page.getByLabel('Your next move', { exact: true }).fill('I board the ferry.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByLabel('Story draft', { exact: true })).toHaveValue(
    'Mara steps onto the ferry.',
  )
  await page.getByRole('button', { name: 'Accept passage', exact: true }).click()
  await expect.poll(() => calls.length).toBe(3)
  expect(calls[0]).toEqual({ method: 'GET', body: null })
  for (const { body } of calls.slice(1)) {
    expect(body.model).toBe('chat-latest')
    expect(body).not.toHaveProperty('max_output_tokens')
  }
  await saved(page)
  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByLabel('Model ID', { exact: true })).toHaveValue('chat-latest')
  await expect(page.getByLabel('Output limit', { exact: true })).toHaveValue('auto')
  await page.getByLabel('Output limit', { exact: true }).selectOption('provider')
  await page.getByRole('checkbox', { name: /I allow AI actions/ }).check()
  await page.getByRole('button', { name: 'Use this connection', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByLabel('Output limit', { exact: true })).toHaveValue('provider')
})

test('failed model discovery permits manual selection and changing credentials clears results', async ({
  page,
}) => {
  let calls = 0
  await page.route('https://api.openai.com/v1/models', async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
      })
    calls++
    return route.fulfill({
      status: 404,
      headers: { 'access-control-allow-origin': '*' },
      body: 'private echoed error',
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore The Quiet Tide', exact: true }).click()
  await saved(page)
  const section = await connections(page)
  await section.getByLabel('API key', { exact: true }).fill('synthetic-key')
  await section.getByRole('button', { name: 'Fetch models', exact: true }).click()
  await expect(section.getByRole('alert')).toContainText('enter a model ID manually')
  await expect(section.getByRole('alert')).not.toContainText('private echoed error')
  await section.getByLabel('Model ID', { exact: true }).fill('chat-latest')
  await section.getByRole('checkbox', { name: /I allow AI actions/ }).check()
  await section.getByRole('button', { name: 'Use this connection', exact: true }).click()
  await expect(page.getByRole('button', { name: 'API connected', exact: true })).toBeVisible()
  await section.getByLabel('API key', { exact: true }).fill('replacement-synthetic-key')
  await expect(section.getByRole('alert')).toHaveCount(0)
  expect(calls).toBe(1)
})
