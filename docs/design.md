# ORBITAL WATCH — design (approved 2026-11-11)

## Architecture

- **Sim / render split.** A deterministic 60 Hz fixed-step simulation owns all game state; the
  renderer only reads it. All randomness comes from `RunRng` (`src/core/rng.ts`), which fans one
  run seed out into named streams (waves, loot, shop, …) so a reroll never shifts the waves.
- **Struct-of-arrays pools.** Enemies, projectiles and particles live in preallocated typed arrays
  with free-lists (caps ≈ 600 / 2,000 / 8,000), drawn as one `InstancedMesh` per mesh archetype.
  No per-frame allocation in hot paths.
- **Earth-fixed frame.** Earth radius is 1; cities are static unit vectors. The visible spin is a
  single group rotation (`Earth.surface`).
- **Global weapons.** Targeting queries all enemies with a data-defined rule. Deployed models are
  cosmetic; a shot leaves from the emitter nearest its target, so there are no coverage gaps.
- **Content = tables + archetypes.** Code implements a small set of archetypes (fire kinds, alien
  roles, movement styles, effect ops). Everything else is data in `src/data/`, validated by tests.
- **Tags drive synergies.** Effects select what they modify with a `TagQuery`; only evolutions
  reference weapons by id.
- **Kit-built models.** A tier model is a data recipe of kit parts merged into one geometry.
- **Rendering.** Scene → 480-line target (width follows aspect) → bloom → optional dither/quantise
  → optional CRT → nearest upscale. Ships are vertex-lit with optional vertex snap / affine warp.
- **UI.** DOM overlay at native resolution, command-console style, no framework.
- **Run end.** Total population below 25% of the starting total.

```
src/core/    rng, geo, assets, loop, pools, events, save
src/sim/     cities, enemies, weapons, projectiles, targeting, waves, effects, abilities
src/data/    cities, weapons, evolutions, passives, relics, aliens, species, modifiers, waves, shop, abilities, commanders, kit recipes
src/render/  earth, starfield, orbit camera, pipeline, instancing, kit builder, particles, post, indicators
src/ui/      hud, level-up, shop, build panel, meta, settings
assets/      manifest.json, models/, textures/, audio/
```

## Data schema

```ts
type Rarity = 'common'|'uncommon'|'rare'|'epic'|'legendary';

interface WeaponDef {
  id: string; name: string;
  family: 'kinetic'|'laser'|'missile'|'tesla'|'gravity'|'drone'|'artillery';
  tags: Tag[]; rarity: Rarity; unlock?: string;
  deploy: 'satRing'|'platform'|'groundBattery'|'droneWing';
  fire: { kind: 'projectile'|'hitscan'|'beam'|'homing'|'chain'|'field'|'drone'|'ballistic' };
  targeting: { rule: 'nearestToCity'|'highestHp'|'lowestHp'|'abductorsFirst'|'fastest'|'densest'|'random';
               prefer?: AlienRole[] };
  tiers: [WeaponTier, WeaponTier, WeaponTier, WeaponTier, WeaponTier];
  evolvesWith: string[];
}
interface WeaponTier {
  damage: number; damageType: 'kinetic'|'energy'|'explosive'|'gravity';
  fireRate: number; targets: number; range?: number; projectileSpeed?: number;
  aoe?: number; chain?: { jumps: number; falloff: number }; pierce?: number;
  model: string;      // kit recipe id, unique per tier
  emitters: number;   // copies deployed around Earth
  fx: { projectile: string; muzzle: string; impact: string; sfx: string };
}
interface EvolutionDef { id: string; parents: [string, string]; result: WeaponDef; }

interface UpgradeDef {  // passives and relics
  id: string; name: string; kind: 'passive'|'relic'; rarity: Rarity; tags: Tag[];
  maxStacks: number; unlock?: string; effects: Effect[];
}
type Effect =
  | { op: 'stat'; stat: StatId; mode: 'add'|'mul'; value: number; where?: TagQuery }
  | { op: 'trigger'; on: 'kill'|'hit'|'waveStart'|'cityHit'|'levelUp'|'abilityUse';
      chance?: number; where?: TagQuery; do: ActionDef }
  | { op: 'rule'; rule: string; value?: number };
interface TagQuery { all?: Tag[]; any?: Tag[]; none?: Tag[] }

interface AbilityDef {
  id: string; name: string; cooldown: number;  // 45–120 s
  targeting: 'none'|'point'|'city'; action: ActionDef;
  source: { metaCost?: number; shopPrice?: number; shopWeight?: number };
  fx: string; sfx: string;
}

interface AlienDef {
  id: string; name: string; species: string;
  role: 'invader'|'destroyer'|'abductor'|'saboteur'|'carrier'|'boss';
  hp: number; speed: number; armor: number; shield?: number;
  movement: 'direct'|'swarm'|'spiral'|'strafe'|'blink'|'lumber';
  roleParams: Record<string, number>;
  model: string; scale: number; xp: number; salvage: number; threat: number; minWave: number;
}
interface SpeciesDef  { id: string; name: string; palette: string[]; gimmick: Effect[]; }
interface TierDef     { id: 'common'|'elite'|'champion'|'mythic'; hpMul: number; dmgMul: number;
                        modifiers: [number, number]; rewardMul: number; weightByWave: number[]; }
interface ModifierDef { id: 'shielded'|'splitting'|'regenerating'|'fast'|'explosive'; effects: Effect[]; fx: string; }
interface WaveDef     { wave: number; budget: number; species: string[];
                        roleWeights: Record<AlienRole, number>; boss?: string; }
```

## Assets

Sourced (CC0 / public domain / OFL): Earth maps (NASA), alien hulls and hero kit parts
(Quaternius, Kenney), hull textures (ambientCG), SFX and music (Kenney, Freesound CC0,
OpenGameArt), UI font. Coded: starfield, atmosphere, clouds (placeholder), shields, beams,
projectiles, particles, trajectories, indicators, post shaders, UI icons. See `CREDITS.md`
and `TODO-ASSETS.md`.
