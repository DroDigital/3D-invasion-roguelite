import { ALIENS, ALIEN_TIERS, MODIFIERS, SPECIES } from '../data/aliens';
import { CITIES, CITY_MAX_HEALTH } from '../data/cities';
import { xpForLevel } from '../data/progression';
import type { ActionDef, DamageType } from '../data/types';
import { spawnAlien } from './aliens';
import { matches, TriggerOn } from './build';
import { ROLE_ABDUCTOR, ROLE_BOSS, ROLE_HORROR, ROLE_INVADER, ROLE_TENTACLE } from './enemies';
import { WAVE_RULES } from '../data/aliens';
import { spawnWreck } from './wrecks';
import type { Game } from './game';
import { FX_BLAST, FX_CITY_FALL, FX_CITY_HIT, FX_EXPLOSION, FX_HIT, FX_KILL, FX_SHIELD_HIT, FX_STRIKE } from './game';
import { chainArc } from './combat';

const MOD_SPLIT = MODIFIERS.find((m) => m.id === 'splitting')!;
const MOD_EXPLODE = MODIFIERS.find((m) => m.id === 'explosive')!;

/**
 * Apply damage to an enemy: species resistances, marks, shields, armour, execute.
 * `slot` is the source weapon (-1 for abilities/triggers). Returns damage dealt to health+shield.
 */
export function damageEnemy(g: Game, i: number, raw: number, type: DamageType, slot: number, silent = false): number {
  const e = g.enemies;
  if (!e.alive[i] || raw <= 0) return 0;
  const sp = SPECIES[e.species[i]];
  const w = slot >= 0 ? g.arsenal.weapons[slot] : undefined;
  let dmg = raw * sp.resist[type] * (1 + e.mark[i]);
  if (e.role[i] === ROLE_BOSS) dmg *= w ? w.stats.bossDamage : 1;
  if (e.role[i] === ROLE_ABDUCTOR && g.build.rules.has('abductorBane')) dmg *= 2;
  e.flash[i] = 0.08;
  e.sinceHit[i] = 0;
  let dealt = 0;

  if (e.shield[i] > 0) {
    const sm = w ? w.stats.shieldDamage : 1;
    const sd = dmg * sm;
    if (sd <= e.shield[i]) {
      e.shield[i] -= sd;
      if (w) w.damageDealt += sd;
      if (!silent) g.emitFx(FX_SHIELD_HIT, e.x[i], e.y[i], e.z[i]);
      return sd;
    }
    dealt += e.shield[i];
    dmg = (sd - e.shield[i]) / sm;
    e.shield[i] = 0;
  }

  // Flat armour, but at least a fifth of every hit gets through.
  dmg = Math.max(dmg * 0.2, dmg - e.armor[i]);
  const hpDealt = Math.min(dmg, e.hp[i]);
  e.hp[i] -= dmg;
  dealt += hpDealt;
  if (w) w.damageDealt += hpDealt;

  if (e.hp[i] > 0 && w && w.stats.execute > 0 && e.role[i] !== ROLE_BOSS && e.hp[i] < e.maxHp[i] * w.stats.execute) {
    if (w) w.damageDealt += e.hp[i];
    e.hp[i] = 0;
  }
  if (e.hp[i] <= 0) killEnemy(g, i, slot);
  else if (!silent) g.emitFx(FX_HIT, e.x[i], e.y[i], e.z[i]);
  return dealt;
}

