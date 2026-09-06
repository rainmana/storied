# Development roadmap

Status: future scope, not a promise of implemented features or dates. Version 0.4 adds built-in color themes; narration, extension loading, and an in-app Help workspace remain future work.

Version 0.6 now includes the manuscript and voice-profile workflows described in [MANUSCRIPT.md](MANUSCRIPT.md). Next refinements can include richer manuscript navigation, continuously updated review decorations, more sample formats, and per-specialist model choices. Keep sample evidence, fictional canon, and agent authority separate as those surfaces grow.

Version 0.7 implements the first practice/conversation slice described in [PRACTICE.md](PRACTICE.md): real sessions with local history, interviews and staged scenes, exact conversation clips, and source-aware manuscript adaptation. Rewards, prose statistics, NPC instantiation, packs, mechanics, and sync remain future work.

## Proposed priorities

The following records the September 6 discussion as proposals, not approved implementation specifications. Prioritize one complete creative workflow over adding many separate workspaces.

1. Establish real writing sessions and connect character conversations in Play to manuscript scenes. Exercise that workflow with a sustained piece of writing.
2. Add contextual offline Help and a small declarative starter/world pack format. Build optional encouragement on the session history once its measurements are trustworthy.
3. Prototype offline merge early, before further persistence contracts harden. Select a production sync approach only after migration, recovery, and conflicting edits have been demonstrated.
4. Evaluate one small optional game ruleset, then broader rule packs. Executable extensions and long-form narration remain later phases.

Session history is a relatively small addition; a dependable dialogue-to-scene workflow and validated content packs are moderate features. Robust multi-device sync and a general TTRPG rules platform are substantial architectural phases. These relative estimates are not delivery dates.

## Writing sessions and optional encouragement

Implemented in 0.7: goals start at zero, with explicit start/pause/finish and local daily history. Word-count increases/decreases, net change, edit counts, and time follow a documented idle policy; quiet thinking time is an explicit choice. Known generated insertions and imports are separated without treating ordinary pasted text as evidence of AI authorship. Richer analytics and optional rewards remain proposals.

Goals can span Write, the world editor, and Play: write a passage, revise dialogue, develop a belief, or spend ten minutes talking to a character. A conversation goal measures practice time, not word output or model response speed. Separate out-of-story character interviews from events that happened in the fictional world. Aggregate activity stays local, can be disabled/exported/deleted, and needs neither an LLM nor a raw keystroke log.

Optional milestones should recognize revision, exploration, and returning to a project as well as new words. Avoid punitive streak loss, competitive rankings, or rewards for accepting AI text or changing canon. Begin prose statistics with word frequency, repeated phrases, and sentence lengths; evaluate parts of speech later with language support and uncertainty made clear. Measurements are descriptive, not a writing-quality score.

## Character conversations into manuscript scenes

Implemented in 0.7: a dedicated conversation-to-scene workflow with exact source clips and the existing specialist manuscript graph. Three starting modes are available:

- **Interview or rehearsal:** talk freely to a character as the author, or practice a conversation. This does not automatically become an in-world meeting or teach the character facts.
- **Staged scene:** choose participants, setting, time, the role the author will play, and a situation to explore in a what-if branch.
- **World exploration:** meet characters during an adventure, with branch history, viewpoint knowledge, and consequences carried forward.

Allow the author to select all or part of an exchange, check speaker attribution, and choose **Keep exact dialogue** or **Adapt into a scene**. Store the source adventure, branch head, turns, and selected text with the adaptation. Current turns can mix narration and dialogue; inferred speaker labels must be reviewable. Exact dialogue stays unchanged in the first mode, while optional surrounding prose supplies viewpoint, action, and pacing. Adaptation may propose changes to dialogue, with an inspectable draft and the original still available.

Reuse approved voice guidance and separate writing, continuity, prose-cue, and voice-review roles. Reviews need the selected source context and current permitted world context, not merely the existing short recent-turn excerpts. Author acceptance inserts manuscript text; canon changes remain a separate reviewable operation. A good conversation may yield one useful line, several scenes, or no manuscript text at all.

