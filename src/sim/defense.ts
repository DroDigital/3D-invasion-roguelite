import { DEFENSE_RULES, DEFENSES } from '../data/defenses';
import type { DefenseDef } from '../data/types';
import { blast, damageEnemy, healCities, nearestLivingCity } from './damage';
import { ROLE_BOSS, ROLE_GUNSHIP, ROLE_HORROR, ROLE_SABOTEUR, ROLE_TENTACLE, ST_ATTACHED } from './enemies';
import type { Game } from './game';
import { FX_AEGIS, FX_AEGIS_DOWN, FX_EMITTER_DOWN, FX_FLAK, FX_INTERCEPT, FX_MINE, FX_TESLA } from './game';
import { MAX_SHOTS, SHOT_LASER } from './hostile';
import { MAX_WRECKS, spawnWreck } from './wrecks';
import { GROUND_RADIUS, MAX_EMITTERS, OwnedWeapon, tierOf } from './weapons';

/** Radius of the Aegis Shell. Shots and debris crossing it inward are absorbed while it holds. */
export const AEGIS_R = 1.085;
export const MAX_MINES = 160;
export const EMITTER_HP = 14;
/** Seconds for a destroyed emitter to be rebuilt (Repair Nanites speed this up). */
export const EMITTER_REBUILD = 14;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export interface OwnedDefense {
  def: DefenseDef;
  tier: number;
  timer: number;
  kills: number;
}

/** Earth's defense loadout: slotted modules plus the shared state they drive. */
export class DefenseGrid {
  readonly modules: OwnedDefense[] = [];
  slots = DEFENSE_RULES.slots;
  aegis = 0;
  aegisMax = 0;
  aegisSince = 99;
  /** Hit flashes on the shell for the renderer: x, y, z, age. */
  readonly aegisHits = new Float32Array(8 * 4);
  aegisHitNext = 0;
  /** Mines: x, y, z, rearm timer, ttl (<0 = permanent, from the module), damage. */
  readonly mines = new Float32Array(MAX_MINES * 6);
  mineCount = 0;
  /** Flak battery sites (unit vectors * ground radius). */
  readonly sites = new Float32Array(32 * 3);
  siteCount = 0;
  minePhase = 0;
  // Derived each recompute.
  cityReduce = 0;
  popReduce = 0;
  abductReduce = 0;
  emitterArmor = 1;
  jamReduce = 0;
  rebuildMul = 1;
  decoyChance = 0;

  owns(id: string): boolean {
    return this.modules.some((m) => m.def.id === id);
  }

  get(id: string): OwnedDefense | undefined {
    return this.modules.find((m) => m.def.id === id);
  }

  /** Current tier values of a module, or undefined if not owned. */
  v(id: string): Record<string, number> | undefined {
    const m = this.get(id);
    return m ? m.def.tiers[m.tier].v : undefined;
  }

  add(def: DefenseDef): OwnedDefense | null {
    if (this.modules.length >= this.slots || this.owns(def.id)) return null;
    const m = { def, tier: 0, timer: 0.5, kills: 0 };
    this.modules.push(m);
    return m;
  }
}

export function defenseIsMax(m: OwnedDefense): boolean {
  return m.tier >= m.def.tiers.length - 1;
}

