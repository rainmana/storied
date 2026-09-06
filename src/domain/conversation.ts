import { now, uid, type Project } from './schema'
import { branchPath } from './story'
import { conversationClipSchema, type ConversationClip } from './practice-schema'
import { checkpointScene } from './manuscript'

export function keepConversation(
  p: Project,
  input: Omit<ConversationClip, 'id' | 'createdAt' | 'sceneId'>,
  sceneId?: string,
) {
  const adventure = p.adventures.find((a) => a.id === input.adventureId)
  if (!adventure || !adventure.turns.some((t) => t.id === input.branchHeadId))
    throw new Error('Choose an existing conversation branch.')
  const path = branchPath(adventure, input.branchHeadId)
  if ((adventure.scenario.practiceMode || 'explore') !== input.mode)
    throw new Error('The conversation mode changed.')
  const length = input.excerpts.reduce((sum, e) => sum + e.text.length, 0)
  if (length > 8000 || (input.method === 'adapt' && length > 4000))
    throw new Error(
      input.method === 'adapt'
        ? 'Select up to 4,000 characters for one adaptation.'
        : 'Keep up to 8,000 characters at a time.',
    )
  for (const excerpt of input.excerpts) {
    const t = path.find((t) => t.id === excerpt.turnId)
    if (
      !t ||
      excerpt.end > t[excerpt.field].length ||
      excerpt.end <= excerpt.start ||
      t[excerpt.field].slice(excerpt.start, excerpt.end) !== excerpt.text
    )
      throw new Error('The selected text no longer matches its source. Select it again.')
    if (
      excerpt.origin !== (excerpt.field === 'input' || t.model === 'Author' ? 'author' : 'assisted')
    )
      throw new Error('The excerpt origin does not match the source.')
  }
  if (p.studio.clips.length >= 1000)
    throw new Error('Export a backup before adding more conversation clips.')
  let scene = p.scenes.find((s) => s.id === sceneId)
  if (sceneId && !scene) throw new Error('The destination scene is missing.')
  const destination = scene?.id || uid()
  const clip = conversationClipSchema.parse({
    ...input,
    id: uid(),
    createdAt: now(),
    sceneId: destination,
  })
  if (!scene) {
    scene = {
      id: destination,
      title: input.title,
      book: p.title,
      chapter: 'Chapter one',
      text: '',
      notes: '',
      entityIds: [
        ...new Set([adventure.scenario.characterId, ...adventure.scenario.activeEntityIds]),
      ],
      // An author interview is source material, never the scene's fictional history.
      adventureId: input.mode === 'interview' ? undefined : adventure.id,
      branchHeadId: input.mode === 'interview' ? undefined : input.branchHeadId,
      viewpointId: input.mode === 'interview' ? undefined : adventure.scenario.characterId,
      locationId: input.mode === 'interview' ? undefined : adventure.scenario.locationId,
      eventId: input.mode === 'interview' ? undefined : adventure.currentEventId,
      perspective: 'third',
      updatedAt: now(),
    }
    p.scenes.push(scene)
  }
  if (input.method === 'exact') {
    checkpointScene(p, scene, 'Before keeping conversation excerpts')
    const text = input.excerpts.map((e) => e.text).join('\n\n')
    if (scene.text.length + text.length + 2 > 500000)
      throw new Error('This scene has reached its text limit.')
    scene.text += (scene.text ? '\n\n' : '') + text
    scene.updatedAt = now()
  }
  p.studio.clips.push(clip)
  return clip
}
