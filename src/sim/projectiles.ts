export const MAX_PROJECTILES = 2000;

/** Homing projectile pool. A projectile tracks an enemy slot + generation. */
export class ProjectilePool {
  readonly alive = new Uint8Array(MAX_PROJECTILES);
  readonly x = new Float32Array(MAX_PROJECTILES);
  readonly y = new Float32Array(MAX_PROJECTILES);
  readonly z = new Float32Array(MAX_PROJECTILES);
  readonly dx = new Float32Array(MAX_PROJECTILES);
  readonly dy = new Float32Array(MAX_PROJECTILES);
  readonly dz = new Float32Array(MAX_PROJECTILES);
  readonly speed = new Float32Array(MAX_PROJECTILES);
  readonly damage = new Float32Array(MAX_PROJECTILES);
  readonly life = new Float32Array(MAX_PROJECTILES);
  readonly target = new Int16Array(MAX_PROJECTILES);
  readonly targetGen = new Uint16Array(MAX_PROJECTILES);
  /** Owning weapon slot, for damage attribution. */
  readonly weapon = new Int8Array(MAX_PROJECTILES);
  count = 0;
  high = 0;
  private free = new Int16Array(MAX_PROJECTILES);
  private freeTop = 0;

  spawn(): number {
    let i: number;
    if (this.freeTop > 0) i = this.free[--this.freeTop];
    else if (this.high < MAX_PROJECTILES) i = this.high++;
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
