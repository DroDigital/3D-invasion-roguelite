import type { DamageType } from '../data/types';
import { blast, damageEnemy, runTriggers } from './damage';
import { MAX_ENEMIES, ROLE_BOSS, ST_SIEGE } from './enemies';
import type { Game } from './game';
import { FX_BEAM, FX_BLAST, FX_CHAIN, FX_CRIT, FX_FIELD, FX_MUZZLE, FX_NOVA, FX_SHOT } from './game';
import { PK_BOLT, PK_DRONE, PK_SHARD } from './projectiles';
import { nearestEnemy, selectTargets } from './targeting';
import { nearestEmitter, OwnedWeapon, updateEmitters } from './weapons';

const MIN_ALTITUDE = 1.03;
const HIT_RADIUS = 0.035;
const LINE_RADIUS = 0.05;
const NOVA_MAX_R = 3.2;
const chainHit = new Uint8Array(MAX_ENEMIES);

export function updateCombat(g: Game, dt: number): void {
  updateWeapons(g, dt);
  updateProjectiles(g, dt);
  updateFields(g, dt);
}

function rollCrit(g: Game, w: OwnedWeapon): boolean {
  if (g.build.rules.has('overcharge') && w.volleys % 8 === 0) return true;
  return w.stats.critChance > 0 && g.combatRng.next() < w.stats.critChance;
}

function updateWeapons(g: Game, dt: number): void {
  const e = g.enemies;
  const ws = g.arsenal.weapons;
  for (let s = 0; s < ws.length; s++) {
    const w = ws[s];
    const st = w.stats;
    updateEmitters(w, dt);
    const rate = st.fireRate * (g.overclockT > 0 ? g.overclockMul : 1) * Math.max(0.1, 1 - w.jam);
    w.cooldown -= dt;
    if (w.cooldown > 0) continue;
    if (e.count === 0) {
      w.cooldown = 0;
      continue;
    }
    const n = selectTargets(w.def.targeting.rule, Math.min(st.targets, g.targets.length), e, g.cities, g.combatRng, g.targets);
    if (n === 0) {
      w.cooldown = 0;
      continue;
    }
    w.cooldown += 1 / rate;
    w.volleys++;
    const crit = rollCrit(g, w);
    g.emitFx(FX_SHOT, 0, 0, 0, 0, 0, 0, s);
    if (w.def.fire === 'nova') {
      fireNova(g, s, crit);
      continue;
    }
    for (let j = 0; j < n; j++) fireAt(g, s, g.targets[j], crit);
  }
}

function fireAt(g: Game, s: number, ti: number, crit: boolean): void {
  const e = g.enemies;
  const w = g.arsenal.weapons[s];
  const st = w.stats;
  const em = nearestEmitter(w, e.x[ti], e.y[ti], e.z[ti]) * 3;
  const ox = w.emitters[em];
  const oy = w.emitters[em + 1];
  const oz = w.emitters[em + 2];
  const dmg = st.damage * (crit ? st.critMult : 1);
  if (crit) g.emitFx(FX_CRIT, e.x[ti], e.y[ti], e.z[ti]);

  switch (w.def.fire) {
    case 'beam':
      g.emitFx(FX_BEAM, ox, oy, oz, e.x[ti], e.y[ti], e.z[ti], s);
      impact(g, s, ti, dmg, crit);
      return;
    case 'lineBeam': {
      // Through the target and beyond: everything near the line is hit.
      let lx = e.x[ti] - ox;
      let ly = e.y[ti] - oy;
      let lz = e.z[ti] - oz;
      const len = Math.hypot(lx, ly, lz) || 1;
      lx /= len;
      ly /= len;
      lz /= len;
      const reach = len + 2.5;
      g.emitFx(FX_BEAM, ox, oy, oz, ox + lx * reach, oy + ly * reach, oz + lz * reach, s);
      for (let i = 0; i < e.high; i++) {
        if (!e.alive[i]) continue;
        const px = e.x[i] - ox;
        const py = e.y[i] - oy;
        const pz = e.z[i] - oz;
        const t = px * lx + py * ly + pz * lz;
        if (t < 0 || t > reach) continue;
        const qx = px - lx * t;
        const qy = py - ly * t;
        const qz = pz - lz * t;
        if (qx * qx + qy * qy + qz * qz < LINE_RADIUS * LINE_RADIUS) impact(g, s, i, dmg, crit);
      }
      return;
    }
    case 'chain':
      g.emitFx(FX_CHAIN, ox, oy, oz, e.x[ti], e.y[ti], e.z[ti], s);
      chainArc(g, ti, e.x[ti], e.y[ti], e.z[ti], dmg, st.chainJumps, st.chainRange, st.chainFalloff, s, w.def.damageType, crit);
      return;
    case 'field':
      g.emitFx(FX_BEAM, ox, oy, oz, e.x[ti], e.y[ti], e.z[ti], s);
      spawnField(g, s, e.x[ti], e.y[ti], e.z[ti], dmg);
      return;
    case 'projectile':
    case 'drone': {
      const p = g.projectiles;
      const pi = p.spawn();
      if (pi < 0) return;
      p.x[pi] = ox;
      p.y[pi] = oy;
      p.z[pi] = oz;
      const dx = e.x[ti] - ox;
      const dy = e.y[ti] - oy;
      const dz = e.z[ti] - oz;
      const inv = 1 / (Math.hypot(dx, dy, dz) || 1);
      p.dx[pi] = dx * inv;
      p.dy[pi] = dy * inv;
      p.dz[pi] = dz * inv;
      const drone = w.def.fire === 'drone';
      p.kind[pi] = drone ? PK_DRONE : PK_BOLT;
      p.speed[pi] = st.projectileSpeed;
      p.damage[pi] = dmg;
      p.crit[pi] = crit ? 1 : 0;
      p.life[pi] = drone ? 9 : 6;
      p.hits[pi] = Math.min(255, 1 + st.pierce);
      p.target[pi] = ti;
      p.targetGen[pi] = e.gen[ti];
      p.weapon[pi] = s;
      p.pend[pi] = dmg;
      e.pending[ti] += dmg;
      g.emitFx(FX_MUZZLE, ox, oy, oz, 0, 0, 0, s);
      return;
    }
  }
}

