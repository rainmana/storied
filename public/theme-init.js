// Apply a validated device preference before the app paints. No project data or network calls.
(() => {
  const colors = { moss: '#171b1a', midnight: '#131b26', parchment: '#f2e9d9', ink: '#121212' }
  let theme = 'moss'
  try {
    const saved = localStorage.getItem('storied-theme')
    if (Object.hasOwn(colors, saved)) theme = saved
  } catch { /* The default remains usable when browser storage is unavailable. */ }
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[theme])
})()
