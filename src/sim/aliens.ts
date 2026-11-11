import { ALIENS, ALIEN_TIERS, MODIFIERS, SPECIES, speciesIndex, WAVE_RULES } from '../data/aliens';
import type { Rng } from '../core/rng';
import { damageCity, damageEnemy, losePeople, nearestLivingCity, returnPeople } from './damage';
import {
  ROLE_ABDUCTOR, ROLE_BOSS, ROLE_CARRIER, ROLE_DESTROYER, ROLE_IDS, ROLE_INVADER, ROLE_SABOTEUR,
  ST_APPROACH, ST_ATTACHED, ST_FLEE, ST_HOVER, ST_SIEGE,
} from './enemies';
import type { Game } from './game';
import { FX_BLINK, FX_BOMB, FX_ESCAPE, FX_WARP } from './game';
import { tierOf } from './weapons';

/** Nothing flies lower than this; paths that would cut through the planet slide around it. */
const MIN_ALTITUDE = 1.03;
const LAND_RADIUS = 1.012;
const ROLE_INDEX = new Map(ROLE_IDS.map((r, i) => [r, i]));
const MOD_BITS = Object.fromEntries(MODIFIERS.map((m) => [m.id, m]));

export interface SpawnOpts {
  hpMul?: number;
  noMods?: boolean;
  /** No warp-in effect (children of splitting aliens, carrier spawns). */
  quiet?: boolean;
}

/** Health growth for a given wave; bosses grow per appearance instead. */
function waveHpMul(g: Game, boss: boolean): number {
  if (boss) return Math.pow(WAVE_RULES.bossGrowth, Math.max(0, Math.floor(g.wave / WAVE_RULES.bossEvery) - 1));
  return Math.pow(WAVE_RULES.hpGrowthPerWave, Math.max(0, g.wave - 1));
}

export function spawnAlien(g: Game, defIdx: number, tierIdx: number, x: number, y: number, z: number, city: number, rng: Rng, opts: SpawnOpts = {}): number {
  const e = g.enemies;
  const i = e.spawn();
  if (i < 0) return -1;
  const def = ALIENS[defIdx];
  const sp = SPECIES[speciesIndex.get(def.species)!];
  const tier = ALIEN_TIERS[tierIdx];
  const role = ROLE_INDEX.get(def.role)!;
  const boss = role === ROLE_BOSS;

  let mods = 0;
  if (!opts.noMods && !boss) {
    const [lo, hi] = tier.modifiers;
    let n = lo + rng.int(hi - lo + 1);
    while (n > 0) {
      const m = MODIFIERS[rng.int(MODIFIERS.length)];
      if (mods & m.bit) continue;
      mods |= m.bit;
      n--;
    }
  }

  const maxHp = def.hp * tier.hpMul * waveHpMul(g, boss) * (opts.hpMul ?? 1);
  e.def[i] = defIdx;
  e.species[i] = speciesIndex.get(def.species)!;
  e.role[i] = role;
  e.tier[i] = tierIdx;
  e.mods[i] = mods;
  e.hp[i] = e.maxHp[i] = maxHp;
  let shield = (sp.shield ?? 0) * maxHp;
  if (mods & MOD_BITS.shielded.bit) shield += MOD_BITS.shielded.value * maxHp;
  e.shield[i] = e.maxShield[i] = shield;
  e.armor[i] = (sp.armor ?? 0) * (1 + (g.wave - 1) * 0.08) * (boss ? 2 : 1);
  e.regen[i] = ((sp.regen ?? 0) + (mods & MOD_BITS.regenerating.bit ? MOD_BITS.regenerating.value : 0)) * maxHp;
  e.speed[i] = def.speed * tier.speedMul * (mods & MOD_BITS.fast.bit ? MOD_BITS.fast.value : 1);
  e.dmgMul[i] = tier.dmgMul * (1 + (g.wave - 1) * 0.05);
  e.rewardMul[i] = tier.rewardMul * (opts.hpMul !== undefined ? 0.3 : 1);
  e.scale[i] = def.scale * tier.scale;
  e.x[i] = x;
  e.y[i] = y;
  e.z[i] = z;
  const l = Math.hypot(x, y, z) || 1;
  e.dx[i] = -x / l;
  e.dy[i] = -y / l;
  e.dz[i] = -z / l;
  e.city[i] = city;
  e.seed[i] = rng.next() * 100;
  e.mtimer[i] = rng.range(1, 3);
  e.timer[i] = role === ROLE_CARRIER || role === ROLE_BOSS ? def.roleParams.spawnPeriod * 0.5 : 0;
  if (role === ROLE_SABOTEUR) pickSabotageTarget(g, i, rng);
  if (boss) {
    g.bossSlot = i;
    g.addLog(`WARNING: ${def.name.toUpperCase()} INBOUND`, 'boss');
  }
  if (!opts.quiet) g.emitFx(FX_WARP, x, y, z, 0, 0, 0, e.scale[i]);
  return i;
}

