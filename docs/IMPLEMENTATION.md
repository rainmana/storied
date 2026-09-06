# MVP implementation ledger

The acceptance target is the vertical workflow in the supplied product brief: create a world and linked entities, keep a secret out of viewpoint context, play locally, review a generated draft, approve durable changes, reload offline, and round-trip the complete project.

Implementation sequence:

1. Static React PWA, validated versioned domain model, PGlite persistence, portable archive.
2. General world editor, relationships, explicit facts and viewpoint knowledge.
3. Opt-in WebLLM worker and local embeddings worker; no remote inference.
4. Branchable adventures, deterministic context, editable drafts, canon review.
5. Manuscript, timeline, relationships, local search, journal, maps.
6. Adversarial domain tests, production browser workflows, offline/restore checks, documentation.

No server, accounts, analytics, or project network endpoints. Runtime model downloads are separate from story processing. Verification results and known limitations are recorded in `VERIFICATION.md`.
