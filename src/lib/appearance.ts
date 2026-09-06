import { create } from 'zustand'

export const themes = [
  {
    id: 'moss',
    name: 'Moss',
    description: 'The original woodland studio. Soft greens and warm light.',
    background: '#171b1a',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep blue, clear lettering, and a little lamplight.',
    background: '#131b26',
  },
  {
    id: 'parchment',
    name: 'Parchment',
    description: 'Warm paper, dark ink, and blue accents. A light studio.',
    background: '#f2e9d9',
  },
  {
    id: 'ink',
    name: 'Ink',
    description: 'Stronger contrast. Charcoal, ivory, and amber.',
    background: '#121212',
  },
] as const
export type Theme = (typeof themes)[number]['id']
const isTheme = (value: unknown): value is Theme => themes.some((t) => t.id === value)
function readTheme(): Theme {
  try {
    const saved = localStorage.getItem('storied-theme')
    return isTheme(saved) ? saved : 'moss'
  } catch {
    return 'moss'
  }
}
export const useAppearance = create<{ theme: Theme; select: (theme: Theme) => boolean }>((set) => ({
  theme: readTheme(),
  select: (theme) => {
    if (!isTheme(theme)) return false
    document.documentElement.dataset.theme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', themes.find((t) => t.id === theme)!.background)
    set({ theme })
    try {
      localStorage.setItem('storied-theme', theme)
      return true
    } catch {
      return false
    }
  },
}))
