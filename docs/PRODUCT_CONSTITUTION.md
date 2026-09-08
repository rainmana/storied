# Storied product constitution

## Storied is world-native and medium-agnostic

The durable creative object in Storied is **the world**.

It is not the novel, campaign, module, game, manuscript, journal, or Play session.

Those are different ways of **creating, experiencing, understanding, recording, and expressing the same living world**.

A creator may spend years with one world while moving fluidly among:

- world building
- journaling
- manuscript authorship
- interactive Play
- simulated or rehearsed Play
- real tabletop campaigns
- module/campaign authorship
- other future storytelling media

Storied must never require the creator to decide permanently what kind of project a world is.

A world is not intrinsically:

- a novel
- a campaign
- a game
- a module
- an interactive story

Those are projections, experiences, and authored works derived from or occurring within the same underlying world.

## The shared substrate

Conceptually:

```text
                         THE WORLD
                            │
          ┌─────────────────┼──────────────────┐
          │                 │                  │
       CREATE            EXPERIENCE          EXPRESS
          │                 │                  │
     World Builder         Play            Manuscript
       Journal          Rehearsal            Module
      Research         Live Table           Campaign
       Canon           Simulation          Other media
          │                 │                  │
          └─────────────────┼──────────────────┘
                            │
                     SAME LIVING WORLD
```

This is conceptual architecture, not necessarily literal UI navigation.

No workflow owns the world.

---

## First-class product surfaces — non-negotiable

The following remain first-class product capabilities:

- **World Builder / world bible**
- **Play / experiencing and rehearsing the world**
- **Manuscript / long-form writing and revision**
- **Journal / notes, discoveries, questions, reflection, and world-development records**
- **Practice / character conversations and creative exploration**
- existing canon, knowledge, relationships, timeline, provenance, branch, approval, review, and repair tooling

TTRPG mechanics, character sheets, encounters, campaign management, simulation systems, and future module-authoring features are **additive capabilities over the shared world model**.

They must not reorganize Storied around tabletop gaming.

An author who never uses RPG mechanics should be able to use Storied for years without being forced through RPG terminology or UI.

A DM/GM should be able to make campaign-oriented capabilities prominent and treat them as first-class tools.

Both people are working with the same kind of durable world.

---

## Personas are lenses, not data silos

Storied may eventually support workspace emphases such as:

- World Builder
- Author
- Player / Explorer
- DM / GM

These are **presentation and workflow lenses over the same portable world**, not mutually exclusive project types.

Do not create incompatible project silos such as:

- Novel Project
- Campaign Project
- Game Project

A world may become all of these things over its lifetime.

A DM can become an author.

An author can enter Play to understand a scene.

A novelist can use deterministic economics or a hard-magic system without ever running a tabletop campaign.

A GM can turn years of campaign history into a manuscript.

A world builder can create a playable module without writing a novel.

Changing workflow emphasis must never discard, irreversibly hide, or fork the underlying world state.

---

## Transitions must feel native, not like conversion

Moving among media and workflows should preserve continuity.

Examples:

- A DM who decides to write a novel about their party opens Manuscript and writes against the **same characters, chronology, conversations, relationships, events, discoveries, and world state** accumulated during play.
- An author can enter Play at any point to experience or test a scene without creating another project.
- A world builder can rehearse an adventure, keep useful discoveries, reject the rest, and later publish a module from the same world.
- A campaign can become fiction without flattening years of history into a generated summary.
- Manuscript prose can inspire changes to the world, but prose itself does not silently become canon.

The experience should feel like changing perspective on the same place, not exporting from one application mode and importing into another.

---

## DM → Author continuity

Preserve and strengthen the path from actual or simulated play into authorship.

Play, session, and rehearsal material should retain enough provenance that selected material can later become:

- manuscript scenes
- journal entries
- canonical world events
- module/campaign material

through explicit review and acceptance boundaries.

A recorded tabletop campaign should be capable of becoming a book about that party **without manually rebuilding its world, characters, events, relationships, or history**.

The Manuscript Studio remains an independent first-class creative environment.

It must **not** collapse into an “export Play transcript” feature.

Likewise, Journal remains a first-class world-development and reflection surface.

It must **not** collapse into DM session notes.

---

## Play is experiential, not inherently game-mechanical

Play is the interface through which a world becomes **experiential**.

The creator can cross into the world at any time.

Existing open-ended Play is a first-class feature and must always remain available.

Rules and crunch are optional.

A world may be:

- entirely narrative
- lightly constrained
- governed by a hard magic system
- governed by detailed physics
- economically simulated
- using survival/resource mechanics
- using D&D, Pathfinder, Cypher/Numenera, or another TTRPG system
- using several compatible systems together
- using a completely original homebrew system

**Crunch is a property of the world or active experience, not a property of Storied itself.**

Conceptually:

```text
PLAY

Freeform
   │
   ├── current Storied experience
   └── no mechanics required
        ↓ optional constraints

Assisted / soft constraints
   │
   ├── suggested checks
   ├── resources
   ├── magic/economy/physics guidance
   └── creator can ignore them
        ↓ optional constraints

Deterministic / hard constraints
   │
   ├── explicit state
   ├── validated outcomes
   ├── resource accounting
   ├── hard magic / physics / economy
   └── TTRPG-style resolution
```

The exact UX/mode names are not binding. The conceptual distinction is.

---

## Optional complexity must use progressive disclosure

