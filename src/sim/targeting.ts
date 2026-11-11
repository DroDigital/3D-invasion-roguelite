import type { Rng } from '../core/rng';
import type { TargetRule } from '../data/types';
import type { CityState } from './cities';
import { EnemyPool, MAX_ENEMIES, ROLE_ABDUCTOR, ROLE_BOSS, ROLE_SABOTEUR, ST_ATTACHED, ST_FLEE, ST_SIEGE } from './enemies';

const picked = new Uint8Array(MAX_ENEMIES);
const density = new Float32Array(MAX_ENEMIES);
const DENSITY_R2 = 0.25 * 0.25;
const SAMPLE = 48;

function distToCity(e: EnemyPool, c: CityState, i: number): number {
  if (e.state[i] === ST_SIEGE) return -1;
  const k = e.city[i] * 3;
  const dx = e.x[i] - c.pos[k];
  const dy = e.y[i] - c.pos[k + 1];
  const dz = e.z[i] - c.pos[k + 2];
  return dx * dx + dy * dy + dz * dz;
}

/** Lower score = engage first. */
function score(rule: TargetRule, e: EnemyPool, c: CityState, i: number, rng: Rng): number {
  switch (rule) {
    case 'highestHp':
      return -(e.hp[i] + e.shield[i]);
    case 'lowestHp':
      return e.hp[i] + e.shield[i];
    case 'nearestToCity':
      return distToCity(e, c, i);
    case 'abductorsFirst':
      if (e.role[i] === ROLE_ABDUCTOR) return -100 - e.cargo[i] * 1e-6 - (e.state[i] === ST_FLEE ? 50 : 0);
      return distToCity(e, c, i);
    case 'saboteursFirst':
      if (e.role[i] === ROLE_SABOTEUR) return e.state[i] === ST_ATTACHED ? -200 : -100;
      return distToCity(e, c, i);
    case 'fastest':
      return -e.speed[i];
    case 'bossFirst':
      return -(e.role[i] === ROLE_BOSS ? 1e9 : 0) - e.tier[i] * 1e6 - e.hp[i];
    case 'densest':
      return -density[i];
    case 'random':
      return rng.next();
  }
}

/** Approximate local crowding: neighbours within a radius, from a strided sample of enemies. */
function computeDensity(e: EnemyPool): void {
  const stride = Math.max(1, Math.floor(e.high / SAMPLE));
  for (let i = 0; i < e.high; i++) {
    if (!e.alive[i]) continue;
    let n = 0;
    for (let j = i % stride; j < e.high; j += stride) {
      if (!e.alive[j]) continue;
      const dx = e.x[i] - e.x[j];
      const dy = e.y[i] - e.y[j];
      const dz = e.z[i] - e.z[j];
      if (dx * dx + dy * dy + dz * dz < DENSITY_R2) n++;
    }
    density[i] = n * stride;
  }
}

/** Fill `out` with up to `k` enemy slots chosen by `rule`, skipping cloaked enemies and
 *  ones that in-flight damage will already kill. Weapons are global: every enemy is in range. */
export function selectTargets(rule: TargetRule, k: number, e: EnemyPool, c: CityState, rng: Rng, out: Int16Array): number {
  if (rule === 'densest') computeDensity(e);
  let n = 0;
  for (let pass = 0; pass < k; pass++) {
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || picked[i] || e.cloaked[i] || e.pending[i] >= e.hp[i] + e.shield[i]) continue;
      const s = score(rule, e, c, i, rng);
      if (s < bestScore) {
        bestScore = s;
        best = i;
      }
    }
    if (best < 0) break;
    picked[best] = 1;
    out[n++] = best;
  }
  for (let j = 0; j < n; j++) picked[out[j]] = 0;
  return n;
}

/** Nearest visible enemy to a point, excluding one slot; -1 if none within range. */
export function nearestEnemy(e: EnemyPool, x: number, y: number, z: number, range: number, exclude: number, excludeMask?: Uint8Array): number {
  let best = -1;
  let bd = range * range;
  for (let i = 0; i < e.high; i++) {
    if (!e.alive[i] || i === exclude || e.cloaked[i] || (excludeMask && excludeMask[i])) continue;
    const dx = e.x[i] - x;
    const dy = e.y[i] - y;
    const dz = e.z[i] - z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
