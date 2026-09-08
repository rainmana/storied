import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createDemo } from '../../src/domain/seed'
import { exampleRuleSystem } from '../../src/domain/rules'

async function nav(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name, exact: true }).click()
}
const saved = (page: Page) =>
  expect(page.getByRole('banner').getByRole('status')).toHaveText('Saved on this device')
async function setup(page: Page) {
  const p = createDemo()
  const old = { ...p, schemaVersion: 4, ruleSystems: undefined }
  await page.goto('/')
  await page.getByLabel('Import project', { exact: true }).setInputFiles({
    name: 'v07.storyworld',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(old)),
  })
  await expect(page.getByRole('heading', { name: 'Welcome back to your world.' })).toBeVisible()
  return p
}
async function install(page: Page) {
  await nav(page, 'Settings')
  await page.getByLabel('Ruleset file').setInputFiles({
    name: 'small-steps.storysystem',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exampleRuleSystem)),
  })
  await expect(page.getByRole('dialog')).toContainText('Small steps')
  await page.getByRole('button', { name: 'Install in this world', exact: true }).click()
  await expect(page.getByLabel('Enable Small steps in this world')).not.toBeChecked()
  await page.getByLabel('Enable Small steps in this world').check()
}
async function edit(page: Page, energy: string, resolve = '4') {
  await page.getByRole('button', { name: 'Edit mechanical state', exact: true }).click()
  await page.getByLabel('Resolve', { exact: true }).fill(resolve)
  await page.getByLabel('Energy', { exact: true }).fill(energy)
  await page.getByRole('button', { name: 'Save mechanical state', exact: true }).click()
}
async function exportWorld(page: Page, path: string) {
  await nav(page, 'Settings')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export project', exact: true }).click()
  await (await pending).saveAs(path)
  return JSON.parse(readFileSync(path, 'utf8'))
}

test('rules are opt-in, validate before installation, persist explicit entity state, and survive offline export and restore', async ({
  page,
  context,
}, info) => {
  const original = await setup(page)
  await nav(page, 'Play')
  await expect(page.getByRole('region', { name: 'Play rules' })).toHaveCount(0)
  await install(page)
  await nav(page, 'Play')
  const panel = page.getByRole('region', { name: 'Play rules' })
  await panel.locator('summary').first().click()
  await expect(page.getByLabel('Rules for this experience')).toHaveValue('')
  await page.getByLabel('Rules for this experience').selectOption(exampleRuleSystem.id)
  await edit(page, '3')
  await expect(panel).toContainText('3 / 6')
  await expect(panel.locator('.rule-values').first()).toContainText('Reach6')
  await saved(page)
  await page.reload()
  await nav(page, 'Play')
  await expect(page.getByLabel('Rules for this experience')).toHaveValue(exampleRuleSystem.id)
  await expect(panel).toContainText('3 / 6')
  const data = await exportWorld(page, info.outputPath('rules.storyworld'))
  expect(data.schemaVersion).toBe(5)
  expect(data.adventures[0].mechanics[0].entities[0].values).toEqual({ resolve: 4, energy: 3 })
  for (const key of [
    'entities',
    'scenes',
    'journal',
    'studio',
    'facts',
    'knowledge',
    'events',
    'memories',
    'proposals',
    'activity',
  ] as const)
    expect(data[key]).toEqual(original[key])
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  await context.setOffline(true)
  await page.reload()
  await nav(page, 'Settings')
  await page.getByLabel('Import .storyworld project', { exact: true }).setInputFiles({
    name: 'rules.storyworld',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  })
  await expect(page.getByRole('heading', { name: 'Welcome back to your world.' })).toBeVisible()
  await nav(page, 'Play')
  await expect(panel).toContainText('3 / 6')
  await expect(page.getByLabel('Rules for this experience')).toHaveValue(exampleRuleSystem.id)
})

