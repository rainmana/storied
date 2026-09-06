import { test, expect, type Page } from '@playwright/test'

async function setup(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore The Quiet Tide', exact: true }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const section = page.getByRole('region', { name: 'Storyteller connections' })
  await section.getByText('Connect an API or local server', { exact: true }).click()
  await section.getByLabel('Provider', { exact: true }).selectOption('custom')
  await section.getByLabel('API base URL', { exact: true }).fill('https://author.example.test/v1')
  await section.getByLabel('Model ID', { exact: true }).fill('author-fixture')
  await section.getByLabel('API key', { exact: true }).fill('synthetic-author-test-key')
  await section.getByRole('checkbox', { name: /I allow AI actions/ }).check()
  await section.getByRole('button', { name: 'Use this connection', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'World', exact: true }).click()
}
const fixture = (
  title = 'A small duty',
  text = 'She leaves an empty chair beside the door for a passenger who never arrives.',
) =>
  JSON.stringify({
    ideas: [
      { title, text },
      { title: 'An old promise', text: 'She keeps a list of names beneath the ferry bench.' },
    ],
  })

test('field brainstorming uses world context, refines an editable idea, inserts and undoes only on request', async ({
  page,
}) => {
  const requests: any[] = []
  await page.route('https://author.example.test/v1/**', async (route) => {
    const body = route.request().postDataJSON()
    requests.push(body)
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: fixture() } }] }),
    })
  })
  await setup(page)
  await page.getByRole('button', { name: /Mara Vale/ }).click()
  const description = page.getByLabel('In-world description', { exact: true })
  const before = await description.inputValue()
  await page.getByRole('button', { name: 'Explore In-world description', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Explore In-world description', exact: true })
  expect(requests).toHaveLength(0)
  await dialog.getByRole('button', { name: 'Find possibilities', exact: true }).click()
  await expect(dialog.getByLabel('Edit idea 1', { exact: true })).toBeVisible()
  expect(requests).toHaveLength(1)
  expect(requests[0].messages[0].content).toContain('PROSE STYLE')
  expect(requests[0].messages[1].content).toContain('The Quiet Tide')
  expect(requests[0].messages[1].content).toContain('canon_fact')
  expect(requests[0].messages[1].content).not.toContain('extinguished the lantern deliberately')
  await expect(description).toHaveValue(before)
  await dialog
    .getByRole('region', { name: 'Idea 1', exact: true })
    .getByRole('button', { name: 'Refine this idea' })
    .click()
  await dialog
    .getByLabel('What would you like to explore?', { exact: true })
    .fill('Keep the chair. Give her a practical reason.')
  await dialog.getByRole('button', { name: 'Explore further' }).click()
  await expect(dialog.getByRole('button', { name: 'Explore further' })).toBeEnabled()
  expect(requests).toHaveLength(2)
  expect(requests[1].messages[1].content).toContain('Keep the chair. Give her a practical reason.')
  expect(requests[1].messages[1].content).toContain('developing')
  const edited = 'She keeps the chair for her sister, who repairs the nets after dusk.'
  await dialog.getByLabel('Edit idea 1', { exact: true }).fill(edited)
  await page.screenshot({ path: 'docs/screenshots/author-assistance.png', animations: 'disabled' })
  await dialog
    .getByRole('region', { name: 'Idea 1', exact: true })
    .getByRole('button', { name: 'Replace field' })
    .click()
  await expect(description).toHaveValue(edited)
  await page
    .getByRole('button', { name: 'Undo suggestion for In-world description', exact: true })
    .click()
  await expect(description).toHaveValue(before)
  expect(requests).toHaveLength(2)
  // A private context is explicit; toggling it also clears prior results and history.
  await page.getByRole('button', { name: 'Explore In-world description', exact: true }).click()
  await dialog.getByRole('checkbox', { name: /Include private world/ }).check()
  await dialog.getByRole('button', { name: 'Find possibilities' }).click()
  await expect(dialog.getByLabel('Edit idea 1', { exact: true })).toBeVisible()
  expect(requests[2].messages[1].content).toContain('extinguished the lantern deliberately')
  await dialog.getByRole('checkbox', { name: /Include private world/ }).uncheck()
  await expect(dialog.getByLabel('Edit idea 1', { exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close dialog' }).click()
  await expect(description).toHaveValue(before)
})

test('new belief systems start with human direction, use the chosen API, and support blank attributes on mobile', async ({
  page,
}) => {
  let count = 0
  await page.route('https://author.example.test/v1/**', async (route) => {
    count++
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: fixture(
                'A custom',
                'At low tide, each household returns a borrowed object.',
              ),
            },
          },
        ],
      }),
    })
  })
  await setup(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'New world element', exact: true }).click()
  const creation = page.getByRole('dialog', { name: 'Make something new' })
  await creation.getByLabel('What are you making?', { exact: true }).selectOption('Religion')
  await creation.getByLabel('Name', { exact: true }).fill('The Returning Tide')
  await creation.getByRole('button', { name: 'Explore In a few words', exact: true }).click()
  let assistant = page.getByRole('dialog', { name: 'Explore In a few words', exact: true })
  await expect(assistant.getByRole('button', { name: 'Find possibilities' })).toBeDisabled()
  expect(count).toBe(0)
  await assistant
    .getByLabel('What would you like to explore?', { exact: true })
    .fill('A belief system built around returning what you borrow from the sea.')
  await assistant.getByRole('button', { name: 'Find possibilities' }).click()
  await expect(assistant.getByLabel('Edit idea 1', { exact: true })).toBeVisible()
  await assistant
    .getByRole('region', { name: 'Idea 1', exact: true })
    .getByRole('button', { name: 'Use in field' })
    .click()
  await expect(creation.getByLabel('In a few words', { exact: true })).toHaveValue(
    'At low tide, each household returns a borrowed object.',
  )
  await creation.getByRole('button', { name: 'Add to world' }).click()
  await page.getByRole('button', { name: 'Explore Beliefs', exact: true }).click()
  assistant = page.getByRole('dialog', { name: 'Explore Beliefs', exact: true })
  await assistant
    .getByLabel('What would you like to explore?', { exact: true })
    .fill('One daily obligation. Keep it under 100 characters.')
  await assistant.getByRole('button', { name: 'Find possibilities' }).click()
  await expect(assistant.getByLabel('Edit idea 1', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: 'docs/screenshots/author-assistance-mobile.png',
    animations: 'disabled',
  })
  await assistant
    .getByRole('region', { name: 'Idea 1', exact: true })
    .getByRole('button', { name: 'Use in field' })
    .click()
  await expect(page.getByLabel('Beliefs', { exact: true })).toHaveValue(
    'At low tide, each household returns a borrowed object.',
  )
  await expect(page.locator('.save-status')).toHaveText('Saved on this device')
  await page.reload()
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'World', exact: true }).click()
  await page.getByRole('button', { name: /The Returning Tide/ }).click()
  await expect(page.getByLabel('Beliefs', { exact: true })).toHaveValue(
    'At low tide, each household returns a borrowed object.',
  )
  expect(count).toBe(2)
})

