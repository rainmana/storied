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
  // Capture only model text in this disposable test context, never in production telemetry.
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker
    ;(window as any).__testModelOutputs = []
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options)
        if (String(url).includes('storyteller.worker'))
          this.addEventListener('message', (event) => {
            if (typeof event.data?.result === 'string')
              (window as any).__testModelOutputs.push(event.data.result.slice(0, 20000))
          })
      }
    }
  })
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
  await navigate(page, 'World')
  await page.getByRole('button', { name: /Mara Vale/ }).click()
  const originalDescription = await page
    .getByLabel('In-world description', { exact: true })
    .inputValue()
  await page.getByRole('button', { name: 'Explore In-world description', exact: true }).click()
  const authorDialog = page.getByRole('dialog', {
    name: 'Explore In-world description',
    exact: true,
  })
  await authorDialog
    .getByLabel('What would you like to explore?', { exact: true })
    .fill('Suggest one short sentence about a habit. Keep her existing role. Return one idea.')
  await authorDialog.getByRole('button', { name: 'Find possibilities' }).click()
  const authorAttemptErrors: string[] = []
  const authorResult = authorDialog.getByLabel('Edit idea 1', { exact: true })
  await expect(authorResult.or(authorDialog.getByRole('alert')).first()).toBeVisible({
    timeout: 120000,
  })
  // Small models can produce invalid structures. Exercise one explicit author-directed recovery;
  // never retry silently or discard the failed attempt from the evidence.
  if (await authorDialog.getByRole('alert').isVisible()) {
    authorAttemptErrors.push(await authorDialog.getByRole('alert').innerText())
    const returnedText = await page.evaluate(() => (window as any).__testModelOutputs.at(-1))
    writeFileSync(
      testInfo.outputPath('author-invalid-reply.json'),
      JSON.stringify({ error: authorAttemptErrors[0], returnedText }, null, 2),
    )
    await expect(page.getByLabel('In-world description', { exact: true })).toHaveValue(
      originalDescription,
    )
    await authorDialog
      .getByLabel('What would you like to explore?', { exact: true })
      .fill(
        'One idea only. Title: Habit. Text: one sentence about counting ships, under 100 characters.',
      )
    await authorDialog.getByRole('button', { name: 'Find possibilities' }).click()
    await expect(authorResult.or(authorDialog.getByRole('alert')).first()).toBeVisible({
      timeout: 120000,
    })
  }
  await expect(authorDialog.getByRole('alert')).toHaveCount(0, { timeout: 1000 })
  await expect(authorDialog.getByLabel('Edit idea 1', { exact: true })).toBeVisible({
    timeout: 120000,
  })
  const authorIdeas = await authorDialog
    .locator('.assistant-idea textarea')
    .evaluateAll((elements) => elements.map((e) => (e as HTMLTextAreaElement).value))
  expect(authorIdeas[0].length).toBeGreaterThan(10)
  expect(authorIdeas.join(' ')).not.toMatch(
    /extinguished the lantern deliberately|protect the people beneath/i,
  )
  const authorAccepted =
    'Mara keeps a spare notebook in her coat and writes down the names of passing ships.'
  await authorDialog.getByLabel('Edit idea 1', { exact: true }).fill(authorAccepted)
  await authorDialog
    .getByRole('region', { name: 'Idea 1', exact: true })
    .getByRole('button', { name: 'Replace field' })
    .click()
  await expect(page.getByLabel('In-world description', { exact: true })).toHaveValue(authorAccepted)
  console.info(
    'Real author suggestions generated, reviewed, and inserted with networking disabled.',
  )
  await navigate(page, 'Write')
  await page.getByLabel('Manuscript text', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Writing assistant', exact: true }).click()
  for (const name of ['Story continuity', 'Prose rules', 'Your voice'])
    await page
      .getByRole('group', { name: 'Specialist reviews' })
      .getByRole('checkbox', { name, exact: true })
      .uncheck()
  await page
    .getByLabel('Direction for this passage')
    .fill(
      'Write one short paragraph: Mara waits for a ferry. Under 40 words. Keep all events ordinary.',
    )
  await page.getByRole('button', { name: 'Find a draft', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Insert chosen draft' })).toBeEnabled({
    timeout: 120000,
  })
  const manuscriptDraft = await page.getByLabel('Edit manuscript suggestion').inputValue()
  expect(manuscriptDraft.length).toBeGreaterThan(20)
  await expect(page.getByLabel('Manuscript text', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'Insert chosen draft' }).click()
  await page.getByLabel('Writing action').selectOption('review')
  await page
    .getByRole('group', { name: 'Specialist reviews' })
    .getByRole('checkbox', { name: 'Story continuity', exact: true })
    .check()
  await page
    .getByRole('group', { name: 'Specialist reviews' })
    .getByRole('checkbox', { name: 'Prose rules', exact: true })
    .check()
  await page.getByRole('button', { name: 'Run specialist review' }).click()
  await expect(
    page
      .getByRole('button', { name: 'Show passage highlights' })
      .or(page.getByRole('button', { name: 'Resume saved step' })),
  ).toBeVisible({ timeout: 120000 })
  await expect(page.getByLabel('Manuscript text', { exact: true })).toHaveValue(manuscriptDraft)
  await page.getByRole('button', { name: 'Close writing assistant' }).click()
  console.info(
    'Real manuscript draft accepted offline; specialist review finished or preserved an explicit validation pause.',
  )
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await saved(page)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export project', exact: true }).click()
  const archive = testInfo.outputPath('offline-model-world.storyworld')
  await (await downloading).saveAs(archive)
  const exported = JSON.parse(readFileSync(archive, 'utf8'))
  expect(exported.adventures[0].turns[0].text).toBe(accepted)
  expect(exported.proposals.some((p: { status: string }) => p.status === 'accepted')).toBe(true)
  expect(exported.studio.runs[0].status).toBe('accepted')
  expect(exported.studio.runs[0].steps[0].role).toBe('manuscript-writer')
  expect(exported.studio.runs[1].steps[0].role).toBe('continuity-reviewer')
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
        authorIdeas,
        authorAttemptErrors,
        authorAccepted,
        manuscriptDraft,
        manuscriptReview: exported.studio.runs[1],
        offlineManuscript: true,
        offlineAuthoring: true,
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
