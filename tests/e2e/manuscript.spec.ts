import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createDemo } from '../../src/domain/seed'
import { uid } from '../../src/domain/schema'

const draft = 'Mara carried a brass compass. A tapestry of light fell across the pier.'
async function setup(page: Page, api = true) {
  const p = createDemo(),
    character = p.entities.find((e) => e.name === 'Mara Vale')!,
    scene = p.scenes[0]
  scene.text = ''
  scene.viewpointId = character.id
  scene.entityIds = [character.id]
  p.facts.push({
    id: uid(),
    subjectId: character.id,
    predicate: 'Compass material',
    object: 'Silver',
    status: 'Canon',
    visibility: 'public',
    knownTo: [],
    provenance: { kind: 'author', note: '' },
  })
  await page.goto('/')
  await page.getByLabel('Import project', { exact: true }).setInputFiles({
    name: 'manuscript.storyworld',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(p)),
  })
  await expect(page.getByRole('heading', { name: 'Welcome back to your world.' })).toBeVisible()
  if (api) {
    await nav(page, 'Settings')
    const section = page.getByRole('region', { name: 'Storyteller connections' })
    await section.getByText('Connect an API or local server', { exact: true }).click()
    await section.getByLabel('Provider', { exact: true }).selectOption('custom')
    await section
      .getByLabel('API base URL', { exact: true })
      .fill('https://manuscript.example.test/v1')
    await section.getByLabel('Model ID', { exact: true }).fill('studio-fixture')
    await section.getByLabel('API key', { exact: true }).fill('synthetic-studio-key')
    await section.getByRole('checkbox', { name: /I allow AI actions/ }).check()
    await section.getByRole('button', { name: 'Use this connection', exact: true }).click()
  }
  return p
}
async function nav(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name, exact: true }).click()
}
function nodeInput(body: any) {
  const prompt = body.messages[1].content as string
  const role = prompt.match(/STORIED MANUSCRIPT NODE: ([\w-]+)/)![1]
  const json = prompt
    .slice(prompt.indexOf('{"operation"'))
    .split('\nReturn only a JSON object matching this schema:')[0]
  return { role, input: JSON.parse(json), prompt }
}
async function installFixture(page: Page) {
  const requests: { role: string; input: any; prompt: string; body: any }[] = []
  await page.route('https://manuscript.example.test/v1/**', async (route) => {
    const body = route.request().postDataJSON(),
      parsed = nodeInput(body)
    requests.push({ ...parsed, body })
    const { role, input } = parsed
    let result: unknown = { findings: [] }
    if (role === 'voice-analyst')
      result = {
        observations: [
          {
            instruction: 'Use short sentences to end moments of waiting.',
            category: 'rhythm',
            evidence: [{ sampleId: input.sources[0].id, quote: 'I waited.' }],
          },
        ],
      }
    if (role === 'manuscript-writer') result = { text: draft }
    if (role === 'continuity-reviewer')
      result = {
        findings: [
          {
            quote: 'brass compass',
            occurrence: 0,
            explanation: 'The canonical compass is silver. REVIEWER_PRIVATE_OPINION',
            replacement: 'silver compass',
            sourceIds: [input.sources.find((s: any) => s.title.endsWith('Compass material')).id],
          },
        ],
      }
    if (role === 'prose-reviewer')
      result = {
        findings: [
          {
            quote: 'A tapestry of light',
            occurrence: 0,
            explanation: 'A stock image conflicts with the explicit prose rules.',
            replacement: 'Light',
            sourceIds: [],
          },
        ],
      }
    if (role === 'voice-reviewer')
      result = {
        findings: [
          {
            quote: 'A tapestry of light fell across the pier.',
            occurrence: 0,
            explanation: 'Consider a shorter closing sentence.',
            replacement: 'Light crossed the pier.',
            sourceIds: [input.sources.find((s: any) => s.kind === 'voice').id],
          },
        ],
      }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }),
    })
  })
  return requests
}
async function exportWorld(page: Page, filename: string) {
  await nav(page, 'Settings')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export project', exact: true }).click()
  const file = await download
  await file.saveAs(filename)
  return JSON.parse(readFileSync(filename, 'utf8'))
}
test('samples build an approved voice graph; independent specialists draft and review; insertion has a restorable revision', async ({
  page,
}, info) => {
  const requests = await installFixture(page)
  await setup(page)
  await nav(page, 'Your voice')
  await page.getByRole('button', { name: 'Create a voice profile', exact: true }).click()
  await page.getByLabel('New voice profile name').fill('Quiet fiction')
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  await page.getByLabel('Upload writing samples').setInputFiles({
    name: 'letter-about-gardening.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('The garden gate would not open. I waited. Then I went home.'),
  })
  expect(requests).toHaveLength(0)
  await page.getByRole('button', { name: 'Preview analysis request' }).click()
  await expect(page.getByText('Exact analysis input', { exact: true })).toBeVisible()
  expect(requests).toHaveLength(0)
  await page.getByRole('button', { name: 'Analyze samples', exact: true }).click()
  await expect(page.getByLabel('Proposed preference 1')).toBeVisible()
  await page
    .getByLabel('Proposed preference 1')
    .fill('Use short sentences to close a reflective paragraph.')
  await page.getByRole('button', { name: 'Save selected preferences', exact: true }).click()
  await page.getByRole('button', { name: 'Preview analysis request' }).click()
  await page.getByText('Explore the prose graph', { exact: true }).click()
  await expect(page.locator('.voice-graph')).toContainText('letter-about-gardening.txt')
  await page.screenshot({ path: 'docs/screenshots/voice-profile.png', animations: 'disabled' })
  await nav(page, 'Write')
  await page.getByRole('button', { name: 'Scene setup', exact: true }).click()
  await page.getByLabel('Scene voice profile').selectOption({ label: 'Quiet fiction' })
  await page.getByRole('button', { name: 'Back to writing', exact: true }).click()
  await page.getByRole('button', { name: 'Writing assistant', exact: true }).click()
  await page
    .getByLabel('Direction for this passage')
    .fill('Open with Mara waiting at the pier. Keep the compass in view.')
  await page.getByRole('button', { name: 'Find a draft', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Insert chosen draft', exact: true })).toBeEnabled()
  expect(requests.map((r) => r.role)).toEqual([
    'voice-analyst',
    'manuscript-writer',
    'continuity-reviewer',
    'prose-reviewer',
    'voice-reviewer',
  ])
  for (const r of requests) {
    expect(r.body.messages).toHaveLength(2)
    expect(r.body.messages[0].content).toContain('PROSE STYLE')
  }
  expect(requests[1].prompt).not.toContain('garden gate')
  expect(requests[3].prompt).not.toContain('REVIEWER_PRIVATE_OPINION')
  expect(requests[4].prompt).not.toContain('REVIEWER_PRIVATE_OPINION')
  await expect(page.getByLabel('Manuscript text', { exact: true })).toHaveValue('')
  await page.screenshot({
    path: 'docs/screenshots/manuscript-assistance.png',
    animations: 'disabled',
  })
  await page
    .getByLabel('Edit manuscript suggestion')
    .fill('Mara carried a silver compass. Light crossed the pier.')
  await page.getByRole('button', { name: 'Insert chosen draft', exact: true }).click()
  await page.getByRole('button', { name: 'Close writing assistant' }).click()
  await expect(page.getByLabel('Manuscript text', { exact: true })).toHaveValue(
    'Mara carried a silver compass. Light crossed the pier.',
  )
  const exported = await exportWorld(page, info.outputPath('voice-and-manuscript.storyworld'))
  expect(exported.studio.profiles[0].traits[0].status).toBe('approved')
  expect(exported.studio.samples[0].text).toContain('garden gate')
  expect(JSON.stringify(exported)).not.toContain('synthetic-studio-key')
  expect(exported.studio.runs.find((r: any) => r.kind === 'draft').steps).toHaveLength(4)
  expect(exported.studio.revisions[0].text).toBe('')
  await nav(page, 'Write')
  await page.getByRole('button', { name: 'Manuscript history' }).click()
  await page.getByText(/Before accepted AI draft ·/).click()
  await page.getByRole('button', { name: 'Restore this version' }).click()
  await expect(page.getByLabel('Manuscript text', { exact: true })).toHaveValue('')
})
test('source-linked canon highlights permit explicit correction, preserve old canon, and survive offline export and restore', async ({
  page,
  context,
}, info) => {
  await installFixture(page)
  await setup(page)
  await nav(page, 'Write')
  await page.getByLabel('Manuscript text', { exact: true }).fill(draft)
  await page.getByRole('button', { name: 'Writing assistant', exact: true }).click()
  await page.getByLabel('Writing action').selectOption('review')
  await page.getByRole('button', { name: 'Run specialist review' }).click()
  await expect(page.getByRole('button', { name: 'Show passage highlights' })).toBeVisible()
  await page.getByRole('button', { name: 'Show passage highlights' }).click()
  await page.getByRole('button', { name: 'Story continuity: brass compass', exact: true }).click()
  await page.getByRole('button', { name: 'Propose canon update' }).click()
  const dialog = page.getByRole('dialog', { name: 'Bring a detail into the world' })
  await dialog.getByLabel('Proposed canonical text').fill('Brass')
  await dialog
    .getByLabel('Reason for canon change')
    .fill('The author decided that Mara uses a brass compass.')
  await dialog.getByRole('button', { name: 'Preview canon change' }).click()
  await expect(dialog.getByRole('region', { name: 'Canon change preview' })).toContainText('Silver')
  const acknowledge = dialog.getByRole('checkbox', { name: /I reviewed these graph findings/ })
  if (await acknowledge.isVisible()) await acknowledge.check()
  await page.screenshot({
    path: 'docs/screenshots/manuscript-canon-review.png',
    animations: 'disabled',
  })
  await dialog.getByRole('button', { name: 'Approve canon change' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('banner').getByRole('status')).toHaveText('Saved on this device')
  await expect(page.getByText('Ready for offline use', { exact: true })).toBeVisible()
  await context.setOffline(true)
  await page.reload()
  const filename = info.outputPath('manuscript-canon.storyworld'),
    exported = await exportWorld(page, filename)
  expect(
    exported.facts.find((f: any) => f.predicate === 'Compass material' && f.status === 'Deprecated')
      .object,
  ).toBe('Silver')
  expect(
    exported.facts.find((f: any) => f.predicate === 'Compass material' && f.status === 'Canon')
      .object,
  ).toBe('Brass')
  expect(exported.studio.canonChanges).toHaveLength(1)
  expect(exported.studio.canonChanges[0].before).toContain('Silver')
  expect(exported.scenes[0].text).toBe(draft)
  await page.getByLabel('Import .storyworld project').setInputFiles(filename)
  await expect(
    page.getByRole('heading', { name: 'The Quiet Tide (imported copy)', exact: true }),
  ).toBeVisible()
  await nav(page, 'Write')
  await expect(page.getByLabel('Manuscript text', { exact: true })).toHaveValue(draft)
})
test('mobile local prose checks need no model; exact highlights can be revised and scene metadata remains editable', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, false)
  await nav(page, 'Write')
  await page.getByLabel('Manuscript text', { exact: true }).fill('A tapestry of light. She waited.')
  await page.getByRole('button', { name: 'Scene setup' }).click()
  await page.getByLabel('Chapter title').fill('A new beginning')
  await page.getByLabel('What needs to happen in this scene?').fill('She decides whether to wait.')
  await page.getByRole('button', { name: 'Back to writing' }).click()
  await page.getByRole('button', { name: 'Writing assistant', exact: true }).click()
  await page.getByRole('button', { name: 'Check prose rules locally' }).click()
  await page.getByRole('button', { name: 'Prose rules: tapestry', exact: true }).click()
  await page.getByLabel('Replacement passage').fill('strip')
  await page.getByRole('button', { name: 'Apply passage edit' }).click()
  await expect(page.getByLabel('Manuscript text', { exact: true })).toHaveValue(
    'A strip of light. She waited.',
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'docs/screenshots/manuscript-mobile.png', animations: 'disabled' })
  const exported = await exportWorld(page, info.outputPath('local-manuscript.storyworld'))
  expect(exported.studio.runs[0].steps).toEqual([])
  expect(exported.studio.revisions[0].text).toContain('tapestry')
  expect(exported.scenes[0].chapter).toBe('A new beginning')
})
test('invalid evidence pauses only the failed specialist and stale text cannot receive its results', async ({
  page,
}) => {
  let calls = 0
  await page.route('https://manuscript.example.test/v1/**', async (route) => {
    calls++
    const { role } = nodeInput(route.request().postDataJSON())
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(
                role === 'manuscript-writer'
                  ? { text: draft }
                  : {
                      findings: [
                        {
                          quote: 'not in the manuscript',
                          occurrence: 0,
                          explanation: 'Forged finding',
                          replacement: '',
                          sourceIds: ['not-a-source'],
                        },
                      ],
                    },
              ),
            },
          },
        ],
      }),
    })
  })
  await setup(page)
  await nav(page, 'Write')
  await page.getByRole('button', { name: 'Writing assistant', exact: true }).click()
  await page.getByLabel('Direction for this passage').fill('Write an opening with the compass.')
  await page.getByRole('button', { name: 'Find a draft' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'outside this passage' })).toBeVisible()
  expect(calls).toBe(2)
  await expect(page.getByRole('button', { name: 'Insert chosen draft' })).toBeDisabled()
  await expect(page.getByLabel('Manuscript text', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'Resume saved step' }).click()
  await expect(page.getByRole('button', { name: 'Resume saved step' })).toBeVisible()
  expect(calls).toBe(3)
  await page
    .getByLabel('Manuscript text', { exact: true })
    .fill('A fresh direction written by the author.')
  await expect(
    page.getByText(
      'Sources changed. This pass is preserved as history; its edits and highlights cannot be applied.',
    ),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resume saved step' })).toHaveCount(0)
})
test('stopping and reloading preserve the request without replay; resumption is explicit', async ({
  page,
}, info) => {
  let calls = 0,
    release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('https://manuscript.example.test/v1/**', async (route) => {
    calls++
    if (calls === 1) await held
    await route
      .fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ text: draft }) } }],
        }),
      })
      .catch(() => {})
  })
  await setup(page)
  await nav(page, 'Write')
  await page.getByRole('button', { name: 'Writing assistant', exact: true }).click()
  for (const name of ['Story continuity', 'Prose rules', 'Your voice'])
    await page
      .getByRole('group', { name: 'Specialist reviews' })
      .getByRole('checkbox', { name, exact: true })
      .uncheck()
  await page.getByLabel('Direction for this passage').fill('Mara waits at the pier.')
  await page.getByRole('button', { name: 'Find a draft' }).click()
  await expect.poll(() => calls).toBe(1)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Resume saved step' })).toBeVisible()
  release()
  await expect(page.getByRole('banner').getByRole('status')).toHaveText('Saved on this device')
  await page.reload()
  await nav(page, 'Write')
  await page.getByRole('button', { name: 'Writing assistant', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Resume saved step' })).toBeVisible()
  expect(calls).toBe(1)
  await expect(page.getByLabel('Manuscript text', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'Resume saved step' }).click()
  await expect(page.getByRole('button', { name: 'Insert chosen draft' })).toBeEnabled()
  expect(calls).toBe(2)
  const exported = await exportWorld(page, info.outputPath('resumed-manuscript.storyworld'))
  expect(exported.studio.runs[0].steps).toHaveLength(2)
  expect(exported.studio.runs[0].steps[0].status).toBe('failed')
  expect(
    exported.studio.runs[0].boundaries.some((b: any) => b.text.includes('Explicitly resumed')),
  ).toBe(true)
})
test('a late model response is retained as evidence but cannot overwrite an author edit', async ({
  page,
}, info) => {
  let requested = false,
    release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('https://manuscript.example.test/v1/**', async (route) => {
    requested = true
    await held
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ text: draft }) } }],
      }),
    })
  })
  await setup(page)
  await nav(page, 'Write')
  await page.getByRole('button', { name: 'Writing assistant', exact: true }).click()
  await page.getByLabel('Direction for this passage').fill('Mara waits at the pier.')
  await page.getByRole('button', { name: 'Find a draft' }).click()
  await expect.poll(() => requested).toBe(true)
  await page
    .getByLabel('Manuscript text', { exact: true })
    .fill('The author has a different opening.')
  release()
  await expect(
    page.getByRole('alert').filter({ hasText: 'changed while this specialist was working' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Insert chosen draft' })).toHaveCount(0)
  const exported = await exportWorld(page, info.outputPath('late-manuscript.storyworld'))
  expect(exported.scenes[0].text).toBe('The author has a different opening.')
  expect(exported.studio.runs[0].steps[0].raw).toContain(draft)
  expect(exported.studio.runs[0].status).toBe('repair')
  expect(exported.studio.runs[0].candidate).toBe('')
})
