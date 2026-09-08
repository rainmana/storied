# Optional rule layers

Version 0.8 adds a small manual rules workflow. World, Write, Journal, Practice, and freeform Play work without installing anything. This supports structured values, not automatic game or simulation resolution.

## Try the reference system

1. Open **Settings → Optional rule layers → Download example ruleset**.
2. Choose **Import ruleset**, select the `.storysystem`, inspect it, and **Install in this world**. It starts disabled.
3. Enable **Small steps** in this world. Open Play, expand **Rules · Off**, and select it under **Rules for this experience**.
4. **Edit mechanical state** for an existing world entity. Save Resolve and Energy. Reach is Resolve + 2; Energy has a fixed capacity of 6 in this example.
5. Write a Story passage as usual. The new turn inherits a copy of the current state. Return to earlier turns or create another branch to explore alternatives.

Unsaved editor values are starting suggestions. Saving changes neither narrative entity fields, canon, character knowledge, prose, nor Journal. The storyteller does not see these values or apply these rules. You decide what happens and record changes explicitly. Canonical consequences still require existing author editing or canon review.

## Time, branches, and recovery

State belongs to the adventure, branch position, and selected scene time. Changing time does not simulate elapsed time or move numbers into the past. Each time has its own snapshot. New adventures start with mechanics off. Old turns without state start empty; editing an ancestor does not rewrite existing descendants.

Selecting **Off**, disabling, or removing a ruleset preserves saved values and their full definition. **Saved mechanical snapshots** remains readable when an installation is missing. Derived values are unavailable until the exact definition is installed, enabled, and active at that time. Re-enabling or reinstalling does not activate it for you.

Autosave, reload, offline access, and `.storyworld` export/restore include definitions, bindings, activation, entity references, time anchors, and values. Each rule can be exported separately as `.storysystem`. No account, registry, key, or network request is needed. A different definition/version cannot silently reinterpret existing state; upgrades are deferred.

## Data format

`.storysystem` is UTF-8 JSON: `format: "storied-system"`, `schemaVersion: 1`, and required `id`, three-part numeric `version`, `name`, `description`, `author`, `license`, and `fields`. The downloadable reference is `exampleRuleSystem` in `src/domain/rules.ts`; its original content is CC0-1.0. Imported license/author fields are declarations, not verified ownership claims.

| Kind       | Required field data                                              | Behavior                                      |
| ---------- | ---------------------------------------------------------------- | --------------------------------------------- |
| `number`   | `id`, `label`, `kind`, `min`, `max`, `initial`                   | Author-edited bounded integer.                |
| `resource` | `id`, `label`, `kind`, `max`, `initial`                          | Current integer from zero to a fixed maximum. |
| `derived`  | `id`, `label`, `kind`, `operation: "add"`, `attribute`, `amount` | Numeric attribute plus a constant, read-only. |

IDs start with a lowercase letter and contain lowercase letters, digits, dots, or hyphens; reserved names are rejected. Dots are literal ID characters, not property traversal. A derived field refers only to a numeric attribute, not a resource or another derived field. Missing references, cycles, duplicates, reversed bounds, invalid defaults, and overflow fail validation.

Limits: 64 KiB per file; eight installed rulesets per world; 16 fields per system; integers/outputs within ±1,000,000; 32 system/time snapshots per story position; 100 entities per snapshot; 32 MiB for the complete project. Unknown fields, code, and general expressions are rejected. No `eval`, `Function`, dynamic code loading, shell command, or executable plugin runtime is added.

This first contract has one active ruleset per adventure, fixed capacities, and one-hop addition. Dice, costs/effects, arbitrary formulas, dependencies, composition, upgrades, model-controlled participants, and automatic state-to-canon promotion remain future work. See [ADR 0005](adr/0005-optional-declarative-rule-layers.md) and the [roadmap](ROADMAP.md).
