import type { Project } from './schema'
export type SearchDoc = {
  id: string
  kind: string
  title: string
  body: string
  target: string
  tags: string[]
}
export function searchDocuments(p: Project): SearchDoc[] {
  return [
    ...p.entities.map((e) => ({
      id: e.id,
      kind: e.type,
      title: e.name,
      body: `${e.name}\n${e.aliases.join(', ')}\n${e.summary}\n${e.tags.join(' ')}`,
      target: e.id,
      tags: e.tags,
    })),
    ...p.entities
      .filter((e) => e.notes)
      .map((e) => ({
        id: `notes:${e.id}`,
        kind: 'Author note',
        title: `${e.name} · notes`,
        body: e.notes,
        target: e.id,
        tags: e.tags,
      })),
    ...p.facts.map((f) => ({
      id: f.id,
      kind: 'Fact',
      title: `${p.entities.find((e) => e.id === f.subjectId)?.name} · ${f.predicate}`,
      body: f.object,
      target: f.subjectId,
      tags: [f.status, f.visibility],
    })),
    ...p.knowledge.map((k) => ({
      id: k.id,
      kind: 'Knowledge',
      title: `${p.entities.find((e) => e.id === k.entityId)?.name} ${k.stance.replace('_', ' ')}`,
      body: k.claim,
      target: k.entityId,
      tags: [],
    })),
    ...p.relationships.map((r) => ({
      id: r.id,
      kind: 'Relationship',
      title: `${p.entities.find((e) => e.id === r.from)?.name} ${r.label} ${p.entities.find((e) => e.id === r.to)?.name}`,
      body: r.description,
      target: r.from,
      tags: [r.label],
    })),
    ...p.scenes.map((s) => ({
      id: s.id,
      kind: 'Manuscript',
      title: s.title,
      body: s.text,
      target: s.id,
      tags: [s.book, s.chapter],
    })),
    ...p.adventures.flatMap((a) =>
      a.turns.map((t) => ({
        id: t.id,
        kind: 'Adventure',
        title: a.title,
        body: `${t.input}\n${t.text}`,
        target: a.id,
        tags: [t.intent],
      })),
    ),
    ...p.memories.map((m) => ({
      id: m.id,
      kind: 'Memory',
      title: 'A remembered moment',
      body: m.text,
      target: m.adventureId,
      tags: [],
    })),
    ...p.events.map((e) => ({
      id: e.id,
      kind: 'Timeline',
      title: e.title,
      body: `${e.date} ${e.description} ${e.consequences}`,
      target: e.id,
      tags: [e.status],
    })),
    ...p.journal.map((j) => ({
      id: j.id,
      kind: 'Journal',
      title: j.title,
      body: j.text,
      target: j.id,
      tags: [j.kind],
    })),
  ]
}
export function textSearch(p: Project, query: string, type = 'All', tag = ''): SearchDoc[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  return searchDocuments(p)
    .filter(
      (d) =>
        (type === 'All' || d.kind === type) &&
        (!tag || d.tags.some((t) => t.toLowerCase().includes(tag.toLowerCase()))) &&
        words.every((w) => `${d.title} ${d.body} ${d.tags.join(' ')}`.toLowerCase().includes(w)),
    )
    .sort(
      (a, b) =>
        Number(b.title.toLowerCase().includes(query.toLowerCase())) -
        Number(a.title.toLowerCase().includes(query.toLowerCase())),
    )
    .slice(0, 60)
}
