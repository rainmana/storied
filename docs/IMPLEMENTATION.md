# MVP implementation ledger

The acceptance target is the vertical workflow in the supplied product brief: create a world and linked entities, keep a secret out of viewpoint context, play locally, review a generated draft, approve durable changes, reload offline, and round-trip the complete project.

Implementation sequence:

1. Static React PWA, validated versioned domain model, PGlite persistence, portable archive.
2. General world editor, relationships, explicit facts and viewpoint knowledge.
3. Opt-in WebLLM worker and local embeddings worker; on-device inference by default.
4. Branchable adventures, deterministic context, editable drafts, canon review.
5. Manuscript, timeline, relationships, local search, journal, maps.
6. Adversarial domain tests, production browser workflows, offline/restore checks, documentation.

Version 0.2 adds distinct world/execution graphs and durable coordination checkpoints. Version 0.3 adds explicit optional inference connections for OpenAI, Anthropic, OpenRouter, Venice, LM Studio, Ollama, and compatible custom endpoints. The selected connection supplies generation and extraction through the same human-reviewed workflow; embeddings remain local. See [provider setup](PROVIDERS.md) and [ADR 0003](adr/0003-optional-inference-providers.md).

No application server, accounts, analytics, or hosted project storage. Runtime model downloads are separate from story processing. Optional API calls go directly from the browser to the user-selected endpoint. Verification results and known limitations are recorded in `VERIFICATION.md`.
