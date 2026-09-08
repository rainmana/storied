# ADR 0006: Author-initiated checks with saved receipts

Status: accepted for the requested v0.9 slice. Date: 2026-09-07.

The user approved a second reusable ruleset and one explicit check with history. AI narration of results is a separate later step. The Product Constitution and existing world, execution, knowledge, and canon boundaries remain in force. The incomplete projection/retrieval and execution-subgraph commitments recorded in ADR 0005 remain unchanged.

## Reuse before expansion

`public/rules/lantern-crossing.storysystem` is a separately authored original data file using the unchanged format-1 contract: Wayfinding, Supplies, and derived Footing. It imports into multiple worlds with independent state and can be downloaded offline from the app cache. It contains no world/entity IDs, code, dependencies, or new operations. Both examples were authored for this project; external creator usability has not yet been evaluated.

The concrete missing capability was a recorded outcome with an agreed resource cost. A single application operation meets that need without expanding the ruleset language. It computes one d6 plus a selected numeric attribute or one-hop derived value against an author-selected target. The author supplies the approach, success/setback stakes, and optional cost. Descriptions in the ruleset are suggestions, not executable check definitions.

## One explicit transaction

Setup and review draw no randomness and change no persistent data. **Resolve and record check** confirms the reviewed setup, records one die/result, and applies the optional attempt cost together through `store.mutate`. The cost applies on success or setback; that policy is visible before confirmation. This avoids an unfinished result/cost decision that could be abandoned after seeing the roll. Closing before confirmation changes nothing. A later attempt is another explicit check with its own receipt.

The preview pins project, adventure, material world revision, active system definition, branch head, scene time, and prior frame. Resolution rechecks those inputs, references, bounds, available resources, and history capacity before sampling. Repeat clicks on an old preview fail without another roll. Browser cryptographic randomness uses rejection sampling for an unbiased d6, with a finite failure bound. Randomness is not supplied by the model or an imported definition.

Validation succeeds before publishing a new frame. The existing save worker commits project JSONB and typed graph projections together and waits for IndexedDB durability. The app's existing saved/pending/error indicator remains the durability signal; the synchronous command is not a guarantee against a device failing before autosave finishes.

## Receipts, branches, and migration

Project format 6 adds optional `checks` to a mechanical frame. Migration from format 5 leaves existing definitions, activation, snapshots, and creative records unchanged. Older migrations remain supported. `.storysystem` stays at format 1 and existing exact-definition reinstall behavior is retained.

A receipt holds its method version, stable ID, source turn (or adventure beginning), author initiation timestamp, entity name at the time, approach/stakes/target/attribute/cost, complete before/after numeric values, die, modifier, total, and result. Its enclosing frame supplies the exact ruleset and scene-time anchor. New turns copy the frame and its receipts. Later checks or manual edits at an ancestor never rewrite descendants. Undo/redo and branch selection only select saved copies; they never execute a roll.

Imports validate math, costs, field types, entity references, receipt uniqueness, original source location, and continuous inheritance through parent snapshots. Repeated receipt IDs are allowed only as identical copies with the same adventure, system, and time. Manual field edits after a check are permitted; a receipt describes that check's before/after values, not necessarily the current sheet. This is not a complete ledger of every manual edit.

History has a limit of 100 receipts per system/time snapshot, in addition to the existing 32 MiB project limit. History is never silently trimmed. Shared immutable events may become worthwhile if real usage reaches these limits; the current slice reuses bounded snapshots. Existing state and history remain readable after disabling/removing an installation, without new calculation or network recovery.

## Authority and next step

Checks are author tools. They do not alter prose, canon, beliefs, knowledge, episodic memories, Journal, or manuscript text. The graph explicitly marks check receipts as non-canon. They are not included in model perception; ruleset text cannot relax visibility or choose providers. Recorded actor labels, dice, and timestamps in an editable imported file are provenance claims, not cryptographic proof or multiplayer anti-cheat.

The next bounded step is narration of an explicitly selected, accepted outcome using a dedicated permitted-context projection and the existing author review flow. It must distinguish mechanical result, authored stakes, fictional events, character perception, and canon promotion. Further check types, rule composition, automatic action selection, simulated parties, sync, and executable extensions remain deferred.
