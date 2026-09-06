# Third-party notices

Dependencies keep their original copyright and license notices. `package-lock.json` pins the installed graph. Every production build collects installed runtime dependency license/notice files, together with Storied’s GPL text, into `dist/third-party-notices.txt`, also available offline. The generator includes some Node-only transitive packages conservatively. Review licenses again when changing dependencies or redistributing model weights.

| Component                                                                                                    | License / role                                        |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| React, React DOM, Zustand, Zod, Vite, Tailwind CSS, Radix UI, clsx, tailwind-merge, class-variance-authority | MIT                                                   |
| shadcn/ui patterns                                                                                           | MIT; locally owned, adapted components built on Radix |
| lucide-react                                                                                                 | ISC                                                   |
| PGlite, pgvector package                                                                                     | Apache-2.0 / PostgreSQL ecosystem notices             |
| WebLLM                                                                                                       | Apache-2.0                                            |
| Transformers.js                                                                                              | Apache-2.0                                            |
| ONNX Runtime                                                                                                 | MIT                                                   |
| DM Sans, Newsreader                                                                                          | SIL Open Font License 1.1; self-hosted fonts          |
| vite-plugin-pwa, Workbox, Vitest, Playwright, TypeScript, Prettier                                           | Their upstream permissive licenses (MIT / Apache-2.0) |

Optional Qwen 2.5 0.5B/1.5B and MiniLM model weights are separately downloaded and identified as Apache-2.0 in the fixed catalog. Their upstream model cards and redistribution notices remain authoritative. No weights are committed to this repository.

The transitive Node-only `sharp` package is overridden to version 0.35+ to avoid the advisory reported for older libvips distributions. It is not included in the browser inference path. Browser imports use the Transformers.js web bundle.

The Quiet Tide fiction in `src/domain/seed.ts`, the original coastal SVG, and the original Storied symbol are authored for this project and offered under CC0-1.0 as well as the repository license. No remote photos, fonts, proprietary product assets, or hosted design content are used.
