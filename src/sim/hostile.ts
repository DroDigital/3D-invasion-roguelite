import type { EnemyShotKind } from '../data/types';
import { damageCity, DMG_SHOT } from './damage';
import { aegisAbsorb, AEGIS_R, decoyFor, emitterBroken, hitEmitter } from './defense';
import type { Game } from './game';
import { FX_ELASER, FX_ESHOT, FX_IMPACT, FX_SCORCH } from './game';

export const MAX_SHOTS = 2048;
export const SHOT_PLASMA = 0;
export const SHOT_MISSILE = 1;
export const SHOT_ACID = 2;
export const SHOT_LASER = 3;
export const SHOT_VOID = 4;
export const SHOT_KINDS: Record<EnemyShotKind, number> = { plasma: 0, missile: 1, acid: 2, laser: 3, void: 4 };
/** How high each kind arcs above the straight line, as a fraction of the distance. */
const ARC = [0.06, 0.32, 0.45, 0, 0.12];
/** Visual / impact size per kind. */
export const SHOT_SIZE = [0.025, 0.03, 0.035, 0.03, 0.05];

/** Alien shots in flight: quadratic Bezier paths from shooter to target (struct-of-arrays). */
export class EnemyShotPool {
  readonly alive = new Uint8Array(MAX_SHOTS);
  readonly kind = new Uint8Array(MAX_SHOTS);
  readonly x = new Float32Array(MAX_SHOTS);
  readonly y = new Float32Array(MAX_SHOTS);
  readonly z = new Float32Array(MAX_SHOTS);
  /** Heading, for rendering. */
  readonly dx = new Float32Array(MAX_SHOTS);
  readonly dy = new Float32Array(MAX_SHOTS);
  readonly dz = new Float32Array(MAX_SHOTS);
  readonly sx = new Float32Array(MAX_SHOTS);
  readonly sy = new Float32Array(MAX_SHOTS);
  readonly sz = new Float32Array(MAX_SHOTS);
  readonly cx = new Float32Array(MAX_SHOTS);
  readonly cy = new Float32Array(MAX_SHOTS);
  readonly cz = new Float32Array(MAX_SHOTS);
  readonly tx = new Float32Array(MAX_SHOTS);
  readonly ty = new Float32Array(MAX_SHOTS);
  readonly tz = new Float32Array(MAX_SHOTS);
  /** Progress along the path, 0..1, and progress per second. */
  readonly t = new Float32Array(MAX_SHOTS);
  readonly rate = new Float32Array(MAX_SHOTS);
  readonly dmg = new Float32Array(MAX_SHOTS);
  /** Target city (-1: empty ground / decoy). */
  readonly city = new Int16Array(MAX_SHOTS);
  /** Target weapon slot and emitter (-1: none). */
  readonly ws = new Int8Array(MAX_SHOTS);
  readonly we = new Int8Array(MAX_SHOTS);
  readonly species = new Uint8Array(MAX_SHOTS);
  count = 0;
  high = 0;
  private free = new Int16Array(MAX_SHOTS);
  private freeTop = 0;

  spawn(): number {
    let i: number;
    if (this.freeTop > 0) i = this.free[--this.freeTop];
    else if (this.high < MAX_SHOTS) i = this.high++;
    else return -1;
    this.alive[i] = 1;
    this.count++;
    return i;
  }

  kill(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.free[this.freeTop++] = i;
    this.count--;
  }
}

/**
 * Fire one alien shot from (x,y,z). Target is a city (`city` >= 0) or a weapon emitter
 * (`ws`/`we` >= 0). Decoys may redirect city shots onto empty ground.
 */
