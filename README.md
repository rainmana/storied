# Storied

**A world of your own.** A private, local-first writing and interactive storytelling studio.

**Live app:** [storied.alecakin.com](https://storied.alecakin.com). [Download the matching source](https://storied.alecakin.com/storied-source-v0.1.0.zip).

Build a world, write within it, and step inside as a character. Storied keeps structured canon separate from narrative, character beliefs, and the things only the author knows. A local storyteller can propose the next passage. You decide what to accept and what becomes part of the world.

![The Storied home workspace](docs/screenshots/home.png)

## Run locally

Use Node.js **22.12+** (Node 24 LTS recommended) and npm.

```sh
npm ci
npm run dev
```

For the installable, offline production app:

```sh
npm run build
npm run preview
```

Open the printed localhost URL. Choose **Create a world**, **Start writing**, **Start an adventure**, or **Explore The Quiet Tide**, the included original demo. No account or model download is needed to begin writing.

## What is here

- A composable story bible with 11 element types, custom attributes/templates, private notes, secrets, beliefs, relationships, images, and backlinks.
- A Markdown manuscript editor with books, chapters, scenes, word counts, focus mode, and `@` references that open contextual cards.
- Adventures with Do / Say / Story / Director intents, editable drafts, accept/retry, undo/redo, branches, bookmarks, annotations, and inspectable context.
- Explicit review of proposed facts, events, relationships, and character knowledge. Narrative acceptance never silently changes canon.
- Local text search and optional Transformers.js embeddings with pgvector retrieval, plus a timeline, relationship map, and world journal.
- PGlite in a Web Worker, persisted in IndexedDB; autosave, multiple projects, complete `.storyworld` import/export, and Markdown/plain-text prose export.
- An installable static PWA, locally bundled fonts/artwork, keyboard commands (`Ctrl/⌘ K`), and responsive layouts.

## Local AI

Open **Settings → Your local creative tools**. Choose an explicitly downloaded Qwen 2.5 model for WebGPU storytelling, or MiniLM for CPU-based semantic search. Cached models must be loaded into memory again after reopening. **Load from device** cannot fetch missing remote assets; use **Repair download** when online if a cache is incomplete.

The smallest storyteller is about 400 MB and needs roughly 1.1 GB of available graphics memory. Model quality varies: a small model can write weak prose or suggest inaccurate changes. Extraction uses constrained JSON and reference validation; failed extraction leaves canon untouched and offers manual proposals. There is no remote inference fallback.

The `Story` intent lets you author passages without any model. Test fixtures are never presented as AI generation.

See [local models](docs/LOCAL_MODELS.md) for hardware, downloads, roles, and troubleshooting. See [verification](docs/VERIFICATION.md) for what was actually exercised.

## Your work stays yours

The URL installs the application; the browser runs it; your device stores the world. There is no application server, hosted database, login, telemetry, or analytics. Runtime network access is limited to static application assets, updates, and user-requested model assets. Story text travels between browser workers, never to a remote inference service.

Wait for **Ready for offline use** after the first production launch. The static app/runtime cache is approximately 45 MB uncompressed, before optional models. Development mode does not install a service worker.

Browser storage is not a separate backup. Export `.storyworld` regularly. Clearing site data, deleting a browser profile, or changing the app’s origin can make a local library unavailable. Request persistent storage in Settings. The MVP uses a single editor tab per origin to prevent conflicting full-project writes.

## Tests

```sh
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The E2E suite uses isolated disposable projects. It checks create/connect/secret/context/author/commit, reload, offline operation, export/delete/import, writing/search, invalid imports, a second-tab lock, and mobile/keyboard interaction. It makes no model downloads by default. To use an installed Microsoft Edge locally, set `PW_CHANNEL=msedge` in your shell.

```powershell
$env:PW_CHANNEL = 'msedge'
npm run test:e2e
```

Source formatting: `npm run format` and `npm run format:check`.

The opt-in hardware test uses real Qwen/MiniLM downloads and disables browser networking before reloading and running both models. Set `LIVE_MODELS=1` to include it. See [verification evidence and instructions](docs/VERIFICATION.md).

## Deployment

The personal deployment uses Cloudflare Workers Static Assets with no server-side application module. Configuration is in `wrangler.jsonc`; see [deployment and live verification](docs/DEPLOYMENT.md).

Deploy only `dist/` on a static HTTPS host. There are no environment variables or API keys. Serve `.wasm` as `application/wasm` and `.mjs` as JavaScript. The current build targets an origin root (`/`); a subdirectory deployment needs the Vite base, PWA scope, asset paths, and CSP tested together. Preserve the same origin to retain access to existing browser data.

Use the example [static headers](public/_headers) when supported by your host. The HTML also supplies a restrictive CSP. `frame-ancestors` requires an HTTP response header.

## Project documentation

- [Architecture and boundaries](docs/ARCHITECTURE.md)
- [Privacy and security architecture](docs/PRIVACY.md)
- [Project file format](docs/PROJECT_FORMAT.md)
- [Local models](docs/LOCAL_MODELS.md)
- [Verification and MVP limits](docs/VERIFICATION.md)
- [Contributing](CONTRIBUTING.md), [code of conduct](CODE_OF_CONDUCT.md), [security policy](SECURITY.md)

## License

Storied is licensed **GPL-3.0-or-later**. See [LICENSE](LICENSE). Contributions are accepted under that license. The original _Quiet Tide_ demo fiction and original artwork may also be used under **CC0-1.0**. Your own stories and exports remain yours; using the application does not license your creative work under the GPL.

Third-party packages, fonts, and optional model weights retain their respective licenses. See [third-party notices](docs/THIRD_PARTY.md). No proprietary interface, assets, or implementation has been copied.
