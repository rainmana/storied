import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

test('loopback HTTP with real CORS, optional persistent key, and manual Story mode', async ({
  page,
  context,
}, info) => {
  const appOrigin = new URL(info.project.use.baseURL!).origin
  const received: {
    method: string
    url: string
    origin: string | undefined
    key: string | undefined
  }[] = []
  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', appOrigin)
    res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    received.push({
      method: req.method!,
      url: req.url!,
      origin: req.headers.origin,
      key: req.headers.authorization,
    })
    for await (const _chunk of req) {
      /* Consume only this test's tiny request. */
    }
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify(
        req.url === '/v1/models'
          ? { data: [{ id: 'local-fixture' }] }
          : { choices: [{ message: { content: 'A local server answers from the ferry.' } }] },
      ),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    await context.grantPermissions(['local-network-access'])
    await page.goto('/')
    await page.getByRole('button', { name: 'Explore The Quiet Tide', exact: true }).click()
    await expect(page.locator('.save-status')).toHaveText('Saved on this device')
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const section = page.getByRole('region', { name: 'Storyteller connections' })
    await section.getByText('Connect an API or local server', { exact: true }).click()
    await section.getByLabel('Provider', { exact: true }).selectOption('lmstudio')
    await section
      .getByLabel('API base URL', { exact: true })
      .fill(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`)
    await expect(section.getByLabel('API key', { exact: true })).toHaveValue('')
    await section.getByRole('button', { name: 'Fetch models', exact: true }).click()
    await expect(section.getByRole('status')).toContainText('1 models found')
    await section.getByLabel('Available models', { exact: true }).selectOption('local-fixture')
    await section.getByLabel('API key', { exact: true }).fill('synthetic-local-key')
    await section
      .getByRole('checkbox', { name: 'Remember this key on this device', exact: true })
      .check()
    await section.getByRole('checkbox', { name: /I allow AI actions/ }).check()
    await section.getByRole('button', { name: 'Use this connection', exact: true }).click()
    expect(await page.evaluate(() => localStorage.getItem('storied-provider-key:lmstudio'))).toBe(
      'synthetic-local-key',
    )
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Play', exact: true })
      .click()
    await page.getByRole('button', { name: 'Story', exact: true }).click()
    await page
      .getByLabel('Your next move', { exact: true })
      .fill('A manually written passage stays local.')
    await page.getByRole('button', { name: 'Review passage', exact: true }).click()
    await page.getByRole('button', { name: 'Accept passage', exact: true }).click()
    await expect(page.locator('.save-status')).toHaveText('Saved on this device')
    expect(received).toHaveLength(1)
    await page.getByRole('button', { name: 'Do', exact: true }).click()
    await page.getByLabel('Your next move', { exact: true }).fill('I step aboard.')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByLabel('Story draft', { exact: true })).toHaveValue(
      'A local server answers from the ferry.',
    )
    expect(received).toEqual([
      { method: 'GET', url: '/v1/models', origin: appOrigin, key: undefined },
      {
        method: 'POST',
        url: '/v1/chat/completions',
        origin: appOrigin,
        key: 'Bearer synthetic-local-key',
      },
    ])
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Forget connection & key', exact: true }).click()
    expect(await page.evaluate(() => localStorage.getItem('storied-provider-key:lmstudio'))).toBe(
      null,
    )
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
