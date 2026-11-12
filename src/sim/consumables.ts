import { ARMORY_RULES } from '../data/consumables';
import type { ConsumableDef } from '../data/types';
import { damageCity, damageEnemy, healCity, nearestLivingCity, stunArea } from './damage';
import { addMine, defenseScale, EMITTER_HP } from './defense';
import { ROLE_BOSS, ROLE_HORROR, ST_SIEGE } from './enemies';
import type { Game } from './game';
import { FX_CITY_SHIELD, FX_CRYO, FX_IMPACT, FX_NUKE, FX_PLACE, FX_TURRET } from './game';
import { tierOf } from './weapons';

export interface HeldItem {
  def: ConsumableDef;
  count: number;
}

/** Something a consumable left on or above the globe. */
export interface Placed {
  kind: 'turret' | 'decoy' | 'well' | 'singularity';
  x: number;
  y: number;
  z: number;
  ttl: number;
  maxTtl: number;
  radius: number;
  dps: number;
  pull: number;
  period: number;
  timer: number;
  kills: number;
}

/** Add `n` of a consumable to the player's stock. Returns false when it cannot be held. */
export function addItem(g: Game, def: ConsumableDef, n = 1): boolean {
  const held = g.items.find((h) => h.def.id === def.id);
  if (held) {
    if (held.count >= def.maxStack) return false;
    held.count = Math.min(def.maxStack, held.count + n);
    return true;
  }
  if (g.items.length >= ARMORY_RULES.maxKinds) return false;
  g.items.push({ def, count: Math.min(def.maxStack, n) });
  return true;
}

function place(g: Game, p: Omit<Placed, 'timer' | 'kills' | 'maxTtl'>): void {
  if (g.placed.length >= 24) g.placed.shift();
  g.placed.push({ ...p, maxTtl: p.ttl, timer: 0, kills: 0 });
  g.emitFx(FX_PLACE, p.x, p.y, p.z, 0, 0, 0, p.radius);
}

/** Use one of held item `i`. Point items need a unit direction on the globe; city items a city. */
export function useItem(g: Game, i: number, target?: { point?: [number, number, number]; city?: number }): boolean {
  const h = g.items[i];
  if (!h || h.count <= 0 || g.paused) return false;
  const a = h.def.action;
  const pt = target?.point;
  if (h.def.targeting === 'point' && !pt) return false;
  const city = target?.city;
  if (h.def.targeting === 'city' && (city === undefined || city < 0 || g.cities.health[city] <= 0)) return false;
  const e = g.enemies;
  const scale = defenseScale(g);
  switch (a.kind) {
    case 'nuke': {
      const [px, py, pz] = pt!;
      g.emitFx(FX_NUKE, px * 1.1, py * 1.1, pz * 1.1, 0, 0, 0, a.radius);
      g.emitFx(FX_IMPACT, px, py, pz, 0, 0, 0, a.radius * 0.8);
      for (let j = 0; j < e.high; j++) {
        if (!e.alive[j]) continue;
        const r = Math.hypot(e.x[j], e.y[j], e.z[j]) || 1;
        if (r > 2.8) continue;
        const dx = e.x[j] / r - px;
        const dy = e.y[j] / r - py;
        const dz = e.z[j] / r - pz;
        if (dx * dx + dy * dy + dz * dz < a.radius * a.radius) damageEnemy(g, j, a.damage * scale, 'explosive', -1, true);
      }
      const c = g.cities;
      for (let k = 0; k < c.count; k++) {
        const dx = c.pos[k * 3] - px;
        const dy = c.pos[k * 3 + 1] - py;
        const dz = c.pos[k * 3 + 2] - pz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < a.radius * 0.7) damageCity(g, k, a.collateral * (1 - d / (a.radius * 0.7)), true);
      }
      break;
    }
    case 'turret':
      place(g, { kind: 'turret', x: pt![0] * 1.012, y: pt![1] * 1.012, z: pt![2] * 1.012, ttl: a.duration, radius: a.range, dps: a.damage, pull: 0, period: a.period });
      break;
    case 'mines': {
      const r = g.combatRng;
      for (let k = 0; k < a.count; k++) {
        let x = pt![0] + r.range(-0.3, 0.3);
        let y = pt![1] + r.range(-0.3, 0.3);
        let z = pt![2] + r.range(-0.3, 0.3);
        const l = Math.hypot(x, y, z) || 1;
        const rad = r.range(1.18, 1.75);
        x = (x / l) * rad;
        y = (y / l) * rad;
        z = (z / l) * rad;
        addMine(g, x, y, z, a.duration, a.damage);
      }
      g.emitFx(FX_PLACE, pt![0] * 1.4, pt![1] * 1.4, pt![2] * 1.4, 0, 0, 0, 0.3);
      break;
    }
    case 'decoy':
      place(g, { kind: 'decoy', x: pt![0], y: pt![1], z: pt![2], ttl: a.duration, radius: a.radius, dps: 0, pull: 0, period: 0 });
      break;
    case 'cryo':
      g.emitFx(FX_CRYO, pt![0] * 1.2, pt![1] * 1.2, pt![2] * 1.2, 0, 0, 0, a.radius);
      for (let j = 0; j < e.high; j++) {
        if (!e.alive[j]) continue;
        const r = Math.hypot(e.x[j], e.y[j], e.z[j]) || 1;
        if (r > 2.6) continue;
        const dx = e.x[j] / r - pt![0];
        const dy = e.y[j] / r - pt![1];
        const dz = e.z[j] / r - pt![2];
        if (dx * dx + dy * dy + dz * dz < a.radius * a.radius) {
          const big = e.role[j] === ROLE_BOSS || e.role[j] === ROLE_HORROR;
          e.stun[j] = Math.max(e.stun[j], a.duration * (big ? 0.3 : 1));
          e.slow[j] = 0.6;
          e.slowT[j] = a.duration * 2;
        }
      }
      break;
    case 'well':
      place(g, { kind: 'well', x: pt![0] * 1.3, y: pt![1] * 1.3, z: pt![2] * 1.3, ttl: a.duration, radius: a.radius, dps: a.dps, pull: a.pull, period: 0 });
      break;
    case 'singularity':
      place(g, { kind: 'singularity', x: pt![0] * 1.35, y: pt![1] * 1.35, z: pt![2] * 1.35, ttl: a.duration, radius: a.radius, dps: a.dps, pull: 1.6, period: 0 });
      break;
    case 'shield': {
      g.cityShield[city!] = Math.max(g.cityShield[city!], a.duration);
      const k = city! * 3;
      g.emitFx(FX_CITY_SHIELD, g.cities.pos[k], g.cities.pos[k + 1], g.cities.pos[k + 2]);
      break;
    }
    case 'repair': {
      healCity(g, city!, a.amount);
      const k = city! * 3;
      const c = g.cities.pos;
      for (const w of g.arsenal.weapons) {
        const n = tierOf(w).emitters;
        for (let m = 0; m < n; m++) {
          const dx = w.emitters[m * 3] - c[k];
          const dy = w.emitters[m * 3 + 1] - c[k + 1];
          const dz = w.emitters[m * 3 + 2] - c[k + 2];
          if (dx * dx + dy * dy + dz * dz < 0.8) {
            w.emDown[m] = 0;
            w.emHp[m] = EMITTER_HP;
          }
        }
      }
      g.emitFx(FX_CITY_SHIELD, c[k], c[k + 1], c[k + 2]);
      break;
    }
    case 'squadron':
      g.bonusAllies += a.count;
      g.squadronTarget = nearestLivingCity(g, pt![0], pt![1], pt![2]);
      g.emitFx(FX_PLACE, pt![0], pt![1], pt![2], 0, 0, 0, 0.2);
      break;
  }
  h.count--;
  if (h.count <= 0) g.items.splice(i, 1);
  g.itemsUsed++;
  return true;
}