/** Kill with rewards (xp, salvage, triggers, death modifiers). */
export function killEnemy(g: Game, i: number, slot: number): void {
  const e = g.enemies;
  if (!e.alive[i]) return;
  const def = ALIENS[e.def[i]];
  const x = e.x[i];
  const y = e.y[i];
  const z = e.z[i];
  const city = e.city[i];
  const tier = e.tier[i];
  const role = e.role[i];
  const mods = e.mods[i];
  const w = slot >= 0 ? g.arsenal.weapons[slot] : undefined;

  g.kills++;
  if (w) w.kills++;
  if (role === ROLE_BOSS || role === ROLE_HORROR) {
    if (role === ROLE_BOSS || def.elder) g.bossKills++;
    g.addLog(`${def.name.toUpperCase()} ${role === ROLE_HORROR ? 'BANISHED' : 'DESTROYED'}`, 'good');
  }
  if (g.bossSlot === i) g.bossSlot = -1;
  if (role === ROLE_TENTACLE) {
    const p = e.parent[i];
    if (p >= 0 && e.alive[p] && e.gen[p] === e.parentGen[i] && e.cargo[p] > 0) e.cargo[p]--;
  }
  if (role === ROLE_ABDUCTOR && e.cargo[i] > 0) {
    g.peopleRescued += e.cargo[i];
    returnPeople(g, city, e.cargo[i]);
    e.cargo[i] = 0;
  }
  const giant = role === ROLE_BOSS || role === ROLE_HORROR || ALIENS[e.def[i]].mothership;
  const fodder = e.fodder[i] === 1;
  g.emitFx(FX_EXPLOSION, x, y, z, 0, 0, 0, e.scale[i] * (giant ? 4 : 1));
  g.emitFx(FX_KILL, x, y, z, role, 0, 0, fodder ? 0 : giant ? 8 : tier + 1);
  // Every ship leaves wreckage that falls to Earth; giants break into burning chunks.
  if (role !== ROLE_TENTACLE) {
    const r = g.combatRng;
    const sp = e.speed[i] * 0.6;
    const chunks = giant ? 5 + (ALIENS[e.def[i]].mothership ? 3 : 0) : fodder ? (r.next() < 0.35 ? 1 : 0) : 1;
    for (let k = 0; k < chunks; k++) {
      const kick = giant ? 0.18 : 0.07;
      const size = giant ? e.scale[i] * r.range(0.18, 0.32) : e.scale[i] * 0.55;
      const dmg = fodder ? 0 : giant ? 3 + e.scale[i] * 8 : e.scale[i] * 10;
      spawnWreck(g, x, y, z, e.dx[i] * sp + r.range(-kick, kick), e.dy[i] * sp + r.range(-kick, kick), e.dz[i] * sp + r.range(-kick, kick), size, dmg, e.species[i]);
    }
  }
  const splits = fodder && g.dir.splitFodder && e.rewardMul[i] > 0.02;
  e.kill(i);

  // Salvage dries up as the war drags on: per-kill value falls with the wave, swarms are
  // nearly worthless, and each wave's kill income has diminishing returns.
  let salvage = def.salvage * (fodder ? WAVE_RULES.fodderSalvage : e.rewardMul[i]) / (1 + 0.07 * Math.max(0, g.wave - 1));
  if (tier >= 1 && g.build.rules.has('bountyHunter')) salvage *= 3;
  gainKillSalvage(g, salvage * g.dir.salvageMul);
  if (splits) {
    for (let k = 0; k < 2; k++) {
      const j = spawnAlien(g, e.def[i], 0, x + g.combatRng.range(-0.04, 0.04), y + g.combatRng.range(-0.04, 0.04), z + g.combatRng.range(-0.04, 0.04), city, g.combatRng, { hpMul: 0.25, noMods: true, quiet: true, fodder: true });
      if (j >= 0) e.rewardMul[j] = 0.01;
    }
  }

  if (mods & MOD_EXPLODE.bit) {
    g.emitFx(FX_BLAST, x, y, z, 0, 0, 0, MOD_EXPLODE.value);
    const c = g.cities;
    for (let k = 0; k < c.count; k++) {
      if (c.health[k] <= 0) continue;
      const dx = c.pos[k * 3] - x;
      const dy = c.pos[k * 3 + 1] - y;
      const dz = c.pos[k * 3 + 2] - z;
      if (dx * dx + dy * dy + dz * dz < MOD_EXPLODE.value * MOD_EXPLODE.value) damageCity(g, k, 6 * ALIEN_TIERS[tier].dmgMul, true);
    }
  }
  if (mods & MOD_SPLIT.bit && role !== ROLE_BOSS) {
    const child = role === ROLE_INVADER ? e.def[i] : ALIENS.findIndex((a) => a.species === def.species && a.role === 'invader');
    for (let k = 0; k < MOD_SPLIT.value; k++) {
      spawnAlien(g, child, 0, x + g.combatRng.range(-0.05, 0.05), y + g.combatRng.range(-0.05, 0.05), z + g.combatRng.range(-0.05, 0.05), city, g.combatRng, { hpMul: 0.35, noMods: true, quiet: true });
    }
  }
  runTriggers(g, 'kill', slot, x, y, z, city);
  gainXp(g, def.xp * e.rewardMul[i]);
}