/** Rebuild derived numbers and battery layouts after the loadout changes. */
export function recomputeDefense(g: Game): void {
  const d = g.defense;
  d.cityReduce = d.v('bastion')?.reduce ?? 0;
  d.popReduce = d.v('bunkers')?.pop ?? 0;
  d.abductReduce = d.v('bunkers')?.abduct ?? 0;
  d.emitterArmor = 1 + (d.v('wards')?.hp ?? 0);
  d.jamReduce = d.v('wards')?.jam ?? 0;
  d.rebuildMul = d.v('nanites')?.rebuild ?? 1;
  d.decoyChance = d.v('decoy')?.chance ?? 0;
  const a = d.v('aegis');
  const prev = d.aegisMax;
  d.aegisMax = a ? a.cap * (1 + 0.04 * Math.max(0, g.wave - 1)) : 0;
  d.aegis = Math.min(d.aegisMax, d.aegis + Math.max(0, d.aegisMax - prev));
  const n = Math.min(32, d.v('flak')?.sites ?? 0);
  d.siteCount = n;
  for (let k = 0; k < n; k++) {
    const y = 1 - (2 * (k + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const ang = k * GOLDEN + 0.9;
    d.sites[k * 3] = Math.cos(ang) * r * GROUND_RADIUS;
    d.sites[k * 3 + 1] = y * GROUND_RADIUS;
    d.sites[k * 3 + 2] = Math.sin(ang) * r * GROUND_RADIUS;
  }
  // Permanent module mines occupy the front of the mine array; consumable mines follow.
  const mf = d.v('minefield');
  const want = mf ? Math.min(MAX_MINES - 40, mf.mines) : 0;
  let perm = 0;
  for (let k = 0; k < d.mineCount; k++) if (d.mines[k * 6 + 4] < 0) perm++;
  if (perm !== want) {
    // Rebuild: keep temporary mines, regenerate the permanent shell.
    const temp: number[] = [];
    for (let k = 0; k < d.mineCount; k++) if (d.mines[k * 6 + 4] >= 0) for (let j = 0; j < 6; j++) temp.push(d.mines[k * 6 + j]);
    d.mineCount = 0;
    for (let k = 0; k < want; k++) {
      const y = 1 - (2 * (k + 0.5)) / want;
      const r = Math.sqrt(1 - y * y);
      const ang = k * GOLDEN;
      const rad = 1.22 + ((k * 0.618) % 1) * 0.5;
      addMine(g, Math.cos(ang) * r * rad, y * rad, Math.sin(ang) * r * rad, -1, 0);
    }
    for (let k = 0; k + 5 < temp.length; k += 6) addMine(g, temp[k], temp[k + 1], temp[k + 2], temp[k + 4], temp[k + 5]);
  }
}

export function addMine(g: Game, x: number, y: number, z: number, ttl: number, dmg: number): void {
  const d = g.defense;
  if (d.mineCount >= MAX_MINES) return;
  const o = d.mineCount++ * 6;
  d.mines[o] = x;
  d.mines[o + 1] = y;
  d.mines[o + 2] = z;
  d.mines[o + 3] = 0;
  d.mines[o + 4] = ttl;
  d.mines[o + 5] = dmg;
}

function removeMine(d: DefenseGrid, k: number): void {
  const last = --d.mineCount;
  if (k !== last) for (let j = 0; j < 6; j++) d.mines[k * 6 + j] = d.mines[last * 6 + j];
}

/** Defense damage keeps pace with alien health. */
export function defenseScale(g: Game): number {
  return Math.pow(DEFENSE_RULES.damageGrowth, Math.max(0, g.wave - 1)) * g.build.defenseDamage;
}

// ---- emitters ----

export function emitterBroken(w: OwnedWeapon, k: number): boolean {
  return w.emDown[k] > 0;
}

/** Damage a weapon emitter; at zero it is destroyed, falls to Earth, and rebuilds later. */
export function hitEmitter(g: Game, slot: number, k: number, dmg: number): void {
  const w = g.arsenal.weapons[slot];
  if (!w || k < 0 || k >= tierOf(w).emitters || w.emDown[k] > 0) return;
  w.emHp[k] -= dmg / g.defense.emitterArmor;
  if (w.emHp[k] > 0) return;
  w.emDown[k] = EMITTER_REBUILD;
  const x = w.emitters[k * 3];
  const y = w.emitters[k * 3 + 1];
  const z = w.emitters[k * 3 + 2];
  g.emitFx(FX_EMITTER_DOWN, x, y, z, 0, 0, 0, slot);
  const r = g.combatRng;
  spawnWreck(g, x, y, z, -x * 0.05 + r.range(-0.08, 0.08), -y * 0.05 + r.range(-0.08, 0.08), -z * 0.05 + r.range(-0.08, 0.08), 0.03, 1, 255);
  g.emittersLost++;
}

export function updateEmitterRepair(g: Game, dt: number): void {
  const rate = g.defense.rebuildMul * dt;
  for (const w of g.arsenal.weapons) {
    const n = tierOf(w).emitters;
    for (let k = 0; k < n; k++) {
      if (w.emDown[k] > 0) {
        w.emDown[k] -= rate;
        if (w.emDown[k] <= 0) {
          w.emDown[k] = 0;
          w.emHp[k] = EMITTER_HP;
        }
      } else if (w.emHp[k] < EMITTER_HP) w.emHp[k] = Math.min(EMITTER_HP, w.emHp[k] + 0.5 * rate);
    }
  }
}

/** Fraction of a weapon's emitters still standing. */
export function liveFraction(w: OwnedWeapon): number {
  const n = tierOf(w).emitters;
  let live = 0;
  for (let k = 0; k < n; k++) if (w.emDown[k] <= 0) live++;
  return n > 0 ? live / n : 1;
}

export function resetEmitters(w: OwnedWeapon): void {
  for (let k = 0; k < MAX_EMITTERS; k++) {
    w.emHp[k] = EMITTER_HP;
    w.emDown[k] = 0;
  }
}

// ---- aegis and decoys ----

/** Try to absorb a hit at (x,y,z) on the Aegis Shell. Returns true when absorbed. */
export function aegisAbsorb(g: Game, x: number, y: number, z: number, dmg: number, _sx = 0, _sy = 0, _sz = 0): boolean {
  const d = g.defense;
  if (d.aegis <= 0) return false;
  d.aegis -= dmg;
  d.aegisSince = 0;
  const l = Math.hypot(x, y, z) || 1;
  const hx = (x / l) * AEGIS_R;
  const hy = (y / l) * AEGIS_R;
  const hz = (z / l) * AEGIS_R;
  const o = d.aegisHitNext * 4;
  d.aegisHitNext = (d.aegisHitNext + 1) % 8;
  d.aegisHits[o] = hx;
  d.aegisHits[o + 1] = hy;
  d.aegisHits[o + 2] = hz;
  d.aegisHits[o + 3] = 0;
  g.emitFx(FX_AEGIS, hx, hy, hz, 0, 0, 0, Math.min(1, dmg / 6));
  if (d.aegis <= 0) {
    d.aegis = 0;
    g.emitFx(FX_AEGIS_DOWN, 0, 0, 0);
    g.addLog('AEGIS SHELL COLLAPSED', 'warn');
    if (d.v('aegis')?.pulse) {
      // Overload: the collapsing lattice burns everything in low orbit.
      blast(g, 0, 0, 0, 1.7, 400 * defenseScale(g), 'energy', -1);
    }
  }
  return true;
}

const decoyOut: [number, number, number] = [0, 0, 0];

/** Where a city-bound attack lands instead, if a decoy draws it; null otherwise. */
export function decoyFor(g: Game, x: number, y: number, z: number): [number, number, number] | null {
  for (const p of g.placed) {
    if (p.kind !== 'decoy') continue;
    const dx = p.x - x;
    const dy = p.y - y;
    const dz = p.z - z;
    if (dx * dx + dy * dy + dz * dz < p.radius * p.radius) {
      decoyOut[0] = p.x;
      decoyOut[1] = p.y;
      decoyOut[2] = p.z;
      return decoyOut;
    }
  }
  const ch = g.defense.decoyChance;
  if (ch > 0 && g.combatRng.next() < ch) {
    // A false city nearby: the attack lands on empty ground.
    const r = g.combatRng;
    let nx = x + r.range(-0.18, 0.18);
    let ny = y + r.range(-0.18, 0.18);
    let nz = z + r.range(-0.18, 0.18);
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    decoyOut[0] = nx;
    decoyOut[1] = ny;
    decoyOut[2] = nz;
    return decoyOut;
  }
  return null;
}

// ---- the active modules ----

export function updateDefense(g: Game, dt: number): void {
  const d = g.defense;
  updateEmitterRepair(g, dt);
  for (let k = 0; k < 8; k++) d.aegisHits[k * 4 + 3] += dt;
  if (d.aegisMax > 0) {
    d.aegisSince += dt;
    if (d.aegisSince > 2.5 && d.aegis < d.aegisMax) d.aegis = Math.min(d.aegisMax, d.aegis + (d.v('aegis')!.regen * (1 + 0.04 * (g.wave - 1))) * dt);
  }
  const heal = (d.v('nanites')?.heal ?? 0) + (d.v('bastion')?.regen ?? 0);
  if (heal > 0) healCities(g, heal * dt);
  const fighting = g.phase === 'spawning' || g.phase === 'clearing';
  updateMines(g, dt);
  if (!fighting) return;
  const scale = defenseScale(g);
  for (const m of d.modules) {
    const v = m.def.tiers[m.tier].v;
    m.timer -= dt;
    if (m.timer > 0) continue;
    switch (m.def.id) {
      case 'flak':
        m.timer += v.period;
        fireFlak(g, m, v, scale);
        break;
      case 'interceptor':
        m.timer += v.period;
        fireInterceptors(g, m, v, scale);
        break;
      case 'tesla':
        m.timer += v.period;
        fireTesla(g, m, v, scale);
        break;
      default:
        m.timer = 1;
    }
  }
}

function fireFlak(g: Game, m: OwnedDefense, v: Record<string, number>, scale: number): void {
  const d = g.defense;
  const s = g.hostile;
  const w = g.wrecks;
  const e = g.enemies;
  const r2 = v.range * v.range;
  const bursts = v.burst ?? 1;
  for (let k = 0; k < d.siteCount; k++) {
    const sx = d.sites[k * 3];
    const sy = d.sites[k * 3 + 1];
    const sz = d.sites[k * 3 + 2];
    for (let b = 0; b < bursts; b++) {
      // Priority: shots in the air, then falling wrecks, then low fliers.
      let best = -1;
      let bd = r2;
      for (let i = 0; i < s.high && i < MAX_SHOTS; i++) {
        if (!s.alive[i] || s.kind[i] === SHOT_LASER) continue;
        const dx = s.x[i] - sx;
        const dy = s.y[i] - sy;
        const dz = s.z[i] - sz;
        const dd = dx * dx + dy * dy + dz * dz;
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      }
      if (best >= 0) {
        g.emitFx(FX_FLAK, s.x[best], s.y[best], s.z[best], sx, sy, sz, 0);
        s.kill(best);
        continue;
      }
      bd = r2;
      for (let i = 0; i < MAX_WRECKS; i++) {
        if (!w.alive[i] || w.dmg[i] <= 0) continue;
        const dx = w.x[i] - sx;
        const dy = w.y[i] - sy;
        const dz = w.z[i] - sz;
        const dd = dx * dx + dy * dy + dz * dz;
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      }
      if (best >= 0) {
        g.emitFx(FX_FLAK, w.x[best], w.y[best], w.z[best], sx, sy, sz, 1);
        w.kill(best);
        continue;
      }
      bd = r2;
      for (let i = 0; i < e.high; i++) {
        if (!e.alive[i] || e.cloaked[i]) continue;
        const dx = e.x[i] - sx;
        const dy = e.y[i] - sy;
        const dz = e.z[i] - sz;
        const dd = dx * dx + dy * dy + dz * dz;
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      }
      if (best >= 0) {
        g.emitFx(FX_FLAK, e.x[best], e.y[best], e.z[best], sx, sy, sz, 2);
        const kill = e.hp[best] <= v.dmg * scale;
        damageEnemy(g, best, v.dmg * scale, 'explosive', -1, true);
        if (kill) m.kills++;
      }
    }
  }
}

function interceptPriority(g: Game, i: number): number {
  const e = g.enemies;
  const role = e.role[i];
  if (role === ROLE_GUNSHIP) return 0;
  if (role === ROLE_SABOTEUR) return e.state[i] === ST_ATTACHED ? 0 : 1;
  if (role === ROLE_TENTACLE) return 1;
  if (role === ROLE_HORROR || role === ROLE_BOSS) return 3;
  return 2;
}

const picks = new Int16Array(16);

function fireInterceptors(g: Game, m: OwnedDefense, v: Record<string, number>, scale: number): void {
  const e = g.enemies;
  const n = Math.min(16, v.n);
  let got = 0;
  for (let pass = 0; pass < 3 && got < n; pass++) {
    for (let i = 0; i < e.high && got < n; i++) {
      if (!e.alive[i] || e.cloaked[i] || interceptPriority(g, i) !== pass) continue;
      if (Math.hypot(e.x[i], e.y[i], e.z[i]) > 3) continue;
      let dup = false;
      for (let j = 0; j < got; j++) if (picks[j] === i) dup = true;
      if (!dup) picks[got++] = i;
    }
  }
  const c = g.cities;
  for (let j = 0; j < got; j++) {
    const i = picks[j];
    if (!e.alive[i]) continue;
    const city = nearestLivingCity(g, e.x[i], e.y[i], e.z[i]);
    const k = Math.max(0, city) * 3;
    g.emitFx(FX_INTERCEPT, c.pos[k] * 1.01, c.pos[k + 1] * 1.01, c.pos[k + 2] * 1.01, e.x[i], e.y[i], e.z[i], 0);
    const x = e.x[i];
    const y = e.y[i];
    const z = e.z[i];
    const kill = e.hp[i] <= v.dmg * scale;
    damageEnemy(g, i, v.dmg * scale, 'explosive', -1);
    if (kill) m.kills++;
    if (v.aoe) blast(g, x, y, z, v.aoe, v.dmg * scale * 0.4, 'explosive', -1, i);
  }
}

function fireTesla(g: Game, m: OwnedDefense, v: Record<string, number>, scale: number): void {
  const e = g.enemies;
  const c = g.cities;
  const r2 = v.range * v.range;
  for (let k = 0; k < c.count; k++) {
    if (c.health[k] <= 0) continue;
    const px = c.pos[k * 3];
    const py = c.pos[k * 3 + 1];
    const pz = c.pos[k * 3 + 2];
    let n = 0;
    for (let i = 0; i < e.high && n < v.n; i++) {
      if (!e.alive[i]) continue;
      const dx = e.x[i] - px;
      const dy = e.y[i] - py;
      const dz = e.z[i] - pz;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      g.emitFx(FX_TESLA, px * 1.03, py * 1.03, pz * 1.03, e.x[i], e.y[i], e.z[i], 0);
      const kill = e.hp[i] <= v.dmg * scale;
      if (v.stun) e.stun[i] = Math.max(e.stun[i], v.stun * (e.role[i] === ROLE_BOSS || e.role[i] === ROLE_HORROR ? 0.2 : 1));
      damageEnemy(g, i, v.dmg * scale, 'energy', -1, true);
      if (kill) m.kills++;
      n++;
    }
  }
}

function updateMines(g: Game, dt: number): void {
  const d = g.defense;
  if (d.mineCount === 0) return;
  const mf = d.v('minefield');
  const e = g.enemies;
  const scale = defenseScale(g);
  // The permanent shell drifts slowly around the planet.
  const spin = 0.04 * dt;
  const cs = Math.cos(spin);
  const sn = Math.sin(spin);
  for (let k = d.mineCount - 1; k >= 0; k--) {
    const o = k * 6;
    if (d.mines[o + 4] >= 0) {
      d.mines[o + 4] -= dt;
      if (d.mines[o + 4] <= 0) {
        removeMine(d, k);
        continue;
      }
    } else {
      const x = d.mines[o];
      const z = d.mines[o + 2];
      d.mines[o] = x * cs - z * sn;
      d.mines[o + 2] = x * sn + z * cs;
    }
    if (d.mines[o + 3] > 0) d.mines[o + 3] -= dt;
  }
  // Proximity check at 20 Hz.
  if (((g.time * 20) | 0) === (((g.time - dt) * 20) | 0)) return;
  const rad = mf?.radius ?? 0.13;
  const trig = 0.06;
  for (let i = 0; i < e.high; i++) {
    if (!e.alive[i]) continue;
    const r = Math.hypot(e.x[i], e.y[i], e.z[i]);
    if (r < 1.1 || r > 2.05) continue;
    for (let k = 0; k < d.mineCount; k++) {
      const o = k * 6;
      if (d.mines[o + 3] > 0) continue;
      const dx = e.x[i] - d.mines[o];
      const dy = e.y[i] - d.mines[o + 1];
      const dz = e.z[i] - d.mines[o + 2];
      if (dx * dx + dy * dy + dz * dz > trig * trig) continue;
      const perm = d.mines[o + 4] < 0;
      const dmg = (perm ? mf?.dmg ?? 80 : d.mines[o + 5]) * scale;
      g.emitFx(FX_MINE, d.mines[o], d.mines[o + 1], d.mines[o + 2], 0, 0, 0, rad);
      blast(g, d.mines[o], d.mines[o + 1], d.mines[o + 2], rad, dmg, 'explosive', -1);
      if (perm) d.mines[o + 3] = mf?.rearm ?? 6;
      else {
        removeMine(d, k);
        k--;
      }
      if (!e.alive[i]) break;
    }
  }
}

export { DEFENSES };