When no rulesets are active:

- existing freeform Storied behavior remains clean and prominent
- RPG-specific controls do not clutter ordinary worldbuilding or writing
- Manuscript, Journal, World, Practice, and Play retain their existing identities

When rulesets are active or the user is working in a GM-oriented workflow:

- character sheets
- mechanical state
- checks/rolls
- encounters
- resources
- relevant campaign tools

may become prominent first-class controls.

The underlying world and authoring tools remain unchanged.

Complex internal rigor should enable a simpler surface, not force complexity onto the creator.

---

## Simulated experience is first-class

Storied must not require real human players for a creator to experience, rehearse, or stress-test a world.

Play should eventually support reliable simulated participants or inhabitants grounded in:

- identity
- personality
- goals
- actual knowledge
- beliefs
- temporal position
- branch position
- relationships
- prior experiences
- permitted world context
- optional deterministic mechanics
- provenance

A simulated participant must not receive omniscient author knowledge merely because it exists somewhere in the project.

The goal is not merely convincing roleplay.

The goal is coherent world interaction reliable enough that a sophisticated user — even an AI researcher — can inspect repeated behavior and wonder how continuity, knowledge boundaries, causal consistency, and long-lived character state are being maintained.

Achieve that through Storied's architecture:

- world graphs
- story/branch graphs
- execution/agent graphs
- explicit epistemic filtering
- temporal gates
- deterministic validation
- explicit authority
- provenance
- MCW-inspired coordination and repair

Do **not** attempt to create reliability by simply dumping the entire world into a larger prompt.

---

## Rehearsal / dry-run Play

A creator should be able to use Play as a simulation laboratory:

- What happens if the party ignores this clue?
- What if someone approaches from another direction?
- What if the protagonists ally with the antagonist?
- Does this encounter actually work?
- Does the economy survive this pressure?
- Can this supposedly hard magic system be exploited?
- How does this NPC react if the player lies?
- What happens when a simulated party behaves nothing like the author expected?

These runs should naturally use branches, provenance, and explicit promotion.

A rehearsal should not silently become canon.

Useful discoveries may be deliberately kept.

The rest may remain hypothetical.

---

## Live Table is additive, not the product center

Storied should also be useful while running a real external tabletop campaign.

In that case real humans supply actions and outcomes while Storied can help:

- track mechanical/session state
- track world consequences
- preserve history
- maintain character knowledge
- surface relevant world information
- generate reviewable narrative/canon proposals
- later support manuscript or module creation from the campaign

This is a powerful secondary use of the same world machinery.

It must not redefine Storied as primarily a VTT or campaign tracker.

---

## Module and campaign authorship

Storied should eventually support authoring not only manuscripts, but playable modules and campaigns derived from a world.

A creator can:

```text
worldbuild
    ↓
enter the world
    ↓
rehearse / dry-run scenes and encounters
    ↓
discover what works
    ↓
promote selected discoveries or design changes
    ↓
author a module or campaign
    ↓
share it in human-readable and/or interactive form
```

Future module/campaign authoring may include:

- locations
- encounters
- NPCs/characters
- secrets and clues
- read-aloud descriptions
- GM notes
- likely approaches
- consequences
- ruleset dependencies
- assets
- branches/scenarios
- character knowledge boundaries

Do not reduce module authoring to a static transcript export.

It should eventually become another first-class way of expressing a world.

---

## Magic in experience; rigor underneath

The default user experience should feel simple and almost magical.

A creator should be able to do things like:

- **Experience this scene**
- **Rehearse this encounter**
- **Let a simulated party try this**
- **Bring this into the manuscript**
- **Keep this discovery**
- **Record this as world history**
- **Build an adventure from this**
- **Run this with my real table**

without needing to understand the graph machinery beneath it.

However, provenance, boundaries, source state, and decisions should remain inspectable for users who need them.

The model is not being asked to remember reality.

It should receive a carefully bounded perception of reality and be asked to inhabit it.

That distinction is fundamental.

---

## Autonomy is constitutional

Storied exists in part as a better, deeper, open-source alternative to products such as Campfire and AI Dungeon without requiring the creator to surrender ownership or ongoing access to their creative world.

These principles outrank convenience:

### The user owns the world

No Storied account should ever be required to create, experience, modify, export, or recover a world.

### Local is the default

Cloud inference is an optional computational resource a creator may explicitly bring to Storied.

It is not a prerequisite for the application to function.

### No subscription owns access to the world

If every AI company disappears tomorrow, the user's world still opens.

### Portable formats matter

Storied must not become an opaque database that traps somebody's creative life.

Exports should become more capable over time, not be treated as churn prevention.

### AI proposes; the creator decides

Generated prose, extracted operations, rules suggestions, and inferred facts do not gain authority merely because a model produced them.

### Installed systems do not own content

Removing or disabling a ruleset cannot delete the user's characters, prose, history, or world.

### Play never requires mechanics

Ever.

### No telemetry dependency

The application should not require surveillance of its users in order to exist.

### Providers are replaceable

No single AI vendor is structurally privileged as the permanent intelligence source for the user's world.

---

## The product in human terms

Storied can be incredibly complicated under the floorboards while feeling natural:

> I made a person.  
> I made a city.  
> I wrote about them.  
> I stepped inside.  
> Something happened that I hadn't thought of.  
> I decided it was real.  
> Years later, I wrote the book about it.

That is the product.

---
