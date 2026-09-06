import { useState } from 'react'
import { Cable, Check, LoaderCircle } from 'lucide-react'
import { useProviderSettings, readProviderKey } from '../lib/provider-settings'
import {
  defaultConnection,
  providerIds,
  providers,
  connectionLabel,
  connectionOrigin,
  isLoopback,
  type Connection,
  type ProviderId,
} from '../lib/provider-client'
import { listProviderModels, useInferenceStatus } from '../lib/inference'
import { Field } from './common'
import { Button } from './ui/button'

export function ProviderSettings() {
  const settings = useProviderSettings(),
    inference = useInferenceStatus()
  const initial = settings.active === 'browser' ? 'openai' : settings.active
  const [draft, setDraft] = useState<Connection>(
      settings.profiles[initial]?.connection || defaultConnection(initial),
    ),
    [key, setKey] = useState(readProviderKey(initial)),
    [remember, setRemember] = useState(settings.profiles[initial]?.remember || false),
    [consent, setConsent] = useState(false),
    [models, setModels] = useState<string[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const select = (provider: ProviderId) => {
    setDraft(settings.profiles[provider]?.connection || defaultConnection(provider))
    setKey(readProviderKey(provider))
    setRemember(settings.profiles[provider]?.remember || false)
    setConsent(false)
    setModels([])
    setError('')
    setNotice('')
  }
  let destination = 'the endpoint you enter',
    local = false
  try {
    const url = new URL(draft.baseUrl)
    destination = url.origin
    local = isLoopback(url)
  } catch {
    /* Inline validation on activation. */
  }
  const disabled = inference.busy || loading
  return (
    <section className="settings-section provider-settings" aria-label="Storyteller connections">
      <div className="settings-section-title">
        <Cable size={22} />
        <div>
          <h2>Choose your storyteller</h2>
          <p>On this device, on your own server, or with a provider you choose.</p>
        </div>
      </div>
      <div className="provider-current">
        <div>
          <strong>
            {inference.remote ? connectionLabel(inference.connection!) : 'On-device inference'}
          </strong>
          <p className="small muted">
            {inference.remote
              ? `Story context goes directly to ${connectionOrigin(inference.connection!)}. Search and project storage stay in this browser.`
              : 'Writing, generation, and search stay on this device. Model downloads are optional.'}
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={disabled || !inference.remote}
          onClick={() => {
            settings.useBrowser()
            setNotice('On-device inference selected.')
            setError('')
          }}
        >
          {!inference.remote && <Check size={14} />}Use on-device inference
        </Button>
      </div>
      <details open={inference.remote || undefined}>
        <summary>Connect an API or local server</summary>
        <form
          className="form-stack provider-form"
          onSubmit={(e) => {
            e.preventDefault()
            setError('')
            setNotice('')
            try {
              if (!consent) throw new Error('Confirm where your context will be sent.')
              settings.activate(draft, key, remember)
              setNotice('Connection selected. No story has been sent.')
              setConsent(false)
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not save browser settings.')
            }
          }}
        >
          <div className="settings-fields">
            <Field label="Provider">
              <select
                value={draft.provider}
                onChange={(e) => select(e.target.value as ProviderId)}
                disabled={disabled}
              >
                {providerIds.map((id) => (
                  <option key={id} value={id}>
                    {providers[id].name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="API base URL"
              hint="Include the API prefix, such as /v1. Do not include /chat/completions or an API key."
            >
              <input
                value={draft.baseUrl}
                type="url"
                maxLength={2000}
                required
                readOnly={!['custom', 'lmstudio', 'ollama'].includes(draft.provider)}
                disabled={disabled}
                onChange={(e) => {
                  setDraft({ ...draft, baseUrl: e.target.value })
                  setKey('')
                  setConsent(false)
                  setModels([])
                }}
                placeholder="https://your-server.example/v1"
              />
            </Field>
          </div>
          {draft.provider === 'custom' && (
            <Field label="API protocol">
              <select
                value={draft.protocol}
                disabled={disabled}
                onChange={(e) => {
                  setDraft({
                    ...draft,
                    protocol: e.target.value as Connection['protocol'],
                    structured: 'prompt',
                  })
                  setConsent(false)
                }}
              >
                <option value="chat">OpenAI-compatible Chat Completions</option>
                <option value="responses">OpenAI Responses</option>
                <option value="messages">Anthropic Messages</option>
              </select>
            </Field>
          )}
          <Field
            label="API key"
            hint={
              providers[draft.provider].keyRequired
                ? 'Your own provider key. Used only for requests to the selected endpoint.'
                : 'Optional for servers without authentication.'
            }
          >
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              maxLength={4096}
              value={key}
              disabled={disabled}
              required={providers[draft.provider].keyRequired}
              onChange={(e) => {
                setKey(e.target.value)
                setConsent(false)
              }}
            />
          </Field>
          <label className="provider-checkbox">
            <input
              type="checkbox"
              checked={remember}
              disabled={disabled}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Remember this key on this device</span>
          </label>
          <p className="small muted">
            {remember
              ? 'Saved in browser storage without encryption. Anyone with access to this browser profile can retrieve it. Use a limited key on a trusted device.'
              : 'The key lasts for this browser tab’s session, including reloads. A new session may require entering it again.'}{' '}
            Keys are excluded from .storyworld files and never sent to Storied’s hosting server.
          </p>
          <div className="settings-fields">
            <Field label="Model ID" hint="Use the exact ID from your provider or local server.">
              <input
                value={draft.model}
                list="provider-model-ids"
                required
                maxLength={200}
                disabled={disabled}
                placeholder="Enter a model ID, or load the list"
                onChange={(e) => {
                  setDraft({ ...draft, model: e.target.value })
                  setConsent(false)
                }}
              />
            </Field>
            <Field label="Maximum output tokens">
              <input
                type="number"
                min={128}
                max={32768}
                required
                disabled={disabled}
                value={draft.maxTokens}
                onChange={(e) => setDraft({ ...draft, maxTokens: Number(e.target.value) })}
              />
            </Field>
          </div>
          <datalist id="provider-model-ids">
            {models.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
          <div className="button-row">
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || !draft.baseUrl}
              onClick={async () => {
                setLoading(true)
                setError('')
                setNotice('')
                try {
                  const ids = await listProviderModels(draft, key)
                  setModels(ids)
                  setNotice(`${ids.length} model IDs loaded. Select an exact model ID above.`)
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not load model IDs.')
                } finally {
                  setLoading(false)
                }
              }}
            >
              {loading ? <LoaderCircle className="spin" size={14} /> : <Cable size={14} />}Load
              model list
            </Button>
            <span className="small muted">
              Contacts {destination} with your key; sends no story text.
            </span>
          </div>
          <details>
            <summary>Structured extraction</summary>
            <Field
              label="JSON output mode"
              hint="JSON instructions work across the widest range of models. Native JSON modes require provider/model support. Errors stop for review; Storied never silently retries with weaker settings."
            >
              <select
                disabled={disabled || draft.protocol === 'messages'}
                value={draft.structured}
                onChange={(e) =>
                  setDraft({ ...draft, structured: e.target.value as Connection['structured'] })
                }
              >
                <option value="prompt">JSON instructions + local validation</option>
                <option value="json_object">Native JSON object</option>
                <option value="json_schema">Native strict JSON schema</option>
              </select>
            </Field>
          </details>
          <div className="provider-disclosure">
            <strong>{local ? 'Your local server' : 'Context leaves this browser'}</strong>
            <p>
              {local
                ? 'The browser connects to the server on this computer. Configure its allowed origin and start the server first.'
                : 'Generating a passage sends its compiled context; accepting it may send the passage for extraction. Provider usage charges and data policies apply.'}{' '}
              Author assistance also sends the selected entity’s description and author notes.
              Manual Story mode and search stay local.
            </p>
            <label className="provider-checkbox">
              <input
                type="checkbox"
                checked={consent}
                disabled={disabled}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I allow AI actions to send their context to {destination} using this connection.
              </span>
            </label>
          </div>
          {['lmstudio', 'ollama', 'custom'].includes(draft.provider) && (
            <details>
              <summary>Connecting a server</summary>
              <p className="small">
                Allow this site’s origin in the server’s CORS settings:{' '}
                <code>{window.location.origin}</code>. Your browser may also ask for local-network
                permission. Keep local servers bound to loopback.
              </p>
              <p className="small">
                LM Studio: enable CORS in server settings, or start with{' '}
                <code>lms server start --cors</code>. Ollama: set{' '}
                <code>OLLAMA_ORIGINS={window.location.origin}</code> in its process environment and
                restart Ollama. Remote servers need HTTPS. Custom endpoints must implement the
                selected protocol and allow browser requests; Storied does not proxy them.
              </p>
            </details>
          )}
          {draft.provider === 'anthropic' && (
            <p className="small muted">
              Uses Anthropic’s direct-browser access header. Some organization policies block
              browser requests; those accounts need an endpoint you operate that permits them.
            </p>
          )}
          <div className="button-row">
            <Button disabled={disabled || !consent}>Use this connection</Button>
            {settings.profiles[draft.provider] && (
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={() => {
                  settings.forget(draft.provider)
                  setKey('')
                  setRemember(false)
                  setConsent(false)
                  setNotice('Saved connection and key removed.')
                  setError('')
                }}
              >
                Forget connection & key
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </form>
      </details>
      {notice && (
        <p className="small" role="status">
          {notice}
        </p>
      )}
    </section>
  )
}
