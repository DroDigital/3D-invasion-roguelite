import { ALIENS, ALIEN_TIERS, MODIFIERS, SPECIES, speciesIndex, WAVE_RULES } from '../data/aliens';
import type { Rng } from '../core/rng';
import { damageCity, DMG_DIVE, DMG_SIEGE, DMG_TENTACLE, damageEnemy, losePeople, nearestLivingCity, returnPeople } from './damage';
import {
  ROLE_ABDUCTOR, ROLE_BOSS, ROLE_CARRIER, ROLE_DESTROYER, ROLE_GUNSHIP, ROLE_HORROR, ROLE_IDS, ROLE_INVADER, ROLE_SABOTEUR,
  ROLE_TENTACLE, ST_APPROACH, ST_ATTACHED, ST_FLEE, ST_HOVER, ST_SIEGE,
} from './enemies';
import type { Game } from './game';
import { FX_BLINK, FX_BOSS_PHASE, FX_ESCAPE, FX_EXPLOSION, FX_IMPACT, FX_SLAM, FX_TENTACLE, FX_WARP } from './game';
import { tierOf } from './weapons';
import { CITIES } from '../data/cities';
import { aegisAbsorb, AEGIS_R, decoyFor, emitterBroken, hitEmitter } from './defense';
import { fireEnemyShot, SHOT_KINDS } from './hostile';

/** Nothing flies lower than this; paths that would cut through the planet slide around it. */
const MIN_ALTITUDE = 1.03;
const LAND_RADIUS = 1.012;
const ROLE_INDEX = new Map(ROLE_IDS.map((r, i) => [r, i]));
const ECLIPSE_CLOAK = { period: 7, duration: 1.8 };
const MOD_BITS = Object.fromEntries(MODIFIERS.map((m) => [m.id, m]));

export interface SpawnOpts {
  hpMul?: number;
  noMods?: boolean;
  /** Swarm fodder: reduced rewards. */
  fodder?: boolean;
  /** No warp-in effect (children of splitting aliens, carrier spawns). */
  quiet?: boolean;
}