/** Damage plus every on-hit property of the weapon at enemy i. */
function impact(g: Game, s: number, i: number, dmg: number, crit: boolean, allowSplit = true): void {
  const e = g.enemies;
  if (!e.alive[i]) return;
  const w = g.arsenal.weapons[s];
  const st = w.stats;
  const x = e.x[i];
  const y = e.y[i];
  const z = e.z[i];
  const type: DamageType = w.def.damageType;

  if (st.mark > 0) {
    e.mark[i] = Math.max(e.mark[i], st.mark);
    e.markT[i] = 4;
  }
  let total = dmg;
  if (st.maxHpDamage > 0) total += e.maxHp[i] * st.maxHpDamage * (e.role[i] === ROLE_BOSS ? 0.25 : 1);
  if (st.dotDps > 0) {
    e.dotDps[i] = Math.max(e.dotDps[i], st.dotDps);
    e.dotT[i] = st.dotDuration;
    e.dotW[i] = s;
  }
  if (st.slowAmount > 0) {
    e.slow[i] = Math.max(e.slowT[i] > 0 ? e.slow[i] : 0, st.slowAmount);
    e.slowT[i] = st.slowDuration;
  }
  if (st.stunChance > 0 && g.combatRng.next() < st.stunChance) e.stun[i] = Math.max(e.stun[i], st.stunDuration * (e.role[i] === ROLE_BOSS ? 0.3 : 1));

  damageEnemy(g, i, total, type, s);
  runTriggers(g, 'hit', s, x, y, z, e.alive[i] ? e.city[i] : -1);
  if (crit) runTriggers(g, 'crit', s, x, y, z, -1);

  if (st.aoe > 0) {
    g.emitFx(FX_BLAST, x, y, z, 0, 0, 0, st.aoe);
    blast(g, x, y, z, st.aoe, dmg * 0.6, type, s, i);
  }
  if (w.def.fire !== 'field' && st.fieldRadius > 0) spawnField(g, s, x, y, z, dmg * 0.3);
  if (w.def.fire !== 'chain' && st.chainJumps > 0) chainArc(g, i, x, y, z, dmg * 0.6, st.chainJumps, st.chainRange, st.chainFalloff, s, type);
  if (allowSplit && st.split > 0) splitShards(g, s, i, x, y, z, dmg * 0.4, st.split);
}

