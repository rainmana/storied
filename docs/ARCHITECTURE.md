# Architecture

Storied follows a local-compute-web-app architecture: static assets, a browser UI, and browser-local computation and storage. A Vite preview server is a development convenience, not an application backend.

```mermaid
flowchart TD
  UI[React studio / Zustand] --> Domain[Zod-validated project operations]
  Domain --> DB[PGlite worker / IndexedDB]
  DB --> SQL[Project JSONB / relationship projections / documents]
  DB --> Vectors[pgvector derived index]
  UI --> Compiler[Deterministic viewpoint context compiler]
  Compiler --> LLM[WebLLM worker / WebGPU]
  LLM --> Draft[Editable draft]
  Draft --> Accept[Author accepts narrative]
  Accept --> Extractor[Local extraction role]
  Extractor --> Review[Author reviews proposed changes]
  Review --> Domain
  UI --> Embed[Transformers.js worker / CPU WASM]
  Embed --> Vectors
  Domain <--> File[Portable .storyworld file]
```

## Persistence and concurrency

`src/domain/schema.ts` is the versioned domain contract. A complete project is stored as JSONB; relationships and searchable documents are transactionally projected into relational tables. Search embeddings live in a separate table and must match the document’s current source text before retrieval. Restoring a project does not require embeddings.

The database worker serializes operations. The UI batches typing over 300 ms, maintains immutable snapshots, and uses monotonically advancing revisions so an older acknowledgement cannot claim a later edit was saved. Export uses the current in-memory project. Switching, deleting, or applying an application update flushes pending saves first. A failed save remains visible, with retry and export controls.

PGlite 0.5.8 requires an explicit `syncToFs()` after our transaction: the implementation commits before clearing its internal transaction flag. Storied awaits that durability barrier before displaying “Saved on this device.” This is covered by production reload tests.

A Web Lock protects the entire writable library. The MVP opens one editor tab per origin; a second tab gives a clear instruction instead of using stale snapshots to overwrite work. Multiple worlds coexist in the same local database. Importing an already-present project creates a separate copy. No raw SQL or database filesystem archive can be imported.

## Knowledge boundary

The author workspace is intentionally omniscient. The story context is not.

An entity has an in-world description and separate author-only notes/attributes. Only canonical entities visible to the viewpoint are candidates. Public visibility means information plausibly available in this fictional world; the author must mark exceptions private. Private entities/facts/relationships require explicit `knownTo` grants. Mere friendship, a matching search result, or membership in `activeEntityIds` never grants access.

Knowledge claims have their own stance and text. The compiler never dereferences a knowledge claim’s `factId` into a hidden correction. A character can believe the lighthouse failed from neglect without seeing that someone extinguished it deliberately.

Context selects instructions, current input, scenario opening, current character/location/companions, bounded branch history, relevant canonical facts, beliefs, visible relationships, and branch-owned episodic memory. Semantic retrieval returns only eligible entity IDs; the compiler reconstructs safe descriptions from structured state. It never copies raw search snippets. The exact compiled prompt is retained with each accepted turn.

The boundary guarantees exclusion of structured hidden data, not that an LLM cannot independently guess a secret. Authors can intentionally disclose information through scenario openings, instructions, or accepted narrative; those channels are visibly described as model-visible. Prompt instructions alone are not an access control mechanism.

## Adventures and promotion

An adventure snapshots its scenario. Turns form a parent-linked tree. The active head and redo stack are persisted. Undo changes the head; adding after undo creates a sibling branch. Editing a passage creates a new branch instead of rewriting its descendants. Summaries are bounded excerpts of the current branch, and episodic memories are constrained by adventure, viewpoint, and ancestry.

Narrative acceptance records prose and memory only. Extraction is optional and runs with a distinct local model role. WebLLM constrains its JSON output to a proposal schema with short handles for visible active entities; the app validates those handles and maps them back to existing IDs. A failed extraction adds no proposals. Schema-conforming prose can still be inaccurate and always requires human review. Reviewed events, facts, relationships, and knowledge are committed by explicit operations with narrative provenance. Conflicting facts coexist and are labeled “Possible contradiction”; there is no automatic retcon.

## UI and runtimes

React, TypeScript, Vite, Zustand, Tailwind, lucide-react, and local shadcn-style Button/Dialog primitives form the UI. Dialogs use Radix focus management and labeling. No UI operation needs AI to save creative work. Text, not HTML, is the manuscript representation; reading mode supports paragraphs, `##` headings, bold, italic, and entity mentions.

PGlite, WebLLM, and Transformers.js each run in separate dedicated workers. Model roles are distinct interfaces even when the same generative model supplies storyteller, worldbuilder, summarizer, and extractor. The current summary implementation is deterministic excerpting rather than generative compression.

Upstream references: [PGlite API](https://pglite.dev/docs/api), [WebLLM worker architecture](https://webllm.mlc.ai/docs/user/advanced_usage.html), [Transformers.js environment](https://huggingface.co/docs/transformers.js/v3.8.1/api/env).
