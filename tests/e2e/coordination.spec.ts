import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createDemo } from '../../src/domain/seed'
import { uid } from '../../src/domain/schema'

async function openNavigation(page: Page) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true })
  if (await menu.isVisible()) await menu.click()
}
const navigate = async (page: Page, name: string) => {
  const button = page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name, exact: true })
  await expect(button).toBeEnabled()
  await openNavigation(page)
  await button.click()
}
const saved = (page: Page) =>
  expect(page.getByRole('banner').getByRole('status', { includeHidden: true })).toHaveText(
    'Saved on this device',
  )
async function exportProject(page: Page) {
  await openNavigation(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await saved(page)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export project', exact: true }).click()
  const download = await downloading
  return JSON.parse(readFileSync((await download.path())!, 'utf8'))
}

test('v1 migration, draft checkpoint reload, source preservation, and stale-world synchronization', async ({
  page,
  context,
}) => {
  const demo = createDemo()
  await page.goto('/')
  await page.getByLabel('Import project', { exact: true }).setInputFiles({
    name: 'legacy.storyworld',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        ...demo,
        schemaVersion: 1,
        worldRevision: undefined,
        workflows: undefined,
        approvals: undefined,
      }),
    ),
  })
  await navigate(page, 'Play')
  const original = '  The bells ring quietly.\nNobody speaks.  '
  await page.getByRole('button', { name: 'Story', exact: true }).click()
  await page.getByLabel('Your next move').fill(original)
  await page.getByRole('button', { name: 'Review passage', exact: true }).click()
  await expect(page.getByLabel('Story draft', { exact: true })).toHaveValue(original)
  await page
    .getByLabel('Story draft', { exact: true })
    .fill('An edited draft that must remain in the record.')
  await saved(page)
  // The public origin needs time to precache its WASM assets before losing the network.
  await expect(page.getByText('Ready for offline use', { exact: true })).toBeVisible()
  await context.setOffline(true)
  await page.reload()
  await navigate(page, 'Play')
  await expect(page.getByLabel('Story draft', { exact: true })).toHaveValue(
    'An edited draft that must remain in the record.',
  )
  await page
    .locator('.context-person')
    .getByRole('button', { name: 'Mara Vale', exact: true })
    .click()
  await page
    .getByLabel('In-world description', { exact: true })
    .fill('Mara now wants to reconcile with the Tidekeepers.')
  await saved(page)
  await navigate(page, 'Play')
  await expect(
    page.getByRole('button', { name: 'Synchronize & resume', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Synchronize & resume', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Accept passage', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Accept passage', exact: true }).click()
  await saved(page)
  const exported = await exportProject(page)
  expect(exported.schemaVersion).toBe(6)
  expect(exported.facts).toEqual(demo.facts)
  const w = exported.workflows[0]
  expect(w.boundaries.some((b: { text: string }) => b.text === original)).toBe(true)
  expect(
    w.boundaries.some(
      (b: { text: string }) => b.text === 'An edited draft that must remain in the record.',
    ),
  ).toBe(true)
  expect(w.repairs.some((r: { operation: string }) => r.operation === 'synchronize')).toBe(true)
  expect(w.context.prompt).toContain('reconcile with the Tidekeepers')
  expect(exported.adventures[0].turns[0].input).toBe(original)
})

test('consequential ambiguity is repaired before model capability failure, and both survive reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore The Quiet Tide', exact: true }).click()
  await navigate(page, 'Play')
  await page.getByLabel('Your next move').fill('I take care of the guard.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(
    page.getByText(
      'This action has consequential competing interpretations. Choose or describe what you mean.',
      { exact: true },
    ),
  ).toBeVisible()
  await page.getByLabel('Clarify your direction').fill('Offer the guard food and assistance.')
  await page.getByRole('button', { name: 'Repair & resume', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry failed step', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await saved(page)
  await page.reload()
  await navigate(page, 'Play')
  await expect(page.getByRole('button', { name: 'Retry failed step', exact: true })).toBeVisible()
  const exported = await exportProject(page),
    w = exported.workflows[0]
  expect(w.node).toBe('storyteller')
  expect(w.status).toBe('failed')
  expect(w.input).toBe('I take care of the guard.')
  expect(w.repairs[0].operation).toBe('disambiguate')
  expect(w.context.prompt).toContain('Offer the guard food and assistance.')
  expect(exported.adventures[0].turns).toHaveLength(0)
  expect(exported.approvals).toHaveLength(0)
})

test('changing scene time excludes and reveals an explicitly dated discovery in the actual inspector', async ({
  page,
}) => {
  const p = createDemo(),
    a = p.adventures[0],
    earlier = { ...p.events[0], id: uid(), title: 'Before the discovery', order: 72 },
    later = { ...p.events[0], id: uid(), title: 'The discovery', order: 90 }
  p.events.push(earlier, later)
  a.currentEventId = earlier.id
  p.knowledge.push({
    ...p.knowledge[0],
    id: uid(),
    entityId: a.scenario.characterId,
    claim: 'The tower keeper carries a silver compass.',
    learnedAtEventId: later.id,
    stance: 'suspects',
  })
  await page.goto('/')
  await page.getByLabel('Import project', { exact: true }).setInputFiles({
    name: 'chronology.storyworld',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(p)),
  })
  await navigate(page, 'Play')
  await page.getByRole('button', { name: 'Context', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toContainText('silver compass')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByLabel('Scene time', { exact: true }).selectOption(later.id)
  await page.getByRole('button', { name: 'Context', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(
    'The tower keeper carries a silver compass. (stance: suspects',
  )
})