/** Arc from a point to successive nearest enemies. `first` (if >= 0) is hit first. */
export function chainArc(g: Game, first: number, x: number, y: number, z: number, dmg: number, jumps: number, range: number, falloff: number, slot: number, type: DamageType, crit = false): void {
  const e = g.enemies;
  let cur = first;
  let px = x;
  let py = y;
  let pz = z;
  let d = dmg;
  const touched: number[] = [];
  if (cur < 0) cur = nearestEnemy(e, x, y, z, range, -1);
  for (let j = 0; j <= jumps && cur >= 0; j++) {
    chainHit[cur] = 1;
    touched.push(cur);
    const cx = e.x[cur];
    const cy = e.y[cur];
    const cz = e.z[cur];
    if (j > 0 || first < 0) g.emitFx(FX_CHAIN, px, py, pz, cx, cy, cz, slot);
    if (slot >= 0 && g.arsenal.weapons[slot] && j === 0 && first >= 0) impact(g, slot, cur, d, crit, false);
    else damageEnemy(g, cur, d, type, slot);
    px = cx;
    py = cy;
    pz = cz;
    d *= falloff;
    cur = nearestEnemy(e, px, py, pz, range, -1, chainHit);
  }
  for (const t of touched) chainHit[t] = 0;
}

function splitShards(g: Game, s: number, from: number, x: number, y: number, z: number, dmg: number, n: number): void {
  const e = g.enemies;
  const p = g.projectiles;
  for (let k = 0; k < n; k++) {
    const t = nearestEnemy(e, x + g.combatRng.range(-0.2, 0.2), y + g.combatRng.range(-0.2, 0.2), z + g.combatRng.range(-0.2, 0.2), 0.6, from);
    if (t < 0) return;
    const pi = p.spawn();
    if (pi < 0) return;
    p.kind[pi] = PK_SHARD;
    p.x[pi] = x;
    p.y[pi] = y;
    p.z[pi] = z;
    const dx = e.x[t] - x;
    const dy = e.y[t] - y;
    const dz = e.z[t] - z;
    const inv = 1 / (Math.hypot(dx, dy, dz) || 1);
    p.dx[pi] = dx * inv;
    p.dy[pi] = dy * inv;
    p.dz[pi] = dz * inv;
    p.speed[pi] = 3.5;
    p.damage[pi] = dmg;
    p.life[pi] = 1.5;
    p.hits[pi] = 1;
    p.target[pi] = t;
    p.targetGen[pi] = e.gen[t];
    p.weapon[pi] = s;
  }
}

function fireNova(g: Game, s: number, crit: boolean): void {
  const e = g.enemies;
  const w = g.arsenal.weapons[s];
  const dmg = w.stats.damage * (crit ? w.stats.critMult : 1);
  g.emitFx(FX_NOVA, 0, 0, 0, 0, 0, 0, s);
  for (let i = 0; i < e.high; i++) {
    if (!e.alive[i]) continue;
    if (e.x[i] * e.x[i] + e.y[i] * e.y[i] + e.z[i] * e.z[i] > NOVA_MAX_R * NOVA_MAX_R) continue;
    impact(g, s, i, dmg, crit, false);
  }
}

function spawnField(g: Game, s: number, x: number, y: number, z: number, dps: number): void {
  const w = g.arsenal.weapons[s];
  const f = g.fields;
  const i = f.spawn();
  f.x[i] = x;
  f.y[i] = y;
  f.z[i] = z;
  f.radius[i] = w.stats.fieldRadius;
  f.ttl[i] = f.maxTtl[i] = w.stats.fieldDuration;
  f.dps[i] = dps;
  f.slow[i] = w.stats.fieldSlow;
  f.pull[i] = w.stats.fieldPull;
  f.maxHpFrac[i] = w.def.fire === 'field' ? w.stats.maxHpDamage : 0;
  f.weapon[i] = s;
  g.emitFx(FX_FIELD, x, y, z, 0, 0, 0, f.radius[i]);
}

const FIELD_TICK = 0.25;

function updateFields(g: Game, dt: number): void {
  const f = g.fields;
  const e = g.enemies;
  for (let i = 0; i < f.alive.length; i++) {
    if (!f.alive[i]) continue;
    f.ttl[i] -= dt;
    if (f.ttl[i] <= 0 || !g.arsenal.weapons[f.weapon[i]]) {
      f.kill(i);
      continue;
    }
    const r2 = f.radius[i] * f.radius[i];
    f.tick[i] -= dt;
    const tick = f.tick[i] <= 0;
    if (tick) f.tick[i] += FIELD_TICK;
    const w = g.arsenal.weapons[f.weapon[i]];
    for (let j = 0; j < e.high; j++) {
      if (!e.alive[j]) continue;
      const dx = f.x[i] - e.x[j];
      const dy = f.y[i] - e.y[j];
      const dz = f.z[i] - e.z[j];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      if (f.slow[i] > 0) {
        e.slow[j] = Math.max(e.slowT[j] > 0 ? e.slow[j] : 0, f.slow[i]);
        e.slowT[j] = Math.max(e.slowT[j], 0.3);
      }
      if (f.pull[i] > 0 && e.state[j] !== ST_SIEGE && e.role[j] !== ROLE_BOSS) {
        const k = Math.min(1, f.pull[i] * dt * 4);
        e.x[j] += dx * k;
        e.y[j] += dy * k;
        e.z[j] += dz * k;
      }
      if (tick) {
        let dmg = f.dps[i] * FIELD_TICK;
        if (f.maxHpFrac[i] > 0) dmg += e.maxHp[j] * f.maxHpFrac[i] * FIELD_TICK * (e.role[j] === ROLE_BOSS ? 0.25 : 1);
        damageEnemy(g, j, dmg, w.def.damageType, f.weapon[i], true);
      }
    }
  }
}

