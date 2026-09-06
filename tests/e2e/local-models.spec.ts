import { test, expect, type Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

const navigate = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name, exact: true })
    .click()
const saved = (page: Page) =>
  expect(page.getByRole('banner').getByRole('status')).toHaveText('Saved on this device')

// Explicit opt-in: downloads ~400 MB + 23 MB and requires a real WebGPU adapter.
// No stubbed model responses. Keep this out of ordinary CI.
test('real local models: cached offline generation, retry, extraction, semantic search, and restore', async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    process.env.LIVE_MODELS !== '1',
    'Set LIVE_MODELS=1 to download and exercise local model weights.',
  )
  test.setTimeout(600000)
  const appOrigin = new URL(testInfo.project.use.baseURL!).origin
  const external: { url: string; method: string; body: string | null }[] = []
  const errors: string[] = []
  context.on('request', (r) => {
    if (r.url().startsWith('https://') && new URL(r.url()).origin !== appOrigin)
      external.push({ url: r.url(), method: r.method(), body: r.postData() })
  })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore The Quiet Tide', exact: true }).click()
  await saved(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByText('WebGPU available', { exact: true })).toBeVisible()
  const compact = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Qwen 2.5 · 0.5B', exact: true }) })
  await compact.getByRole('button', { name: 'Download & load', exact: true }).click()
  await expect(compact.getByText('● Loaded on this device', { exact: true })).toBeVisible({
    timeout: 180000,
  })
  await page.getByRole('button', { name: 'Download search model', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Build search index', exact: true })).toBeVisible({
    timeout: 120000,
  })
  await expect(page.getByText('Ready for offline use', { exact: true })).toBeVisible()
  await saved(page)
  const downloadedRequests = external.length
  console.info(
    'Local model assets cached. Disabling browser networking before reload and inference.',
  )

  // Disable the browser network before reloading either runtime or performing inference.
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Welcome back to your world.' })).toBeVisible()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await compact.getByRole('button', { name: 'Load from device', exact: true }).click()
  await expect(compact.getByText('● Loaded on this device', { exact: true })).toBeVisible({
    timeout: 120000,
  })
  await page.getByRole('button', { name: 'Load search model', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Build search index', exact: true })).toBeVisible({
    timeout: 60000,
  })
  await navigate(page, 'Play')
  await page.getByRole('button', { name: 'Context', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toContainText('extinguished the lantern deliberately')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page
    .getByLabel('Your next move')
    .fill('I ask Nera to give me the blue cord, and step onto her ferry.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  const draft = page.getByLabel('Story draft', { exact: true })
  await expect(draft).toBeVisible({ timeout: 120000 })
  console.info('Offline generation completed from the reloaded model cache.')
  const first = await draft.inputValue()
  expect(first.length).toBeGreaterThan(40)
  expect(first).not.toMatch(/extinguished the lantern deliberately|protect the people beneath/i)
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Accept passage', exact: true })).toBeEnabled({
    timeout: 120000,
  })
  const retry = await draft.inputValue()
  expect(retry.length).toBeGreaterThan(40)
  expect(retry).not.toBe(first)

  // The human edits the stochastic draft into an explicit durable event before acceptance.
  const accepted =
    'Nera Moss gives Mara Vale the blue cord. Mara ties the blue cord around her wrist. Nera and Mara depart Bellwether aboard the ferry.'
  await draft.fill(accepted)
  await page.getByRole('button', { name: 'Accept passage', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'suggested world changes are ready' }),
  ).toBeVisible({ timeout: 120000 })
  console.info('Offline retry and constrained extraction completed; reviewing a real proposal.')
  await page.getByRole('button', { name: 'Review & commit to world', exact: true }).click()
  const proposal = page.locator('.proposal-card').first()
  const extracted = await page.locator('.proposal-card').allTextContents()
  await expect(proposal.getByText('pending', { exact: true })).toBeVisible()
  // Review/edit one genuine model proposal, then explicitly promote it.
  await proposal.getByLabel('Kind of change').selectOption('event')
  await proposal.getByLabel('What happened?', { exact: true }).fill('Mara receives the blue cord')
  await proposal.getByRole('button', { name: 'Accept into canon', exact: true }).click()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await navigate(page, 'Timeline')
  await expect(
    page.getByRole('heading', { name: 'Mara receives the blue cord', exact: true }),
  ).toBeVisible()
  await navigate(page, 'Search ⌘ K')
  await page.getByRole('button', { name: 'Meaning', exact: true }).click()
  await page
    .getByLabel('Search your whole world')
    .fill('a woman carrying passengers across the sea')
  await page.getByLabel('Search type').selectOption('Character')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Nera Moss', exact: true })).toBeVisible({
    timeout: 60000,
  })
  await page.getByLabel('Search type').selectOption('Memory')
  await page.getByLabel('Search your whole world').fill('receiving a cord and sailing away')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.locator('.search-result')).toHaveCount(1)
  await expect(page.locator('.search-result')).toContainText('blue cord')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await saved(page)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export project', exact: true }).click()
  const archive = testInfo.outputPath('offline-model-world.storyworld')
  await (await downloading).saveAs(archive)
  const exported = JSON.parse(readFileSync(archive, 'utf8'))
  expect(exported.adventures[0].turns[0].text).toBe(accepted)
  expect(exported.proposals.some((p: { status: string }) => p.status === 'accepted')).toBe(true)
  await page.getByRole('button', { name: 'Delete local project', exact: true }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('The Quiet Tide')
  await page.getByRole('button', { name: 'Delete project', exact: true }).click()
  await page.getByLabel('Import project', { exact: true }).setInputFiles(archive)
  await navigate(page, 'Play')
  await expect(page.getByRole('article').getByText(accepted, { exact: true })).toBeVisible()
  await saved(page)
  expect(external.length).toBe(downloadedRequests)
  expect(external.every((r) => r.method === 'GET' && r.body === null)).toBe(true)
  expect(errors).toEqual([])
  writeFileSync(
    testInfo.outputPath('live-model-evidence.json'),
    JSON.stringify(
      {
        browser: testInfo.project.use.channel || 'chromium',
        first,
        retry,
        accepted,
        extracted,
        offlineInference: true,
        offlineSemanticSearch: true,
        offlineRestore: true,
        modelAssetRequests: downloadedRequests,
        requestsDuringOfflineWork: external.length - downloadedRequests,
        pageErrors: errors,
      },
      null,
      2,
    ),
  )
})
