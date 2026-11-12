export const MAX_ENEMIES = 3000;

export const ST_APPROACH = 0;
/** Invader landed and besieging. */
export const ST_SIEGE = 1;
/** Destroyer / carrier / boss on station, abductor beaming. */
export const ST_HOVER = 2;
/** Abductor fleeing with cargo. */
export const ST_FLEE = 3;
/** Saboteur clamped onto a weapon emitter. */
export const ST_ATTACHED = 4;

export const ROLE_INVADER = 0;
export const ROLE_DESTROYER = 1;
export const ROLE_ABDUCTOR = 2;
export const ROLE_SABOTEUR = 3;
export const ROLE_CARRIER = 4;
export const ROLE_BOSS = 5;
export const ROLE_GUNSHIP = 6;
export const ROLE_HORROR = 7;
export const ROLE_TENTACLE = 8;
export const ROLE_IDS = ['invader', 'destroyer', 'abductor', 'saboteur', 'carrier', 'boss', 'gunship', 'horror', 'tentacle'] as const;

/** Struct-of-arrays enemy pool in the Earth-fixed frame. Slots are reused; `gen`
 *  changes on every reuse so stale references (projectiles) can be detected. */
export class EnemyPool {
  readonly alive = new Uint8Array(MAX_ENEMIES);
  readonly gen = new Uint16Array(MAX_ENEMIES);
  readonly def = new Uint16Array(MAX_ENEMIES);
  readonly species = new Uint8Array(MAX_ENEMIES);
  readonly role = new Uint8Array(MAX_ENEMIES);
  readonly tier = new Uint8Array(MAX_ENEMIES);
  /** ModifierDef bits. */
  readonly mods = new Uint8Array(MAX_ENEMIES);
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
  readonly shield = new Float32Array(MAX_ENEMIES);
  readonly maxShield = new Float32Array(MAX_ENEMIES);
  readonly armor = new Float32Array(MAX_ENEMIES);
  /** Health regenerated per second (absolute). */
  readonly regen = new Float32Array(MAX_ENEMIES);
  readonly speed = new Float32Array(MAX_ENEMIES);
  readonly dmgMul = new Float32Array(MAX_ENEMIES);
  readonly rewardMul = new Float32Array(MAX_ENEMIES);
  readonly scale = new Float32Array(MAX_ENEMIES);
  /** Damage already in flight toward this enemy; used to avoid overkill. */
  readonly pending = new Float32Array(MAX_ENEMIES);
  readonly city = new Int16Array(MAX_ENEMIES);
  /** Saboteur target: weapon slot and emitter index. */
  readonly tgtW = new Int8Array(MAX_ENEMIES);
  readonly tgtE = new Int8Array(MAX_ENEMIES);
  /** Role timer (bombard, spawn, abduct). */
  readonly timer = new Float32Array(MAX_ENEMIES);
  /** Movement timer (blink). */
  readonly mtimer = new Float32Array(MAX_ENEMIES);
  /** Seconds since last damage, for shield regeneration. */
  readonly sinceHit = new Float32Array(MAX_ENEMIES);
  /** People carried by an abductor. */
  readonly cargo = new Float32Array(MAX_ENEMIES);
  readonly flash = new Float32Array(MAX_ENEMIES);
  readonly stun = new Float32Array(MAX_ENEMIES);
  readonly slow = new Float32Array(MAX_ENEMIES);
  readonly slowT = new Float32Array(MAX_ENEMIES);
  readonly dotDps = new Float32Array(MAX_ENEMIES);
  readonly dotT = new Float32Array(MAX_ENEMIES);
  readonly dotW = new Int8Array(MAX_ENEMIES);
  readonly mark = new Float32Array(MAX_ENEMIES);
  readonly markT = new Float32Array(MAX_ENEMIES);
  readonly cloaked = new Uint8Array(MAX_ENEMIES);
  /** Swarm fodder (cheap kills, rendered with a low-poly mesh). */
  readonly fodder = new Uint8Array(MAX_ENEMIES);
  /** Seconds until the next ranged volley. */
  readonly atk = new Float32Array(MAX_ENEMIES);
  /** Brood launch timer (carriers, bosses, horrors). */
  readonly btimer = new Float32Array(MAX_ENEMIES);
  /** Tentacles: the body they grow from (slot + generation). */
  readonly parent = new Int16Array(MAX_ENEMIES);
  readonly parentGen = new Uint16Array(MAX_ENEMIES);
  /** Boss / horror rage phase (0..2), advanced at health thresholds. */
  readonly phase = new Uint8Array(MAX_ENEMIES);
  /** Per-enemy random phase for movement wobble and cloak cycles. */
  readonly seed = new Float32Array(MAX_ENEMIES);
  count = 0;
  /** One past the highest slot ever used; loops only need to scan this far. */
  high = 0;
  private free = new Int16Array(MAX_ENEMIES);
  private freeTop = 0;

  spawn(): number {
    let i: number;
    if (this.freeTop > 0) i = this.free[--this.freeTop];
    else if (this.high < MAX_ENEMIES) i = this.high++;
    else return -1;
    this.alive[i] = 1;
    this.gen[i] = (this.gen[i] + 1) & 0xffff;
    this.state[i] = ST_APPROACH;
    this.mods[i] = 0;
    this.shield[i] = this.maxShield[i] = 0;
    this.armor[i] = this.regen[i] = 0;
    this.pending[i] = 0;
    this.tgtW[i] = this.tgtE[i] = -1;
    this.timer[i] = this.mtimer[i] = this.sinceHit[i] = 0;
    this.cargo[i] = this.flash[i] = this.stun[i] = 0;
    this.slow[i] = this.slowT[i] = this.dotDps[i] = this.dotT[i] = 0;
    this.dotW[i] = -1;
    this.mark[i] = this.markT[i] = 0;
    this.cloaked[i] = 0;
    this.fodder[i] = 0;
    this.atk[i] = this.btimer[i] = 0;
    this.parent[i] = -1;
    this.phase[i] = 0;
    this.count++;
    return i;
  }

  kill(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.free[this.freeTop++] = i;
    this.count--;
  }

  /** Untargetable right now. */
  hidden(i: number): boolean {
    return this.cloaked[i] === 1;
  }
}