/** Health growth for a given wave; bosses grow per appearance instead. */
function waveHpMul(g: Game, boss: boolean, role = 0, elder = false): number {
  if (elder) return Math.pow(WAVE_RULES.bossGrowth, Math.max(0, (g.wave - WAVE_RULES.elderFrom) / WAVE_RULES.bossEvery));
  if (role === ROLE_HORROR) return waveHpMul(g, false) * 0.55;
  if (role === ROLE_TENTACLE) return waveHpMul(g, false) * 0.7;
  if (boss) return Math.pow(WAVE_RULES.bossGrowth, Math.max(0, Math.floor(g.wave / WAVE_RULES.bossEvery) - 1));
  const over = Math.max(0, g.wave - WAVE_RULES.overtimeWave);
  return Math.pow(WAVE_RULES.hpGrowthPerWave, Math.max(0, g.wave - 1)) * Math.pow(WAVE_RULES.overtimeGrowth, over);
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
  if (!opts.noMods && !boss && role !== ROLE_HORROR && role !== ROLE_TENTACLE) {
    const [lo, hi] = tier.modifiers;
    let n = lo + rng.int(hi - lo + 1);
    while (n > 0) {
      const m = MODIFIERS[rng.int(MODIFIERS.length)];
      if (mods & m.bit) continue;
      mods |= m.bit;
      n--;
    }
  }

  const growth = opts.fodder ? Math.pow(WAVE_RULES.fodderHpGrowth, Math.max(0, g.wave - 1)) : waveHpMul(g, boss, role, def.elder === true);
  const maxHp = def.hp * tier.hpMul * growth * (opts.hpMul ?? 1) * g.dir.hpMul;
  e.def[i] = defIdx;
  e.species[i] = speciesIndex.get(def.species)!;
  e.role[i] = role;
  e.tier[i] = tierIdx;
  e.mods[i] = mods;
  e.hp[i] = e.maxHp[i] = maxHp;
  // Swarm fodder is cannon fodder: no species shields, armour or regeneration.
  const lean = opts.fodder === true;
  let shield = lean ? 0 : (sp.shield ?? 0) * maxHp;
  if (mods & MOD_BITS.shielded.bit) shield += MOD_BITS.shielded.value * maxHp;
  e.shield[i] = e.maxShield[i] = shield;
  e.armor[i] = (lean ? 0 : (sp.armor ?? 0) * (1 + (g.wave - 1) * 0.08) * (boss ? 2 : 1)) + g.dir.armorAdd;
  e.regen[i] = lean ? 0 : ((sp.regen ?? 0) + (mods & MOD_BITS.regenerating.bit ? MOD_BITS.regenerating.value : 0)) * maxHp;
  e.speed[i] = def.speed * tier.speedMul * (mods & MOD_BITS.fast.bit ? MOD_BITS.fast.value : 1) * g.dir.speedMul;
  e.dmgMul[i] = tier.dmgMul * (1 + (g.wave - 1) * 0.05) * Math.pow(1.06, Math.max(0, g.wave - WAVE_RULES.overtimeWave));
  e.rewardMul[i] = tier.rewardMul * (opts.hpMul !== undefined ? (opts.fodder ? WAVE_RULES.fodderReward : 0.3) : 1);
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
  e.btimer[i] = role === ROLE_CARRIER || role === ROLE_BOSS || role === ROLE_HORROR ? (def.roleParams.spawnPeriod ?? 0) * 0.5 : 0;
  e.atk[i] = def.attack ? rng.range(0.4, def.attack.period) : 0;
  if (role === ROLE_SABOTEUR) pickSabotageTarget(g, i, rng);
  e.fodder[i] = opts.fodder ? 1 : 0;
  if (def.mothership) g.addLog(`MOTHERSHIP INBOUND: ${def.name.toUpperCase()}`, 'boss');
  if (boss || def.elder) {
    g.bossSlot = i;
    g.addLog(def.elder ? `A GREAT OLD ONE STIRS: ${def.name.toUpperCase()}` : `WARNING: ${def.name.toUpperCase()} INBOUND`, 'boss');
  } else if (role === ROLE_HORROR) g.addLog(`HORROR FROM THE OUTER DARK: ${def.name.toUpperCase()}`, 'boss');
  if (role === ROLE_GUNSHIP) e.tgtW[i] = -1;
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
  if (e.role[i] === ROLE_TENTACLE || (e.state[i] !== ST_FLEE && e.state[i] !== ST_ATTACHED)) e.state[i] = ST_APPROACH;
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
    const role = e.role[i];
    const cloak = sp.cloak ?? (g.dir.cloakAll && role !== ROLE_BOSS && role !== ROLE_HORROR && role !== ROLE_TENTACLE ? ECLIPSE_CLOAK : undefined);
    if (cloak) {
      const t = (g.time + e.seed[i]) % cloak.period;
      e.cloaked[i] = t > cloak.period - cloak.duration && e.state[i] !== ST_SIEGE && e.state[i] !== ST_ATTACHED ? 1 : 0;
    }

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
    // Far out, ships close at cruise speed so the bigger battlefield doesn't drag.
    const rr = Math.hypot(e.x[i], e.y[i], e.z[i]);
    const cruise = rr > 3 ? 1 + (rr - 3) * 0.7 : 1;
    const spd = e.speed[i] * speedMul * cruise * (e.slowT[i] > 0 ? 1 - e.slow[i] : 1);
    const k = city * 3;
    const cx = c.pos[k];
    const cy = c.pos[k + 1];
    const cz = c.pos[k + 2];

    // Ranged attacks: anything with a gun shoots its target city on approach or on station.
    if (def.attack && role !== ROLE_GUNSHIP) {
      const atk = def.attack;
      const r2 = (cx - e.x[i]) ** 2 + (cy - e.y[i]) ** 2 + (cz - e.z[i]) ** 2;
      const inRange = atk.range ? r2 < atk.range * atk.range : e.state[i] === ST_HOVER || r2 < 1.2;
      if (inRange && !(e.fodder[i] && role === ROLE_INVADER)) {
        e.atk[i] -= dt * g.dir.fireRateMul * (1 + e.phase[i] * 0.4);
        if (e.atk[i] <= 0) {
          e.atk[i] += atk.period;
          volley(g, i, atk.volley ?? 1, atk.dmg * e.dmgMul[i] * SHOT_DMG, city, -1, -1);
        }
      }
    }

    switch (role) {
      case ROLE_INVADER:
        if (e.state[i] === ST_SIEGE) {
          g.threat[city]++;
          damageCity(g, city, rp.siegeDps * e.dmgMul[i] * dt, false, DMG_SIEGE);
        } else if ((e.fodder[i] && e.seed[i] % 1 < DIVE_SHARE) || g.dir.kamikaze) {
          // Swarms dive straight into the ground: a crater and a burst of damage.
          if (moveTo(g, i, cx * 0.995, cy * 0.995, cz * 0.995, spd * 1.25, dt, 0.004, false) || Math.hypot(e.x[i], e.y[i], e.z[i]) < 1.0) {
            crash(g, i, city, KAMIKAZE_DMG * e.dmgMul[i] * (e.fodder[i] ? 1 : 2.5));
            continue;
          }
          const r = Math.hypot(e.x[i], e.y[i], e.z[i]);
          if (r < AEGIS_R && aegisAbsorb(g, e.x[i], e.y[i], e.z[i], 2 * e.dmgMul[i])) {
            g.emitFx(FX_EXPLOSION, e.x[i], e.y[i], e.z[i], 0, 0, 0, e.scale[i]);
            e.kill(i);
            continue;
          }
        } else if (moveTo(g, i, cx * LAND_RADIUS, cy * LAND_RADIUS, cz * LAND_RADIUS, spd, dt, 0.004, true)) {
          e.state[i] = ST_SIEGE;
          damageCity(g, city, 2 * e.dmgMul[i], true, DMG_SIEGE);
        }
        break;

      case ROLE_DESTROYER:
        if (e.state[i] === ST_HOVER) g.threat[city]++;
        else if (moveTo(g, i, cx * rp.hoverAlt, cy * rp.hoverAlt, cz * rp.hoverAlt, spd, dt, 0.01, true)) e.state[i] = ST_HOVER;
        break;

      case ROLE_BOSS:
      case ROLE_HORROR:
        bossPhases(g, i);
        if (e.state[i] === ST_HOVER) {
          g.threat[city]++;
          if (rp.tentacles) growTentacles(g, i, dt);
          if (rp.spawnCount) spawnBrood(g, i, dt);
          e.mtimer[i] += dt;
          // Bosses roam between cities; horrors hold on once they have a grip.
          if (role === ROLE_BOSS && !rp.tentacles && e.mtimer[i] > 9) {
            e.mtimer[i] = 0;
            const next = g.combatRng.int(c.count);
            if (c.health[next] > 0) {
              e.city[i] = next;
              e.state[i] = ST_APPROACH;
            }
          }
        } else {
          if (rp.spawnCount && role === ROLE_BOSS) spawnBrood(g, i, dt);
          if (moveTo(g, i, cx * rp.hoverAlt, cy * rp.hoverAlt, cz * rp.hoverAlt, spd, dt, 0.01, true)) {
            e.state[i] = ST_HOVER;
            e.mtimer[i] = 0;
            if (role === ROLE_HORROR) g.addLog(`${def.name.toUpperCase()} HAS SEIZED ${CITIES[city].name.toUpperCase()}`, 'boss');
          }
        }
        break;

      case ROLE_TENTACLE: {
        const p = e.parent[i];
        if (p < 0 || !e.alive[p] || e.gen[p] !== e.parentGen[i]) {
          // The body is dead: the limb withers.
          g.emitFx(FX_EXPLOSION, e.x[i], e.y[i], e.z[i], 0, 0, 0, 0.05);
          e.kill(i);
          continue;
        }
        if (e.state[i] === ST_ATTACHED) {
          g.threat[city]++;
          e.timer[i] += dt * g.dir.fireRateMul;
          if (e.timer[i] >= rp.slamPeriod) {
            e.timer[i] -= rp.slamPeriod;
            const slam = (ALIENS[e.def[p]].roleParams.slamDmg ?? rp.slamDmg) * e.dmgMul[i];
            g.emitFx(FX_SLAM, e.x[i], e.y[i], e.z[i], 0, 0, 0, 0.08);
            g.emitFx(FX_IMPACT, e.x[i], e.y[i], e.z[i], 0, 0, 0, 0.06);
            const target = decoyFor(g, e.x[i], e.y[i], e.z[i]) ? -1 : city;
            if (target >= 0) damageCity(g, target, slam, true, DMG_TENTACLE);
          }
        } else {
          // Reach: the tip lashes out from the body toward the city.
          if (moveTo(g, i, cx * LAND_RADIUS, cy * LAND_RADIUS, cz * LAND_RADIUS, 0.55, dt, 0.004, false)) {
            e.state[i] = ST_ATTACHED;
            g.emitFx(FX_SLAM, e.x[i], e.y[i], e.z[i], 0, 0, 0, 0.1);
            g.emitFx(FX_IMPACT, e.x[i], e.y[i], e.z[i], 0, 0, 0, 0.08);
          }
        }
        break;
      }

      case ROLE_GUNSHIP: {
        // Gunships hunt weapon emitters: hold station beside one and pound it.
        let w = g.arsenal.weapons[e.tgtW[i]];
        if (!w || e.tgtE[i] < 0 || e.tgtE[i] >= tierOf(w).emitters || emitterBroken(w, e.tgtE[i])) {
          pickGunshipTarget(g, i);
          w = g.arsenal.weapons[e.tgtW[i]];
          if (!w) {
            e.role[i] = ROLE_DESTROYER;
            e.state[i] = ST_APPROACH;
            break;
          }
        }
        const m = e.tgtE[i] * 3;
        const ex = w.emitters[m];
        const ey = w.emitters[m + 1];
        const ez = w.emitters[m + 2];
        const el = Math.hypot(ex, ey, ez) || 1;
        const off = rp.hoverAlt;
        const sw = Math.sin(g.time * 0.8 + e.seed[i]) * 0.12;
        const hx = ex + (ex / el) * off + e.dz[i] * sw;
        const hy = ey + (ey / el) * off;
        const hz = ez + (ez / el) * off - e.dx[i] * sw;
        if (e.state[i] === ST_HOVER) {
          moveTo(g, i, hx, hy, hz, spd * 1.5, dt, 0.01, true);
          e.atk[i] -= dt * g.dir.fireRateMul;
          if (e.atk[i] <= 0 && def.attack) {
            e.atk[i] += def.attack.period;
            volley(g, i, def.attack.volley ?? 1, def.attack.dmg * e.dmgMul[i], -1, e.tgtW[i], e.tgtE[i]);
          }
        } else if (moveTo(g, i, hx, hy, hz, spd, dt, 0.08, true)) e.state[i] = ST_HOVER;
        break;
      }

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
          if (r > WAVE_RULES.escapeRadius) {
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
            const take = Math.min(rp.abductRate * e.dmgMul[i] * dt * (1 - g.defense.abductReduce), cap - e.cargo[i]);
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
          w.jam += rp.jam * Math.min(1.5, e.dmgMul[i]) * (1 - g.defense.jamReduce);
          // A clamped saboteur slowly burns through the emitter.
          hitEmitter(g, e.tgtW[i], e.tgtE[i], 0.4 * e.dmgMul[i] * dt);
        } else if (moveTo(g, i, ex, ey, ez, spd * 1.2, dt, 0.03, true)) {
          e.state[i] = ST_ATTACHED;
          g.addLog(`SABOTEUR ON ${w.def.name.toUpperCase()}`, 'warn');
        }
        break;
      }

      case ROLE_CARRIER:
        if (e.state[i] === ST_FLEE) {
          // Spent carriers withdraw to deep space (no reward, no penalty) so waves always end.
          const r = Math.hypot(e.x[i], e.y[i], e.z[i]) || 1;
          e.dx[i] = e.x[i] / r;
          e.dy[i] = e.y[i] / r;
          e.dz[i] = e.z[i] / r;
          const out = spd * 2 * dt;
          e.x[i] += e.dx[i] * out;
          e.y[i] += e.dy[i] * out;
          e.z[i] += e.dz[i] * out;
          if (r > WAVE_RULES.escapeRadius) {
            g.emitFx(FX_WARP, e.x[i], e.y[i], e.z[i], 0, 0, 0, e.scale[i]);
            e.kill(i);
          }
        } else if (e.state[i] === ST_HOVER) {
          g.threat[city]++;
          if (spawnBrood(g, i, dt) && ++e.cargo[i] >= (ALIENS[e.def[i]].roleParams.broods ?? CARRIER_BROODS)) e.state[i] = ST_FLEE;
        } else if (moveTo(g, i, cx * rp.hoverAlt, cy * rp.hoverAlt, cz * rp.hoverAlt, spd, dt, 0.01, true)) {
          e.state[i] = ST_HOVER;
        }
        break;
    }
  }
}

