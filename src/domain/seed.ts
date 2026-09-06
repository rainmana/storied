import { newEntity, newProject, now, uid, type Project } from './schema'
import { startAdventure } from './story'

/** Original demonstration fiction, licensed CC0-1.0. */
export function createDemo(): Project {
  const p = newProject('The Quiet Tide')
  p.description = 'A coastal town. A lighthouse gone silent. And the things the sea gives back.'
  p.genre = 'Coastal mystery · A little magical realism'
  const mara = newEntity(
    'Character',
    'Mara Vale',
    'A cartographer returning to the coast after seven years away. She notices what others have learned to overlook.',
  )
  mara.fields = {
    Role: 'Cartographer',
    Pronouns: 'she / her',
    Desire: 'To understand why her brother stopped writing',
  }
  mara.tags = ['viewpoint', 'the coast']
  mara.notes =
    'Give her small, specific observations. She measures a room before she decides whether she feels safe in it.'
  const ivo = newEntity(
    'Character',
    'Ivo Senn',
    'The last keeper of the Ninth Lantern. A patient man with salt-white hair, ink-stained fingers, and a habit of answering questions with questions.',
  )
  ivo.tags = ['lighthouse', 'unfinished business']
  ivo.fields = { Role: 'Lighthouse keeper', Pronouns: 'he / him', Desire: 'To keep a promise' }
  const nera = newEntity(
    'Character',
    'Nera Moss',
    'A ferryperson who knows every channel through the tidal flats. She remembers the names of everyone who has crossed with her.',
  )
  nera.tags = ['the coast']
  nera.fields = { Role: 'Ferryperson', Pronouns: 'she / her' }
  const town = newEntity(
    'Location',
    'Bellwether',
    'A small town arranged around a horseshoe harbor. At low tide, an old road emerges from the water and leads toward a place absent from every map.',
  )
  town.tags = ['the coast', 'home']
  town.fields = { Region: 'The western coast', Atmosphere: 'Familiar, but changed' }
  const lantern = newEntity(
    'Location',
    'The Ninth Lantern',
    'A decommissioned lighthouse on the headland. Its nine windows look toward nine different stretches of sea. Only eight can be seen from outside.',
  )
  lantern.tags = ['lighthouse', 'mystery']
  lantern.fields = { Region: 'Bellwether headland', Atmosphere: 'Salt, silence, and old brass' }
  const flats = newEntity(
    'Location',
    'Glasswater Flats',
    'A silver stretch of tidal sand where the horizon seems unusually close. The safest way across is to follow someone who has done it before.',
  )
  flats.tags = ['the coast']
  flats.fields = { Region: 'Below Bellwether', Atmosphere: 'Wide, reflective, quiet' }
  const faction = newEntity(
    'Faction',
    'The Tidekeepers',
    'A loose association of navigators, fishers, and keepers. They maintain the channel markers and an archive of everything the sea has returned.',
  )
  faction.fields = {
    Purpose: 'Remember what the water changes',
    Influence: 'Quiet but considerable',
  }
  faction.tags = ['the coast']
  const key = newEntity(
    'Item',
    'The Brass Sounding Key',
    'A small brass key threaded on a faded blue cord. A tide mark is etched along one edge.',
  )
  key.fields = { Appearance: 'Warm brass, blue cord', Origin: 'The Ninth Lantern' }
  key.tags = ['mystery']
  p.entities = [mara, ivo, nera, town, lantern, flats, faction, key]
  const relation = (from: string, to: string, label: string) => ({
    id: uid(),
    from,
    to,
    label,
    description: '',
    status: 'Canon' as const,
    visibility: 'public' as const,
    knownTo: [],
    start: '',
    end: '',
    confidence: 1,
    provenance: { kind: 'author' as const, note: 'Starter world' },
  })
  p.relationships = [
    relation(mara.id, town.id, 'born in'),
    relation(ivo.id, lantern.id, 'cares for'),
    relation(ivo.id, faction.id, 'member of'),
    relation(nera.id, flats.id, 'navigates'),
    relation(lantern.id, town.id, 'overlooks'),
    relation(mara.id, nera.id, 'old friend of'),
  ]
  const secretId = uid()
  p.facts = [
    {
      id: uid(),
      subjectId: lantern.id,
      predicate: 'last lit',
      object: 'Seven years ago, on the night Mara left town.',
      status: 'Canon',
      visibility: 'public',
      knownTo: [],
      provenance: { kind: 'author', note: '' },
    },
    {
      id: secretId,
      subjectId: ivo.id,
      predicate: 'hidden promise',
      object:
        'Ivo extinguished the lantern deliberately to protect the people living beneath the tidal road.',
      status: 'Canon',
      visibility: 'private',
      knownTo: [ivo.id],
      provenance: { kind: 'author', note: 'Author-only secret. Mara has not learned this.' },
    },
  ]
  p.knowledge = [
    {
      id: uid(),
      entityId: mara.id,
      factId: secretId,
      claim: 'The lantern failed because no one could afford to repair it.',
      stance: 'believes',
      confidence: 0.85,
      source: 'What her brother wrote in his last letter',
    },
  ]
  p.events = [
    {
      id: uid(),
      title: 'The first channel is marked',
      date: '1882',
      approximate: true,
      description: 'The Tidekeepers place the first nine markers across Glasswater Flats.',
      entityIds: [faction.id, flats.id],
      consequences: 'A safe crossing becomes possible.',
      status: 'Canon',
      provenance: { kind: 'author', note: '' },
    },
    {
      id: uid(),
      title: 'The light goes out',
      date: '1917',
      approximate: false,
      description: 'The Ninth Lantern falls dark. The town learns to navigate without it.',
      entityIds: [lantern.id, town.id],
      consequences: 'Ships begin calling at the neighboring port.',
      status: 'Canon',
      provenance: { kind: 'author', note: '' },
    },
    {
      id: uid(),
      title: 'A letter without a map',
      date: '1924',
      approximate: false,
      description:
        'Mara receives an envelope containing a blue cord and a single sentence: Come before the neap tide.',
      entityIds: [mara.id],
      consequences: 'Mara returns to Bellwether.',
      status: 'Canon',
      provenance: { kind: 'author', note: '' },
    },
  ]
  p.scenes = [
    {
      id: uid(),
      book: 'The Quiet Tide',
      chapter: 'Chapter one',
      title: 'What the water remembers',
      text: 'The town was smaller than she remembered. Or perhaps she had spent seven years making it larger.\n\n@Mara Vale stood at the edge of the harbor with a suitcase in one hand and a letter in the other. The letter had arrived on a Tuesday. She had packed on Wednesday. By Thursday, she had run out of reasons not to come.\n\nAcross the water, @The Ninth Lantern waited in the pale morning light.\n\nEight windows. She counted them again. Eight.\n\nHer brother’s letter had mentioned nine.',
      notes: 'Open with a discrepancy small enough to dismiss, and specific enough to remember.',
      entityIds: [mara.id, lantern.id],
      updatedAt: now(),
    },
  ]
  const scenario = {
    id: uid(),
    title: 'A light across the water',
    characterId: mara.id,
    locationId: town.id,
    opening:
      'You arrive in Bellwether at low tide. The harbor smells of wet rope and rain. Nera Moss waits beside her ferry, holding a blue cord. “You came,” she says. “Good. We have a little time.”',
    tone: 'Intimate, curious, quietly uncanny',
    perspective: 'second' as const,
    instructions:
      'Begin at the harbor. Let the mystery unfold through observed details and conversation. Avoid immediate danger.',
    activeEntityIds: [nera.id],
  }
  p.scenarios = [scenario]
  p.adventures = [startAdventure(scenario)]
  p.journal = [
    {
      id: uid(),
      title: 'What is behind the ninth window?',
      text: 'A question to carry through the first chapter. Let the answer arrive through discovery.',
      kind: 'question',
      createdAt: now(),
    },
    {
      id: uid(),
      title: 'The feeling of this world',
      text: 'Salt on a windowsill. Letters kept in a biscuit tin. The way a familiar place becomes strange when you come back to it.',
      kind: 'note',
      createdAt: now(),
    },
  ]
  return p
}
