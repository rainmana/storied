# `.storyworld` format, version 2

The native file is UTF-8 JSON, with extension `.storyworld` and top-level `schemaVersion: 2`. The executable schemas are `src/domain/schema.ts` and `src/domain/workflow-schema.ts`. `parseProject` is the single import boundary. An alternate diagnostic `.json` extension accepts the same format. Version-1 exports migrate additively without changing existing IDs or creative content.

| Field                                             | Preserved content                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `id`, `title`, `description`, `genre`, timestamps | Project identity and metadata                                                                                          |
| `entities`                                        | Types, descriptions, aliases, author notes, tags, attributes, canon/visibility, panel order, asset references          |
| `relationships`                                   | Directed typed connections, dates, description, confidence, visibility, provenance                                     |
| `facts`, `knowledge`                              | Explicit canon and separately attributed character accounts                                                            |
| `scenes`                                          | Books, chapters, scenes, Markdown, notes, entity references                                                            |
| `scenarios`                                       | Reusable starts, character/location, tone, perspective, instructions, companions                                       |
| `adventures`                                      | Scenario snapshots, all branches and accepted turns, exact context, annotations, bookmarks, summaries, head/redo state |
| `events`                                          | Chronology, dates, uncertainty, participants, consequences, canon and source                                           |
| `memories`                                        | Episodes tied to a character, adventure, and turn                                                                      |
| `proposals`                                       | Pending, accepted, and rejected durable change proposals with sources                                                  |
| `journal`                                         | Notes, questions, discoveries, accepted canon history                                                                  |
| `assets`                                          | Embedded raster data URLs and optional normalized map pins                                                             |
| `templates`, `settings`                           | User attribute templates, guiding instructions, writing goal                                                           |

Version 2 also preserves `worldRevision`, `workflows`, and `approvals`. Workflows include exact boundary records, separately derived interpretations, original model outputs and prompts, edited drafts, context provenance, node/authority traces, repair signals/history, and world/direction versions. Approvals retain the exact reviewed operation and resulting record IDs. Optional event order, temporal fact/relationship anchors, death consequences, knowledge discovery events, summary sources, and scene time extend existing records.

Search indexes, embeddings, model weights, model cache metadata, and application binaries are not project content. Restore reconstructs graph, checkpoint, relational, and text projections; embeddings can be rebuilt locally. Unaccepted generated drafts are now preserved at local checkpoints and included in native exports. Summaries retain source references; exact accepted narrative remains authoritative over derived excerpts. No saved execution node can automatically turn an imported proposal into canon: approval remains an explicit application action.

Identifiers must be unique within each collection. A turn’s parent must precede it in the same adventure’s array; cycles and missing parents are rejected. Entity, fact, asset, participant, and memory source references are checked. Import is all-or-nothing. An ID already present in the library is imported as a new project ID with an “imported copy” title, preserving the existing world.

The MVP project limit is 32 MiB, including embedded images. Edits that would exceed it are rejected before changing the saved world, so this version never writes a project it cannot export and restore. Exports use compact JSON. Individual prose fields are limited to 500,000 characters. Large project splitting, streaming archives, compression, external asset packages, and format negotiation are future work.

A transitional `{ "format": "storied", "version": 0, "project": <version-1-project> }` envelope is accepted, unwrapped, and migrated. Version 1 is upgraded to version 2 with empty workflows/approvals and initial revision zero; future schema versions fail closed. Database migration 2 adds graph nodes/edges and checkpoint projections alongside the original tables. The IndexedDB location is unchanged. Old application versions cannot read version-2 exports. Database files are never accepted from users.

Exports contain plaintext creative content. GPL licensing of the application does not change the copyright or license of the exported story. Markdown/plain text exports include manuscripts only; use `.storyworld` to preserve the complete world.