const CARRIER_BROODS = 6;
const KAMIKAZE_DMG = 1.0;
/** Global scale on alien shot damage. */
const SHOT_DMG = 0.5;
/** Share of swarm fodder that dives into the ground instead of landing to besiege. */
const DIVE_SHARE = 0.4;

/** Fire `n` shots at a city (or an emitter) in this alien's species weapon. */
function volley(g: Game, i: number, n: number, dmg: number, city: number, ws: number, we: number): void {
  const e = g.enemies;
  const kind = SHOT_KINDS[SPECIES[e.species[i]].shot];
  const sc = e.scale[i];
  for (let k = 0; k < n; k++) {
    const r = g.combatRng;
    fireEnemyShot(g, kind, e.species[i], e.x[i] + r.range(-sc, sc) * 0.4, e.y[i] + r.range(-sc, sc) * 0.4, e.z[i] + r.range(-sc, sc) * 0.4, dmg, city, ws, we, 0.02 + n * 0.008);
  }
}

/** A diving alien hits the ground: crater, fire, damage; no reward. */
function crash(g: Game, i: number, city: number, dmg: number): void {
  const e = g.enemies;
  const r = Math.hypot(e.x[i], e.y[i], e.z[i]) || 1;
  const x = e.x[i] / r;
  const y = e.y[i] / r;
  const z = e.z[i] / r;
  const decoy = decoyFor(g, x, y, z);
  g.emitFx(FX_EXPLOSION, x * 1.01, y * 1.01, z * 1.01, 0, 0, 0, e.scale[i] * 1.4);
  g.emitFx(FX_IMPACT, decoy ? decoy[0] : x, decoy ? decoy[1] : y, decoy ? decoy[2] : z, 0, 0, 0, 0.02 + e.scale[i] * 0.4);
  if (!decoy && g.cityShield[city] <= 0) damageCity(g, city, dmg, false, DMG_DIVE);
  if (g.bossSlot === i) g.bossSlot = -1;
  e.kill(i);
}

