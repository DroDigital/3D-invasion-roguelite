import { ALLIES } from '../data/allies';
import { damageEnemy, nearestLivingCity } from './damage';
import type { Game } from './game';
import { FX_ALLY_SHOT } from './game';
import { nearestEnemy } from './targeting';

export const MAX_ALLIES = 320;

/** Allied fighters: steering agents in the Earth-fixed frame. Purely additive firepower. */
export class AllyPool {
  readonly alive = new Uint8Array(MAX_ALLIES);
  readonly x = new Float32Array(MAX_ALLIES);
  readonly y = new Float32Array(MAX_ALLIES);
  readonly z = new Float32Array(MAX_ALLIES);
  readonly vx = new Float32Array(MAX_ALLIES);
  readonly vy = new Float32Array(MAX_ALLIES);
  readonly vz = new Float32Array(MAX_ALLIES);
  readonly target = new Int16Array(MAX_ALLIES).fill(-1);
  readonly targetGen = new Uint16Array(MAX_ALLIES);
  readonly cooldown = new Float32Array(MAX_ALLIES);
  readonly retarget = new Float32Array(MAX_ALLIES);
  readonly life = new Float32Array(MAX_ALLIES);
  readonly model = new Uint8Array(MAX_ALLIES);
  count = 0;
  kills = 0;
  damage = 0;
  launchAcc = 0;
}

export function alliesWanted(wave: number): number {
  return Math.min(ALLIES.max, MAX_ALLIES, Math.round(ALLIES.base + ALLIES.perWave * wave));
}

function launch(g: Game, a: AllyPool): void {
  const c = g.cities;
  const r = g.combatRng;
  const city = r.int(c.count);
  if (c.health[city] <= 0) return;
  let i = -1;
  for (let k = 0; k < MAX_ALLIES; k++) if (!a.alive[k]) { i = k; break; }
  if (i < 0) return;
  a.alive[i] = 1;
  a.count++;
  const k = city * 3;
  a.x[i] = c.pos[k] * 1.02;
  a.y[i] = c.pos[k + 1] * 1.02;
  a.z[i] = c.pos[k + 2] * 1.02;
  // Climb straight out of the city.
  a.vx[i] = c.pos[k] * ALLIES.speed;
  a.vy[i] = c.pos[k + 1] * ALLIES.speed;
  a.vz[i] = c.pos[k + 2] * ALLIES.speed;
  a.target[i] = -1;
  a.cooldown[i] = r.range(0, 0.5);
  a.retarget[i] = 0;
  a.life[i] = ALLIES.sortie * r.range(0.8, 1.2);
  a.model[i] = r.int(ALLIES.models.length);
}

export function updateAllies(g: Game, dt: number): void {
  const a = g.allies;
  const e = g.enemies;
  const fighting = g.phase === 'spawning' || g.phase === 'clearing';
  if (fighting && a.count < Math.min(MAX_ALLIES, alliesWanted(g.wave) + g.bonusAllies)) {
    a.launchAcc += dt * ALLIES.launchRate;
    while (a.launchAcc >= 1 && a.count < Math.min(MAX_ALLIES, alliesWanted(g.wave) + g.bonusAllies)) {
      a.launchAcc -= 1;
      launch(g, a);
    }
  }
  const dmg = ALLIES.damage * (1 + ALLIES.damagePerWave * Math.max(0, g.wave - 1));
  for (let i = 0; i < MAX_ALLIES; i++) {
    if (!a.alive[i]) continue;
    a.life[i] -= dt;
    let tx: number;
    let ty: number;
    let tz: number;
    let t = a.target[i];
    if (t >= 0 && (!e.alive[t] || e.gen[t] !== a.targetGen[i] || e.cloaked[t])) t = a.target[i] = -1;
    a.retarget[i] -= dt;
    if (fighting && a.life[i] > 0 && (t < 0 || a.retarget[i] <= 0)) {
      t = nearestEnemy(e, a.x[i], a.y[i], a.z[i], 3, -1);
      a.target[i] = t;
      if (t >= 0) a.targetGen[i] = e.gen[t];
      a.retarget[i] = 0.6;
    }
    if (t >= 0) {
      tx = e.x[t];
      ty = e.y[t];
      tz = e.z[t];
    } else {
      // Head home and land: the sortie is over (or there is nothing left to fight).
      const home = nearestLivingCity(g, a.x[i], a.y[i], a.z[i]);
      const k = Math.max(0, home) * 3;
      tx = g.cities.pos[k];
      ty = g.cities.pos[k + 1];
      tz = g.cities.pos[k + 2];
      const d = Math.hypot(tx - a.x[i], ty - a.y[i], tz - a.z[i]);
      if (home < 0 || d < 0.04 || (!fighting && a.life[i] < -20)) {
        a.alive[i] = 0;
        a.count--;
        continue;
      }
    }
    // Steering: turn the velocity toward the target, at constant speed.
    let dx = tx - a.x[i];
    let dy = ty - a.y[i];
    let dz = tz - a.z[i];
    const dist = Math.hypot(dx, dy, dz) || 1;
    dx /= dist;
    dy /= dist;
    dz /= dist;
    const k = Math.min(1, ALLIES.turn * dt);
    let vx = a.vx[i] + (dx * ALLIES.speed - a.vx[i]) * k;
    let vy = a.vy[i] + (dy * ALLIES.speed - a.vy[i]) * k;
    let vz = a.vz[i] + (dz * ALLIES.speed - a.vz[i]) * k;
    const vl = Math.hypot(vx, vy, vz) || 1;
    vx = (vx / vl) * ALLIES.speed;
    vy = (vy / vl) * ALLIES.speed;
    vz = (vz / vl) * ALLIES.speed;
    a.vx[i] = vx;
    a.vy[i] = vy;
    a.vz[i] = vz;
    a.x[i] += vx * dt;
    a.y[i] += vy * dt;
    a.z[i] += vz * dt;
    const r = Math.hypot(a.x[i], a.y[i], a.z[i]);
    if (r < 1.03 && t >= 0) {
      const s = 1.03 / r;
      a.x[i] *= s;
      a.y[i] *= s;
      a.z[i] *= s;
    }
    a.cooldown[i] -= dt;
    if (t >= 0 && dist < ALLIES.range && a.cooldown[i] <= 0) {
      a.cooldown[i] = 1 / ALLIES.fireRate;
      g.emitFx(FX_ALLY_SHOT, a.x[i], a.y[i], a.z[i], e.x[t], e.y[t], e.z[t], 0);
      const before = g.kills;
      a.damage += damageEnemy(g, t, dmg, 'kinetic', -1);
      if (g.kills > before) a.kills++;
    }
  }
}
