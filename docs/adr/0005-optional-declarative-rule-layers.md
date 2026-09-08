# ADR 0005: Optional rule layers over the same world

Status: accepted for the requested v0.8 slice. Date: 2026-09-07.

The [Product Constitution](../PRODUCT_CONSTITUTION.md) is durable product intent. The world remains the shared object. World Builder, Play, Manuscript, Journal, Practice, and canon/knowledge tools remain first-class. Rules do not create new project types or replace an existing workflow.

## Findings from actual runtime paths

`store.mutate` clones the Project, validates exportability, advances its material revision, and schedules a save. The PGlite worker strictly validates the complete snapshot, writes JSONB and derived projections in one transaction, and awaits IndexedDB durability. Boot/import use `parseProject`; native exports use `serializeProject`. This remains one writable authority, with no rules database or registry.

Play uses `startAdventure`, `addTurn`, `forkAt`, undo, and redo. Narrative acceptance calls `addTurn`; generated output never supplies a store or mechanical mutation operation. Canon commits retain proposal/review/approval. The Play, manuscript, and field context compilers select explicit source fields instead of serializing arbitrary Project data. Journal continues editing notes and questions; Manuscript remains an independent scene editor and specialist workflow. Practice and conversation clips retain their existing source and acceptance boundaries.

Two accepted-ADR discrepancies remain: runtime retrieval walks Project arrays while `world_nodes` / `world_edges` are transactionally persisted and indexed; `AdventureTurnGraph.subgraph` mostly records intended grouping while the node table, switch, and runner enforce execution. These are incomplete realizations of ADR 0001, not deletion candidates. This slice preserves both and adds typed mechanical projections through the existing save path. A future retrieval change should demonstrate epistemic, temporal, and branch-filter parity before replacing current behavior.

No Product Constitution conflict blocks this slice. Live-table, simulated-party, richer Journal source links, and module authoring remain incomplete future capabilities. They are not represented as new project categories.

## Minimal format and authority

Project format 5 adds installed `ruleSystems` and optional mechanical snapshots at adventure beginnings and accepted turns. A strict JSON definition has a stable ID, version, author, license, and at most 16 fields: bounded integer attributes, current resources with fixed maxima, or a named numeric attribute plus an integer constant. Code, arbitrary expressions, unknown keys, and derived-to-derived dependencies are rejected. One-hop lookup makes definition order irrelevant and cycles invalid by construction.

Import previews a definition and installs it disabled. World enablement and adventure activation are separate explicit actions. One system can be active in an adventure at a time. Multiple installed systems remain separately named, avoiding invented conflict or load-order semantics. Composition, dependencies, upgrades, and dynamic capacities require later designs.

Mechanical facets reference existing entity IDs without changing `EntityType` or narrative custom fields. Values are author-facing working state; they do not enter model context, search, canon, or beliefs in v0.8. Human saves validate the current project, definition, branch head, scene time, prior snapshot, numeric bounds, and references. They use existing direct-author authority, not a fake model approval. Recorded actor/timestamps describe edits, not cryptographic authentication of imported files.

Material rule changes advance the existing world revision conservatively. In-progress AI work must resynchronize through existing stale-state checks. No new agent, execution graph, or expression runtime is needed for a manual editor and one-hop arithmetic.

## Branches, time, and portability

A story position stores snapshots keyed by system and the selected scene event (or unspecified time). New accepted turns copy the parent's snapshots. Undo/redo and branch selection expose the corresponding copies; editing an ancestor cannot rewrite existing descendants. New adventures start without rules or state. Old turns without state do not retroactively inherit a newly edited adventure beginning.

Changing scene time selects a different snapshot; returning restores that time's values. This is a manual sheet with explicit anchors, not elapsed-time simulation. Re-editing a passage follows the existing new-branch behavior and inherits its parent's state. Edits preserve the latest author values at a position, not an append-only mechanical action ledger.

Snapshots contain their complete validated definition. Disabling/removing an installation clears its activation and keeps all snapshots and creative records. Missing installations are not fetched; saved labels, bounds, capacities, and values remain readable. Inactive/unavailable systems cannot calculate derived values or edit mechanics. Reinstall requires the exact saved definition; automatic reinterpretation under a new version is rejected.

Copying bounded snapshots reuses the existing source-preservation pattern. Its ceiling is the 32 MiB whole-world limit. If real campaigns make duplication costly, migrate to immutable shared definitions or mechanical events. Do not replace snapshots with unversioned mutable pointers.

## Next steps without a product pivot

Rules, reusable content, and instantiated worlds have different roles. `.storysystem` is implemented; `.storyworld` remains complete. A future `.storypack`, simulated/rehearsed participants, live table, and module/campaign authoring remain proposals. Workspace personas may change presentation, never partition or convert the world.

The smallest reusable-system next step is to test a second independently authored data file against this contract and identify one concrete missing operation. The smallest TTRPG next step is one explicitly initiated bounded check with recorded inputs/outcome and branch-scoped resource changes, separate from canon promotion. A roll is not an approved world event. Do not build a universal language or commercial ruleset to prove it.

Future model participation needs a separate perception compiler and validated action proposals, respecting participant knowledge/beliefs, entity visibility, time, branch, provenance, and authority. The current model's ignorance of mechanical fields must not be mistaken for this future integration.
