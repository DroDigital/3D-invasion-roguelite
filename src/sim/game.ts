import { ALIENS, alienIndex } from '../data/aliens';
import { CITY_MAX_HEALTH } from '../data/cities';
import { WAVE_CONFIG } from '../data/waves';
import { PROGRESSION, xpForLevel } from '../data/progression';
import type { ActionDef } from '../data/types';
import type { Rng } from '../core/rng';
import { RunRng } from '../core/rng';
import { Build, matches } from './build';
import { CityState } from './cities';
import { ENEMY_APPROACH, ENEMY_SIEGE, EnemyPool } from './enemies';
import { Offer, rollOffers, rollStartingWeapons } from './offers';
import { ProjectilePool } from './projectiles';
import { selectTargets } from './targeting';
import { Arsenal, nearestEmitter, updateEmitters } from './weapons';

export const STEP = 1 / 60;
/** Nothing flies lower than this; paths that would cut through the planet slide around it. */
const MIN_ALTITUDE = 1.03;
const LAND_RADIUS = 1.012;
const HIT_RADIUS = 0.035;

export const FX_HIT = 0;
export const FX_EXPLOSION = 1;
export const FX_MUZZLE = 2;
export const FX_CITY_HIT = 3;
export const FX_BLAST = 4;
export const FX_CRIT = 5;
const FX_CAP = 256;
const FX_STRIDE = 4;

export type Phase = 'intermission' | 'spawning' | 'clearing' | 'gameover';

/** The whole deterministic simulation. Depends only on the seed and step count. */
export class Game {
  readonly rng: RunRng;
  readonly cities = new CityState();
  readonly enemies = new EnemyPool();
  readonly projectiles = new ProjectilePool();
  readonly arsenal = new Arsenal();
  readonly build = new Build();
  /** Lowest health each city has reached; population only falls with new lows. */
  private lowWater = new Float32Array(this.cities.count).fill(CITY_MAX_HEALTH);
  /** Sieging enemies per city, rebuilt every step. */
  readonly siege = new Uint16Array(this.cities.count);

  phase: Phase = 'intermission';
  wave = 0;
  time = 0;
  kills = 0;

  xp = 0;
  level = 1;
  xpNeeded = xpForLevel(1);
  /** While set, the sim is paused waiting for the player to pick one. */
  offer: Offer[] | null = null;
  offerKind: 'start' | 'levelup' = 'start';
  rerolls: number = PROGRESSION.rerolls;
  banishes: number = PROGRESSION.banishes;
  private pendingLevels = 0;
  private banished = new Set<string>();
  private offerRng: Rng;
  private combatRng: Rng;
  private phaseTimer: number = WAVE_CONFIG.firstDelay;
  private toSpawn = 0;
  private spawnTimer = 0;
  private spawnInterval = 0;
  private clusterLeft = 0;
  private clusterX = 0;
  private clusterY = 0;
  private clusterZ = 0;
  private waveRng: Rng;
  private targets = new Int16Array(16);

  /** One-frame visual events for the renderer: [kind, x, y, z]. Never read by the sim. */
  readonly fx = new Float32Array(FX_CAP * FX_STRIDE);
  fxCount = 0;

  constructor(seed: string) {
    this.rng = new RunRng(seed);
    this.waveRng = this.rng.stream('waves');
    this.offerRng = this.rng.stream('offers');
    this.combatRng = this.rng.stream('combat');
    this.offer = rollStartingWeapons(this.offerRng, PROGRESSION.choices);
  }

  get hostiles(): number {
    return this.enemies.count + this.toSpawn;
  }

  /** Seconds until the next wave, or 0 when one is in progress. */
  get nextWaveIn(): number {
    return this.phase === 'intermission' ? this.phaseTimer : 0;
  }

  private emitFx(kind: number, x: number, y: number, z: number): void {
    if (this.fxCount >= FX_CAP) return;
    const k = this.fxCount++ * FX_STRIDE;
    this.fx[k] = kind;
    this.fx[k + 1] = x;
    this.fx[k + 2] = y;
    this.fx[k + 3] = z;
  }