/** Bosses and horrors enrage at two health thresholds: a shockwave that knocks out nearby
 *  emitters, an escort warp-in, and faster attacks from then on. */
function bossPhases(g: Game, i: number): void {
  const e = g.enemies;
  const f = e.hp[i] / e.maxHp[i];
  const want = f < 0.33 ? 2 : f < 0.66 ? 1 : 0;
  if (want <= e.phase[i]) return;
  e.phase[i] = want;
  const x = e.x[i];
  const y = e.y[i];
  const z = e.z[i];
  g.emitFx(FX_BOSS_PHASE, x, y, z, 0, 0, 0, e.scale[i]);
  g.addLog(`${ALIENS[e.def[i]].name.toUpperCase()} ENRAGES`, 'boss');
  for (let s = 0; s < g.arsenal.weapons.length; s++) {
    const w = g.arsenal.weapons[s];
    const n = tierOf(w).emitters;
    for (let k = 0; k < n; k++) {
      const dx = w.emitters[k * 3] - x;
      const dy = w.emitters[k * 3 + 1] - y;
      const dz = w.emitters[k * 3 + 2] - z;
      if (dx * dx + dy * dy + dz * dz < 0.7 * 0.7) hitEmitter(g, s, k, 1e6);
    }
  }
  // Escort: a warp-in of its own species around it.
  const species = SPECIES[e.species[i]].id;
  const child = ALIENS.findIndex((a) => a.species === species && a.role === 'invader');
  const r = g.combatRng;
  const n = 6 + Math.min(18, g.wave >> 1);
  for (let k = 0; k < n; k++) {
    spawnAlien(g, child, 0, x + r.range(-0.25, 0.25), y + r.range(-0.25, 0.25), z + r.range(-0.25, 0.25), e.city[i], r, { hpMul: WAVE_RULES.fodderHp, noMods: true, fodder: true });
  }
  e.shield[i] = e.maxShield[i] = Math.max(e.maxShield[i], e.maxHp[i] * 0.08);
}