function pickSabotageTarget(g: Game, i: number, rng: Rng): void {
  const ws = g.arsenal.weapons;
  const e = g.enemies;
  if (ws.length === 0) {
    e.tgtW[i] = -1;
    return;
  }
  const s = rng.int(ws.length);
  e.tgtW[i] = s;
  e.tgtE[i] = rng.int(tierOf(ws[s]).emitters);
}

/**
 * Move enemy i toward (tx,ty,tz) using its species' movement style. Returns true on arrival.
 * `clamp` keeps it above the atmosphere until the final approach.
 */
function moveTo(g: Game, i: number, tx: number, ty: number, tz: number, spd: number, dt: number, arrive: number, clamp: boolean): boolean {
  const e = g.enemies;
  let vx = tx - e.x[i];
  let vy = ty - e.y[i];
  let vz = tz - e.z[i];
  const dist = Math.hypot(vx, vy, vz);
  let move = spd * dt;
  if (dist <= move + arrive) {
    e.x[i] = tx;
    e.y[i] = ty;
    e.z[i] = tz;
    return true;
  }
  vx /= dist;
  vy /= dist;
  vz /= dist;
  e.dx[i] = vx;
  e.dy[i] = vy;
  e.dz[i] = vz;

  const style = SPECIES[e.species[i]].movement;
  if (style !== 'direct' && dist > 0.25) {
    // Unit radial and a tangent perpendicular to both radial and heading.
    const r = Math.hypot(e.x[i], e.y[i], e.z[i]) || 1;
    const rx = e.x[i] / r;
    const ry = e.y[i] / r;
    const rz = e.z[i] / r;
    let px = ry * vz - rz * vy;
    let py = rz * vx - rx * vz;
    let pz = rx * vy - ry * vx;
    const pl = Math.hypot(px, py, pz) || 1;
    px /= pl;
    py /= pl;
    pz /= pl;
    const fade = Math.min(1, dist / 1.2);
    if (style === 'swarm') {
      const w = Math.sin(g.time * 5 + e.seed[i]) * 0.6 * fade;
      vx += px * w;
      vy += py * w;
      vz += pz * w;
    } else if (style === 'spiral') {
      const s = 0.75 * fade * (e.seed[i] % 2 < 1 ? 1 : -1);
      vx = vx * 0.8 + px * s;
      vy = vy * 0.8 + py * s;
      vz = vz * 0.8 + pz * s;
    } else if (style === 'lumber') {
      move *= 0.75 + 0.25 * Math.sin(g.time * 2 + e.seed[i]);
    } else if (style === 'blink') {
      move *= 0.7;
      e.mtimer[i] -= dt;
      if (e.mtimer[i] <= 0 && dist > 0.5) {
        e.mtimer[i] = 2.5 + (e.seed[i] % 1.5);
        const jump = Math.min(0.45, dist - 0.3);
        g.emitFx(FX_BLINK, e.x[i], e.y[i], e.z[i]);
        e.x[i] += e.dx[i] * jump;
        e.y[i] += e.dy[i] * jump;
        e.z[i] += e.dz[i] * jump;
        g.emitFx(FX_BLINK, e.x[i], e.y[i], e.z[i]);
      }
    }
  }
  e.x[i] += vx * move;
  e.y[i] += vy * move;
  e.z[i] += vz * move;
  if (clamp && dist > 0.1) {
    const r = Math.hypot(e.x[i], e.y[i], e.z[i]);
    if (r < MIN_ALTITUDE) {
      const s = MIN_ALTITUDE / r;
      e.x[i] *= s;
      e.y[i] *= s;
      e.z[i] *= s;
    }
  }
  return false;
}

function retarget(g: Game, i: number): boolean {
  const e = g.enemies;
  const city = nearestLivingCity(g, e.x[i], e.y[i], e.z[i]);
  if (city < 0) return false;
  e.city[i] = city;
  if (e.state[i] !== ST_FLEE && e.state[i] !== ST_ATTACHED) e.state[i] = ST_APPROACH;
  return true;
}

/**
 * Advance every alien. `dt` is alien time (scaled by time dilation); `realDt` is wall time,
 * used for status effects the player applies so dilation doesn't stretch them.
 */