export function updatePlaced(g: Game, dt: number): void {
  const e = g.enemies;
  const scale = defenseScale(g);
  for (let n = g.placed.length - 1; n >= 0; n--) {
    const p = g.placed[n];
    p.ttl -= dt;
    if (p.ttl <= 0) {
      g.placed.splice(n, 1);
      continue;
    }
    if (p.kind === 'decoy') continue;
    if (p.kind === 'turret') {
      p.timer -= dt;
      if (p.timer > 0) continue;
      p.timer += p.period;
      let best = -1;
      let bd = p.radius * p.radius;
      for (let i = 0; i < e.high; i++) {
        if (!e.alive[i] || e.cloaked[i]) continue;
        const dx = e.x[i] - p.x;
        const dy = e.y[i] - p.y;
        const dz = e.z[i] - p.z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (best >= 0) {
        g.emitFx(FX_TURRET, p.x, p.y, p.z, e.x[best], e.y[best], e.z[best], 0);
        damageEnemy(g, best, p.dps * scale, 'kinetic', -1, true);
      }
      continue;
    }
    // Wells and singularities: drag and grind.
    const r2 = p.radius * p.radius;
    const hole = p.kind === 'singularity';
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || e.state[i] === ST_SIEGE) continue;
      const dx = p.x - e.x[i];
      const dy = p.y - e.y[i];
      const dz = p.z - e.z[i];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      const big = e.role[i] === ROLE_BOSS || e.role[i] === ROLE_HORROR;
      const k = Math.min(1, p.pull * dt * (big ? 0.3 : 2));
      e.x[i] += dx * k;
      e.y[i] += dy * k;
      e.z[i] += dz * k;
      if (hole && !big && d2 < r2 * 0.12) {
        damageEnemy(g, i, e.hp[i] + e.shield[i] + 1, 'gravity', -1, true);
        continue;
      }
      damageEnemy(g, i, p.dps * scale * dt, 'gravity', -1, true);
    }
  }
}

export { stunArea };
