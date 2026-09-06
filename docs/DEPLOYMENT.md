# Cloudflare deployment

Production URL: **https://storied.alecakin.com**.

Storied uses Cloudflare Workers Static Assets, service `storied`, with **no server-side application module**, bindings, or remote database. The contents of `dist/` are served statically; browser workers and WASM execute on the visitor’s device. Application observability/logpush and workers.dev/preview URLs are disabled. The hostname is attached through a Workers Custom Domain with Cloudflare-managed TLS.

The initial deployment was authorized and performed through the connected Cloudflare account on 2026-09-05 (America/Denver). No repository push or external CI integration was configured. Deploying a new version is a separate action from editing local source.

## Redeploy

```sh
npm ci
npm run check
npm test
npm run build
npx wrangler@4 deploy
```

Wrangler must be authenticated to the account owning `alecakin.com`, using its normal local login or a scoped deployment API token. `wrangler.jsonc` contains the asset directory, SPA fallback, custom hostname, and observability settings. There is no application API key or secret in the browser bundle.

The connected Cloudflare API can also use the official [asset upload session flow](https://developers.cloudflare.com/workers/static-assets/direct-upload/): submit the manifest, upload requested buckets using the temporary asset-scoped JWT, and attach the completion receipt in multipart metadata. Include raw `dist/_headers` in `assets.config._headers`. Temporary receipts must never be committed. Use no `main_module` for this assets-only service.

## Headers and privacy

`public/_headers` supplies the CSP, no-referrer policy, MIME protection, disabled device capabilities, and service-worker update policy. WASM and worker files retain their correct content types. Version 0.3 permits HTTPS and loopback HTTP connections for optional browser-direct inference. The application requires an explicit connection choice before sending AI context; the broader CSP is a network permission envelope, not a per-provider consent mechanism. No provider proxy or server-side API secret is deployed. See [provider setup](PROVIDERS.md).

The `no-transform` cache directive prevents Cloudflare JavaScript Detection injection. A hostname-specific configuration rule disables automatic Web Analytics/RUM, Zaraz, and Rocket Loader for Storied. The app’s CSP remains strict; injected scripts are removed at the hosting layer instead of being allowed to execute.

A separate Cloudflare response-header rule removes `NEL` and `Report-To` **only for `http.host eq "storied.alecakin.com"`**, preventing browser network-error reporting to Cloudflare. Other hostnames are unaffected. Preserve this account-side rule when changing infrastructure; it is separate from Wrangler.

- Zone: `e2d7e138fee6a7c6bfc6beb4519b5b16`
- Custom domain: `3125e2163bc7a0099b856cc0eab468ea03c83226`
- Response-header ruleset: `d270bcbdc1784e8fa3c6dd66355d6fb2`
- Host-specific rule: `b9c324f7e40a4c599b14fedfd95a43ad`
- Configuration ruleset: `97e16fa216654a33838e7d5fa0fa2dd1`
- Script-injection configuration rule: `346e582d4e824580b4ff778a18b109f1`

Each build includes `storied-source-v0.7.0.zip`, a deterministic archive of the matching source, lockfile, build scripts, licenses, documentation, and original test fixtures. It excludes local credentials, `.git`, dependencies, build outputs, and deployment state. Settings links to the source download; it is not automatically precached.

## Verify the live origin

Verify the complete public asset manifest against the built files before starting offline browser tests. A successful deployment response can precede edge propagation: a fresh browser opened across that boundary can load the old application and precache a different release. During the v0.4 rollout, this caused one offline reload failure; all 57 assets subsequently matched. Keep the test browser online until the release has settled, then run the suite in fresh contexts. The app's offline-ready signal describes its completed cache, not a guarantee that a deployment is no longer propagating.

```powershell
$env:PLAYWRIGHT_BASE_URL = 'https://storied.alecakin.com'
$env:PW_CHANNEL = 'msedge'
npm run test:e2e
```

Set `LIVE_MODELS=1` to include real Qwen/MiniLM downloads and offline inference. Tests create projects only inside isolated temporary browser contexts. The origin override disables the local test web server. The workflow checks production hosting, CSP, app/WASM downloads, service-worker caching, local persistence, and offline restore.

Deployment evidence is recorded under `docs/verification/`. General feature verification and known limits are in [VERIFICATION.md](VERIFICATION.md).

## Moving from localhost

Browser storage belongs to an origin. Worlds created at `http://127.0.0.1:4173` remain there. Export `.storyworld` from localhost and import it at the production URL. Models must be downloaded/cached once for the new origin. Writing, retrieval, and loaded-model generation can work offline after the site reports readiness.

## Rollback

Keep the production origin stable to preserve access to local storage. Roll back the `storied` deployment to its previous asset version in Cloudflare, or rebuild and deploy the prior matching source. Reverting assets does not roll back browser project data; preserve format compatibility. Do not remove the hostname as a routine application rollback.