/** Horrors keep `tentacles` limbs latched onto nearby cities and regrow lost ones. */
function growTentacles(g: Game, i: number, dt: number): void {
  const e = g.enemies;
  const rp = ALIENS[e.def[i]].roleParams;
  e.timer[i] += dt;
  const live = e.cargo[i];
  const need = rp.tentacles + e.phase[i] * 2;
  // First grip comes fast; regrowth takes a while.
  const wait = live === 0 && e.timer[i] < 2 ? 0.6 : rp.regrow / (1 + e.phase[i] * 0.5);
  if (live >= need || e.timer[i] < wait) return;
  e.timer[i] = 0;
  const r = g.combatRng;
  const c = g.cities;
  // Grab a city within reach of the body's city, favouring the one it is over.
  const k0 = e.city[i] * 3;
  let target = e.city[i];
  for (let tries = 0; tries < 6; tries++) {
    const t = r.int(c.count);
    if (c.health[t] <= 0) continue;
    const dx = c.pos[t * 3] - c.pos[k0];
    const dy = c.pos[t * 3 + 1] - c.pos[k0 + 1];
    const dz = c.pos[t * 3 + 2] - c.pos[k0 + 2];
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) < rp.reach) {
      target = t;
      break;
    }
  }
  const sp = SPECIES[e.species[i]].id;
  const def = ALIENS.findIndex((a) => a.species === sp && a.role === 'tentacle');
  const tdef = def >= 0 ? def : ALIENS.findIndex((a) => a.role === 'tentacle');
  const j = spawnAlien(g, tdef, 0, e.x[i], e.y[i], e.z[i], target, r, { noMods: true, quiet: true, hpMul: 1 + e.scale[i] * 3 });
  if (j < 0) return;
  e.parent[j] = i;
  e.parentGen[j] = e.gen[i];
  e.timer[j] = r.range(0, 1.5);
  e.cargo[i]++;
  g.emitFx(FX_TENTACLE, e.x[i], e.y[i], e.z[i], c.pos[target * 3], c.pos[target * 3 + 1], c.pos[target * 3 + 2], 0);
}

