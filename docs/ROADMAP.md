# Development roadmap

Status: future scope, not a promise of implemented features or dates. Version 0.4 adds built-in color themes; narration, extension loading, and an in-app Help workspace remain future work.

Version 0.6 now includes the manuscript and voice-profile workflows described in [MANUSCRIPT.md](MANUSCRIPT.md). Next refinements can include richer manuscript navigation, continuously updated review decorations, more sample formats, and per-specialist model choices. Keep sample evidence, fictional canon, and agent authority separate as those surfaces grow.

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