test('manual freeform passages carry independent state copies and disabling or removing a rule preserves narrative and snapshots on mobile', async ({
  page,
}, info) => {
  await setup(page)
  await install(page)
  await nav(page, 'Play')
  const panel = page.getByRole('region', { name: 'Play rules' })
  await panel.locator('summary').first().click()
  await page.getByLabel('Rules for this experience').selectOption(exampleRuleSystem.id)
  await edit(page, '6', '2')
  await page.getByRole('button', { name: 'Story', exact: true }).click()
  const text = 'Mara walked to the water. The numbers did not choose her next step.'
  await page.getByLabel('Your next move').fill(text)
  await page.getByRole('button', { name: 'Review passage', exact: true }).click()
  await page.getByRole('button', { name: 'Accept passage', exact: true }).click()
  await edit(page, '2')
  await page.getByLabel('Active story branch').selectOption('')
  await expect(panel.locator('.rule-values').first()).toContainText('Energy6 / 6')
  await page.getByLabel('Active story branch').selectOption({ index: 1 })
  await expect(panel.locator('.rule-values').first()).toContainText('Energy2 / 6')
  await page.setViewportSize({ width: 390, height: 844 })
  await panel.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'docs/screenshots/rules-mobile.png', animations: 'disabled' })
  await nav(page, 'Settings')
  await page.getByLabel('Enable Small steps in this world').uncheck()
  await page.getByRole('button', { name: 'Remove ruleset', exact: true }).click()
  await page.getByRole('button', { name: 'Remove and keep saved state', exact: true }).click()
  await nav(page, 'Play')
  await panel.locator('summary').first().click()
  await expect(
    page.getByRole('button', { name: 'Edit mechanical state', exact: true }),
  ).toHaveCount(0)
  await panel.getByText('Saved mechanical snapshots', { exact: true }).click()
  await expect(panel).toContainText('2 / 6')
  await expect(page.getByRole('article').getByText(text, { exact: true })).toBeVisible()
  const data = await exportWorld(page, info.outputPath('removed-rules.storyworld'))
  expect(data.ruleSystems).toEqual([])
  expect(data.adventures[0].turns.at(-1).mechanics[0].system).toEqual(exampleRuleSystem)
  expect(data.adventures[0].turns.at(-1).text).toBe(text)
})

test('invalid rule files do not change the world and a missing installed binding stays readable without executing', async ({
  page,
}, info) => {
  await setup(page)
  await nav(page, 'Settings')
  const region = page.getByRole('region', { name: 'Optional rule layers' })
  await page.getByLabel('Ruleset file').setInputFiles({
    name: 'unsafe.storysystem',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...exampleRuleSystem, execute: 'fetch(secret)' })),
  })
  await expect(region.getByRole('alert')).toContainText('invalid ruleset')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(region).toContainText('No rulesets installed')
  await install(page)
  await nav(page, 'Play')
  const panel = page.getByRole('region', { name: 'Play rules' })
  await panel.locator('summary').first().click()
  await page.getByLabel('Rules for this experience').selectOption(exampleRuleSystem.id)
  await edit(page, '1')
  const data = await exportWorld(page, info.outputPath('missing-binding.storyworld'))
  data.ruleSystems = []
  await page.getByLabel('Import .storyworld project', { exact: true }).setInputFiles({
    name: 'missing-binding.storyworld',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  })
  await expect(page.getByRole('heading', { name: 'Welcome back to your world.' })).toBeVisible()
  await nav(page, 'Play')
  await expect(panel).toContainText('Unavailable')
  await expect(
    page.getByRole('button', { name: 'Edit mechanical state', exact: true }),
  ).toHaveCount(0)
  await panel.getByText('Saved mechanical snapshots', { exact: true }).click()
  await expect(panel).toContainText('1 / 6')
  await expect(panel).toContainText('Unavailable while inactive')
  await page.getByLabel('Rules for this experience').selectOption('')
  await expect(page.getByRole('button', { name: 'Story', exact: true })).toBeEnabled()
})