export function updateAliens(g: Game, dt: number, realDt: number): void {
  const e = g.enemies;
  const c = g.cities;
  g.threat.fill(0);
  for (let k = 0; k < c.count; k++) if (g.cityShield[k] > 0) g.cityShield[k] -= realDt;
  const speedMul = g.build.enemySpeed;

  for (let i = 0; i < e.high; i++) {
    if (!e.alive[i]) continue;
    if (e.flash[i] > 0) e.flash[i] -= realDt;
    if (e.slowT[i] > 0) e.slowT[i] -= realDt;
    if (e.markT[i] > 0 && (e.markT[i] -= realDt) <= 0) e.mark[i] = 0;
    if (e.dotT[i] > 0) {
      e.dotT[i] -= realDt;
      const w = g.arsenal.weapons[e.dotW[i]];
      damageEnemy(g, i, e.dotDps[i] * realDt, w ? w.def.damageType : 'energy', e.dotW[i], true);
      if (!e.alive[i]) continue;
    }
    e.sinceHit[i] += dt;
    // Regeneration slows to a quarter while under fire.
    if (e.regen[i] > 0 && e.hp[i] < e.maxHp[i]) e.hp[i] = Math.min(e.maxHp[i], e.hp[i] + e.regen[i] * dt * (e.sinceHit[i] > 2 ? 1 : 0.25));
    if (e.maxShield[i] > 0 && e.sinceHit[i] > 2 && e.shield[i] < e.maxShield[i]) e.shield[i] = Math.min(e.maxShield[i], e.shield[i] + e.maxShield[i] * 0.12 * dt);

    const sp = SPECIES[e.species[i]];
    if (sp.cloak) {
      const t = (g.time + e.seed[i]) % sp.cloak.period;
      e.cloaked[i] = t > sp.cloak.period - sp.cloak.duration && e.state[i] !== ST_SIEGE && e.state[i] !== ST_ATTACHED ? 1 : 0;
    }

    const role = e.role[i];
    let city = e.city[i];
    if (e.state[i] !== ST_FLEE && role !== ROLE_SABOTEUR && (city < 0 || c.health[city] <= 0)) {
      if (!retarget(g, i)) continue;
      city = e.city[i];
    }
    if (e.stun[i] > 0) {
      e.stun[i] -= realDt;
      if (e.state[i] === ST_SIEGE || e.state[i] === ST_HOVER) g.threat[city]++;
      continue;
    }
    const def = ALIENS[e.def[i]];
    const rp = def.roleParams;
    const spd = e.speed[i] * speedMul * (e.slowT[i] > 0 ? 1 - e.slow[i] : 1);
    const k = city * 3;
    const cx = c.pos[k];
    const cy = c.pos[k + 1];
    const cz = c.pos[k + 2];

    switch (role) {
      case ROLE_INVADER:
        if (e.state[i] === ST_SIEGE) {
          g.threat[city]++;
          damageCity(g, city, rp.siegeDps * e.dmgMul[i] * dt, false);
        } else if (moveTo(g, i, cx * LAND_RADIUS, cy * LAND_RADIUS, cz * LAND_RADIUS, spd, dt, 0.004, true)) {
          e.state[i] = ST_SIEGE;
          damageCity(g, city, 2 * e.dmgMul[i], true);
        }
        break;

      case ROLE_DESTROYER:
      case ROLE_BOSS:
        if (e.state[i] === ST_HOVER) {
          g.threat[city]++;
          e.timer[i] += dt;
          if (e.timer[i] >= rp.bombPeriod) {
            e.timer[i] -= rp.bombPeriod;
            g.emitFx(FX_BOMB, e.x[i], e.y[i], e.z[i], cx, cy, cz, role === ROLE_BOSS ? 2 : 1);
            damageCity(g, city, rp.bombDmg * e.dmgMul[i], true);
            if (role === ROLE_BOSS && g.combatRng.next() < 0.3) {
              // Bosses roam: after some bombardment they move to another city.
              const next = g.combatRng.int(c.count);
              if (c.health[next] > 0) {
                e.city[i] = next;
                e.state[i] = ST_APPROACH;
              }
            }
          }
          if (role === ROLE_BOSS) spawnBrood(g, i, dt);
        } else {
          if (role === ROLE_BOSS) spawnBrood(g, i, dt);
          if (moveTo(g, i, cx * rp.hoverAlt, cy * rp.hoverAlt, cz * rp.hoverAlt, spd, dt, 0.01, true)) e.state[i] = ST_HOVER;
        }
        break;

      case ROLE_ABDUCTOR:
        if (e.state[i] === ST_FLEE) {
          const r = Math.hypot(e.x[i], e.y[i], e.z[i]) || 1;
          const out = spd * 1.4 * dt;
          e.dx[i] = e.x[i] / r;
          e.dy[i] = e.y[i] / r;
          e.dz[i] = e.z[i] / r;
          e.x[i] += e.dx[i] * out;
          e.y[i] += e.dy[i] * out;
          e.z[i] += e.dz[i] * out;
          if (r > WAVE_RULES.spawnRadius) {
            const back = e.cargo[i] * g.build.abductRecovery;
            g.peopleTaken += e.cargo[i] - back;
            if (back > 0) returnPeople(g, city, back);
            g.emitFx(FX_ESCAPE, e.x[i], e.y[i], e.z[i]);
            g.addLog(`ABDUCTOR ESCAPED WITH ${(e.cargo[i] / 1e6).toFixed(2)}M PEOPLE`, 'warn');
            if (g.bossSlot === i) g.bossSlot = -1;
            e.kill(i);
          }
        } else if (e.state[i] === ST_HOVER) {
          g.threat[city]++;
          if (g.cityShield[city] <= 0) {
            const cap = rp.capacity * e.dmgMul[i];
            const take = Math.min(rp.abductRate * e.dmgMul[i] * dt, cap - e.cargo[i]);
            e.cargo[i] += losePeople(g, city, take);
            if (e.cargo[i] >= cap - 1 || c.population[city] <= 0) e.state[i] = ST_FLEE;
          }
        } else if (moveTo(g, i, cx * rp.hoverAlt, cy * rp.hoverAlt, cz * rp.hoverAlt, spd, dt, 0.008, true)) {
          e.state[i] = ST_HOVER;
        }
        break;

      case ROLE_SABOTEUR: {
        const w = g.arsenal.weapons[e.tgtW[i]];
        if (!w || e.tgtE[i] >= tierOf(w).emitters) {
          pickSabotageTarget(g, i, g.combatRng);
          if (e.tgtW[i] < 0) {
            // Nothing to sabotage: dive on a city like an invader.
            e.role[i] = ROLE_INVADER;
            e.state[i] = ST_APPROACH;
          }
          break;
        }
        const m = e.tgtE[i] * 3;
        const ex = w.emitters[m] * 1.03;
        const ey = w.emitters[m + 1] * 1.03;
        const ez = w.emitters[m + 2] * 1.03;
        if (e.state[i] === ST_ATTACHED) {
          e.x[i] = ex;
          e.y[i] = ey;
          e.z[i] = ez;
          w.jam += rp.jam * Math.min(1.5, e.dmgMul[i]);
        } else if (moveTo(g, i, ex, ey, ez, spd * 1.2, dt, 0.03, true)) {
          e.state[i] = ST_ATTACHED;
          g.addLog(`SABOTEUR ON ${w.def.name.toUpperCase()}`, 'warn');
        }
        break;
      }

      case ROLE_CARRIER:
        if (e.state[i] === ST_HOVER) {
          g.threat[city]++;
          spawnBrood(g, i, dt);
        } else if (moveTo(g, i, cx * rp.hoverAlt, cy * rp.hoverAlt, cz * rp.hoverAlt, spd, dt, 0.01, true)) {
          e.state[i] = ST_HOVER;
        }
        break;
    }
  }
}

