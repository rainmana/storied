import { test, expect, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'

async function readableText(page: Page) {
  return page.evaluate(() => {
    const rgb = (s: string) => (s.match(/[\d.]+/g) || []).map(Number)
    const luminance = (color: number[]) =>
      color
        .slice(0, 3)
        .map((c) => {
          const s = c / 255
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        })
        .reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0)
    const ratio = (a: number[], b: number[]) => {
      const x = luminance(a),
        y = luminance(b)
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
    }
    const background = (el: Element): number[] => {
      let bg = [0, 0, 0]
      const ancestors: Element[] = []
      for (let e: Element | null = el; e; e = e.parentElement) ancestors.unshift(e)
      for (const a of ancestors) {
        const color = rgb(getComputedStyle(a).backgroundColor),
          alpha = color[3] ?? 1
        bg = bg.map((c, i) => (color[i] || 0) * alpha + c * (1 - alpha))
      }
      return bg
    }
    return [
      ...document.querySelectorAll(
        'main h1, main h2, main h3, main p, main button, .field > label, main input:not([type=checkbox]):not([type=radio]), main textarea, .sidebar nav button, .badge, .save-status, .theme-choice-copy > span',
      ),
    ]
      .filter(
        (el) =>
          el.getClientRects().length &&
          !el.closest('[aria-hidden=true]') &&
          !el.matches(':disabled'),
      )
      .map((el) => {
        const style = getComputedStyle(el),
          color = rgb(style.color),
          bg = background(el)
        return {
          text: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 70),
          ratio: ratio(color, bg),
          foreground: style.color,
          background: bg,
          tag: el.tagName,
          classes: el.className,
        }
      })
      .filter((row) => row.text)
  })
}

test('themes remain readable across workspaces, persist offline, and support keyboard selection', async ({
  page,
  context,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore The Quiet Tide', exact: true }).click()
  await expect(page.locator('.save-status')).toHaveText('Saved on this device')
  const nav = (name: string) =>
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name, exact: true })
      .click()
  const reports: Record<string, unknown> = {}
  for (const theme of ['Moss', 'Midnight', 'Parchment', 'Ink']) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const appearance = page.getByRole('region', { name: 'Appearance', exact: true })
    await appearance.getByRole('radio', { name: theme, exact: true }).check()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase())
    await expect(appearance.getByRole('radio', { name: theme, exact: true })).toBeChecked()
    await appearance.scrollIntoViewIfNeeded()
    // Finish finite CSS transitions before measuring the selected palette.
    await page.screenshot({
      path: `docs/screenshots/theme-${theme.toLowerCase()}-settings.png`,
      animations: 'disabled',
    })
    if (theme !== 'Moss') {
      const rows = await readableText(page)
      reports[theme + '-settings'] = rows
      expect
        .soft(
          rows.filter((row) => row.ratio < 4.5),
          `${theme} settings contrast`,
        )
        .toEqual([])
    }
    for (const workspace of ['Home', 'World', 'Write', 'Play', 'Relationships']) {
      await nav(workspace)
      if (theme !== 'Moss') {
        const rows = await readableText(page)
        reports[theme + '-' + workspace] = rows
        expect
          .soft(
            rows.filter((row) => row.ratio < 4.5),
            `${theme} ${workspace} contrast`,
          )
          .toEqual([])
      }
      if (['Home', 'Write', 'Relationships'].includes(workspace))
        await page.screenshot({
          path: `docs/screenshots/theme-${theme.toLowerCase()}-${workspace.toLowerCase()}.png`,
          animations: 'disabled',
        })
    }
  }
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('radio', { name: 'Ink', exact: true }).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('radio', { name: 'Parchment', exact: true })).toBeChecked()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'parchment')
  await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content', '#f2e9d9')
  await expect(page.getByText('Ready for offline use', { exact: true })).toBeVisible({
    timeout: 60000,
  })
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'parchment')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Parchment', exact: true })).toBeChecked()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('radio', { name: 'Ink', exact: true }).check()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'docs/screenshots/theme-ink-mobile.png', animations: 'disabled' })
  expect(errors).toEqual([])
  writeFileSync(info.outputPath('theme-contrast.json'), JSON.stringify(reports, null, 2))
})
