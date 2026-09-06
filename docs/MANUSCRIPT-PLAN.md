# Manuscript studio implementation

Approved scope: expand Write with scene planning and ordering, cursor/selection assistance, editable world references, reversible passage edits, evidence-linked continuity/style/voice annotations, reviewed canon changes, and local writing-sample profiles. Preserve existing world, execution, and MCW-inspired coordination boundaries.

Implementation completed for version 0.6: all five stages below are represented in the application, guide, architecture decision, and release verification. See [the user guide](MANUSCRIPT.md), [ADR 0004](adr/0004-manuscript-and-voice-graphs.md), and [verification](VERIFICATION.md) for the actual scope and evidence.

Implementation sequence:

1. Add versioned project records and migration for voice evidence, manuscript runs, revisions, and canon receipts. Extend typed graph projections and reference validation.
2. Implement bounded, separate-context drafting, continuity, prose-rule, voice-review, and voice-analysis nodes. Persist exact requests/results before advancing. Require explicit resumption after interruption and resynchronization after source changes.
3. Extend Write with outline, scene setup, editor/review modes, specialist workflow controls, context inspection, history, editable references, and human-approved canon updates.
4. Add Your voice with TXT/Markdown imports and pasted samples from any topic, evidence-backed observations, profile editing/approval, and inspectable graph connections. Samples never enter fictional canon.
5. Validate graph authority, import/restore, grounding, stale-result rejection, cancellation, separate contexts, local/provider paths, annotation accessibility, and mobile editing. Document limits and deploy to storied.alecakin.com.

No claim of perfect prose classification, complete contradiction detection, or measured shared understanding. Deterministic checks enforce structure/authority. Probabilistic findings are source-linked editorial suggestions. Explicit author rules outrank inferred voice. No automatic canon change, silent network fallback, or automatic replay of uncertain model calls.
