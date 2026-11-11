import { abilityById } from '../data/abilities';
import { CITY_MAX_HEALTH } from '../data/cities';
import { COMMANDERS, CONTENT_GATES } from '../data/meta';
import { PROGRESSION, xpForLevel } from '../data/progression';
import type { AbilityDef } from '../data/types';
import { WAVE_RULES } from '../data/aliens';
import type { Rng } from '../core/rng';
import { RunRng } from '../core/rng';
import { activateAbility, updateAbilities } from './abilities';
import { updateAliens } from './aliens';
import { Build } from './build';
import { CityState } from './cities';
import { updateCombat } from './combat';
import { gainSalvage, healCities, runTriggers } from './damage';
import { EnemyPool } from './enemies';
import { applyOffer, banishOffer, Offer, openLevelUp, rerollOffers, rollStartingWeapons } from './offers';
import { FieldPool, ProjectilePool } from './projectiles';
import { buyShopItem, leaveShop, openShop, rerollShop, ShopState } from './shop';
import { updateWaves } from './waves';
import { Arsenal } from './weapons';

export const STEP = 1 / 60;

// One-frame visual/audio events: [kind, x, y, z, x2, y2, z2, param].
export const FX_HIT = 0;
export const FX_EXPLOSION = 1; // param: size
export const FX_MUZZLE = 2; // param: weapon slot
export const FX_CITY_HIT = 3;
export const FX_BLAST = 4; // param: radius
export const FX_CRIT = 5;
export const FX_BEAM = 6; // line; param: weapon slot
export const FX_CHAIN = 7; // line; param: weapon slot
export const FX_BOMB = 8; // line enemy -> city
export const FX_SHIELD_HIT = 9;
export const FX_ESCAPE = 10;
export const FX_BLINK = 11;
export const FX_NOVA = 12; // param: weapon slot
export const FX_STRIKE = 13; // param: radius
export const FX_EMP = 14;
export const FX_WARP = 15;
export const FX_CITY_FALL = 16;
export const FX_EVOLVE = 17;
export const FX_SHOT = 18; // audio only; param: weapon slot
export const FX_FIELD = 19; // param: radius
export const FX_CITY_SHIELD = 20;
const FX_CAP = 512;
export const FX_STRIDE = 8;

export type Phase = 'intermission' | 'spawning' | 'clearing' | 'shop' | 'gameover';

export interface RunConfig {
  seed: string;
  commander?: string;
  /** Equipped ability ids (at most abilitySlots). */
  abilities?: string[];
  abilitySlots?: number;
  /** Meta unlock ids owned; gate content and starting weapons. */
  unlocks?: string[];
}

export interface AbilityState {
  def: AbilityDef;
  cd: number;
}

export interface LogEntry {
  t: number;
  text: string;
  kind: 'info' | 'warn' | 'good' | 'boss';
}

/** The whole deterministic simulation. Depends only on the config, the step count and player inputs. */
export class Game {
  readonly config: RunConfig;
  readonly rng: RunRng;
  readonly waveRng: Rng;
  readonly offerRng: Rng;
  readonly combatRng: Rng;
  readonly shopRng: Rng;
  readonly cities = new CityState();
  readonly enemies = new EnemyPool();
  readonly projectiles = new ProjectilePool();
  readonly fields = new FieldPool();
  readonly arsenal = new Arsenal();
  readonly build = new Build();
  /** Lowest health each city has reached; population only falls with new lows. */
  readonly lowWater = new Float32Array(this.cities.count).fill(CITY_MAX_HEALTH);
  /** Enemies actively attacking each city, rebuilt every step. */
  readonly threat = new Uint16Array(this.cities.count);
  /** Seconds of emergency shield left per city. */
  readonly cityShield = new Float32Array(this.cities.count);
  /** Content ids hidden from offers (locked by meta progression). */
  readonly locked = new Set<string>();
  readonly unlocks: ReadonlySet<string>;

  phase: Phase = 'intermission';
  wave = 0;
  time = 0;
  kills = 0;
  bossKills = 0;
  salvage = 0;
  salvageEarned = 0;
  peopleRescued = 0;
  peopleTaken = 0;

  xp = 0;
  level = 1;
  xpNeeded = xpForLevel(1);
  /** While set, the sim is paused waiting for the player to pick one. */
  offer: Offer[] | null = null;
  offerKind: 'start' | 'levelup' = 'start';
  rerolls: number;
  banishes: number;
  pendingLevels = 0;
  readonly banished = new Set<string>();
  /** Base weapons consumed by an evolution; they never return to the pool. */
  readonly retired = new Set<string>();

  shop: ShopState | null = null;
  phaseTimer: number = WAVE_RULES.firstDelay;

  readonly abilities: AbilityState[] = [];
  abilitySlots: number;
  /** Alien time multiplier (time dilation). */
  alienScale = 1;
  alienScaleT = 0;
  overclockT = 0;
  overclockMul = 1;
  secondWindUsed = false;
  insuranceAcc = 0;
  /** Slot of the current boss, for the HUD health bar. */
  bossSlot = -1;

  /** Spawn bookkeeping (sim/waves.ts). */
  spawnQueue: { def: number; tier: number; cluster: number }[] = [];
  spawnTimer = 0;
  spawnInterval = 0;
  clusterId = -1;
  clusterDir = [0, 0, 1];

  readonly fx = new Float32Array(FX_CAP * FX_STRIDE);
  fxCount = 0;
  readonly log: LogEntry[] = [];

  readonly targets = new Int16Array(32);

