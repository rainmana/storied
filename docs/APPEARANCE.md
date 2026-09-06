# Appearance and color themes

Choose **Settings → A different kind of light → Color theme**. Changes apply immediately and are remembered in this browser, including after an offline reload.

| Theme     | Appearance                                                              |
| --------- | ----------------------------------------------------------------------- |
| Moss      | The original green woodland studio.                                     |
| Midnight  | Deep blue surfaces, pale text, and warm lamplight accents.              |
| Parchment | Warm paper, dark ink, and blue accents; a light theme.                  |
| Ink       | Neutral charcoal, ivory text, and amber accents with stronger contrast. |

All themes share Storied's type, layout, shapes, and original artwork. The palettes apply to the workspace, forms, model settings, editor, dialogs, badges, and relationship graph. Images attached to a world keep their original colors. Selection uses a radio control, outline, checkmark, and name. Status labels and icons remain meaningful alongside color; private graph connections remain dashed as well as labeled.

The `storied-theme` preference is localStorage metadata, separate from the database and native project exports. Clearing browser site data resets it. A small static initialization script validates the saved ID and applies it before the application renders; invalid/unavailable preferences use Moss. If storage is unavailable when changing a theme, the palette still applies for the current page and the UI explains that it may reset.

## Readability verification

Color-vision differences cannot be addressed by hue changes alone. We use the [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and retain text/icon cues in accordance with [Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html). The three alternate palettes are checked using actual browser-computed foreground/background values in Settings, Home, World, Write, Play, and Relationships. Disabled controls and decorative imagery are excluded. This is targeted verification, not a claim of complete WCAG conformance or a substitute for user accessibility testing.

The test also exercises keyboard theme selection, a 390-pixel viewport, browser theme-color metadata, and offline reload persistence. See [verification](VERIFICATION.md) for measured results and screenshots. Moss retains the original softer palette; choose Ink or Parchment if those colors are easier to read.

## Implementation

`src/themes.css` defines semantic palette values. Component color declarations use `--theme-*` variables with the original Moss colors as fallbacks. Shared `--background`, `--panel`, `--foreground`, `--muted`, and `--accent` values also change. No CSS filter is applied to the rendered page or user images. Themes are built-in choices; importing arbitrary CSS or loading third-party theme code is not supported. Future declarative theme packs should validate token values as described in [the extension proposal](EXTENSIONS.md).