export function fireEnemyShot(g: Game, kind: number, species: number, x: number, y: number, z: number, dmg: number, city: number, ws: number, we: number, spread: number): void {
  let tx: number;
  let ty: number;
  let tz: number;
  const r = g.combatRng;
  if (ws >= 0) {
    const w = g.arsenal.weapons[ws];
    if (!w) return;
    tx = w.emitters[we * 3];
    ty = w.emitters[we * 3 + 1];
    tz = w.emitters[we * 3 + 2];
  } else {
    const c = g.cities;
    const k = city * 3;
    tx = c.pos[k] + r.range(-spread, spread);
    ty = c.pos[k + 1] + r.range(-spread, spread);
    tz = c.pos[k + 2] + r.range(-spread, spread);
    const l = Math.hypot(tx, ty, tz) || 1;
    tx /= l;
    ty /= l;
    tz /= l;
    const decoy = decoyFor(g, tx, ty, tz);
    if (decoy) {
      tx = decoy[0];
      ty = decoy[1];
      tz = decoy[2];
      city = -1;
    }
  }
  g.emitFx(FX_ESHOT, x, y, z, tx, ty, tz, kind);

  if (kind === SHOT_LASER) {
    // Lasers are instant: a beam, then the burn walks a short way across the ground.
    const absorbed = (ws < 0 || Math.hypot(tx, ty, tz) < AEGIS_R) && aegisAbsorb(g, tx, ty, tz, dmg, x, y, z);
    g.emitFx(FX_ELASER, x, y, z, absorbed ? tx * AEGIS_R : tx, absorbed ? ty * AEGIS_R : ty, absorbed ? tz * AEGIS_R : tz, species);
    if (absorbed) return;
    resolveImpact(g, kind, tx, ty, tz, dmg, city, ws, we);
    if (ws < 0) {
      const ax = r.range(-1, 1) * 0.05;
      const ay = r.range(-1, 1) * 0.05;
      const az = r.range(-1, 1) * 0.05;
      for (let k = 1; k <= 3; k++) g.emitFx(FX_SCORCH, tx + ax * k, ty + ay * k, tz + az * k, 0, 0, 0, 0.02);
    }
    return;
  }

  const s = g.hostile;
  const i = s.spawn();
  if (i < 0) return;
  s.kind[i] = kind;
  s.species[i] = species;
  s.sx[i] = s.x[i] = x;
  s.sy[i] = s.y[i] = y;
  s.sz[i] = s.z[i] = z;
  s.tx[i] = tx;
  s.ty[i] = ty;
  s.tz[i] = tz;
  const len = Math.hypot(tx - x, ty - y, tz - z) || 0.01;
  // Control point: the midpoint pushed away from Earth (lob) plus a sideways swerve.
  const mx = (x + tx) * 0.5;
  const my = (y + ty) * 0.5;
  const mz = (z + tz) * 0.5;
  const ml = Math.hypot(mx, my, mz) || 1;
  const lift = len * ARC[kind];
  const sw = kind === SHOT_MISSILE ? len * 0.35 : len * 0.06;
  s.cx[i] = mx + (mx / ml) * lift + r.range(-sw, sw);
  s.cy[i] = my + (my / ml) * lift + r.range(-sw, sw);
  s.cz[i] = mz + (mz / ml) * lift + r.range(-sw, sw);
  s.t[i] = 0;
  s.rate[i] = SPEED[kind] / (len * (1 + ARC[kind]));
  s.dmg[i] = dmg;
  s.city[i] = city;
  s.ws[i] = ws;
  s.we[i] = we;
}

const SPEED = [1.6, 1.1, 0.9, 0, 0.7];

function resolveImpact(g: Game, kind: number, x: number, y: number, z: number, dmg: number, city: number, ws: number, we: number): void {
  if (ws >= 0) {
    hitEmitter(g, ws, we, dmg);
    return;
  }
  g.emitFx(FX_IMPACT, x, y, z, 0, 0, 0, SHOT_SIZE[kind] * (kind === SHOT_VOID ? 1.6 : 1));
  if (city >= 0) damageCity(g, city, dmg, false, DMG_SHOT);
}

export function updateEnemyShots(g: Game, dt: number): void {
  const s = g.hostile;
  for (let i = 0; i < s.high; i++) {
    if (!s.alive[i]) continue;
    // Shots at emitters track them as they orbit.
    if (s.ws[i] >= 0) {
      const w = g.arsenal.weapons[s.ws[i]];
      if (!w || emitterBroken(w, s.we[i])) {
        s.kill(i);
        continue;
      }
      s.tx[i] = w.emitters[s.we[i] * 3];
      s.ty[i] = w.emitters[s.we[i] * 3 + 1];
      s.tz[i] = w.emitters[s.we[i] * 3 + 2];
    }
    const t = Math.min(1, s.t[i] + s.rate[i] * dt);
    s.t[i] = t;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    const nx = a * s.sx[i] + b * s.cx[i] + c * s.tx[i];
    const ny = a * s.sy[i] + b * s.cy[i] + c * s.ty[i];
    const nz = a * s.sz[i] + b * s.cz[i] + c * s.tz[i];
    const hx = nx - s.x[i];
    const hy = ny - s.y[i];
    const hz = nz - s.z[i];
    const hl = Math.hypot(hx, hy, hz);
    if (hl > 1e-6) {
      s.dx[i] = hx / hl;
      s.dy[i] = hy / hl;
      s.dz[i] = hz / hl;
    }
    s.x[i] = nx;
    s.y[i] = ny;
    s.z[i] = nz;
    // City and ground shots cross the Aegis shell on the way down.
    if (s.ws[i] < 0 || Math.hypot(s.tx[i], s.ty[i], s.tz[i]) < AEGIS_R) {
      const r = Math.hypot(nx, ny, nz);
      if (r < AEGIS_R && t < 0.98 && aegisAbsorb(g, nx, ny, nz, s.dmg[i])) {
        s.kill(i);
        continue;
      }
    }
    if (t >= 1) {
      resolveImpact(g, s.kind[i], s.tx[i], s.ty[i], s.tz[i], s.dmg[i], s.city[i], s.ws[i], s.we[i]);
      s.kill(i);
    }
  }
}
