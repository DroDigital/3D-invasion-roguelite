export const MAX_PROJECTILES = 6000;

export const PK_BOLT = 0;
export const PK_DRONE = 1;
export const PK_SHARD = 2; // split fragment: no further splitting

/** Homing projectile / drone pool. A projectile tracks an enemy slot + generation. */
export class ProjectilePool {
  readonly alive = new Uint8Array(MAX_PROJECTILES);
  readonly kind = new Uint8Array(MAX_PROJECTILES);
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
  /** Hits left before the projectile is spent. */
  readonly hits = new Uint8Array(MAX_PROJECTILES);
  /** Last enemy hit, so a piercing round never hits the same target twice in a row. */
  readonly last = new Int16Array(MAX_PROJECTILES);
  readonly crit = new Uint8Array(MAX_PROJECTILES);
  /** Damage reserved on the original target's `pending`; released on hit or loss. */
  readonly pend = new Float32Array(MAX_PROJECTILES);
  /** Owning weapon slot, for damage attribution and effects. */
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
    this.last[i] = -1;
    this.crit[i] = 0;
    this.pend[i] = 0;
    this.hits[i] = 1;
    this.kind[i] = PK_BOLT;
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

export const MAX_FIELDS = 48;

/** Gravity fields: persistent damage/slow/pull areas anchored in the Earth-fixed frame. */
export class FieldPool {
  readonly alive = new Uint8Array(MAX_FIELDS);
  readonly x = new Float32Array(MAX_FIELDS);
  readonly y = new Float32Array(MAX_FIELDS);
  readonly z = new Float32Array(MAX_FIELDS);
  readonly radius = new Float32Array(MAX_FIELDS);
  readonly ttl = new Float32Array(MAX_FIELDS);
  readonly maxTtl = new Float32Array(MAX_FIELDS);
  readonly dps = new Float32Array(MAX_FIELDS);
  readonly slow = new Float32Array(MAX_FIELDS);
  readonly pull = new Float32Array(MAX_FIELDS);
  readonly maxHpFrac = new Float32Array(MAX_FIELDS);
  readonly weapon = new Int8Array(MAX_FIELDS);
  readonly tick = new Float32Array(MAX_FIELDS);
  count = 0;

  spawn(): number {
    for (let i = 0; i < MAX_FIELDS; i++) {
      if (!this.alive[i]) {
        this.alive[i] = 1;
        this.tick[i] = 0;
        this.count++;
        return i;
      }
    }
    // Full: recycle the field closest to expiring.
    let best = 0;
    for (let i = 1; i < MAX_FIELDS; i++) if (this.ttl[i] < this.ttl[best]) best = i;
    this.tick[best] = 0;
    return best;
  }

  kill(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.count--;
  }
}
