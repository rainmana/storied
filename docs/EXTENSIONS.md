# A staged extension system

Version 0.8 implements a narrow **declarative ruleset** contract, documented in [RULES.md](RULES.md) and [ADR 0005](adr/0005-optional-declarative-rule-layers.md). This refines the earlier pack-first sequence: prove data validation and portable entity state before a broader reusable content format. Rulesets are reusable definitions; content packs are reusable creative material; `.storyworld` is the instantiated world. The remaining plugin/content-pack APIs below are proposals. No executable extension loader is implemented.

Status: design proposal, not an implemented plugin API. The core remains the authority over project integrity, secret visibility, persistence, and canonical changes.

Storied is a good candidate for extensions because it already separates structured world state, the context compiler, inference transports, and reviewable execution steps. The current TypeScript interfaces are internal implementation details, however. `GraphPorts` is not yet a stable public API, and entity types, panel kinds, and workflow nodes are closed schema enums. Arbitrary new kinds need a deliberate schema migration and fallback rendering; importing JavaScript is not currently supported.

## First: declarative packs

Start with validated packages of entity templates/custom fields, scenario starters, prompt presets, and theme token values. This is moderate work and makes the existing features shareable. It should precede third-party executable plugins. Packages should declare a stable ID, package/API versions, author, license, contributions, and dependencies. Import shows what will be added, checks bounds and supported versions, and provides a reversible operation. Imported prompt text remains model-visible instructions with no additional authority. Theme values should be validated colors/tokens, not arbitrary CSS with remote URLs or hidden UI rules.

Preserve project content when a pack is disabled or removed. Projects should contain the instantiated data and necessary descriptive metadata so they remain readable without the pack. A pack must not choose an API endpoint, import credentials, install code, or trigger network requests. Existing privacy and project validation remain in force.

## Then: code with narrow capabilities

A useful second stage could add exporters, read-only custom panels, advisory validators, and model/speech adapters. Start with one representative built-in module behind the proposed interface, test uninstall/recovery and version compatibility, and only then stabilize an external SDK.

Expose purpose-specific, immutable snapshots and application-mediated requests. An in-world plugin receives only the context the compiler already permits; an author-facing tool needs clearly disclosed access to broader project content. An extension can return a proposal or derived artifact, but cannot call the canon commit implementation, bypass review, replace database validation, read every browser secret, or silently send story text elsewhere. Model/provider adapters are more sensitive than presentation modules and deserve separate capabilities.

Running untrusted third-party code is a substantial platform/security project, not just dynamic imports. A same-origin Web Worker is useful for computation isolation but is not a sufficient permission boundary. Evaluate an isolated origin or sandboxed frame with a constrained, validated message protocol, resource bounds, narrowly mediated networking, and no direct host DOM/storage access. Do not combine script execution with same-origin privileges and call that a sandbox. The [browser sandbox documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox) explains the relevant distinction. This document does not assert that a sandbox has been implemented or audited.

## Core contracts that remain non-negotiable

- The context compiler owns temporal, branch, and epistemic visibility.
- Extensions propose; deterministic validators and the author authorize durable world changes.
- Checkpoints, undo/recovery, and native exports continue to work when a plugin is absent or fails.
- Credentials remain outside project files and are not handed to unrelated extensions.
- Network access is explicit and scoped; an installed plugin cannot silently relax the local-first default.
- API versions, compatibility tests, and deprecation/migration policy exist before promising an ecosystem.

Suggested order: stabilize the writing/provider workflows and backup UX; add declarative pack import/export; test one module boundary; then evaluate an executable SDK. A marketplace, automatic plugin updates, and arbitrary custom workflow nodes belong after those foundations.
