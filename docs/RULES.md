# Optional rule layers

Version 0.9 adds author-initiated checks to the optional rules workflow. World, Write, Journal, Practice, and freeform Play work without installing anything. Checks resolve one agreed attempt; they do not run an autonomous game or simulation.

## Try the reference system

1. Open **Settings → Optional rule layers → Download example ruleset**.
2. Choose **Import ruleset**, select the `.storysystem`, inspect it, and **Install in this world**. It starts disabled.
3. Enable **Small steps** in this world. Open Play, expand **Rules · Off**, and select it under **Rules for this experience**.
4. **Edit mechanical state** for an existing world entity. Save Resolve and Energy. Reach is Resolve + 2; Energy has a fixed capacity of 6 in this example.
5. Write a Story passage as usual. The new turn inherits a copy of the current state. Return to earlier turns or create another branch to explore alternatives.

Unsaved editor values are starting suggestions. Saving changes neither narrative entity fields, canon, character knowledge, prose, nor Journal. The storyteller does not see these values or apply these rules. You decide what happens and record changes explicitly. Canonical consequences still require existing author editing or canon review.

## Rehearse a crossing

In Settings, **Download Lantern crossing**, then import, enable, and activate it in Play. This is a separate original `.storysystem` using the same format as Small steps. The downloaded file works in any world; each installation has its own entity values. After the app finishes its initial offline cache, the download also works without a connection.

1. **Edit mechanical state**, choose an existing entity, and save its starting Wayfinding and Supplies.
2. **Make a check**. Describe an approach, choose Footing, and set target 6. Write what success and a setback would mean for this attempt.
3. Optionally choose Supplies and cost 1. This is an attempt cost, paid even on a setback.
4. **Review check** to inspect the formula, stakes, and resource balance before and after. Closing here changes nothing.
5. **Resolve and record check** accepts the reviewed cost and saves the result in one operation. Watch for **Saved on this device** before closing the app.

For example: “Follow Nera's channel markers.” Success could mean reaching the lantern before the path floods; a setback could mean finding another route. The app rolls one six-sided die, adds the chosen attribute or derived value, and compares the total with the target. The author chooses the target and stakes; the file's suggested setup is not an automated rule.

**Check history** retains the die, total, target, approach, selected stake, cost, before/after values, definition, source, and timestamp. Viewing or restoring a result never rolls again. A new attempt must be started explicitly and produces a new record. You can still manually edit your mechanical sheet later; past receipts retain the values at the time of their check.

The history is evidence for your rehearsal, not automatic fictional history. These steps neither write a passage nor teach a character anything. AI narration of selected outcomes is deferred. You can continue writing a Story passage with the current tools.

## Time, branches, and recovery

State belongs to the adventure, branch position, and selected scene time. Changing time does not simulate elapsed time or move numbers into the past. Each time has its own snapshot. New adventures start with mechanics off. Old turns without state start empty; editing an ancestor does not rewrite existing descendants.

Check receipts travel with copied state when a new turn is accepted. A later check at the beginning cannot appear retroactively in an existing child branch. Switching branches or using undo/redo selects the stored outcome and resources. A changed world, branch, time, active system, or prior state invalidates an open check preview; reopen it before resolving.

Selecting **Off**, disabling, or removing a ruleset preserves saved values and their full definition. **Saved mechanical snapshots** remains readable when an installation is missing. Derived values are unavailable until the exact definition is installed, enabled, and active at that time. Re-enabling or reinstalling does not activate it for you.

Previously recorded check totals remain readable while inactive, because they are saved results. No new roll or derived-value calculation is performed to display them. Imports validate their arithmetic and resource changes even when the installation is missing. Imported provenance is not authenticated.

Autosave, reload, offline access, and `.storyworld` export/restore include definitions, bindings, activation, entity references, time anchors, and values. Each rule can be exported separately as `.storysystem`. No account, registry, key, or network request is needed. A different definition/version cannot silently reinterpret existing state; upgrades are deferred.

## Data format

`.storysystem` is UTF-8 JSON: `format: "storied-system"`, `schemaVersion: 1`, and required `id`, three-part numeric `version`, `name`, `description`, `author`, `license`, and `fields`. The downloadable reference is `exampleRuleSystem` in `src/domain/rules.ts`; its original content is CC0-1.0. Imported license/author fields are declarations, not verified ownership claims.

| Kind       | Required field data                                              | Behavior                                      |
| ---------- | ---------------------------------------------------------------- | --------------------------------------------- |
| `number`   | `id`, `label`, `kind`, `min`, `max`, `initial`                   | Author-edited bounded integer.                |
| `resource` | `id`, `label`, `kind`, `max`, `initial`                          | Current integer from zero to a fixed maximum. |
| `derived`  | `id`, `label`, `kind`, `operation: "add"`, `attribute`, `amount` | Numeric attribute plus a constant, read-only. |

IDs start with a lowercase letter and contain lowercase letters, digits, dots, or hyphens; reserved names are rejected. Dots are literal ID characters, not property traversal. A derived field refers only to a numeric attribute, not a resource or another derived field. Missing references, cycles, duplicates, reversed bounds, invalid defaults, and overflow fail validation.

Limits: 64 KiB per file; eight installed rulesets per world; 16 fields per system; field integers/derived outputs within ±1,000,000; 32 system/time snapshots per story position; 100 entities and 100 check receipts per snapshot; 32 MiB for the complete project. Check targets/totals allow the six-sided die's additional range through 1,000,006. History is never silently trimmed; export a backup and start a new adventure if its check limit is reached. Unknown fields, code, and general expressions are rejected. No `eval`, `Function`, dynamic code loading, shell command, or executable plugin runtime is added.

The file contract has one active ruleset per adventure, fixed capacities, and one-hop addition. The application now offers one d6-plus-attribute check with an optional resource cost. Other dice/check policies, general effects, arbitrary formulas, dependencies, composition, upgrades, model-controlled participants, and automatic state-to-canon promotion remain future work. See [ADR 0005](adr/0005-optional-declarative-rule-layers.md), [ADR 0006](adr/0006-author-initiated-check-receipts.md), and the [roadmap](ROADMAP.md).