function updateProjectiles(g: Game, dt: number): void {
  const p = g.projectiles;
  const e = g.enemies;
  for (let i = 0; i < p.high; i++) {
    if (!p.alive[i]) continue;
    const w = g.arsenal.weapons[p.weapon[i]];
    if (!w) {
      releasePending(g, i);
      p.kill(i);
      continue;
    }
    let ti = p.target[i];
    let tracking = ti >= 0 && e.alive[ti] === 1 && e.gen[ti] === p.targetGen[i] && !e.cloaked[ti];
    if (!tracking) releasePending(g, i);
    const drone = p.kind[i] === PK_DRONE;
    if (!tracking && (drone || p.hits[i] > 1) && p.life[i] > 0.3) {
      // Drones and piercing rounds look for a new target.
      const nt = nearestEnemy(e, p.x[i], p.y[i], p.z[i], drone ? 3 : 0.8, p.last[i]);
      if (nt >= 0) {
        p.target[i] = ti = nt;
        p.targetGen[i] = e.gen[nt];
        tracking = true;
      }
    }
    const move = p.speed[i] * dt;
    if (tracking) {
      const dx = e.x[ti] - p.x[i];
      const dy = e.y[ti] - p.y[i];
      const dz = e.z[ti] - p.z[i];
      const dist = Math.hypot(dx, dy, dz);
      if (dist <= move + HIT_RADIUS * (1 + e.scale[ti] * 4)) {
        releasePending(g, i);
        if (p.kind[i] === PK_SHARD) damageEnemy(g, ti, p.damage[i], w.def.damageType, p.weapon[i]);
        else impact(g, p.weapon[i], ti, p.damage[i], p.crit[i] === 1);
        p.last[i] = ti;
        p.target[i] = -1;
        if (--p.hits[i] === 0) {
          p.kill(i);
          continue;
        }
        p.damage[i] *= drone ? 1 : 0.8;
        continue;
      }
      const inv = 1 / dist;
      // Drones turn gradually; bolts track hard.
      const turn = drone ? Math.min(1, dt * 6) : 1;
      p.dx[i] += (dx * inv - p.dx[i]) * turn;
      p.dy[i] += (dy * inv - p.dy[i]) * turn;
      p.dz[i] += (dz * inv - p.dz[i]) * turn;
      const l = Math.hypot(p.dx[i], p.dy[i], p.dz[i]) || 1;
      p.dx[i] /= l;
      p.dy[i] /= l;
      p.dz[i] /= l;
    } else if (ti >= 0) {
      // Target gone and nothing to retarget: coast briefly, then fizzle.
      p.target[i] = -1;
      p.life[i] = Math.min(p.life[i], drone ? 1.5 : 0.25);
    }
    p.x[i] += p.dx[i] * move;
    p.y[i] += p.dy[i] * move;
    p.z[i] += p.dz[i] * move;
    const r = Math.hypot(p.x[i], p.y[i], p.z[i]);
    if (r < MIN_ALTITUDE && !(tracking && e.state[ti] === ST_SIEGE && r > 1.0)) {
      const s = MIN_ALTITUDE / r;
      p.x[i] *= s;
      p.y[i] *= s;
      p.z[i] *= s;
    }
    p.life[i] -= dt;
    if (p.life[i] <= 0) {
      releasePending(g, i);
      p.kill(i);
    }
  }
}

/** Give back the damage this projectile reserved on its first target. */
function releasePending(g: Game, i: number): void {
  const p = g.projectiles;
  if (p.pend[i] === 0) return;
  const t = p.target[i];
  const e = g.enemies;
  if (t >= 0 && e.alive[t] && e.gen[t] === p.targetGen[i]) e.pending[t] = Math.max(0, e.pending[t] - p.pend[i]);
  p.pend[i] = 0;
}
