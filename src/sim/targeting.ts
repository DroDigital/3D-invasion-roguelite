import type { TargetRule } from '../data/types';
import type { CityState } from './cities';
import { ENEMY_SIEGE, EnemyPool, MAX_ENEMIES } from './enemies';

const picked = new Uint8Array(MAX_ENEMIES);

/** Lower score = engage first. */
function score(rule: TargetRule, e: EnemyPool, c: CityState, i: number): number {
  switch (rule) {
    case 'highestHp':
      return -e.hp[i];
    case 'lowestHp':
      return e.hp[i];
    case 'nearestToCity': {
      if (e.state[i] === ENEMY_SIEGE) return -1;
      const k = e.city[i] * 3;
      const dx = e.x[i] - c.pos[k];
      const dy = e.y[i] - c.pos[k + 1];
      const dz = e.z[i] - c.pos[k + 2];
      return dx * dx + dy * dy + dz * dz;
    }
  }
}

/** Fill `out` with up to `k` enemy slots chosen by `rule`, skipping enemies that
 *  in-flight damage will already kill. Weapons are global: every enemy is in range. */
export function selectTargets(rule: TargetRule, k: number, e: EnemyPool, c: CityState, out: Int16Array): number {
  let n = 0;
  for (let pass = 0; pass < k; pass++) {
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || picked[i] || e.pending[i] >= e.hp[i]) continue;
      const s = score(rule, e, c, i);
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
