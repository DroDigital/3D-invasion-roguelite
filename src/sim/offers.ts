import { PASSIVES } from '../data/passives';
import { PROGRESSION, RARITY_WEIGHT } from '../data/progression';
import type { UpgradeDef, WeaponDef } from '../data/types';
import { WEAPONS } from '../data/weapons';
import type { Rng } from '../core/rng';
import type { Build } from './build';
import type { Arsenal } from './weapons';

export type Offer =
  | { kind: 'weapon'; key: string; weapon: WeaponDef }
  | { kind: 'tier'; key: string; weapon: WeaponDef; slot: number; toTier: number }
  | { kind: 'passive'; key: string; upgrade: UpgradeDef; stacks: number };

interface Candidate {
  offer: Offer;
  weight: number;
}

/** Everything that could be offered right now, with its roll weight. */
function candidates(arsenal: Arsenal, build: Build, banished: ReadonlySet<string>, exclude: readonly string[]): Candidate[] {
  const out: Candidate[] = [];
  const push = (offer: Offer, weight: number): void => {
    if (!banished.has(offer.key) && !exclude.includes(offer.key)) out.push({ offer, weight });
  };
  if (arsenal.weapons.length < arsenal.slots) {
    for (const w of WEAPONS) {
      if (!arsenal.owns(w.id)) push({ kind: 'weapon', key: `w:${w.id}`, weapon: w }, RARITY_WEIGHT[w.rarity]);
    }
  }
  arsenal.weapons.forEach((w, slot) => {
    if (w.tier < 4) {
      push({ kind: 'tier', key: `t:${w.def.id}`, weapon: w.def, slot, toTier: w.tier + 1 }, PROGRESSION.tierWeight);
    }
  });
  for (const p of PASSIVES) {
    const stacks = build.stacksOf(p.id);
    if (stacks < p.maxStacks) push({ kind: 'passive', key: `p:${p.id}`, upgrade: p, stacks }, RARITY_WEIGHT[p.rarity]);
  }
  return out;
}

/** Rarity-weighted draw of up to `n` distinct offers. */
export function rollOffers(
  rng: Rng, n: number, arsenal: Arsenal, build: Build,
  banished: ReadonlySet<string>, exclude: readonly string[] = [],
): Offer[] {
  const pool = candidates(arsenal, build, banished, exclude);
  const out: Offer[] = [];
  while (out.length < n && pool.length > 0) {
    const i = rng.weighted(pool.map((c) => c.weight));
    out.push(pool[i].offer);
    pool.splice(i, 1);
  }
  return out;
}

/** Opening choice: pick one starting weapon from three. */
export function rollStartingWeapons(rng: Rng, n: number): Offer[] {
  const pool = WEAPONS.slice();
  const out: Offer[] = [];
  while (out.length < n && pool.length > 0) {
    const i = rng.int(pool.length);
    out.push({ kind: 'weapon', key: `w:${pool[i].id}`, weapon: pool[i] });
    pool.splice(i, 1);
  }
  return out;
}
