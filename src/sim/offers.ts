import { PASSIVES } from '../data/passives';
import { PROGRESSION, RARITY_WEIGHT } from '../data/progression';
import type { EvolutionDef, Rarity, UpgradeDef, WeaponDef } from '../data/types';
import { BASE_WEAPONS, DEFAULT_START_WEAPONS, EVOLUTIONS, weaponById } from '../data/weapons';
import { UNLOCKS } from '../data/meta';
import type { Game } from './game';
import { FX_EVOLVE } from './game';
import { isMaxTier, updateEmitters } from './weapons';
import { DEFENSE_RULES, DEFENSES } from '../data/defenses';
import type { DefenseDef } from '../data/types';
import { defenseIsMax, resetEmitters } from './defense';

export type Offer =
  | { kind: 'weapon'; key: string; weapon: WeaponDef }
  | { kind: 'tier'; key: string; weapon: WeaponDef; slot: number; toTier: number }
  | { kind: 'passive'; key: string; upgrade: UpgradeDef; stacks: number }
  | { kind: 'evolve'; key: string; evo: EvolutionDef; result: WeaponDef; a: number; b: number }
  | { kind: 'overdrive'; key: string; weapon: WeaponDef; slot: number; level: number }
  | { kind: 'defense'; key: string; defense: DefenseDef }
  | { kind: 'defenseTier'; key: string; defense: DefenseDef; slot: number; toTier: number };

interface Candidate {
  offer: Offer;
  weight: number;
}

export function rarityWeight(g: Game, r: Rarity): number {
  const w = RARITY_WEIGHT[r];
  // Lucky Star flattens the curve so rare things show up far more often.
  return g.build.rules.has('luckyStar') ? Math.sqrt(w) * 10 : w;
}

/** Evolutions both of whose parents are owned at max tier (tier 4 with the catalyst relic). */
export function readyEvolutions(g: Game): Offer[] {
  const out: Offer[] = [];
  const ws = g.arsenal.weapons;
  const early = g.build.rules.has('earlyEvolution');
  for (const evo of EVOLUTIONS) {
    const a = ws.findIndex((w) => w.def.id === evo.parents[0]);
    const b = ws.findIndex((w) => w.def.id === evo.parents[1]);
    if (a < 0 || b < 0 || g.arsenal.owns(evo.result)) continue;
    const ok = (i: number): boolean => isMaxTier(ws[i]) || (early && ws[i].tier >= 3);
    if (ok(a) && ok(b)) out.push({ kind: 'evolve', key: `e:${evo.id}`, evo, result: weaponById(evo.result), a, b });
  }
  return out;
}

/** Everything that could be offered right now, with its roll weight. */
function candidates(g: Game, exclude: readonly string[]): Candidate[] {
  const out: Candidate[] = [];
  const push = (offer: Offer, weight: number): void => {
    if (!g.banished.has(offer.key) && !exclude.includes(offer.key)) out.push({ offer, weight });
  };
  const a = g.arsenal;
  if (a.weapons.length < a.slots) {
    for (const w of BASE_WEAPONS) {
      if (!a.owns(w.id) && !g.retired.has(w.id) && g.isUnlocked(w.id, w.unlock)) push({ kind: 'weapon', key: `w:${w.id}`, weapon: w }, rarityWeight(g, w.rarity) * 0.8);
    }
  }
  a.weapons.forEach((w, slot) => {
    if (!isMaxTier(w)) push({ kind: 'tier', key: `t:${w.def.id}`, weapon: w.def, slot, toTier: w.tier + 1 }, PROGRESSION.tierWeight);
    // Maxed weapons can be overdriven forever, each step a little weaker.
    else push({ kind: 'overdrive', key: `o:${w.def.id}`, weapon: w.def, slot, level: w.overdrive + 1 }, 22 / (1 + w.overdrive * 0.15));
  });
  const d = g.defense;
  if (d.modules.length < d.slots) {
    for (const def of DEFENSES) if (!d.owns(def.id)) push({ kind: 'defense', key: `d:${def.id}`, defense: def }, rarityWeight(g, def.rarity) * DEFENSE_RULES.newWeight);
  }
  d.modules.forEach((m, slot) => {
    if (!defenseIsMax(m)) push({ kind: 'defenseTier', key: `dt:${m.def.id}`, defense: m.def, slot, toTier: m.tier + 1 }, DEFENSE_RULES.tierWeight);
  });
  for (const p of PASSIVES) {
    const stacks = g.build.stacksOf(p.id);
    if (stacks < p.maxStacks && g.isUnlocked(p.id, p.unlock)) push({ kind: 'passive', key: `p:${p.id}`, upgrade: p, stacks }, rarityWeight(g, p.rarity));
  }
  return out;
}

/** Rarity-weighted draw of up to `n` distinct offers. Ready evolutions always come first. */
export function rollOffers(g: Game, n: number, exclude: readonly string[] = []): Offer[] {
  const out: Offer[] = readyEvolutions(g).filter((o) => !exclude.includes(o.key)).slice(0, n);
  const pool = candidates(g, exclude);
  while (out.length < n && pool.length > 0) {
    const i = g.offerRng.weighted(pool.map((c) => c.weight));
    out.push(pool[i].offer);
    pool.splice(i, 1);
  }
  // Until the first defense module is installed, every level-up from level 3 shows one.
  if (g.defense.modules.length === 0 && g.level >= DEFENSE_RULES.firstFromLevel && out.length > 1 && !out.some((o) => o.kind === 'defense')) {
    const defs = pool.filter((c) => c.offer.kind === 'defense');
    if (defs.length) out[out.length - 1] = defs[g.offerRng.int(defs.length)].offer;
  }
  return out;
}

