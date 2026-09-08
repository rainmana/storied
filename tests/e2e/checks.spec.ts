import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createDemo } from '../../src/domain/seed'

async function nav(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name, exact: true }).click()
}
const saved = (page: Page) =>
  expect(page.getByRole('banner').getByRole('status')).toHaveText('Saved on this device')
const home = (page: Page) =>
  expect(page.getByRole('heading', { name: 'Welcome back to your world.' })).toBeVisible()
const panel = (page: Page) => page.getByRole('region', { name: 'Play rules' })
const receipts = (page: Page) => panel(page).getByRole('article', { name: 'Recorded check' })
async function importWorld(page: Page, data: unknown, first = false) {
  await page
    .getByLabel(first ? 'Import project' : 'Import .storyworld project', { exact: true })
    .setInputFiles({
      name: 'crossing.storyworld',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(data)),
    })
  await home(page)
}
async function setup(page: Page) {
  const p = createDemo()
  await page.goto('/')
  await importWorld(page, { ...p, schemaVersion: 5 }, true)
  await nav(page, 'Settings')
  const pending = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download Lantern crossing', exact: true }).click()
  const file = readFileSync((await (await pending).path())!, 'utf8')
  return { p, file }
}
async function install(page: Page, file: string) {
  await nav(page, 'Settings')
  await page.getByLabel('Ruleset file').setInputFiles({
    name: 'lantern-crossing.storysystem',
    mimeType: 'application/json',
    buffer: Buffer.from(file),
  })
  await expect(page.getByRole('dialog')).toContainText('Lantern crossing')
  await page.getByRole('button', { name: 'Install in this world', exact: true }).click()
  await page.getByLabel('Enable Lantern crossing in this world').check()
  await nav(page, 'Play')
  await panel(page).locator('summary').first().click()
  await page.getByLabel('Rules for this experience').selectOption('storied.lantern-crossing')
  await expect(page.getByRole('button', { name: 'Make a check', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Edit mechanical state', exact: true }).click()
  await page.getByRole('button', { name: 'Save mechanical state', exact: true }).click()
}
async function review(page: Page) {
  await page.getByRole('button', { name: 'Make a check', exact: true }).click()
  await page.getByLabel('Approach', { exact: true }).fill('Follow the channel markers.')
  await page.getByLabel('Check attribute', { exact: true }).selectOption('footing')
  await page
    .getByLabel('On success', { exact: true })
    .fill('Reach the lantern before the path floods.')
  await page.getByLabel('On setback', { exact: true }).fill('Find another route.')
  await page.getByLabel('Resource to spend', { exact: true }).selectOption('supplies')
  await page.getByRole('button', { name: 'Review check', exact: true }).click()
}
async function resolve(page: Page) {
  await review(page)
  await page.getByRole('button', { name: 'Resolve and record check', exact: true }).click()
  await saved(page)
}
async function archive(page: Page, path: string) {
  await nav(page, 'Settings')
  await saved(page)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export project', exact: true }).click()
  await (await pending).saveAs(path)
  return JSON.parse(readFileSync(path, 'utf8'))
}

test('a reviewed check saves one fixed result and cost, survives offline restore, and never modifies creative content', async ({
  page,
  context,
}, info) => {
  const { p, file } = await setup(page)
  await install(page, file)
  await review(page)
  await expect(page.getByRole('dialog')).toContainText('3 → 2')
  await expect(page.getByRole('dialog')).toContainText('even if the check misses')
  await page.screenshot({ path: 'docs/screenshots/check-review.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(receipts(page)).toHaveCount(0)
  await expect(panel(page).locator('.rule-values').first()).toContainText('3 / 4')
  await resolve(page)
  await expect(receipts(page)).toHaveCount(1)
  const result = await receipts(page).locator('.check-result').innerText()
  const data = await archive(page, info.outputPath('check.storyworld'))
  expect(data.schemaVersion).toBe(6)
  const check = data.adventures[0].mechanics[0].checks[0]
  expect(check.die).toBeGreaterThanOrEqual(1)
  expect(check.die).toBeLessThanOrEqual(6)
  expect(check.total).toBe(check.die + 2)
  expect(check.before.supplies).toBe(3)
  expect(check.after.supplies).toBe(2)
  for (const key of [
    'entities',
    'relationships',
    'facts',
    'knowledge',
    'events',
    'scenes',
    'studio',
    'journal',
    'memories',
    'proposals',
    'activity',
  ])
    expect(data[key]).toEqual(p[key as keyof typeof p])
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  await context.setOffline(true)
  await page.reload()
  await nav(page, 'Play')
  await expect(receipts(page)).toHaveCount(1)
  await expect(receipts(page).locator('.check-result')).toHaveText(result)
  await nav(page, 'Settings')
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download Lantern crossing', exact: true }).click()
  expect(readFileSync((await (await download).path())!, 'utf8')).toBe(file)
  await importWorld(page, data)
  await nav(page, 'Play')
  await expect(receipts(page)).toHaveCount(1)
  await expect(receipts(page).locator('.check-result')).toHaveText(result)
  await expect(panel(page).locator('.rule-values').first()).toContainText('2 / 4')
})

test('the same standalone ruleset works independently in two worlds and checks stay with their branch copies', async ({
  page,
}, info) => {
  const { p, file } = await setup(page)
  await install(page, file)
  await resolve(page)
  await page.getByRole('button', { name: 'Story', exact: true }).click()
  await page.getByLabel('Your next move').fill('Mara reached the first marker.')
  await page.getByRole('button', { name: 'Review passage', exact: true }).click()
  await page.getByRole('button', { name: 'Accept passage', exact: true }).click()
  await resolve(page)
  await expect(receipts(page)).toHaveCount(2)
  await expect(panel(page).locator('.rule-values').first()).toContainText('1 / 4')
  await page.getByLabel('Active story branch').selectOption('')
  await expect(receipts(page)).toHaveCount(1)
  await expect(panel(page).locator('.rule-values').first()).toContainText('2 / 4')
  await page.getByLabel('Active story branch').selectOption({ index: 1 })
  await expect(receipts(page)).toHaveCount(2)
  await saved(page)
  await nav(page, 'Settings')
  const second = createDemo()
  second.title = 'Another coast'
  await importWorld(page, second)
  await nav(page, 'Play')
  await expect(panel(page)).toHaveCount(0)
  await install(page, file)
  await expect(receipts(page)).toHaveCount(0)
  await expect(panel(page).locator('.rule-values').first()).toContainText('3 / 4')
  const exported = await archive(page, info.outputPath('second-world.storyworld'))
  expect(exported.ruleSystems[0].definition).toEqual(JSON.parse(file))
  await page.getByLabel('Current project', { exact: true }).selectOption(p.id)
  await home(page)
  await nav(page, 'Play')
  await expect(receipts(page)).toHaveCount(2)
  await expect(panel(page).locator('.rule-values').first()).toContainText('1 / 4')
})

test('corrupt receipts are rejected while removed or missing rules leave history readable on mobile', async ({
  page,
}, info) => {
  const { file } = await setup(page)
  await install(page, file)
  await resolve(page)
  const data = await archive(page, info.outputPath('original-check.storyworld'))
  const corrupt = structuredClone(data)
  corrupt.adventures[0].mechanics[0].checks[0].total++
  await page.getByLabel('Import .storyworld project', { exact: true }).setInputFiles({
    name: 'corrupt.storyworld',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(corrupt)),
  })
  await expect(page.getByRole('status').filter({ hasText: 'saved check disagrees' })).toBeVisible()
  await expect(page.getByLabel('World title', { exact: true })).toHaveValue(data.title)
  data.ruleSystems = []
  await importWorld(page, data)
  await nav(page, 'Play')
  await panel(page).getByText('Saved mechanical snapshots', { exact: true }).click()
  await expect(receipts(page)).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Make a check', exact: true })).toHaveCount(0)
  await expect(panel(page)).toContainText('Unavailable')
  await page.setViewportSize({ width: 390, height: 844 })
  await receipts(page).scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: 'docs/screenshots/check-history-mobile.png',
    animations: 'disabled',
  })
  await page.getByLabel('Rules for this experience').selectOption('')
  await expect(page.getByRole('button', { name: 'Story', exact: true })).toBeEnabled()
})
