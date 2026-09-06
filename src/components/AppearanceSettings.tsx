import { useState } from 'react'
import { Check, Palette } from 'lucide-react'
import { themes, useAppearance } from '../lib/appearance'

export function AppearanceSettings() {
  const appearance = useAppearance()
  const [notice, setNotice] = useState('')
  return (
    <section className="settings-section appearance-settings" aria-label="Appearance">
      <div className="settings-section-title">
        <Palette size={22} />
        <div>
          <h2>A different kind of light</h2>
          <p>The same studio, in colors that feel right to you.</p>
        </div>
      </div>
      <fieldset className="theme-choices">
        <legend>Color theme</legend>
        {themes.map((theme) => (
          <label
            key={theme.id}
            className={`theme-choice ${appearance.theme === theme.id ? 'is-selected' : ''}`}
          >
            <input
              type="radio"
              name="color-theme"
              value={theme.id}
              aria-label={theme.name}
              checked={appearance.theme === theme.id}
              onChange={() =>
                setNotice(
                  appearance.select(theme.id)
                    ? `${theme.name} selected. Remembered on this device.`
                    : `${theme.name} applied. Browser storage is unavailable, so it may reset on reload.`,
                )
              }
            />
            <span className={`theme-swatch theme-swatch-${theme.id}`} aria-hidden="true">
              <span />
              <i />
              <b>Aa</b>
            </span>
            <span className="theme-choice-copy">
              <strong>{theme.name}</strong>
              <span>{theme.description}</span>
            </span>
            {appearance.theme === theme.id && (
              <Check className="theme-check" size={18} aria-hidden="true" />
            )}
          </label>
        ))}
      </fieldset>
      <p className="small muted">
        Try Ink for stronger contrast or Parchment for a light background. Status labels and icons
        carry meaning alongside color. This choice stays on this device and is separate from your
        worlds.
      </p>
      {notice && (
        <p className="small" role="status">
          {notice}
        </p>
      )}
    </section>
  )
}
