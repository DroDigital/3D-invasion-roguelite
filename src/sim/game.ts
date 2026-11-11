import { ALIENS, alienIndex } from '../data/aliens';
import { CITY_MAX_HEALTH } from '../data/cities';
import { WAVE_CONFIG } from '../data/waves';
import { weaponById } from '../data/weapons';
import type { Rng } from '../core/rng';
import { RunRng } from '../core/rng';
import { CityState } from './cities';
import { ENEMY_APPROACH, ENEMY_SIEGE, EnemyPool } from './enemies';
import { ProjectilePool } from './projectiles';
import { selectTargets } from './targeting';
import { Arsenal, nearestEmitter, tierOf, updateEmitters } from './weapons';

export const STEP = 1 / 60;
/** Nothing flies lower than this; paths that would cut through the planet slide around it. */
const MIN_ALTITUDE = 1.03;
const LAND_RADIUS = 1.012;
const HIT_RADIUS = 0.035;

export const FX_HIT = 0;
export const FX_EXPLOSION = 1;
export const FX_MUZZLE = 2;
export const FX_CITY_HIT = 3;
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
  /** Sieging enemies per city, rebuilt every step. */
  readonly siege = new Uint16Array(this.cities.count);

  phase: Phase = 'intermission';
  wave = 0;
  time = 0;
  kills = 0;
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
    this.arsenal.add(weaponById('railgun_sat'));
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
    if (this.phase === 'gameover') return;
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
    const hp = ALIENS[def].hp * (1 + WAVE_CONFIG.hpGrowthPerWave * (this.wave - 1));
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
        this.damageCity(city, def.roleParams.siegeDps * dt);
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
    c.population[city] = Math.max(0, c.population[city] - (c.maxPopulation[city] * d) / CITY_MAX_HEALTH);
    if (c.health[city] <= 0.0001) {
      c.health[city] = 0;
      c.population[city] = 0;
      const k = city * 3;
      this.emitFx(FX_EXPLOSION, c.pos[k], c.pos[k + 1], c.pos[k + 2]);
    }
  }

  private damageEnemy(i: number, dmg: number, weapon: number): void {
    const e = this.enemies;
    const w = this.arsenal.weapons[weapon];
    const dealt = Math.min(dmg, e.hp[i]);
    e.hp[i] -= dmg;
    e.flash[i] = 0.08;
    if (w) w.damageDealt += dealt;
    if (e.hp[i] <= 0) {
      this.kills++;
      if (w) w.kills++;
      this.emitFx(FX_EXPLOSION, e.x[i], e.y[i], e.z[i]);
      e.kill(i);
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
      const t = tierOf(w);
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
        p.speed[pi] = t.projectileSpeed ?? 4;
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
          this.damageEnemy(ti, p.damage[i], p.weapon[i]);
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
    let h = this.wave * 73856093 + this.kills * 19349663;
    const e = this.enemies;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      h = (Math.imul(h, 31) + Math.fround(e.x[i] * 1e4) + Math.fround(e.hp[i] * 1e3)) | 0;
    }
    for (let i = 0; i < this.cities.count; i++) h = (Math.imul(h, 31) + Math.round(this.cities.health[i] * 1e3)) | 0;
    return h;
  }
}
