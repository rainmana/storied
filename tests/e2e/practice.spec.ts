import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createDemo } from '../../src/domain/seed'
import { addTurn } from '../../src/domain/story'

async function nav(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name, exact: true }).click()
}
async function setup(page: Page) {
  const p = createDemo()
  p.scenes[0].text = 'Words already on the page.'
  await page.goto('/')
  await page.getByLabel('Import project', { exact: true }).setInputFiles({
    name: 'practice.storyworld',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(p)),
  })
  await expect(page.getByRole('heading', { name: 'Welcome back to your world.' })).toBeVisible()
  return p
}
async function exported(page: Page, path: string) {
  await nav(page, 'Settings')
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export project', exact: true }).click()
  await (await event).saveAs(path)
  return JSON.parse(readFileSync(path, 'utf8'))
}
test('a real session starts at zero, pauses, saves time and separate history, and restores paused', async ({
  page,
}, info) => {
  await setup(page)
  await page.clock.install()
  await nav(page, 'Write')
  await page.getByRole('button', { name: 'Start a session', exact: true }).click()
  await page.getByLabel('Session intention').fill('A paragraph at the pier')
  await page.getByLabel('Words', { exact: true }).fill('3')
  await page.getByRole('button', { name: 'Begin session', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Practice session' })
  await expect(panel).toContainText('+0 author words')
  await page
    .getByLabel('Manuscript text', { exact: true })
    .fill('Words already on the page. Three more words.')
  await expect(panel).toContainText('+3 author words')
  await expect(panel.getByRole('progressbar')).toHaveAttribute('value', '100')
  await page.clock.runFor(6000)
  await expect(panel.getByLabel('Session elapsed time')).not.toHaveText('0:00')
  await page.getByRole('button', { name: 'Pause session', exact: true }).click()
  await page
    .getByLabel('Manuscript text', { exact: true })
    .fill('Changes while paused do not count.')
  await expect(panel).toContainText('+3 author words')
  await page.getByRole('button', { name: 'Resume session', exact: true }).click()
  await page.clock.runFor(2000)
  await expect(page.getByRole('banner').getByRole('status')).toHaveText('Saved on this device')
  await page.reload()
  await nav(page, 'Write')
  await expect(page.getByRole('button', { name: 'Resume session', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Practice session' })).toContainText(
    '+3 author words',
  )
  await nav(page, 'Progress')
  await expect(page.getByRole('heading', { name: 'Time with your story.' })).toBeVisible()
  await page.screenshot({ path: 'docs/screenshots/practice-progress.png', animations: 'disabled' })
  const data = await exported(page, info.outputPath('practice.storyworld'))
  expect(data.schemaVersion).toBe(5)
  expect(data.activity.sessions[0].status).toBe('paused')
  expect(data.activity.sessions[0].days[0].author.added).toBe(3)
  expect(data.activity.sessions[0].days[0].milliseconds).toBeGreaterThanOrEqual(5000)
  expect(JSON.stringify(data.activity)).not.toContain('Words already')
})
test('quiet time pauses, deliberate thinking counts, and clearing history preserves text', async ({
  page,
}) => {
  await setup(page)
  await page.clock.install()
  await nav(page, 'Write')
  await page.getByRole('button', { name: 'Start a session', exact: true }).click()
  await page.getByLabel('Goal type').selectOption('minutes')
  await page.getByRole('button', { name: 'Begin session', exact: true }).click()
  await page.clock.runFor(125000)
  await expect(page.getByRole('button', { name: 'Resume session', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Practice session' })).toContainText(
    'two quiet minutes',
  )
  await page.getByLabel('Count quiet thinking time').check()
  await page.getByRole('button', { name: 'Resume session', exact: true }).click()
  await page.clock.runFor(125000)
  await expect(page.getByRole('button', { name: 'Pause session', exact: true })).toBeVisible()
  await nav(page, 'Progress')
  await page.getByLabel('Enable local practice tracking').uncheck()
  await expect(page.getByRole('button', { name: 'Resume session', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Finish session', exact: true })).toBeEnabled()
  await page.getByLabel('Enable local practice tracking').check()
  await page.getByRole('button', { name: 'Resume session', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause session', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear practice history', exact: true }).click()
  await page.getByRole('button', { name: 'Clear session totals', exact: true }).click()
  await expect(
    page.getByText('Your first session begins whenever you are ready.', { exact: true }),
  ).toBeVisible()
  await nav(page, 'Write')
  await expect(page.getByLabel('Manuscript text', { exact: true })).toHaveValue(
    'Words already on the page.',
  )
})
test('interviews keep practice outside canon and bring selected dialogue to a manuscript on mobile', async ({
  page,
}, info) => {
  await setup(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await nav(page, 'Play')
  await page.getByRole('button', { name: 'New adventure', exact: true }).click()
  await page.getByLabel('How would you like to begin?').selectOption('interview')
  await page.getByLabel('Imagined setting (optional)').selectOption('')
  await page
    .getByLabel('What would you like to explore?')
    .fill('Ask Mara why she keeps the last ferry ticket.')
  await page.getByRole('button', { name: 'Begin interview', exact: true }).click()
  await expect(page.getByText('YOU ARE TALKING TO', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Story', exact: true }).click()
  const line = '"I kept the last ticket," Mara said. "Nobody ever asked for it."'
  await page.getByLabel('Your next move').fill(line)
  await page.getByRole('button', { name: 'Review passage', exact: true }).click()
  await page.getByRole('button', { name: 'Accept passage', exact: true }).click()
  await page.getByRole('button', { name: 'Bring to manuscript', exact: true }).click()
  await page.getByRole('button', { name: 'Use whole exchange', exact: true }).click()
  await page.getByLabel('Speaker for excerpt 1').fill('Mara')
  await page.getByLabel('New scene title').fill('The last ticket')
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: 'docs/screenshots/conversation-mobile.png',
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Add excerpts to manuscript', exact: true }).click()
  await expect(page.getByLabel('Manuscript text', { exact: true })).toHaveValue(line)
  const data = await exported(page, info.outputPath('interview-exact.storyworld'))
  const a = data.adventures.at(-1)
  expect(a.scenario.practiceMode).toBe('interview')
  expect(data.memories.filter((m: any) => m.adventureId === a.id)).toEqual([])
  expect(data.proposals.filter((v: any) => v.adventureId === a.id)).toEqual([])
  expect(data.studio.clips[0].excerpts[0].text).toBe(line)
  expect(data.scenes.at(-1).adventureId).toBeUndefined()
})
test('selected conversation material reaches independent adaptation roles and waits for author acceptance', async ({
  page,
}, info) => {
  const p = createDemo(),
    a = p.adventures[0]
  a.scenario.practiceMode = 'interview'
  addTurn(a, {
    input: 'Why keep it?',
    text: 'I kept the last ticket. Nobody ever asked for it.',
    intent: 'Say',
    context: '',
    model: 'fixture',
  })
  await page.goto('/')
  await page.getByLabel('Import project', { exact: true }).setInputFiles({
    name: 'conversation.storyworld',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(p)),
  })
  await expect(page.getByRole('heading', { name: 'Welcome back to your world.' })).toBeVisible()
  const requests: { role: string; input: any; system: string }[] = []
  await page.route('https://practice.example.test/v1/**', async (route) => {
    const body = route.request().postDataJSON(),
      prompt = body.messages[1].content
    const role = prompt.match(/STORIED MANUSCRIPT NODE: ([\w-]+)/)[1]
    const input = JSON.parse(
      prompt
        .slice(prompt.indexOf('{"operation"'))
        .split('\nReturn only a JSON object matching this schema:')[0],
    )
    requests.push({ role, input, system: body.messages[0].content })
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(
                role === 'manuscript-writer'
                  ? { text: 'Mara pressed the ticket flat. "Nobody ever asked for it."' }
                  : { findings: [] },
              ),
            },
          },
        ],
      }),
    })
  })
  await nav(page, 'Settings')
  const connection = page.getByRole('region', { name: 'Storyteller connections' })
  await connection.getByText('Connect an API or local server', { exact: true }).click()
  await connection.getByLabel('Provider', { exact: true }).selectOption('custom')
  await connection
    .getByLabel('API base URL', { exact: true })
    .fill('https://practice.example.test/v1')
  await connection.getByLabel('Model ID', { exact: true }).fill('practice-fixture')
  await connection.getByRole('checkbox', { name: /I allow AI actions/ }).check()
  await connection.getByRole('button', { name: 'Use this connection', exact: true }).click()
  await nav(page, 'Play')
  await page.getByRole('button', { name: 'Bring to manuscript', exact: true }).click()
  const passage = page.getByLabel('Accepted passage', { exact: true })
  await passage.evaluate((e: HTMLTextAreaElement) => {
    e.focus()
    e.setSelectionRange(0, 24)
  })
  await expect
    .poll(() => passage.evaluate((e: HTMLTextAreaElement) => [e.selectionStart, e.selectionEnd]))
    .toEqual([0, 24])
  await page.getByRole('button', { name: 'Keep selected text', exact: true }).last().click()
  await page.getByLabel('How to use these excerpts').selectOption('adapt')
  await page.getByLabel('New scene title').fill('Ticket scene')
  await page.getByRole('button', { name: 'Prepare scene adaptation', exact: true }).click()
  await expect(page.getByLabel('Conversation to adapt')).toBeVisible()
  expect(requests).toHaveLength(0)
  await page
    .getByLabel('Direction for this passage')
    .fill('Use the ticket line in a scene at the pier. Let Mara flatten it with her palm.')
  await page.getByRole('button', { name: 'Find a draft', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Insert chosen draft', exact: true })).toBeEnabled()
  expect(requests.map((r) => r.role)).toEqual([
    'manuscript-writer',
    'continuity-reviewer',
    'prose-reviewer',
  ])
  for (const request of requests) {
    expect(request.system).toContain('PROSE STYLE')
    expect(request.input.scene.conversationSource.mode).toBe('interview')
    expect(request.input.scene.conversationSource.excerpts[0].text).toBe('I kept the last ticket. ')
    expect(request.input.scene.conversationSource.excerpts[0].speaker).toBe('Mara Vale')
  }
  await expect(page.getByLabel('Manuscript text', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'Insert chosen draft', exact: true }).click()
  await expect(page.getByLabel('Manuscript text', { exact: true })).toHaveValue(
    'Mara pressed the ticket flat. "Nobody ever asked for it."',
  )
  const data = await exported(page, info.outputPath('adapted-conversation.storyworld'))
  expect(data.studio.runs[0].clipId).toBe(data.studio.clips[0].id)
  expect(data.studio.clips[0].excerpts[0].text).toBe('I kept the last ticket. ')
  expect(data.facts).toEqual(p.facts)
})
