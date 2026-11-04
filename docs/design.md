# Bullet Storm Raiden — design decisions
## Step 1: Core feel (Zach, 2026-11-04)
- Tone: C — grim main story; stages swing between serious (Gradius) and silly (Parodius).
- Structure: B — Darius-style forks: choose a route at the end of each main level AND each sub-level; routes constantly change the flow, every playthrough different, high replayability.
- Length: custom — over 38 main levels, each with 3 sub-levels (114+ sub-levels). Target 24-31 hours to complete.
- DECIDED 2026-11-04: 24-31h = full completion (every route, ending, unlock) across many roguelite runs of ~1 hour each; dying is part of the loop. (Was asked: is 24-31h one single run through all levels, or full completion across many runs/routes? (My recommendation: ~45-75 min roguelite runs through a branching tree; 24-31h to see every route/ending/unlock.) Feasibility: 32 MB GBA cart fits it if levels are built from ~10-12 biome tilesets + seeded remixed layouts; needs battery save (SRAM/flash).

## Step 2: Story & endings (Zach, 2026-11-04)
- Premise: C Dream War — a kid's sci-fi daydream gone wrong; serious Gradius stages = the nightmare, silly Parodius stages = the dream fighting back.
- Carry-over: A Memory fragments — unlocked lore/dialogue persists across runs; each run reveals more.
- Endings: C 12+ — nearly every final route ends differently.
## Step 3: Power-ups & relics (Zach, 2026-11-04)
- Power meter (L cash-in): REVERSED hybrid — 7 slots: 1 slot the player chooses (fixed pick), the other 6 slots randomly rolled each run from a pool of power-ups, ship upgrades, game tweaks, and ship tweaks.
- Relics: A simple relics — stat boosts and weapon tweaks from bosses.
- Between sub-levels: C fork + shop + random events (dream merchant, nightmare gamble, etc.).
## Step 4: Ships, meta-progression, difficulty (Zach, 2026-11-04)
- Roster: C 10+ ships, full Parodius-style cast (jets to a battle penguin), nightmare + dream ships.
- Carry-over: C both — small permanent stat upgrades (dream coins) plus unlocks (ships, pool items, starting-slot choices).
- Difficulty: A modes, tuned: Easy = easy but a little challenging; Normal = perfectly normal; Hard = hard but not much harder than Normal; Extreme = adaptive but rough (message cut off at "rough diffu", read as rough difficulty).
## Step 5: Worlds, enemies, bosses (Zach, 2026-11-04)
- Worlds: C 16 worlds (nightmare + dream), each a bit shorter, together holding the 38+ main levels.
- Bosses: B mini-boss per sub-level + big boss per main level.
- Enemy feel: mix of B and C — remixed waves that shuffle per run/difficulty, escalating into dense DoDonPachi-style bullet hell on later routes.
## Step 6: Art, music, story presentation (Zach, 2026-11-04): "an overall mixture of A, B and C for all 3"
- Art: crisp 16-bit Gradius-quality sprites as the base (A), cartoony Parodius chunkiness on dream enemies/ships (B), palettes split by world: gritty dark nightmare vs bright pastel dream (C).
- Music (original chiptune): a theme per world + boss songs (A), built on shared leitmotifs with dream/nightmare versions (B), with dynamic dream<->nightmare switches at key story moments mid-stage (C).
- Story scenes: dialogue boxes with pilot portraits between levels (A), short pixel cutscenes at world ends (B), both together and at endings (C).
## Build plan
- Build 1 = vertical slice: engine, title, ship select (3 ships), World 1 main level with 3 sub-levels, Darius forks after each sub-level, 7-slot meter (1 chosen + 6 rolled), shop/event node, mini-bosses + main boss, relic drop, dialogue, 4 difficulties, SRAM save with dream coins. Then expand worlds/ships each round.