  constructor(config: RunConfig | string) {
    this.config = typeof config === 'string' ? { seed: config } : config;
    this.rng = new RunRng(this.config.seed);
    this.waveRng = this.rng.stream('waves');
    this.offerRng = this.rng.stream('offers');
    this.combatRng = this.rng.stream('combat');
    this.shopRng = this.rng.stream('shop');
    this.unlocks = new Set(this.config.unlocks ?? []);
    for (const [gate, ids] of Object.entries(CONTENT_GATES)) if (!this.unlocks.has(gate)) for (const id of ids) this.locked.add(id);

    const cmd = COMMANDERS.find((c) => c.id === this.config.commander);
    if (cmd) {
      this.build.innate.push(...cmd.effects);
      this.salvage += cmd.salvage ?? 0;
    }
    this.abilitySlots = Math.max(1, Math.min(2, this.config.abilitySlots ?? 1));
    for (const id of (this.config.abilities ?? []).slice(0, this.abilitySlots)) this.abilities.push({ def: abilityById(id), cd: 0 });
    this.recompute();
    this.rerolls = PROGRESSION.rerolls + Math.round(this.build.global('rerolls'));
    this.banishes = PROGRESSION.banishes + Math.round(this.build.global('banishes'));
    this.offer = rollStartingWeapons(this);
  }

  /** Content gate check for weapons, passives and relics. */
  isUnlocked(id: string, unlock?: string): boolean {
    if (unlock && !this.unlocks.has(unlock)) return false;
    return !this.locked.has(id);
  }

  recompute(): void {
    const before = this.arsenal.slots;
    this.build.recompute(this.arsenal.weapons);
    this.arsenal.slots = Math.max(before, 6 + Math.round(this.build.global('slots')) + (this.extraSlots ?? 0));
  }
  /** Slots bought in the shop. */
  extraSlots = 0;

  get hostiles(): number {
    return this.enemies.count + this.spawnQueue.length;
  }

  /** Seconds until the next wave, or 0 when one is in progress. */
  get nextWaveIn(): number {
    return this.phase === 'intermission' ? this.phaseTimer : 0;
  }

  get paused(): boolean {
    return this.phase === 'gameover' || this.phase === 'shop' || this.offer !== null;
  }

  emitFx(kind: number, x: number, y: number, z: number, x2 = 0, y2 = 0, z2 = 0, p = 0): void {
    if (this.fxCount >= FX_CAP) return;
    const k = this.fxCount++ * FX_STRIDE;
    const f = this.fx;
    f[k] = kind;
    f[k + 1] = x;
    f[k + 2] = y;
    f[k + 3] = z;
    f[k + 4] = x2;
    f[k + 5] = y2;
    f[k + 6] = z2;
    f[k + 7] = p;
  }

  addLog(text: string, kind: LogEntry['kind'] = 'info'): void {
    this.log.push({ t: this.time, text, kind });
    if (this.log.length > 40) this.log.shift();
  }

  step(dt: number): void {
    if (this.paused) return;
    this.time += dt;
    updateAbilities(this, dt);
    updateWaves(this, dt);
    for (const w of this.arsenal.weapons) w.jam = 0;
    updateAliens(this, dt * this.alienScale, dt);
    updateCombat(this, dt);
    if (this.build.cityRegen > 0) healCities(this, this.build.cityRegen * dt);

    const c = this.cities;
    if (!this.secondWindUsed && this.build.rules.has('secondWind') && c.totalPopulation() < c.startPopulation * 0.4) {
      this.secondWindUsed = true;
      healCities(this, CITY_MAX_HEALTH);
      this.addLog('SECOND WIND: all surviving cities rebuilt', 'good');
    }
    if (this.insuranceAcc >= 1e6) {
      const n = Math.floor(this.insuranceAcc / 1e6);
      this.insuranceAcc -= n * 1e6;
      gainSalvage(this, n * 2, false);
    }
    if (c.isLost()) {
      this.phase = 'gameover';
      this.addLog('EARTH HAS FALLEN', 'warn');
    }
  }

  // ---- player inputs (the only things besides time that change the sim) ----

  choose(i: number): void {
    applyOffer(this, i);
  }

  reroll(): void {
    rerollOffers(this);
  }

  banish(i: number): void {
    banishOffer(this, i);
  }

  buy(i: number): boolean {
    return buyShopItem(this, i);
  }

  rerollShop(): boolean {
    return rerollShop(this);
  }

  leaveShop(): void {
    leaveShop(this);
  }

  /** Called by the wave system when a wave is cleared. */
  onWaveCleared(): void {
    openShop(this);
  }

  useAbility(i: number, target?: { point?: [number, number, number]; city?: number }): boolean {
    return activateAbility(this, i, target);
  }

  /** Level-up bookkeeping shared with damage.ts. */
  queueLevelUps(): void {
    if (!this.offer && this.pendingLevels > 0) openLevelUp(this);
  }

  fireTriggers(on: Parameters<typeof runTriggers>[1]): void {
    runTriggers(this, on, -1, 0, 0, 0, -1);
  }

  /** Cheap state digest for determinism tests. */
  digest(): number {
    let h = this.wave * 73856093 + this.kills * 19349663 + this.level * 83492791 + Math.round(this.salvage) * 2654435761;
    const e = this.enemies;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      h = (Math.imul(h, 31) + Math.fround(e.x[i] * 1e4) + Math.fround(e.hp[i] * 1e3)) | 0;
    }
    for (let i = 0; i < this.cities.count; i++) h = (Math.imul(h, 31) + Math.round(this.cities.health[i] * 1e3) + Math.round(this.cities.population[i] / 1000)) | 0;
    return h;
  }
}
