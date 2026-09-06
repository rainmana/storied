# Practice and conversations

Version 0.7 adds local session history and a path from character conversations to manuscript scenes. World packs, game mechanics, sync, and executable extensions remain on the roadmap.

## Make time for a story

Use **Start a session** beside Write or Play, or open **Progress** for writing and worldbuilding practice. Name your intention and choose a time or net-author-word goal. Character conversations use a time goal, with ten minutes offered as a starting point. Progress begins at zero even if your manuscript already contains thousands of words.

Pause, resume, or finish explicitly. Time uses five-second checkpoints; the short interval since the last checkpoint may be absent when you pause, finish, or close abruptly. Two quiet minutes pause the session; select **Count quiet thinking time** when you want quiet time to count. Switching to another activity or putting the tab in the background pauses it. Reopening the app or importing a project leaves it paused. Suspended-device intervals are not credited.

**Progress** shows the last seven days and session history. A goal can be reached without accepting AI content or promoting any canon. Tracking is optional, local to each project, included in project backups, and independently exportable or deletable. Disabling tracking pauses an existing session; enable it again to resume.

Word figures describe changes in whitespace-delimited word counts per edit, not a full text diff. Equal-length revisions register an edit without increasing net words. Writing sessions count manuscript text; worldbuilding counts entity descriptions, notes, and attributes; conversations count accepted turns. AI suggestions accepted through Storied are tracked as assisted, including author-edited suggestions. Imported conversation passages and restored revisions are separate. Ordinary pasted text is treated as an author edit; Storied does not infer its authorship. Deleting text while manually editing is an author word-count decrease, even when earlier material was generated. These are descriptive session aggregates, not a provenance measure for every surviving word or a quality score.

## Talk with a character

In **Play → New adventure**, choose a starting mode:

- **Character interview:** you ask as the author; the model portrays the selected character using their permitted world knowledge. An imagined setting is optional. The interview is rehearsal outside the timeline, creates no episodic memories, and does not request canon extraction. Questions and hypothetical answers are not knowledge grants. Develop ideas deliberately in the world editor or manuscript canon review.
- **Staged scene:** choose who you play, the other participants, a location, and a situation. Outcomes stay on this adventure branch until separately reviewed.
- **World exploration:** continue the existing Do/Say/Story/Director workflow through encounters and choices.

The mode is fixed in the scenario snapshot; start a new adventure to change it. Every new workflow records the mode and author/player roles as an application boundary. This extends the existing MCW-inspired coordination; it does not establish model reliability or guarantee perfect characterization.

Use **Story** to write an exchange yourself without a model, or choose a storyteller and use **Say** to engage it. Existing prose instructions and editorial cues also apply to generated conversation. Character responses still require acceptance. Optional remote requests use the configured provider and the same explicit connection consent.

## Bring dialogue to the page

Choose **Bring to manuscript** after accepting a passage. The picker shows the current branch. Highlight individual lines and click **Keep selected text**, or **Use whole exchange**. For mixed dialogue/narration, select separate lines and check their speaker labels. The selected text remains exact; speaker labels are author annotations, not automatic attribution claims.

Choose a new scene or an existing destination:

- **Keep exact wording:** appends the selected text unchanged, with paragraph breaks between excerpts. Saves a manuscript checkpoint before insertion. No AI request is made.
- **Adapt into a scene:** saves the material beside the destination scene. Open the writing assistant, choose **Adapt a conversation**, and write your direction. Set viewpoint, participants, time, and voice in **Scene setup** as needed. Preview the request before generating. The existing separate writer, continuity, prose, and optional voice passes run; inspect/edit the suggestion and explicitly insert it.

Exact imports accept up to 8,000 selected characters; one adaptation accepts up to 4,000. Original excerpts, turn ranges, branch head, mode, and attribution survive export/restore. The inspector shows which source material was supplied to the model. An interview source does not automatically become a new scene's fictional history. The original conversation remains unchanged when you edit an adaptation.

Model reviews are bounded suggestions. They do not certify canon consistency or prose quality. Manuscript insertion never automatically changes the world; use the existing explicit canon review to establish any new story facts. Template NPC instantiation and reviewed promotion of an emergent NPC are future work.