/** Kill income: logarithmic per wave, so a flood of kills can't bankroll the whole shop. */
export function gainKillSalvage(g: Game, amount: number): void {
  const raw = amount * g.build.salvageGain;
  const C = 22 + 3 * g.wave;
  const before = C * Math.log1p(g.waveSalvageRaw / C);
  g.waveSalvageRaw += raw;
  const v = C * Math.log1p(g.waveSalvageRaw / C) - before;
  g.salvage += v;
  g.salvageEarned += v;
}

export function gainSalvage(g: Game, amount: number, scaled: boolean): void {
  const v = scaled ? amount * g.build.salvageGain : amount;
  g.salvage += v;
  g.salvageEarned += v;
}

export function gainXp(g: Game, amount: number): void {
  g.xp += amount * g.build.xpGain;
  while (g.xp >= g.xpNeeded) {
    g.xp -= g.xpNeeded;
    g.level++;
    g.xpNeeded = xpForLevel(g.level);
    g.pendingLevels++;
    runTriggers(g, 'levelUp', -1, 0, 0, 0, -1);
  }
  g.queueLevelUps();
}

/** Remove people from a city (abduction, bombardment fallout). */
export function losePeople(g: Game, city: number, people: number): number {
  const c = g.cities;
  const n = Math.min(people, c.population[city]);
  c.population[city] -= n;
  if (g.build.rules.has('insurance')) g.insuranceAcc += n;
  return n;
}

/** Bring people home; a fallen city's survivors go to the nearest living city. */
export function returnPeople(g: Game, city: number, people: number): void {
  const c = g.cities;
  let k = city;
  if (k < 0 || c.health[k] <= 0) k = nearestLivingCity(g, c.pos[city * 3] ?? 0, c.pos[city * 3 + 1] ?? 0, c.pos[city * 3 + 2] ?? 1);
  if (k < 0) return;
  c.population[k] = Math.min(c.maxPopulation[k] * 1.2, c.population[k] + people);
}

