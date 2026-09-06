# `.storyworld` format, version 1

The native file is UTF-8 JSON, with extension `.storyworld` and top-level `schemaVersion: 1`. The executable schema is `src/domain/schema.ts`. `parseProject` is the single import boundary. An alternate diagnostic `.json` extension accepts the same format.

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

Search indexes, embeddings, model weights, model cache metadata, and application binaries are not project content. Restore reconstructs relational/text projections; embeddings can be rebuilt locally. Unaccepted generation drafts are transient and are not part of the editable archive until accepted. Summaries and episodic text are original branch data and are preserved.

Identifiers must be unique within each collection. A turn’s parent must precede it in the same adventure’s array; cycles and missing parents are rejected. Entity, fact, asset, participant, and memory source references are checked. Import is all-or-nothing. An ID already present in the library is imported as a new project ID with an “imported copy” title, preserving the existing world.

The MVP project limit is 32 MiB, including embedded images. Edits that would exceed it are rejected before changing the saved world, so this version never writes a project it cannot export and restore. Exports use compact JSON. Individual prose fields are limited to 500,000 characters. Large project splitting, streaming archives, compression, external asset packages, and format negotiation are future work.

A transitional `{ "format": "storied", "version": 0, "project": <version-1-project> }` envelope is accepted and unwrapped. No other migration is inferred. A future schema version fails closed with an explanation. Database schema migration 1 creates idempotent local tables and records its version; database files are never accepted from users.

Exports contain plaintext creative content. GPL licensing of the application does not change the copyright or license of the exported story. Markdown/plain text exports include manuscripts only; use `.storyworld` to preserve the complete world.
