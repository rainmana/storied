# Contributing to Storied

Help make a writing studio that respects authorship and works on the author’s device.

Use Node 22.12+ and `npm ci`. Run `npm run dev` for development. Before proposing a change, run `npm run format`, `npm run check`, `npm test`, and `npm run build`. Install a Playwright browser with `npx playwright install chromium`, then run `npm run test:e2e`. Production/offline behavior must be tested against the production preview, not Vite development mode.

Keep changes focused and describe the behavior they change, the reason, and how you verified them. Screenshots help UI reviews. Reproduce bugs in a small original test world; do not share someone else’s creative work without permission. The included Quiet Tide demo is CC0 and safe to use in tests.

## Design boundaries

- No application backend, account system, analytics, telemetry, remote AI, or remote story storage.
- Creative content cannot leave the device through a feature or dependency.
- Model downloads must be explicit, catalog-controlled, and separate from inference.
- Generated material is a proposal. Canon mutation must be an explicit author action.
- The character knowledge boundary is an access rule, not just a prompt instruction. Add adversarial tests for any context/retrieval change.
- Keep world concepts human-readable. Shared entity/template infrastructure is preferable to separate applications for every entity type.
- Preserve portable project data and validate untrusted inputs. Version formats intentionally; never infer a migration that might discard data.

`src/domain` owns pure data, context, and world operations. `src/lib` coordinates persistence and workers. `src/workers` owns database/inference compute. `src/pages` and `src/components` present the author’s workflow. UI changes should retain keyboard operation, visible focus, readable labels, responsive behavior, and reduced-motion support.

Contributions are made under GPL-3.0-or-later. Include provenance/license notes for any new dependency, font, artwork, demo text, or model. Follow the code of conduct and report vulnerabilities privately.
