export const MAX_ENEMIES = 600;
export const ENEMY_APPROACH = 0;
export const ENEMY_SIEGE = 1;

/** Struct-of-arrays enemy pool in the Earth-fixed frame. Slots are reused; `gen`
 *  changes on every reuse so stale references (projectiles) can be detected. */
export class EnemyPool {
  readonly alive = new Uint8Array(MAX_ENEMIES);
  readonly gen = new Uint16Array(MAX_ENEMIES);
  readonly def = new Uint16Array(MAX_ENEMIES);
  readonly state = new Uint8Array(MAX_ENEMIES);
  readonly x = new Float32Array(MAX_ENEMIES);
  readonly y = new Float32Array(MAX_ENEMIES);
  readonly z = new Float32Array(MAX_ENEMIES);
  /** Unit facing direction. */
  readonly dx = new Float32Array(MAX_ENEMIES);
  readonly dy = new Float32Array(MAX_ENEMIES);
  readonly dz = new Float32Array(MAX_ENEMIES);
  readonly hp = new Float32Array(MAX_ENEMIES);
  readonly maxHp = new Float32Array(MAX_ENEMIES);
  /** Damage already in flight toward this enemy; used to avoid overkill. */
  readonly pending = new Float32Array(MAX_ENEMIES);
  readonly city = new Int16Array(MAX_ENEMIES);
  readonly flash = new Float32Array(MAX_ENEMIES);
  count = 0;
  /** One past the highest slot ever used; loops only need to scan this far. */
  high = 0;
  private free = new Int16Array(MAX_ENEMIES);
  private freeTop = 0;

  spawn(def: number, x: number, y: number, z: number, hp: number, city: number): number {
    let i: number;
    if (this.freeTop > 0) i = this.free[--this.freeTop];
    else if (this.high < MAX_ENEMIES) i = this.high++;
    else return -1;
    this.alive[i] = 1;
    this.gen[i] = (this.gen[i] + 1) & 0xffff;
    this.def[i] = def;
    this.state[i] = ENEMY_APPROACH;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    const l = Math.hypot(x, y, z) || 1;
    this.dx[i] = -x / l;
    this.dy[i] = -y / l;
    this.dz[i] = -z / l;
    this.hp[i] = hp;
    this.maxHp[i] = hp;
    this.pending[i] = 0;
    this.city[i] = city;
    this.flash[i] = 0;
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