test('malformed replies and stopped requests preserve the field and never retry automatically', async ({
  page,
}) => {
  let count = 0,
    release: (() => void) | undefined
  await page.route('https://author.example.test/v1/**', async (route) => {
    count++
    if (count === 2)
      await new Promise<void>((resolve) => {
        release = resolve
      })
    await route
      .fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ message: { content: count === 1 ? 'This is not JSON' : fixture() } }],
        }),
      })
      .catch(() => {})
  })
  await setup(page)
  await page.getByRole('button', { name: /Mara Vale/ }).click()
  const field = page.getByLabel('In-world description', { exact: true }),
    before = await field.inputValue()
  await page.getByRole('button', { name: 'Explore In-world description', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Explore In-world description', exact: true })
  await dialog.getByRole('button', { name: 'Find possibilities' }).click()
  await expect(dialog.getByRole('alert')).toContainText('did not return usable suggestions')
  expect(count).toBe(1)
  await dialog.getByRole('button', { name: 'Find possibilities' }).click()
  await expect.poll(() => count).toBe(2)
  await dialog.getByRole('button', { name: 'Stop', exact: true }).click()
  release?.()
  await expect(dialog.getByRole('alert')).toHaveText('Stopped. Your field is unchanged.')
  await expect(dialog.getByLabel('Edit idea 1', { exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close dialog' }).click()
  await expect(field).toHaveValue(before)
  expect(count).toBe(2)
})
