import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const navigate = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name, exact: true })
    .click()
const saved = (page: Page) =>
  expect(page.getByRole('banner').getByRole('status')).toHaveText('Saved on this device')
async function demo(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore The Quiet Tide', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back to your world.' })).toBeVisible()
}
async function createEntity(page: Page, name: string, type: string) {
  await navigate(page, 'World')
  await page.getByRole('button', { name: 'New world element' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('What are you making?').selectOption(type)
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  await dialog
    .getByLabel('In a few words', { exact: true })
    .fill(`A ${type.toLowerCase()} at the beginning of a story.`)
  await dialog.getByRole('button', { name: 'Add to world' }).click()
  await saved(page)
}
test('the vertical slice: create, connect, keep a secret, author, branch, commit, export, delete, restore offline', async ({
  page,
  context,
}, testInfo) => {
  const appOrigin = new URL(testInfo.project.use.baseURL!).origin
  const remote: string[] = [],
    errors: string[] = []
  page.on('request', (r) => {
    if (
      !r.url().startsWith(appOrigin + '/') &&
      !r.url().startsWith('blob:') &&
      !r.url().startsWith('data:')
    )
      remote.push(r.url())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Create a world People, places' }).click()
  await page.getByLabel('World name').fill('A Test World')
  await page.getByRole('button', { name: 'Create world', exact: true }).click()
  await createEntity(page, 'Mira', 'Character')
  await createEntity(page, 'Salt Harbor', 'Location')
  await navigate(page, 'World')
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: 'Mira', exact: true }) })
    .click()
  await page.getByRole('button', { name: 'Connect to someone or something' }).click()
  await page.getByRole('dialog').getByLabel('Connected to').selectOption({ label: 'Salt Harbor' })
  await page.getByRole('dialog').getByLabel('Relationship', { exact: true }).fill('lives in')
  await page.getByRole('dialog').getByLabel('Who can know this?').selectOption('public')
  await page.getByRole('button', { name: 'Save detail' }).click()
  await page.getByRole('button', { name: 'Add a fact or a secret' }).click()
  await page.getByLabel('About', { exact: true }).fill('Unknown royal secret')
  await page.getByLabel('The fact', { exact: true }).fill('The king is secretly dead.')
  await page.getByRole('button', { name: 'Save detail' }).click()
  await saved(page)
  await navigate(page, 'Play')
  await page.getByRole('button', { name: 'Create a scenario', exact: true }).click()
  await page.getByLabel('Adventure title').fill('At the harbor')
  await page.getByLabel('The opening situation').fill('A ship arrives in the quiet harbor.')
  await page.getByRole('button', { name: 'Begin adventure' }).click()
  await page.getByRole('button', { name: 'Context', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toContainText('The king is secretly dead')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Story', exact: true }).click()
  await page.getByLabel('Your next move').fill('Mira finds a brass key beside the mooring post.')
  await page.getByRole('button', { name: 'Review passage', exact: true }).click()
  await page.getByRole('button', { name: 'Accept passage', exact: true }).click()
  await page.getByRole('button', { name: 'Propose change', exact: true }).click()
  await page.getByLabel('What happened?', { exact: true }).fill('Mira finds the brass key')
  await page.getByRole('button', { name: 'Accept into canon' }).click()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Undo story turn' }).click()
  await expect(page.getByRole('button', { name: 'Propose change', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Redo story turn' }).click()
  await expect(
    page
      .getByRole('article')
      .getByText('Mira finds a brass key beside the mooring post.', { exact: true }),
  ).toBeVisible()
  await navigate(page, 'Timeline')
  await expect(page.getByRole('heading', { name: 'Mira finds the brass key' })).toBeVisible()
  await saved(page)
  await expect(page.getByText('Ready for offline use', { exact: true })).toBeVisible()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Welcome back to your world.' })).toBeVisible()
  await navigate(page, 'Play')
  await expect(
    page
      .getByRole('article')
      .getByText('Mira finds a brass key beside the mooring post.', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export project', exact: true }).click()
  const file = await downloadPromise
  const archive = testInfo.outputPath('restorable.storyworld')
  await file.saveAs(archive)
  const project = JSON.parse(readFileSync(archive, 'utf8'))
  expect(project.entities).toHaveLength(2)
  expect(project.relationships).toHaveLength(1)
  expect(project.memories).toHaveLength(1)
  expect(project.events).toHaveLength(1)
  await page.getByRole('button', { name: 'Delete local project' }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('A Test World')
  await page.getByRole('button', { name: 'Delete project', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Every world begins with a possibility.' }),
  ).toBeVisible()
  await page.getByLabel('Import project', { exact: true }).setInputFiles(archive)
  await expect(page.getByRole('heading', { name: 'A Test World', exact: true })).toBeVisible()
  await navigate(page, 'Timeline')
  await expect(page.getByRole('heading', { name: 'Mira finds the brass key' })).toBeVisible()
  expect(errors).toEqual([])
  expect(remote).toEqual([])
})
test('starter world, writing, local search, and screenshot evidence', async ({ page }) => {
  await demo(page)
  await saved(page)
  mkdirSync('docs/screenshots', { recursive: true })
  await page.screenshot({ path: 'docs/screenshots/home.png' })
  await navigate(page, 'Write')
  await page
    .getByLabel('Manuscript text')
    .fill('**The sea was still.**\n\n@Mara Vale found a silver sextant.')
  await page.getByRole('button', { name: 'Read', exact: true }).click()
  await expect(page.locator('.prose strong')).toHaveText('The sea was still.')
  await page.locator('.prose').getByRole('button', { name: 'Mara Vale', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('cartographer')
  await page.getByRole('button', { name: 'Back to the page' }).click()
  await saved(page)
  await page.screenshot({ path: 'docs/screenshots/write.png' })
  await navigate(page, 'Search ⌘ K')
  await page.getByLabel('Search your whole world').fill('silver sextant')
  await expect(page.getByRole('heading', { name: 'What the water remembers' })).toBeVisible()
  await navigate(page, 'Play')
  await page.screenshot({ path: 'docs/screenshots/play.png' })
  await page.reload()
  await navigate(page, 'Write')
  await expect(page.getByLabel('Manuscript text')).toHaveValue(
    '**The sea was still.**\n\n@Mara Vale found a silver sextant.',
  )
})
test('malformed imports fail safely and a second tab cannot overwrite the writer', async ({
  page,
  context,
}) => {
  await demo(page)
  const second = await context.newPage()
  await second.goto('/')
  await expect(second.getByRole('alert')).toContainText('already open in another tab')
  await second.close()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Import .storyworld project').setInputFiles({
    name: 'bad.storyworld',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":99}'),
  })
  await expect(page.getByRole('status').filter({ hasText: 'damaged' })).toBeVisible()
  await expect(page.getByLabel('World title')).toHaveValue('The Quiet Tide')
})
test('mobile layout, navigation, and command palette', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await demo(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: 'docs/screenshots/mobile.png' })
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await navigate(page, 'World')
  await expect(page.getByRole('heading', { name: 'A world, taking shape.' })).toBeVisible()
  await page.keyboard.press('Control+k')
  await page.getByLabel('Find a command').fill('Create a location')
  await page.getByRole('button', { name: 'Create a location', exact: true }).click()
  await expect(page.getByRole('dialog').getByLabel('What are you making?')).toHaveValue('Location')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