  step(dt: number): void {
    if (this.phase === 'gameover' || this.offer) return;
    this.time += dt;
    this.updateWaves(dt);
    this.updateEnemies(dt);
    this.updateWeapons(dt);
    this.updateProjectiles(dt);
    if (this.cities.isLost()) this.phase = 'gameover';
  }

  // ---- waves ----

  private updateWaves(dt: number): void {
    if (this.phase === 'intermission') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.wave++;
        this.toSpawn = WAVE_CONFIG.baseCount + WAVE_CONFIG.countPerWave * this.wave;
        this.spawnInterval = WAVE_CONFIG.duration / this.toSpawn;
        this.spawnTimer = 0;
        this.clusterLeft = 0;
        this.phase = 'spawning';
        const wt = this.build.waveTriggers;
        for (let k = 0; k < wt.length; k++) this.runAction(wt[k].action, -1, 0, 0, 0);
      }
    } else if (this.phase === 'spawning') {
      this.spawnTimer -= dt;
      while (this.spawnTimer <= 0 && this.toSpawn > 0) {
        this.spawnOne();
        this.spawnTimer += this.spawnInterval;
      }
      if (this.toSpawn === 0) this.phase = 'clearing';
    } else if (this.phase === 'clearing' && this.enemies.count === 0) {
      this.phase = 'intermission';
      this.phaseTimer = WAVE_CONFIG.intermission;
    }
  }

  private spawnOne(): void {
    const r = this.waveRng;
    if (this.clusterLeft <= 0) {
      // New attack vector: uniform direction on the sphere.
      const u = r.range(-1, 1);
      const a = r.range(0, Math.PI * 2);
      const s = Math.sqrt(1 - u * u);
      this.clusterX = s * Math.cos(a);
      this.clusterY = u;
      this.clusterZ = s * Math.sin(a);
      this.clusterLeft = WAVE_CONFIG.clusterMin + r.int(WAVE_CONFIG.clusterMax - WAVE_CONFIG.clusterMin + 1);
    }
    this.clusterLeft--;
    this.toSpawn--;

    let x = this.clusterX + r.range(-0.12, 0.12);
    let y = this.clusterY + r.range(-0.12, 0.12);
    let z = this.clusterZ + r.range(-0.12, 0.12);
    const rad = (WAVE_CONFIG.spawnRadius + r.range(-0.4, 0.4)) / Math.hypot(x, y, z);
    x *= rad;
    y *= rad;
    z *= rad;

    const city = this.pickCity(x, y, z, r);
    if (city < 0) return;
    const def = alienIndex(WAVE_CONFIG.alien);
    const hp = ALIENS[def].hp * Math.pow(WAVE_CONFIG.hpGrowthPerWave, this.wave - 1);
    this.enemies.spawn(def, x, y, z, hp, city);
  }

  /** A living city on the side of the planet facing (x,y,z); any living city as a fallback. */
  private pickCity(x: number, y: number, z: number, r: Rng): number {
    const c = this.cities;
    let facing = 0;
    let living = 0;
    for (let i = 0; i < c.count; i++) {
      if (c.health[i] <= 0) continue;
      living++;
      if (c.pos[i * 3] * x + c.pos[i * 3 + 1] * y + c.pos[i * 3 + 2] * z > 0.2) facing++;
    }
    if (living === 0) return -1;
    const useFacing = facing > 0;
    let pick = r.int(useFacing ? facing : living);
    for (let i = 0; i < c.count; i++) {
      if (c.health[i] <= 0) continue;
      if (useFacing && c.pos[i * 3] * x + c.pos[i * 3 + 1] * y + c.pos[i * 3 + 2] * z <= 0.2) continue;
      if (pick-- === 0) return i;
    }
    return -1;
  }

  /** Closest living city to a point; used to retarget when a city falls. */
  private nearestCity(x: number, y: number, z: number): number {
    const c = this.cities;
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

  // ---- enemies ----

  private updateEnemies(dt: number): void {
    const e = this.enemies;
    const c = this.cities;
    this.siege.fill(0);
    if (this.build.cityRegen > 0) this.healCities(this.build.cityRegen * dt);
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      if (e.flash[i] > 0) e.flash[i] -= dt;
      let city = e.city[i];
      if (c.health[city] <= 0) {
        city = this.nearestCity(e.x[i], e.y[i], e.z[i]);
        if (city < 0) continue;
        e.city[i] = city;
        e.state[i] = ENEMY_APPROACH;
      }
      const def = ALIENS[e.def[i]];
      const k = city * 3;

      if (e.state[i] === ENEMY_SIEGE) {
        this.siege[city]++;
        this.damageCity(city, def.roleParams.siegeDps * dt * (1 - this.build.cityArmor));
        continue;
      }

      const tx = c.pos[k] * LAND_RADIUS - e.x[i];
      const ty = c.pos[k + 1] * LAND_RADIUS - e.y[i];
      const tz = c.pos[k + 2] * LAND_RADIUS - e.z[i];
      const dist = Math.hypot(tx, ty, tz);
      const move = def.speed * dt;
      if (dist <= move + 0.004) {
        e.x[i] = c.pos[k] * LAND_RADIUS;
        e.y[i] = c.pos[k + 1] * LAND_RADIUS;
        e.z[i] = c.pos[k + 2] * LAND_RADIUS;
        e.state[i] = ENEMY_SIEGE;
        this.emitFx(FX_CITY_HIT, e.x[i], e.y[i], e.z[i]);
        continue;
      }
      const inv = 1 / dist;
      e.dx[i] = tx * inv;
      e.dy[i] = ty * inv;
      e.dz[i] = tz * inv;
      e.x[i] += e.dx[i] * move;
      e.y[i] += e.dy[i] * move;
      e.z[i] += e.dz[i] * move;
      // Slide around the planet instead of flying through it (final descent excepted).
      if (dist > 0.08) {
        const r = Math.hypot(e.x[i], e.y[i], e.z[i]);
        if (r < MIN_ALTITUDE) {
          const s = MIN_ALTITUDE / r;
          e.x[i] *= s;
          e.y[i] *= s;
          e.z[i] *= s;
        }
      }
    }
  }

  private damageCity(city: number, dmg: number): void {
    const c = this.cities;
    if (c.health[city] <= 0) return;
    const d = Math.min(dmg, c.health[city]);
    c.health[city] -= d;
    // Healing restores defences, not the dead: only new lows cost population.
    if (c.health[city] < this.lowWater[city]) {
      const lost = this.lowWater[city] - c.health[city];
      this.lowWater[city] = c.health[city];
      c.population[city] = Math.max(0, c.population[city] - (c.maxPopulation[city] * lost) / CITY_MAX_HEALTH);
    }
    if (c.health[city] <= 0.0001) {
      c.health[city] = 0;
      c.population[city] = 0;
      const k = city * 3;
      this.emitFx(FX_EXPLOSION, c.pos[k], c.pos[k + 1], c.pos[k + 2]);
    }
  }

  private healCities(amount: number): void {
    const c = this.cities;
    for (let i = 0; i < c.count; i++) {
      if (c.health[i] > 0 && c.health[i] < CITY_MAX_HEALTH) c.health[i] = Math.min(CITY_MAX_HEALTH, c.health[i] + amount);
    }
  }

  /** Run a trigger action. `weapon` is the slot that caused it (-1 for none). */
  private runAction(a: ActionDef, weapon: number, x: number, y: number, z: number): void {
    if (a.kind === 'healCities') this.healCities(a.amount);
    else if (a.kind === 'xp') this.gainXp(a.amount);
    else if (a.kind === 'explode') {
      const w = this.arsenal.weapons[weapon];
      if (!w) return;
      const e = this.enemies;
      const r2 = a.radius * a.radius;
      const dmg = w.stats.damage * a.damageMul;
      this.emitFx(FX_BLAST, x, y, z);
      for (let j = 0; j < e.high; j++) {
        if (!e.alive[j]) continue;
        const dx = e.x[j] - x;
        const dy = e.y[j] - y;
        const dz = e.z[j] - z;
        if (dx * dx + dy * dy + dz * dz <= r2) this.damageEnemy(j, dmg, weapon);
      }
    }
  }

  private gainXp(amount: number): void {
    this.xp += amount * this.build.xpGain;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      this.xpNeeded = xpForLevel(this.level);
      this.pendingLevels++;
    }
    if (!this.offer && this.pendingLevels > 0) this.openLevelUp();
  }

  private openLevelUp(): void {
    while (this.pendingLevels > 0) {
      this.pendingLevels--;
      const o = rollOffers(this.offerRng, PROGRESSION.choices, this.arsenal, this.build, this.banished);
      if (o.length > 0) {
        this.offer = o;
        this.offerKind = 'levelup';
        return;
      }
    }
  }

  // ---- player choices (the only inputs to the sim so far) ----

  choose(i: number): void {
    const o = this.offer?.[i];
    if (!o) return;
    if (o.kind === 'weapon') this.arsenal.add(o.weapon);
    else if (o.kind === 'tier') {
      const w = this.arsenal.weapons[o.slot];
      w.tier = o.toTier;
      updateEmitters(w, 0);
    } else this.build.add(o.upgrade);
    this.build.recompute(this.arsenal.weapons);
    this.offer = null;
    this.openLevelUp();
  }

  reroll(): void {
    if (!this.offer || this.offerKind !== 'levelup' || this.rerolls <= 0) return;
    const o = rollOffers(this.offerRng, PROGRESSION.choices, this.arsenal, this.build, this.banished);
    if (o.length === 0) return;
    this.rerolls--;
    this.offer = o;
  }

  /** Remove an option from the pool for the rest of the run and replace its card. */
  banish(i: number): void {
    const o = this.offer?.[i];
    if (!o || this.offerKind !== 'levelup' || this.banishes <= 0 || o.kind === 'tier') return;
    this.banishes--;
    this.banished.add(o.key);
    const keep = this.offer!.filter((_, j) => j !== i).map((x) => x.key);
    const repl = rollOffers(this.offerRng, 1, this.arsenal, this.build, this.banished, keep);
    if (repl.length > 0) this.offer![i] = repl[0];
    else this.offer!.splice(i, 1);
    if (this.offer!.length === 0) {
      this.offer = null;
      this.openLevelUp();
    }
  }

  private damageEnemy(i: number, dmg: number, weapon: number): void {
    const e = this.enemies;
    if (!e.alive[i]) return;
    const w = this.arsenal.weapons[weapon];
    const dealt = Math.min(dmg, e.hp[i]);
    e.hp[i] -= dmg;
    e.flash[i] = 0.08;
    if (w) w.damageDealt += dealt;
    if (e.hp[i] <= 0) {
      const x = e.x[i];
      const y = e.y[i];
      const z = e.z[i];
      const xp = ALIENS[e.def[i]].xp;
      this.kills++;
      if (w) w.kills++;
      this.emitFx(FX_EXPLOSION, x, y, z);
      e.kill(i);
      if (w) {
        const kt = this.build.killTriggers;
        for (let k = 0; k < kt.length; k++) {
          const t = kt[k];
          if (matches(t.where, w.def.tags) && this.combatRng.next() < t.chance) this.runAction(t.action, weapon, x, y, z);
        }
      }
      this.gainXp(xp);
    } else {
      this.emitFx(FX_HIT, e.x[i], e.y[i], e.z[i]);
    }
  }

  // ---- weapons ----

  private updateWeapons(dt: number): void {
    const e = this.enemies;
    const p = this.projectiles;
    const ws = this.arsenal.weapons;
    for (let s = 0; s < ws.length; s++) {
      const w = ws[s];
      const t = w.stats;
      updateEmitters(w, dt);
      w.cooldown -= dt;
      if (w.cooldown > 0) continue;
      if (e.count === 0) {
        w.cooldown = 0;
        continue;
      }
      const n = selectTargets(w.def.targeting.rule, Math.min(t.targets, this.targets.length), e, this.cities, this.targets);
      if (n === 0) {
        w.cooldown = 0;
        continue;
      }
      w.cooldown += 1 / t.fireRate;
      for (let j = 0; j < n; j++) {
        const ti = this.targets[j];
        const em = nearestEmitter(w, e.x[ti], e.y[ti], e.z[ti]) * 3;
        const pi = p.spawn();
        if (pi < 0) break;
        p.x[pi] = w.emitters[em];
        p.y[pi] = w.emitters[em + 1];
        p.z[pi] = w.emitters[em + 2];
        const dx = e.x[ti] - p.x[pi];
        const dy = e.y[ti] - p.y[pi];
        const dz = e.z[ti] - p.z[pi];
        const inv = 1 / (Math.hypot(dx, dy, dz) || 1);
        p.dx[pi] = dx * inv;
        p.dy[pi] = dy * inv;
        p.dz[pi] = dz * inv;
        p.speed[pi] = t.projectileSpeed;
        p.damage[pi] = t.damage;
        p.life[pi] = 6;
        p.target[pi] = ti;
        p.targetGen[pi] = e.gen[ti];
        p.weapon[pi] = s;
        e.pending[ti] += t.damage;
        this.emitFx(FX_MUZZLE, p.x[pi], p.y[pi], p.z[pi]);
      }
    }
  }

  private updateProjectiles(dt: number): void {
    const p = this.projectiles;
    const e = this.enemies;
    for (let i = 0; i < p.high; i++) {
      if (!p.alive[i]) continue;
      const ti = p.target[i];
      const tracking = ti >= 0 && e.alive[ti] === 1 && e.gen[ti] === p.targetGen[i];
      const move = p.speed[i] * dt;
      if (tracking) {
        const dx = e.x[ti] - p.x[i];
        const dy = e.y[ti] - p.y[i];
        const dz = e.z[ti] - p.z[i];
        const dist = Math.hypot(dx, dy, dz);
        if (dist <= move + HIT_RADIUS) {
          e.pending[ti] -= p.damage[i];
          const w = this.arsenal.weapons[p.weapon[i]];
          let dmg = p.damage[i];
          if (w && w.stats.critChance > 0 && this.combatRng.next() < w.stats.critChance) {
            dmg *= w.stats.critMult;
            this.emitFx(FX_CRIT, e.x[ti], e.y[ti], e.z[ti]);
          }
          this.damageEnemy(ti, dmg, p.weapon[i]);
          p.kill(i);
          continue;
        }
        const inv = 1 / dist;
        p.dx[i] = dx * inv;
        p.dy[i] = dy * inv;
        p.dz[i] = dz * inv;
      } else if (ti >= 0) {
        // Target died to something else: coast briefly, then fizzle.
        p.target[i] = -1;
        p.life[i] = Math.min(p.life[i], 0.25);
      }
      p.x[i] += p.dx[i] * move;
      p.y[i] += p.dy[i] * move;
      p.z[i] += p.dz[i] * move;
      const r = Math.hypot(p.x[i], p.y[i], p.z[i]);
      if (r < MIN_ALTITUDE && !(tracking && e.state[ti] === ENEMY_SIEGE && r > 1.0)) {
        const s = MIN_ALTITUDE / r;
        p.x[i] *= s;
        p.y[i] *= s;
        p.z[i] *= s;
      }
      p.life[i] -= dt;
      if (p.life[i] <= 0) {
        if (tracking) e.pending[ti] -= p.damage[i];
        p.kill(i);
      }
    }
  }

  /** Cheap state digest for determinism tests. */
  digest(): number {
    let h = this.wave * 73856093 + this.kills * 19349663 + this.level * 83492791;
    const e = this.enemies;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      h = (Math.imul(h, 31) + Math.fround(e.x[i] * 1e4) + Math.fround(e.hp[i] * 1e3)) | 0;
    }
    for (let i = 0; i < this.cities.count; i++) h = (Math.imul(h, 31) + Math.round(this.cities.health[i] * 1e3)) | 0;
    return h;
  }
}