Preserve the declared MCW-inspired coordination boundaries: author intent, who is speaking/playing whom, current mode, relevant knowledge, branch scope, and explicit transitions. An omniscient author interview must not silently become a character memory. The framework organizes these decisions; its presence does not establish reliable characterization or perfect canon checking.

Still TODO: an encountered template NPC should become a distinct branch-local instance with a stable identity. Repeated encounters should reuse that instance; discoveries should enrich it without modifying every NPC created from the template. Offer a reviewed **Keep as a world character** operation with provenance and proposed facts. The current extraction flow does not yet create such new canonical entities automatically.

## Story starters and complete world packs — TODO

Extend the declarative [pack proposal](EXTENSIONS.md) to cover a small premise/scene starter through a complete playable world: characters, locations, relationships, attributed beliefs, secrets, timeline, scenarios, and optional NPC templates. A ready-made world should work for both an author exploring scenes and someone starting a solo campaign.

Start by creating a separate project from a pack. Preview scope, content/spoiler guidance, author, license, and compatible format versions. Give each installation its own identities while preserving internal references, source package/version, and attribution. Keep templates distinct from instantiated characters and adventures. Existing-project imports and pack upgrades need a later merge preview; neither may overwrite the author's canon or active campaign silently. Projects remain readable and editable after a pack is removed.

## Optional game mechanics and campaign-to-book writing — TODO

Explore a small deterministic rules module for dice, checks, hit points, inventory, conditions, and limited resources such as spell slots. Choose a modest initial ruleset; broad compatibility with arbitrary TTRPG systems is a separate effort. Rule packs need explicit versions, supported operations, and appropriate content licenses; do not assume permission to redistribute a commercial game's rules or world.

Separate rules state and adjudicated events from their prose presentation. The model proposes an action or narrates a validated outcome; application rules calculate and validate resource changes and record rolls. The reader can hide numbers while seeing their consequences. Under a selected rules mode, routine valid actions can update the adventure without an approval dialog for every roll, while promotion into shared world canon stays deliberate. Freeform play remains available without these mechanics.

Use the same conversation-to-scene workflow to adapt campaign events into fiction. Preserve the event source and distinguish an intentionally rewritten outcome from what occurred during play. Resolve disagreements about character knowledge, actions, or rules through a visible decision rather than letting narration silently rewrite state.

## Portable backups and multi-device sync — exploration TODO