/** Opening choice: one starting weapon from three, drawn from the unlocked starting pool. */
export function rollStartingWeapons(g: Game): Offer[] {
  const ids = new Set(DEFAULT_START_WEAPONS.filter((id) => !g.arsenal.owns(id)));
  for (const u of UNLOCKS) if (u.kind === 'startWeapon' && u.grants && g.unlocks.has(u.id) && !g.arsenal.owns(u.grants)) ids.add(u.grants);
  const pool = [...ids].map(weaponById);
  const out: Offer[] = [];
  while (out.length < PROGRESSION.choices && pool.length > 0) {
    const i = g.offerRng.int(pool.length);
    out.push({ kind: 'weapon', key: `w:${pool[i].id}`, weapon: pool[i] });
    pool.splice(i, 1);
  }
  return out;
}

export function openLevelUp(g: Game): void {
  while (g.pendingLevels > 0) {
    g.pendingLevels--;
    const o = rollOffers(g, g.build.choices);
    if (o.length > 0) {
      g.offer = o;
      g.offerKind = 'levelup';
      return;
    }
  }
}

export function applyOffer(g: Game, i: number): void {
  const o = g.offer?.[i];
  if (!o) return;
  const a = g.arsenal;
  if (o.kind === 'weapon') a.add(o.weapon);
  else if (o.kind === 'tier') {
    const w = a.weapons[o.slot];
    w.tier = o.toTier;
    updateEmitters(w, 0);
  } else if (o.kind === 'passive') g.build.add(o.upgrade);
  else if (o.kind === 'overdrive') a.weapons[o.slot].overdrive++;
  else if (o.kind === 'defense') g.defense.add(o.defense);
  else if (o.kind === 'defenseTier') g.defense.modules[o.slot].tier = o.toTier;
  else evolve(g, o.a, o.b, o.result);
  g.recompute();
  g.offer = null;
  // Runs open with two starting weapons, picked one after the other.
  if (g.offerKind === 'start' && g.arsenal.weapons.length < START_WEAPONS) {
    g.offer = rollStartingWeapons(g);
    return;
  }
  g.queueLevelUps();
}

export const START_WEAPONS = 2;

/** Merge two max-tier weapons: the evolution takes slot `a`, slot `b` is freed. */
export function evolve(g: Game, a: number, b: number, result: WeaponDef): void {
  const ar = g.arsenal;
  const nameA = ar.weapons[a].def.name;
  const nameB = ar.weapons[b].def.name;
  g.retired.add(ar.weapons[a].def.id);
  g.retired.add(ar.weapons[b].def.id);
  const keep = ar.replace(a, result);
  resetEmitters(keep);
  keep.damageDealt = ar.weapons[a].damageDealt;
  ar.remove(b);
  // Slots after b shifted down: fix references held by saboteurs, projectiles and fields.
  const fix = (s: number): number => (s === b ? -1 : s > b ? s - 1 : s);
  const e = g.enemies;
  for (let i = 0; i < e.high; i++) {
    if (!e.alive[i]) continue;
    if (e.tgtW[i] >= 0) e.tgtW[i] = fix(e.tgtW[i]);
    if (e.dotW[i] >= 0) e.dotW[i] = fix(e.dotW[i]);
  }
  const p = g.projectiles;
  for (let i = 0; i < p.high; i++) if (p.alive[i]) p.weapon[i] = fix(p.weapon[i]) < 0 ? -1 : fix(p.weapon[i]);
  const f = g.fields;
  for (let i = 0; i < f.alive.length; i++) if (f.alive[i]) f.weapon[i] = fix(f.weapon[i]) < 0 ? -1 : fix(f.weapon[i]);
  g.emitFx(FX_EVOLVE, 0, 0, 0);
  g.addLog(`EVOLUTION: ${nameA.toUpperCase()} + ${nameB.toUpperCase()} = ${result.name.toUpperCase()}`, 'good');
}

export function rerollOffers(g: Game): void {
  if (!g.offer || g.offerKind !== 'levelup' || g.rerolls <= 0) return;
  const o = rollOffers(g, g.build.choices);
  if (o.length === 0) return;
  g.rerolls--;
  g.offer = o;
}

/** Remove an option from the pool for the rest of the run and replace its card. */
export function banishOffer(g: Game, i: number): void {
  const o = g.offer?.[i];
  if (!o || g.offerKind !== 'levelup' || g.banishes <= 0 || o.kind === 'tier' || o.kind === 'evolve' || o.kind === 'overdrive' || o.kind === 'defenseTier') return;
  g.banishes--;
  g.banished.add(o.key);
  const keep = g.offer!.filter((_, j) => j !== i).map((x) => x.key);
  const repl = rollOffers(g, 1, keep);
  if (repl.length > 0) g.offer![i] = repl[0];
  else g.offer!.splice(i, 1);
  if (g.offer!.length === 0) {
    g.offer = null;
    g.queueLevelUps();
  }
}
