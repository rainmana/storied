# Privacy by architecture

There are no accounts, project APIs, cloud databases, analytics, ads, telemetry, remote search services, or remote AI clients. Project identifiers are generated locally. No creative text is included in network URLs, request headers, request bodies, or referrers.

## Permitted network activity

1. Static HTML, scripts, CSS, fonts, artwork, and WASM runtimes from the installation origin.
2. Static application updates through a prompt-based service worker update.
3. Explicit model asset downloads from the application’s fixed catalog. Those requests contain public model asset identifiers only.

The model worker asset gate allows GET/HEAD on approved asset hosts only while the user-requested download is running. Credentials are omitted and referrers suppressed. Outside this window remote fetches are rejected, including cache misses on “Load from device.” Generation closes the gate before processing text. A failed local model never invokes a remote service.

WebLLM uses its browser caches. Embeddings use the `storied-embeddings-v1` cache. Model deletion removes the selected model’s assets; it does not delete projects. App cache updates clean old static assets separately. Models must be loaded again after a page reload; that uses cached assets without reopening network access.

## Browser storage

PGlite’s IndexedDB database contains original project data, relationship projections, text documents, and derived vectors. App Cache Storage contains static files; separate model caches contain public model assets. The only localStorage item is the last-opened project ID. No application secret or credentials are required.

Site data belongs to an origin and browser profile. Clearing it, storage eviction, profile deletion, or changing domains can lose access. The storage manager offers `navigator.storage.persist()` and shows usage. Independent `.storyworld` exports are the portable recovery mechanism. Projects are not encrypted by Storied; device/browser access controls protect them. Authors should not mistake local-only storage for protection against another user of the same browser profile.

## Untrusted imports

Native imports pass a file-size limit, strict Zod schema, collection/field bounds, identifier uniqueness checks, referential validation, and acyclic parent ordering. Unknown model metadata, remote image URLs, executable fields, SQL dumps, future formats, and arbitrary extension data are rejected. Imported text is rendered by React as text. Nothing interprets project text as JavaScript, Python, HTML, or WASM.

Uploaded images are restricted to PNG/JPEG/WebP, decoded, resized, and re-encoded as local WebP. Native embedded images permit only raster data URLs. SVG imports are unsupported. The authored application SVG illustration is trusted static code.

The CSP disallows arbitrary scripts, unsafe JavaScript eval, external images/fonts, plugins, and form submission. `wasm-unsafe-eval` permits the bundled inference/database runtimes. Inline style attributes are allowed for local layout. Model runtime WASM is restricted to curated application model entries; project files cannot select executable assets. Production hosts should apply `_headers` (or equivalent) as well as the HTML CSP.

## Scope of the privacy claim

The guarantee concerns Storied’s application behavior. Browser extensions, compromised operating systems, malicious modifications to the distributed app, and authors manually sharing exported files are outside that boundary. The deterministic compiler controls what goes into an inference request, while an LLM’s independent speculation remains fallible.

`tests/unit/network-policy.test.ts` verifies the worker gate. Production E2E tests monitor all routine application requests and require zero external requests during writing, worldbuilding, search, and project restoration. The offline tests use the production service worker, not a simulated demo response.