function pickGunshipTarget(g: Game, i: number): void {
  const e = g.enemies;
  const ws = g.arsenal.weapons;
  e.tgtW[i] = -1;
  if (ws.length === 0) return;
  // Hunt the nearest standing emitter (sampled), so packs spread over the arsenal.
  const r = g.combatRng;
  let best = -1;
  let be = -1;
  let bd = Infinity;
  for (let tries = 0; tries < 10; tries++) {
    const s = r.int(ws.length);
    const n = tierOf(ws[s]).emitters;
    const k = r.int(n);
    if (emitterBroken(ws[s], k)) continue;
    const dx = ws[s].emitters[k * 3] - e.x[i];
    const dy = ws[s].emitters[k * 3 + 1] - e.y[i];
    const dz = ws[s].emitters[k * 3 + 2] - e.z[i];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) {
      bd = d;
      best = s;
      be = k;
    }
  }
  e.tgtW[i] = best;
  e.tgtE[i] = be;
  e.state[i] = ST_APPROACH;
}

/** Carriers and bosses launch small invaders of their own species. Returns true when a brood launched. */
function spawnBrood(g: Game, i: number, dt: number): boolean {
  const e = g.enemies;
  const rp = ALIENS[e.def[i]].roleParams;
  e.btimer[i] += dt;
  if (e.btimer[i] < rp.spawnPeriod) return false;
  e.btimer[i] -= rp.spawnPeriod;
  const species = SPECIES[e.species[i]].id;
  const child = ALIENS.findIndex((a) => a.species === species && a.role === 'invader');
  const giant = ALIENS[e.def[i]].mothership === true || e.role[i] === ROLE_HORROR;
  const r = g.combatRng;
  for (let k = 0; k < rp.spawnCount; k++) {
    const j = spawnAlien(g, child, 0, e.x[i] + r.range(-0.06, 0.06), e.y[i] + r.range(-0.06, 0.06), e.z[i] + r.range(-0.06, 0.06), e.city[i], r, { hpMul: 0.5, noMods: true, quiet: true, fodder: giant });
    if (j >= 0) {
      // Fan out to nearby cities rather than piling on one.
      const t = nearestLivingCity(g, e.x[j] + r.range(-0.5, 0.5), e.y[j] + r.range(-0.5, 0.5), e.z[j] + r.range(-0.5, 0.5));
      if (t >= 0) e.city[j] = t;
    }
  }
  g.emitFx(FX_WARP, e.x[i], e.y[i], e.z[i], 0, 0, 0, e.scale[i] * 0.5);
  return true;
}
