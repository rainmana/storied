import { test, expect, type Page } from '@playwright/test'

async function openDemo(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore The Quiet Tide', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back to your world.' })).toBeVisible()
}

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name, exact: true }).click()
}

test('new world elements inherit the selected section through both creation buttons', async ({
  page,
}) => {
  await openDemo(page)
  await navigate(page, 'World')
  const filters = page.getByRole('group', { name: 'Filter world elements' })
  const dialog = page.getByRole('dialog')
  for (const type of ['Concept', 'Location', 'Faction', 'Religion', 'Character', 'All']) {
    if (['Concept', 'Religion'].includes(type)) {
      await filters.getByLabel('More entity types').selectOption(type)
    } else {
      await filters
        .getByRole('button', { name: type === 'All' ? /Everything/ : new RegExp(`${type}s`) })
        .click()
    }
    const expected = type === 'All' ? 'Character' : type
    await page.getByRole('button', { name: 'New world element', exact: true }).click()
    await expect(dialog.getByLabel('What are you making?')).toHaveValue(expected)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByLabel('Find world elements').fill('No matching world element for this test')
    await page.getByRole('button', { name: 'Create a world element', exact: true }).click()
    await expect(dialog.getByLabel('What are you making?')).toHaveValue(expected)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByLabel('Find world elements').fill('')
  }
  await filters.getByLabel('More entity types').selectOption('Concept')
  await page.getByRole('button', { name: 'New world element', exact: true }).click()
  await dialog.getByLabel('Name', { exact: true }).fill('The Last Light')
  await dialog.getByRole('button', { name: 'Add to world', exact: true }).click()
  await expect(page.getByLabel('Entity name', { exact: true })).toHaveValue('The Last Light')
  await expect(page.locator('.entity-page-header .eyebrow')).toHaveText('Concept')
})

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 660 },
]) {
  test(`the frame stays within the viewport while content scrolls at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await openDemo(page)
    // Settings contains the off-screen import input that previously enlarged the outer document.
    for (const workspace of ['Settings', 'Home', 'World', 'Write', 'Play']) {
      await navigate(page, workspace)
      const frame = await page.evaluate(() => ({
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: innerHeight,
        footerBottom: document.querySelector('.app-footer')!.getBoundingClientRect().bottom,
      }))
      expect(frame.documentHeight, workspace).toBe(frame.viewportHeight)
      expect(frame.footerBottom, workspace).toBeCloseTo(frame.viewportHeight, 0)
      const main = page.getByRole('main')
      // Scroll the workspace edge, outside the manuscript's independently scrolling textarea.
      await main.hover({ position: { x: 2, y: 2 } })
      await page.mouse.wheel(0, 100000)
      await expect
        .poll(() => main.evaluate((e) => Math.abs(e.scrollHeight - e.clientHeight - e.scrollTop)))
        .toBeLessThanOrEqual(1)
      await page.mouse.wheel(0, 100000)
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
      await expect(page.locator('.app-footer')).toBeInViewport()
    }
    await navigate(page, 'Write')
    await page.getByRole('button', { name: 'Focus mode', exact: true }).click()
    await expect(page.locator('.focus-mode')).toBeInViewport()
    await page.getByRole('button', { name: 'Leave focus mode', exact: true }).click()
    await navigate(page, 'World')
    await page.getByRole('button', { name: 'New world element', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Add to world', exact: true }).scrollIntoViewIfNeeded()
    await expect(dialog.getByRole('button', { name: 'Add to world', exact: true })).toBeInViewport()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.app-footer')).toBeInViewport()
    expect(await page.evaluate(() => scrollY)).toBe(0)
  })
}
