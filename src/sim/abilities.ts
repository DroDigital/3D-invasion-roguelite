import { ROLE_ABDUCTOR, ROLE_BOSS, ROLE_SABOTEUR, ST_APPROACH, ST_ATTACHED, ST_FLEE, ST_HOVER } from './enemies';
import { damageEnemy, healCities, returnPeople, runTriggers } from './damage';
import type { Game } from './game';
import { FX_CITY_SHIELD, FX_EMP, FX_STRIKE } from './game';

export function updateAbilities(g: Game, dt: number): void {
  for (const a of g.abilities) if (a.cd > 0) a.cd = Math.max(0, a.cd - dt);
  if (g.alienScaleT > 0 && (g.alienScaleT -= dt) <= 0) g.alienScale = 1;
  if (g.overclockT > 0) g.overclockT -= dt;
}

/** Trigger ability `i`. Point abilities need a unit direction; city abilities need a city index. */
export function activateAbility(g: Game, i: number, target?: { point?: [number, number, number]; city?: number }): boolean {
  const a = g.abilities[i];
  if (!a || a.cd > 0 || g.paused) return false;
  const act = a.def.action;
  const e = g.enemies;
  switch (act.kind) {
    case 'strike': {
      const p = target?.point;
      if (!p) return false;
      g.emitFx(FX_STRIKE, p[0], p[1], p[2], 0, 0, 0, act.radius);
      for (let j = 0; j < e.high; j++) {
        if (!e.alive[j]) continue;
        const r = Math.hypot(e.x[j], e.y[j], e.z[j]) || 1;
        if (r > 2.6) continue;
        const dx = e.x[j] / r - p[0];
        const dy = e.y[j] / r - p[1];
        const dz = e.z[j] / r - p[2];
        if (dx * dx + dy * dy + dz * dz < act.radius * act.radius) damageEnemy(g, j, act.damage * (1 + g.wave * 0.12), 'explosive', -1);
      }
      break;
    }
    case 'stunAll':
      g.emitFx(FX_EMP, 0, 0, 0);
      for (let j = 0; j < e.high; j++) if (e.alive[j]) e.stun[j] = Math.max(e.stun[j], act.duration * (e.role[j] === ROLE_BOSS ? 0.5 : 1));
      break;
    case 'cityShield': {
      const c = target?.city;
      if (c === undefined || c < 0 || g.cities.health[c] <= 0) return false;
      g.cityShield[c] = act.duration;
      const k = c * 3;
      g.emitFx(FX_CITY_SHIELD, g.cities.pos[k], g.cities.pos[k + 1], g.cities.pos[k + 2]);
      break;
    }
    case 'timeScale':
      g.alienScale = act.scale;
      g.alienScaleT = act.duration;
      break;
    case 'overclock':
      g.overclockMul = act.mul;
      g.overclockT = act.duration;
      break;
    case 'dropCargo':
      g.emitFx(FX_EMP, 0, 0, 0);
      for (let j = 0; j < e.high; j++) {
        if (!e.alive[j]) continue;
        if (e.role[j] === ROLE_ABDUCTOR) {
          if (e.cargo[j] > 0) {
            g.peopleRescued += e.cargo[j];
            returnPeople(g, e.city[j], e.cargo[j]);
            e.cargo[j] = 0;
          }
          if (e.state[j] === ST_FLEE) e.state[j] = ST_HOVER;
          e.stun[j] = Math.max(e.stun[j], act.stun);
        } else if (e.role[j] === ROLE_SABOTEUR && e.state[j] === ST_ATTACHED) {
          e.state[j] = ST_APPROACH;
          e.stun[j] = Math.max(e.stun[j], act.stun);
        }
      }
      break;
    case 'repairAll':
      healCities(g, act.amount);
      break;
    case 'barrage':
      g.emitFx(FX_EMP, 0, 0, 0);
      for (let j = 0; j < e.high; j++) {
        if (!e.alive[j] || e.role[j] === ROLE_BOSS) continue;
        damageEnemy(g, j, e.maxHp[j] * act.maxHpFrac + e.shield[j], 'kinetic', -1);
      }
      break;
  }
  a.cd = a.def.cooldown * g.build.abilityCooldown;
  runTriggers(g, 'abilityUse', -1, 0, 0, 0, -1);
  return true;
}