Evaluate [Automerge](https://automerge.org/) as a candidate for offline edits that merge after devices reconnect. Its [repository API](https://automerge.org/docs/reference/repositories/) separates document changes from storage and communication adapters; an Automerge `Repo` is not a Git repository. This does not by itself supply Storied's GitHub, local Git, or Google Drive integration.

Keep two milestones distinct: saving versioned backups to a chosen destination, and merging independently edited projects. Explore a chosen-folder/Git adapter, a GitHub connection, and Google Drive as optional destinations. Browser folder permissions or a companion application, provider authentication, transport design, and recovery behavior need their own prototypes. Preserve concurrent versions/changes and merge through the document model; do not treat copying the live PGlite database or overwriting one shared `.storyworld` file as concurrent sync. A Git option should also offer readable exports for meaningful diffs.

Prototype with one scene and a few linked world entities edited in two disconnected browser profiles, then reconnect in both orders. Evaluate Automerge documents as the authoritative editable data and PGlite as rebuildable graph/search projections, rather than maintaining two independent writable authorities. Document granularity, text edit operations, cross-document references, format migration, history growth, and export/restore remain open decisions.

Automerge exposes [concurrent property conflicts](https://automerge.org/docs/reference/documents/conflicts/), and its [merge rules](https://automerge.org/docs/reference/under-the-hood/merge-rules/) establish data convergence. Application-level validity still needs deliberate handling: two offline edits can disagree about a death, or both spend the last spell slot. Preserve alternatives for author review or separate adventure branches; choose an explicit resource-authority policy before supporting concurrent game actions. A merged value must not silently count as an approved canon decision.

Acceptance for a production sync design should include offline editing, restart durability, interrupted transfers, edit/delete conflicts, duplicated delivery, recovery, and preservation of source evidence and knowledge boundaries. Replace assumptions that a single numeric revision identifies all relevant changes. Revalidate pending AI proposals against merged state, and never resume paid/model operations merely because their checkpoints arrived on another device. Keep provider keys and execution leases device-local. Make cloud sync opt-in, decide access/encryption and key recovery explicitly, and retain independent backups: synchronization also propagates deletions.

## Extensibility

Add validated template/scenario/theme packs before a third-party code runtime. A small pack system is moderate work; a stable executable plugin platform is a much larger effort involving capability boundaries, compatibility, and recovery. The [extension proposal](EXTENSIONS.md) identifies suitable contribution points and the authority that stays in the core. Stabilize the existing editing, provider, and backup paths before building an ecosystem.

## Docs and offline Help — TODO

Keep developer-facing architecture, privacy, setup, and verification docs current while behavior changes. Build the polished in-app **Help** section once the main creative workflows settle; it does not require waiting for every possible feature. Bundle searchable help with the static app so it works offline and matches the installed version. Reuse the repository's documentation as the source to avoid two drifting manuals.

Cover getting started, world/character knowledge, canon review, branches/checkpoints and recovery, backup/restore, model/provider setup, offline storage, keyboard shortcuts, themes/accessibility, and common errors. Add contextual links from Settings, failed provider requests, and repair checkpoints. Author a short guided first-world walkthrough, then update screenshots and long-form tutorials nearer release. Defer a hosted docs service or chat-based support agent unless a concrete need emerges.

## Later-stage narration

A dedicated **Narration** workspace is a useful addition for listening to prose, revising rhythm, and hearing adventures aloud. Prioritize dependable text-provider connections, recovery/backup, and the writing/review workflow first. Narration should follow as an optional presentation feature, with generated audio having no authority over text or canon.

## Suggested first slice

Read a selected passage or scene, choose a narrator voice, preview the exact text being sent, play/pause/stop, adjust playback speed, and download the audio. Begin with one speech provider plus a compatible custom speech endpoint, then add additional adapters. Keep speech provider/model/voice settings separate from the text storyteller so choosing one cannot silently change the other. Require explicit opt-in for remote speech and preserve the existing browser-held key policy.

Use a small speech port that returns audio and metadata. Keep audio blobs outside the primary project JSON and its 32 MiB archive limit; provide separate audio downloads initially. Key any disposable audio cache by the exact text, model, voice, and generation settings so editing prose cannot play stale narration. Retain bounded responses, visible failures, cancellation, and no automatic paid-request retries.

## Effort and sequencing

These are engineering estimates, not a delivery commitment. A single cloud provider with short-passage playback is moderate work, roughly several focused development days including browser/account validation. A polished chapter-length experience with chunking, resumable jobs, pronunciation controls, and multiple adapters is a larger phase. Fully local speech support adds runtime/model selection, download consent, caching, hardware performance, and licensing checks. Do a small device-tested prototype before promising broad local model compatibility.

[OpenAI Speech](https://developers.openai.com/api/docs/guides/text-to-speech) and [ElevenLabs text-to-speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) have dedicated audio APIs, so their adapters fit this design. Verify live browser/CORS access, account permissions, and provider retention choices before selecting the first production integration. OpenAI requires disclosure that its generated voice is AI-generated.

Hugging Face is a distribution/inference ecosystem, not a single interchangeable speech protocol. Evaluate a specific compatible model and runtime, hosted or local. Likewise, an Ollama or LM Studio text-model endpoint does not prove that a chosen server/version supports speech: verify an actual speech endpoint, or use a dedicated local TTS server. Browser speech synthesis is another possible convenience feature, but a system voice must not be advertised as guaranteed offline without verification.

Character casting, dialogue attribution, long-book rendering, and advanced voice direction belong after the first reliable narration slice. The text model registry and speech/voice registry should remain distinct.
