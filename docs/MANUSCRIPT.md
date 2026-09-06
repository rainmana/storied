# Writing a manuscript

Version 0.7 connects Play conversations to Write. Use **Bring to manuscript** to keep selected wording exactly or prepare an adaptation, with original excerpts preserved beside the scene. [Practice and conversations](PRACTICE.md) covers character interviews, staged scenes, session goals, and source handling.

Open **Write** and use **Scene setup** beside the page title. Give the scene a purpose, choose its participants, viewpoint, setting, and time, and optionally select an existing adventure branch and a voice profile. Scene and chapter arrows control manuscript order. Markdown and plain-text exports follow the outline.

An adventure connection uses the branch head you explicitly chose; it does not follow whichever branch is later active in Play. Temporal facts require an ordered scene event. If time is unknown, restricted facts and discoveries are withheld. The assistant reports its omissions in the request inspector.

## Invite help into a passage

Open **Writing assistant**. Choose Start a scene, Continue at cursor, Explore dialogue, or Revise selection. Write a direction in your own words first. The operation uses the current cursor or selection. **Preview request** shows the context before anything is sent. Use Settings to select an on-device model or a previously configured API connection.

The writer returns a suggestion in a separate box. Selected reviewers then examine it in separate model calls. Edit the suggestion and choose **Insert chosen draft** when ready. Author edits to that box are not silently re-reviewed: the original model suggestion and your chosen version remain distinct in history. No suggestion changes world canon.

Use **Manuscript history** for explicit checkpoints and to restore the text from before an accepted suggestion or passage edit. Restoration first saves the current text. Ordinary typing autosaves the current document; it does not make a new historical version for each keystroke.

## Review the writing

Choose **Review passage** for selected text, or the whole scene if nothing is selected. Reviews are limited to 8,000 characters at once. The three layers are:

- **Story continuity:** possible conflicts with the supplied facts, relationships, timeline, and attributed beliefs. Findings must cite supplied world evidence.
- **Prose rules:** editorial suggestions based on the shared writing preferences. A small set of phrase and punctuation checks also works without a model through **Check prose rules locally**.
- **Your voice:** differences from preferences you have approved in the scene's voice profile. This step is skipped when there are no approved preferences.

**Show passage highlights** opens a review view of the exact text. Underline shapes and text labels distinguish layers without relying on color. Click a highlight to inspect its evidence, edit the passage, dismiss the finding, or record an intentional choice such as a lie or unreliable narration. Highlights are not live background spellchecking; changing text or relevant sources invalidates the old pass.

The shared prompts and prose reviewer adapt the requested [Wikipedia writing cues](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) into editorial preferences: concrete language, restrained rhetoric, varied sentences, and no assistant or reference artifacts. This is not an authorship detector. The article itself cautions that its observations are context dependent. A model may still overlook or introduce a problem; review remains the author's decision.

## Change the world deliberately

From a continuity finding, choose **Propose canon update**. You can also select an authored passage and choose **Bring selected detail into world**. Add a fact, a world entry, or a timeline event. Enter the proposed text and your reason, preview the change, inspect any structural graph findings, then approve.

Correcting an existing fact retains its prior text as a deprecated record. A change taking effect at a dated event instead closes the previous fact's validity interval and establishes the new fact from that event. The approval keeps the manuscript passage, prior record, new record, reason, and source review. Other scenes may need another review. Drafting and reviewing agents have no canonical write authority.

Type `@` to link an entry, or use the scene's reference cards. You can inspect and edit an entry's description, private notes, and attributes beside the manuscript, or open the complete entry in World. Those edits also invalidate old review contexts.

## Bring your own voice

Open **Your voice**, create a profile, then upload TXT/Markdown samples or paste text from any document. Samples can concern any topic. Each sample is limited to 100,000 characters; uploaded files must also be under 400 KB. DOCX and PDF extraction are not included in this release.

Importing or pasting does not invoke a model. **Preview analysis request** shows the bounded excerpts that **Analyze samples** will send to the displayed destination. The analyst proposes tendencies supported by exact excerpts. Edit, select, and save the preferences you want; rejected and provisional preferences do not guide generation. You can also add your own instruction. Choose the resulting profile in Scene setup.

**Explore the prose graph** shows profile → preference → supporting excerpt → sample connections. These are evidence links, not a numeric fingerprint or model training. Samples never become fictional facts. Manuscript assistance sends approved instructions; sending sample excerpts requires a separate checkbox. Removing a sample removes its profile analysis and supported preferences. Previously recorded manuscript requests can still contain excerpts that were sent earlier.

## Pauses, context, and privacy

Every specialist records its exact request, response, model, destination, and response contract locally. A reload does not replay a pending request. **Resume saved step** explicitly retries only the interrupted or failed node. It can repeat a provider charge if the earlier request completed remotely without a received response. **Stop** cancels the active request; late results cannot overwrite the author's text.

When the world, scene, branch selection, or voice profile changes, choose **Start with current sources**. This creates a new pass linked to the old one, preserving the original directions. Unsupported quotes, missing evidence, invalid structures, and context failures pause the workflow instead of advancing it.

Context is a bounded neighborhood of linked entries and relationships, not an exhaustive scan of an entire novel. Private evidence is off by default. Opting into private author review does not give a limited-viewpoint writer access to secrets unknown to its viewpoint. Omniscient narration has a separate perspective choice. Free-form world-entry private notes and attributes are excluded from compilation; represent reviewable assertions as explicit facts or deliberately supply needed information in the direction.

The on-device model has a 4,096-token context and a short output allowance. Local passes ask for one brief draft paragraph, or at most one finding or voice observation; API passes allow up to three findings or observations. Small models can fail structured or evidence-linked tasks. A context failure tells you what to shorten; there is no automatic remote fallback. API calls use the explicitly selected provider and its configured output-token policy. Multiple specialists use multiple calls to that same selected model, with distinct roles and contexts; per-role model routing is future work.

All samples, runs, evidence, revisions, and approvals travel in `.storyworld` backups. API keys do not. The total project limit remains 32 MiB; studio collections also have explicit bounds. Export regularly. Format-1 and format-2 projects migrate to format 3 without replacing existing writing or canon. Earlier app versions cannot read format-3 projects.
