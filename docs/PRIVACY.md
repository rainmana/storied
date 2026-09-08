# Privacy by architecture

There are no Storied accounts, project APIs, cloud databases, analytics, ads, telemetry, or remote search services. Project identifiers are generated locally. Version 0.3 adds optional, explicitly configured inference connections. In default on-device mode creative text remains local. With an API connection selected, the requested operation's context is sent directly to that endpoint in its request body. It is never placed in URLs or referrers. See [provider scope, credentials, and browser requirements](PROVIDERS.md).

## Permitted network activity

1. Static HTML, scripts, CSS, fonts, artwork, and WASM runtimes from the installation origin.
2. Static application updates through a prompt-based service worker update.
3. Explicit model asset downloads from the application’s fixed catalog. Those requests contain public model asset identifiers only.
4. Explicit API model-list requests and AI operations through a connection the user has selected and approved. No provider request occurs merely from entering configuration fields. There is no fallback from local to remote inference.

The model worker asset gate allows GET/HEAD on approved asset hosts only while the user-requested download is running. Credentials are omitted and referrers suppressed. Outside this window remote fetches are rejected, including cache misses on “Load from device.” Generation closes the gate before processing text. A failed local model never invokes a remote service.

WebLLM uses its browser caches. Embeddings use the `storied-embeddings-v1` cache. Model deletion removes the selected model’s assets; it does not delete projects. App cache updates clean old static assets separately. Models must be loaded again after a page reload; that uses cached assets without reopening network access.

## Browser storage

Optional rulesets and mechanical snapshots live inside each project. Importing, inspecting, enabling, calculating supported derived values, and editing them use no network or AI. Rules are strictly validated data and cannot select providers, access credentials, run code, or relax visibility rules. Mechanical fields and check receipts are not sent to models in v0.9. Checks use browser cryptographic randomness locally; no dice service, AI request, or telemetry is involved. Original example definitions are public static app assets cached for offline download. Complete project exports preserve snapshots and definitions even after an installation is removed; removal disables use, not historical retention. See [rule layers and portability](RULES.md).

Optional practice history stores session intentions, dates, duration, word-count changes, and edit counts in the project. It stores no raw keystroke log or copied writing in its counters, makes no network request, and can be disabled, exported, or cleared independently in Progress. Conversation clips preserve the selected source text and attribution beside a manuscript scene; adapting one sends it only through an explicitly requested AI operation. See [practice and conversations](PRACTICE.md).

Manuscript runs, writing samples, approved voice profiles, exact specialist requests/responses, revisions, and canon approvals are saved locally and included in project exports. Sample import/paste makes no inference request. Analysis sends only the previewed excerpts to the explicitly selected destination; manuscript generation sends approved preferences, with sample excerpts separately opt-in. Samples never enter fictional canon or the world search index. Old run histories can retain excerpts even after their original sample is removed. See [manuscript context and recovery](MANUSCRIPT.md).

Field-assistance conversations remain in panel memory until closed; only text the author inserts reaches project storage. Its author-view compiler includes public story-bible context by default, with an explicit private-context choice. The selected field is always part of the requested input, even when it contains private notes. This does not change Play's character-view restrictions. See [field-assistance context and lifecycle](AUTHORING.md).

The optional `storied-theme` localStorage entry remembers a built-in color palette on this device. It contains no project text and is excluded from native exports. Changing themes makes no network request.

PGlite’s IndexedDB database contains original project data, graph/checkpoint projections, text documents, and derived vectors. App Cache Storage contains static files; separate model caches contain public model assets. localStorage contains the last-opened project ID and optional inference profile metadata. Keys use sessionStorage by default; persistent unencrypted localStorage is an explicit choice. Credentials are not part of projects, the database, or native exports. API responses use `cache: no-store`; the service worker does not cache provider responses. Default on-device operation requires no API credentials.

Site data belongs to an origin and browser profile. Clearing it, storage eviction, profile deletion, or changing domains can lose access. The storage manager offers `navigator.storage.persist()` and shows usage. Independent `.storyworld` exports are the portable recovery mechanism. Projects are not encrypted by Storied; device/browser access controls protect them. Authors should not mistake local-only storage for protection against another user of the same browser profile.

## Untrusted imports

Native imports pass a file-size limit, strict Zod schema, collection/field bounds, identifier uniqueness checks, referential validation, and acyclic parent ordering. Unknown model metadata, remote image URLs, executable fields, SQL dumps, future formats, and arbitrary extension data are rejected. Imported text is rendered by React as text. Nothing interprets project text as JavaScript, Python, HTML, or WASM.

Uploaded images are restricted to PNG/JPEG/WebP, decoded, resized, and re-encoded as local WebP. Native embedded images permit only raster data URLs. SVG imports are unsupported. The authored application SVG illustration is trusted static code.

The CSP disallows arbitrary scripts, unsafe JavaScript eval, external images/fonts, plugins, and form submission. `wasm-unsafe-eval` permits the bundled inference/database runtimes. Inline style attributes are allowed for local layout. Model runtime WASM is restricted to curated application model entries; project files cannot select executable assets. Production hosts should apply `_headers` (or equivalent) as well as the HTML CSP.

To support custom endpoints, the page's `connect-src` allows HTTPS and loopback HTTP. The explicit API transport validates endpoints, suppresses cookies/referrers, rejects redirects, bounds responses, and never retries automatically. The broader connection policy is not a defense against an already compromised same-origin script. Local model workers still enforce their separate asset-only gate. Provider error bodies are not logged or copied into projects because they may echo credentials or context. A verbatim API-key echo in normal output is redacted before storage.

## Scope of the privacy claim

The guarantee concerns Storied’s application behavior. Browser extensions, compromised operating systems, malicious modifications to the distributed app, and authors manually sharing exported files are outside that boundary. The deterministic compiler controls what goes into an inference request, while an LLM’s independent speculation remains fallible.

`tests/unit/network-policy.test.ts` verifies the worker gate. Production E2E tests monitor all routine application requests and require zero external requests during writing, worldbuilding, search, and project restoration. The offline tests use the production service worker, not a simulated demo response.
