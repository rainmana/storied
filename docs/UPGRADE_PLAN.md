# Incremental graph and coordination upgrade

Inspection completed before implementation, 2026-09-05 (America/Denver).

The existing application remains the foundation. No replacement database, remote service, agent server, or orchestration dependency is needed.

| Current implementation                                                                                          | Minimal target change                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.ts`: stable entity IDs, relationships, facts, separate knowledge, events, narrative provenance          | Preserve these records; add optional explicit temporal anchors and an indexed, derived world-graph view.                                      |
| `database.worker.ts`: transactional JSONB save, relationship/document projections, IndexedDB durability barrier | Keep the database and durability barrier; add graph and checkpoint projections in the same transaction.                                       |
| `Play.generate()` → semantic lookup → `compileContext()` → `completeLocally()`                                  | Wrap these functions in named, typed nodes with directed routes, authority declarations, and local checkpoints.                               |
| `Play.accept()` → `addTurn()` → `extractProposals()`                                                            | Keep narrative acceptance separate from canon; retain exact input, original output, edited acceptance, and retryable extraction state.        |
| `approveProposal()`                                                                                             | Retain deterministic operation implementations behind schema, references, current-version, branch, consistency, and explicit approval checks. |
| `canSee()` / `visibleEntities()` / `compileContext()`                                                           | Preserve the secret boundary; add temporal knowledge checks, graph traversal reasons, source references, and exclusion/budget diagnostics.    |
| `branchPath()` / `forkAt()` / undo/redo                                                                         | Keep the parent-linked tree; scope workflow state, inherited direction, and knowledge grants to the appropriate ancestry.                     |
| `possibleContradictions()`                                                                                      | Extend the existing advisory checks for explicit death, ownership intervals, and containment cycles; never silently repair fiction.           |
| Zustand snapshot autosave                                                                                       | Persist workflow boundaries alongside project data; flush meaningful checkpoints before model calls and after approvals.                      |

## Delivery sequence

1. Pin and read canonical MCW materials; document terminology and application extensions in ADRs.
2. Add backward-compatible project migration, world-graph queries, deterministic rules, and context provenance.
3. Add a small browser-only execution graph, coordination records, repair interrupts, and retry/resume behavior.
4. Connect the existing Play UI and canon review to these boundaries, including legible progress and repair controls.
5. Test world consistency, authority, coordination, persistence, and the existing vertical slice. Build and deploy only after verification.

## MCW source pin and scope

Canonical repository: <https://github.com/rainmana/mcw-framework>, revision `8365d220f2676f248c934e20f23e427e01cf3ce8`; framework label v0.2, Constitution v1.1 (July 2026 amendment). Read the overview, glossary, Constitution, diagrams, failure/repair mapping, system-prompt derivation, constitution-as-code builder guidance, test-bed guidance, governance pinning guidance, and the current downstream integration note.

The current canon explicitly leaves Constraint Opacity and Repair Suppression without designated canonical repair operations; its proposed additional operations remain extensions. Storied will use concrete application diagnostics and preserve the canonical five operation names. Its stored coordination state, operational IU records, routing heuristics, and repair UI are **MCW-inspired application extensions**, not the emergent MCW, a model capability, or a validated scientific instrument. No H/R/D/M scores are planned.

## Proportional scope

Implement the AdventureTurnGraph, a reusable validation/approval/commit subgraph, and repair routes. Keep entity creation and optional authoring assistance on their existing proposal-only path. Explicit world order is optional; unknown and approximate dates will not be coerced into a fabricated chronology. General natural-language contradiction detection and a generalized multi-agent runtime remain future work.