/** Carriers and bosses launch small invaders of their own species. */
function spawnBrood(g: Game, i: number, dt: number): void {
  const e = g.enemies;
  const rp = ALIENS[e.def[i]].roleParams;
  e.timer[i] += dt;
  if (e.timer[i] < rp.spawnPeriod) return;
  e.timer[i] -= rp.spawnPeriod;
  const species = SPECIES[e.species[i]].id;
  const child = ALIENS.findIndex((a) => a.species === species && a.role === 'invader');
  const r = g.combatRng;
  for (let k = 0; k < rp.spawnCount; k++) {
    const j = spawnAlien(g, child, 0, e.x[i] + r.range(-0.06, 0.06), e.y[i] + r.range(-0.06, 0.06), e.z[i] + r.range(-0.06, 0.06), e.city[i], r, { hpMul: 0.5, noMods: true, quiet: true });
    if (j >= 0) {
      // Fan out to nearby cities rather than piling on one.
      const t = nearestLivingCity(g, e.x[j] + r.range(-0.5, 0.5), e.y[j] + r.range(-0.5, 0.5), e.z[j] + r.range(-0.5, 0.5));
      if (t >= 0) e.city[j] = t;
    }
  }
  g.emitFx(FX_WARP, e.x[i], e.y[i], e.z[i], 0, 0, 0, e.scale[i] * 0.5);
}