export function nearestLivingCity(g: Game, x: number, y: number, z: number): number {
  const c = g.cities;
  let best = -1;
  let bd = -Infinity;
  for (let i = 0; i < c.count; i++) {
    if (c.health[i] <= 0) continue;
    const d = c.pos[i * 3] * x + c.pos[i * 3 + 1] * y + c.pos[i * 3 + 2] * z;
    if (d > bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** Damage a city's defences; new lows cost population. `discrete` marks single hits (triggers, fx). */
/** City damage sources, for the run summary and balance tools. */
export const DMG_SIEGE = 0;
export const DMG_DIVE = 1;
export const DMG_SHOT = 2;
export const DMG_WRECK = 3;
export const DMG_TENTACLE = 4;
export const DMG_OTHER = 5;

export function damageCity(g: Game, city: number, amount: number, discrete: boolean, src = DMG_OTHER): void {
  const c = g.cities;
  if (c.health[city] <= 0) return;
  if (g.cityShield[city] > 0) return;
  const dmg = amount * (1 - g.build.cityArmor) * (1 - g.defense.cityReduce) * g.build.cityDamageTaken;
  const d = Math.min(dmg, c.health[city]);
  c.health[city] -= d;
  g.cityDamage[src] += d;
  if (c.health[city] < g.lowWater[city]) {
    const lost = g.lowWater[city] - c.health[city];
    g.lowWater[city] = c.health[city];
    losePeople(g, city, ((c.maxPopulation[city] * lost) / CITY_MAX_HEALTH) * (1 - g.defense.popReduce));
  }
  const k = city * 3;
  if (discrete) {
    g.emitFx(FX_CITY_HIT, c.pos[k], c.pos[k + 1], c.pos[k + 2]);
    runTriggers(g, 'cityHit', -1, c.pos[k] * 1.05, c.pos[k + 1] * 1.05, c.pos[k + 2] * 1.05, city);
  }
  if (c.health[city] <= 0.0001) {
    c.health[city] = 0;
    losePeople(g, city, c.population[city]);
    g.emitFx(FX_CITY_FALL, c.pos[k], c.pos[k + 1], c.pos[k + 2]);
    g.addLog(`${CITIES[city].name} HAS FALLEN`, 'warn');
    if (g.build.rules.has('martyr')) {
      const e = g.enemies;
      g.emitFx(FX_STRIKE, c.pos[k], c.pos[k + 1], c.pos[k + 2], 0, 0, 0, 0.6);
      for (let i = 0; i < e.high; i++) {
        if (!e.alive[i] || e.role[i] === ROLE_BOSS) continue;
        const dx = e.x[i] - c.pos[k];
        const dy = e.y[i] - c.pos[k + 1];
        const dz = e.z[i] - c.pos[k + 2];
        if (dx * dx + dy * dy + dz * dz < 0.36) killEnemy(g, i, -1);
      }
    }
  }
}

export function healCities(g: Game, amount: number): void {
  const c = g.cities;
  for (let i = 0; i < c.count; i++) healCity(g, i, amount);
}

/** Repairs defences. Lost people do not come back, but the city can absorb that much again. */
export function healCity(g: Game, i: number, amount: number): void {
  const c = g.cities;
  if (i < 0 || c.health[i] <= 0 || c.health[i] >= CITY_MAX_HEALTH) return;
  c.health[i] = Math.min(CITY_MAX_HEALTH, c.health[i] + amount);
  if (c.health[i] > g.lowWater[i]) g.lowWater[i] = c.health[i];
}

/** Area damage (explosions, strikes). */
export function blast(g: Game, x: number, y: number, z: number, radius: number, dmg: number, type: DamageType, slot: number, exclude = -1): void {
  const e = g.enemies;
  const r2 = radius * radius;
  for (let j = 0; j < e.high; j++) {
    if (!e.alive[j] || j === exclude) continue;
    const dx = e.x[j] - x;
    const dy = e.y[j] - y;
    const dz = e.z[j] - z;
    if (dx * dx + dy * dy + dz * dz <= r2) damageEnemy(g, j, dmg, type, slot, true);
  }
}

export function stunArea(g: Game, x: number, y: number, z: number, radius: number, duration: number): void {
  const e = g.enemies;
  const r2 = radius * radius;
  for (let j = 0; j < e.high; j++) {
    if (!e.alive[j]) continue;
    const dx = e.x[j] - x;
    const dy = e.y[j] - y;
    const dz = e.z[j] - z;
    if (dx * dx + dy * dy + dz * dz <= r2) e.stun[j] = Math.max(e.stun[j], duration * (e.role[j] === ROLE_BOSS ? 0.3 : 1));
  }
}

export function runAction(g: Game, a: ActionDef, slot: number, x: number, y: number, z: number, city: number): void {
  const w = slot >= 0 ? g.arsenal.weapons[slot] : undefined;
  switch (a.kind) {
    case 'healCities':
      healCities(g, a.amount);
      break;
    case 'healCity':
      healCity(g, city >= 0 ? city : nearestLivingCity(g, x, y, z), a.amount);
      break;
    case 'xp':
      gainXp(g, a.amount);
      break;
    case 'salvage':
      gainSalvage(g, a.amount, true);
      break;
    case 'cooldown':
      for (const ab of g.abilities) ab.cd = Math.max(0, ab.cd - a.seconds);
      break;
    case 'stunArea':
      stunArea(g, x, y, z, a.radius, a.duration);
      break;
    case 'explode': {
      const dmg = (w ? w.stats.damage : 20) * a.damageMul;
      g.emitFx(FX_BLAST, x, y, z, 0, 0, 0, a.radius);
      blast(g, x, y, z, a.radius, dmg, w ? w.def.damageType : 'explosive', slot);
      break;
    }
    case 'zap':
      chainArc(g, -1, x, y, z, (w ? w.stats.damage : 15) * a.damageMul, a.jumps, 0.4, 0.85, slot, w ? w.def.damageType : 'energy');
      break;
  }
}

/** Fire every trigger of a kind. Weapon-scoped triggers only fire for matching source weapons. */
export function runTriggers(g: Game, on: TriggerOn, slot: number, x: number, y: number, z: number, city: number): void {
  const list = g.build.triggers[on];
  if (list.length === 0) return;
  const w = slot >= 0 ? g.arsenal.weapons[slot] : undefined;
  for (let k = 0; k < list.length; k++) {
    const t = list[k];
    if (t.where && !(w && matches(t.where, w.def.tags))) continue;
    if (t.chance < 1 && g.combatRng.next() >= t.chance) continue;
    runAction(g, t.action, slot, x, y, z, city);
  }
}
