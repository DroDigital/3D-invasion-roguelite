import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, ConeGeometry, DynamicDrawUsage,
  IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4,
  Object3D, Quaternion, SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { modelNow } from '../core/assets';
import { ALLIES } from '../data/allies';
import { MAX_ALLIES } from '../sim/allies';
import { ALIENS, ALIEN_TIERS, SPECIES } from '../data/aliens';
import {
  MAX_ENEMIES, ROLE_ABDUCTOR, ROLE_INVADER, ROLE_SABOTEUR, ROLE_TENTACLE, ST_ATTACHED, ST_FLEE, ST_HOVER, ST_SIEGE,
} from '../sim/enemies';
import type { Game } from '../sim/game';
import {
  FX_ALLY_SHOT, FX_BEAM, FX_BLAST, FX_BLINK, FX_BOMB, FX_CHAIN, FX_CITY_FALL, FX_CITY_HIT, FX_CITY_SHIELD, FX_CRIT, FX_EMP, FX_ESCAPE,
  FX_EVOLVE, FX_EXPLOSION, FX_FIELD, FX_HIT, FX_KILL, FX_MUZZLE, FX_NOVA, FX_SHIELD_HIT, FX_STRIDE, FX_STRIKE, FX_WARP,
} from '../sim/game';
import { MAX_FIELDS, MAX_PROJECTILES, PK_DRONE } from '../sim/projectiles';
import { MAX_EMITTERS, tierOf } from '../sim/weapons';
import { RibbonLayer, SP_EMBER, SP_FLASH, SP_PORTAL, SP_RING, SP_STAR, SpriteFx, SpriteLayer } from './billboards';
import { buildTierModel, tierScale } from './kit';
import { PS2 } from './ps2Material';
import { additive, fresnel, psInstanced } from './instanced';
import { creatureGeometry, isCreature } from './creatures';
import { HostileView } from './hostileView';

const FWD = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);
const X_AXIS = new Vector3(1, 0, 0);
const m = new Matrix4();
const q = new Quaternion();
const p = new Vector3();
const d = new Vector3();
const s = new Vector3();
const col = new Color();

const HULLS = [...new Set(ALIENS.map((a) => a.model))];
const HULL_INDEX = new Map(HULLS.map((h, i) => [h, i]));
const DEF_HULL = ALIENS.map((a) => HULL_INDEX.get(a.model)!);
const CREATURE = ALIENS.map((a) => isCreature(a.model));
const MAX_MOTES = 1500;
const SPECIES_GLOW = SPECIES.map((sp) => sp.palette[1].map((v) => v * 2.2) as [number, number, number]);
const ALIEN_RENDER_SCALE = 1.6;
const MAX_WAVES = 24;

/** Palette slot for Earth's allied fighters (species use 0-3). */
const PAL_ALLY = 5;

/** Swarm fodder hull: a tiny faceted dart. At a few pixels on screen it reads as well as a full hull. */
function dartGeometry(): BufferGeometry {
  const nose = new ConeGeometry(0.22, 0.75, 5).rotateX(Math.PI / 2).translate(0, 0, 0.12);
  const wings = new ConeGeometry(0.5, 0.35, 3).scale(1, 1, 0.12).rotateX(Math.PI / 2).rotateZ(Math.PI).translate(0, 0, -0.2);
  const g = mergeGeometries([nose.toNonIndexed(), wings.toNonIndexed()])!;
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(i % 9 < 3 ? [0.75, 0.75, 0.75] : [0.45, 0.45, 0.45], i * 3);
  g.setAttribute('color', new BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

interface WeaponMesh {
  key: string;
  mesh: InstancedMesh;
  data: InstancedBufferAttribute;
}

/** Instanced views of everything in the sim. One draw call per archetype. */
export class CombatView {
  private hulls: ({ mesh: InstancedMesh; data: InstancedBufferAttribute } | null)[] = HULLS.map(() => null);
  private hullCount = new Int32Array(HULLS.length);
  private shields = fresnel(new IcosahedronGeometry(1, 2), MAX_ENEMIES, 2.5, 1.2);
  private halos = additive(new TorusGeometry(1, 0.035, 3, 18), MAX_ENEMIES, 0.55);
  private beams = additive(new ConeGeometry(1, 1, 10, 1, true).translate(0, -0.5, 0), 64, 0.35);
  private drones: { mesh: InstancedMesh; data: InstancedBufferAttribute };
  private fields = fresnel(new SphereGeometry(1, 20, 12), MAX_FIELDS, 3.0, 0.45);
  private waves = additive(new TorusGeometry(1, 0.02, 3, 48), MAX_WAVES, 0.9);
  private domes = additive(new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 32, 0.35);
  private weapons: (WeaponMesh | null)[] = [];
  private fodderView = psInstanced(dartGeometry(), MAX_ENEMIES);
  private allyViews: ({ mesh: InstancedMesh; data: InstancedBufferAttribute } | null)[] = ALLIES.models.map(() => null);
  private trails: LineSegments;
  private trailPos = new Float32Array(MAX_ENEMIES * 6);
  private trailCol = new Float32Array(MAX_ENEMIES * 6);
  /** Juice layers: animated sprites, beam/lightning ribbons, projectile tracers, engine glows and XP motes. */
  private sprites: SpriteFx;
  private ribbons: RibbonLayer;
  private tracers: RibbonLayer;
  private glows: SpriteLayer;
  private moteX = new Float32Array(MAX_MOTES);
  private moteY = new Float32Array(MAX_MOTES);
  private moteZ = new Float32Array(MAX_MOTES);
  private moteVX = new Float32Array(MAX_MOTES);
  private moteVY = new Float32Array(MAX_MOTES);
  private moteVZ = new Float32Array(MAX_MOTES);
  private moteT = new Float32Array(MAX_MOTES);
  private moteNext = 0;
  /** XP motes absorbed this frame (HUD pulses the XP bar). */
  absorbed = 0;
  /** Hit-stop request in seconds of slow motion; main.ts consumes it. */
  hitStop = 0;
  private waveData = new Float32Array(MAX_WAVES * 8); // x y z, radius, ttl, maxTtl, r g (b in color)
  private waveCol: Color[] = Array.from({ length: MAX_WAVES }, () => new Color());
  private waveNext = 0;
  /** Weapon shot colours by slot, refreshed when the loadout changes. */
  private slotColor: Color[] = [];
  /** Effect intensity per slot: grows with tier (evolved = 2). */
  private slotPower: number[] = [];
  /** Camera shake requests, read by main.ts. */
  shake = 0;
  flash = 0;
  /** Alien fire, tentacles, wrecks, smoke and Earth's defenses. */
  readonly hostile: HostileView;

  constructor(private game: Game, private parent: Object3D) {
    const droneGeo = new ConeGeometry(0.4, 1.2, 4).rotateX(Math.PI / 2).toNonIndexed();
    const dn = droneGeo.getAttribute('position').count;
    droneGeo.setAttribute('color', new BufferAttribute(new Float32Array(dn * 3).fill(0.7), 3));
    droneGeo.computeVertexNormals();
    this.drones = psInstanced(droneGeo, MAX_PROJECTILES);

    const mkLines = (pos: Float32Array, colArr: Float32Array, opacity: number): LineSegments => {
      const g = new BufferGeometry();
      const pa = new BufferAttribute(pos, 3);
      const ca = new BufferAttribute(colArr, 3);
      pa.setUsage(DynamicDrawUsage);
      ca.setUsage(DynamicDrawUsage);
      g.setAttribute('position', pa);
      g.setAttribute('color', ca);
      const l = new LineSegments(g, new LineBasicMaterial({ vertexColors: true, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false }));
      l.frustumCulled = false;
      return l;
    };
    this.trails = mkLines(this.trailPos, this.trailCol, 0.16);
    this.sprites = new SpriteFx(parent);
    this.ribbons = new RibbonLayer(parent, 4000, false);
    this.tracers = new RibbonLayer(parent, MAX_PROJECTILES, true);
    this.glows = new SpriteLayer(parent, MAX_ENEMIES + MAX_MOTES + 64);
    this.hostile = new HostileView(game, parent, this);

    for (const o of [this.shields, this.halos, this.beams, this.drones.mesh, this.fields, this.waves, this.domes, this.trails, this.fodderView.mesh]) parent.add(o);
  }

  dispose(): void {
    this.hostile.dispose();
    this.sprites.dispose();
    this.ribbons.dispose();
    this.tracers.dispose();
    this.glows.dispose();
    const objs = [this.shields, this.halos, this.beams, this.drones.mesh, this.fields, this.waves, this.domes, this.trails, this.fodderView.mesh];
    for (const v of this.allyViews) if (v) objs.push(v.mesh);
    for (const v of this.hulls) if (v) objs.push(v.mesh);
    for (const v of this.weapons) if (v) objs.push(v.mesh);
    for (const o of objs) {
      o.removeFromParent();
      o.geometry.dispose();
    }
  }

  private hull(h: number): { mesh: InstancedMesh; data: InstancedBufferAttribute } | null {
    let v = this.hulls[h];
    if (v) return v;
    const name = HULLS[h];
    const geo = isCreature(name) ? creatureGeometry(name) : modelNow(`hull:${name}`);
    if (!geo) return null;
    v = psInstanced(geo, MAX_ENEMIES);
    this.parent.add(v.mesh);
    this.hulls[h] = v;
    return v;
  }

  private addLine(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, c: Color, ttl: number, width = 0.006): void {
    this.ribbons.add(x1, y1, z1, x2, y2, z2, width, ttl, c.r, c.g, c.b);
  }

  /** Lightning: a jagged polyline between two points. */
  private addBolt(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, c: Color, ttl: number, width = 0.005): void {
    const n = 4;
    let px = x1;
    let py = y1;
    let pz = z1;
    const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const j = k === n ? 0 : len * 0.12;
      const nx = x1 + (x2 - x1) * t + (Math.random() - 0.5) * j;
      const ny = y1 + (y2 - y1) * t + (Math.random() - 0.5) * j;
      const nz = z1 + (z2 - z1) * t + (Math.random() - 0.5) * j;
      this.addLine(px, py, pz, nx, ny, nz, c, ttl, width);
      px = nx;
      py = ny;
      pz = nz;
    }
  }

  private addWave(x: number, y: number, z: number, radius: number, ttl: number, c: Color): void {
    const i = this.waveNext;
    this.waveNext = (this.waveNext + 1) % MAX_WAVES;
    const o = i * 8;
    this.waveData[o] = x;
    this.waveData[o + 1] = y;
    this.waveData[o + 2] = z;
    this.waveData[o + 3] = radius;
    this.waveData[o + 4] = ttl;
    this.waveData[o + 5] = ttl;
    this.waveCol[i].copy(c);
  }

  /** Consume the frame's sim fx: sprites, ribbons, shockwaves, motes, shake and hit-stop. */
  consumeFx(): void {
    const g = this.game;
    const f = g.fx;
    const sp = this.sprites;
    for (let k = 0; k < g.fxCount; k++) {
      const o = k * FX_STRIDE;
      const kind = f[o];
      const x = f[o + 1];
      const y = f[o + 2];
      const z = f[o + 3];
      const slot = f[o + 7] | 0;
      const c = this.slotColor[slot] ?? col.set(2, 2, 2);
      switch (kind) {
        case FX_HIT:
          sp.spawn(SP_FLASH, x, y, z, 0.012, 0.03, 0.1, 1.8, 1.4, 0.9);
          break;
        case FX_EXPLOSION: {
          const size = f[o + 7];
          // Sized by the hull: fodder pops, line ships boom, giants detonate.
          const r = Math.max(0.03, size * 1.3);
          sp.spawn(SP_FLASH, x, y, z, r * 0.7, r * 2, 0.26, 3.2, 1.9, 0.8);
          if (size > 0.05 || Math.random() < 0.35) sp.spawn(SP_RING, x, y, z, r * 0.3, r * (size > 0.09 ? 4 : 2.2), 0.4, 2.2, 1.2, 0.45);
          sp.spawn(SP_FLASH, x, y, z, r * 0.4, r * 1.1, 0.55, 1.6, 0.5, 0.15, 0.05);
          if (size > 0.09) {
            sp.spawn(SP_STAR, x, y, z, r * 3, r * 6, 0.35, 3, 2.6, 2);
            this.shake = Math.max(this.shake, Math.min(1.2, size * 2.5));
          }
          if (size > 0.4) {
            // Boss kill: a beat of slow motion and a long second shockwave.
            this.hitStop = Math.max(this.hitStop, 0.45);
            sp.spawn(SP_RING, x, y, z, r, r * 9, 1.1, 3, 2.2, 1.2, 0.08);
            this.flash = Math.max(this.flash, 0.5);
          }
          break;
        }
        case FX_KILL:
          this.spawnMotes(x, y, z, f[o + 7] > 0 ? 3 + f[o + 7] * 3 : 1);
          break;
        case FX_ALLY_SHOT:
          this.addLine(x, y, z, f[o + 4], f[o + 5], f[o + 6], col.set(1.4, 2.4, 3.2), 0.07, 0.0025);
          sp.spawn(SP_FLASH, f[o + 4], f[o + 5], f[o + 6], 0.01, 0.025, 0.08, 1.4, 2.2, 3);
          break;
        case FX_MUZZLE:
          sp.spawn(SP_FLASH, x, y, z, 0.02, 0.05, 0.08, c.r * 0.8, c.g * 0.8, c.b * 0.8);
          break;
        case FX_CITY_HIT:
          sp.spawn(SP_FLASH, x * 1.01, y * 1.01, z * 1.01, 0.05, 0.13, 0.35, 3, 0.9, 0.3);
          sp.spawn(SP_RING, x * 1.01, y * 1.01, z * 1.01, 0.02, 0.16, 0.5, 2.4, 0.6, 0.2);
          break;
        case FX_BLAST:
          sp.spawn(SP_FLASH, x, y, z, slot * 0.6 + 0.03, f[o + 7] * 1.8 + 0.05, 0.28, 3, 1.7, 0.6);
          sp.spawn(SP_RING, x, y, z, f[o + 7] * 0.4, f[o + 7] * 2.4 + 0.05, 0.4, 2.6, 1.4, 0.5);
          break;
        case FX_CRIT:
          sp.spawn(SP_STAR, x, y, z, 0.05, 0.11, 0.22, 3, 3, 2.4);
          break;
        case FX_SHIELD_HIT:
          sp.spawn(SP_RING, x, y, z, 0.03, 0.08, 0.2, 0.5, 1.4, 2.6);
          break;
        case FX_BEAM: {
          const pw = this.slotPower[slot] ?? 1;
          const wdt = g.arsenal.weapons[slot]?.def.shot.width ?? 1;
          const ttl = (0.1 + wdt * 0.04) * (0.8 + pw * 0.25);
          this.addLine(x, y, z, f[o + 4], f[o + 5], f[o + 6], c, ttl, 0.004 * wdt * (0.7 + pw * 0.5));
          sp.spawn(SP_FLASH, f[o + 4], f[o + 5], f[o + 6], 0.02, 0.05 * pw, 0.12, c.r, c.g, c.b);
          break;
        }
        case FX_CHAIN: {
          const pw = this.slotPower[slot] ?? 1;
          this.addBolt(x, y, z, f[o + 4], f[o + 5], f[o + 6], c, 0.14 + pw * 0.05, 0.004 * (0.7 + pw * 0.4));
          if (pw >= 1.6) this.addBolt(x, y, z, f[o + 4], f[o + 5], f[o + 6], c, 0.12, 0.003);
          sp.spawn(SP_FLASH, f[o + 4], f[o + 5], f[o + 6], 0.02, 0.05, 0.12, c.r, c.g, c.b);
          break;
        }
        case FX_BOMB:
          this.addLine(x, y, z, f[o + 4], f[o + 5], f[o + 6], col.set(3, 0.6, 0.3), 0.35, 0.01 * (f[o + 7] || 1));
          break;
        case FX_ESCAPE:
          sp.spawn(SP_PORTAL, x, y, z, 0.05, 0.18, 0.7, 0.6, 2.2, 1.4);
          break;
        case FX_BLINK:
          sp.spawn(SP_FLASH, x, y, z, 0.03, 0.07, 0.15, 1.2, 1.6, 2.6);
          break;
        case FX_WARP:
          // Aliens arrive through glowing portals.
          sp.spawn(SP_PORTAL, x, y, z, f[o + 7] * 2 + 0.05, f[o + 7] * 5 + 0.12, 0.6, 1.6, 0.7, 2.8);
          sp.spawn(SP_FLASH, x, y, z, 0.05, f[o + 7] * 3 + 0.08, 0.25, 1.5, 1.0, 2.8);
          break;
        case FX_FIELD:
          sp.spawn(SP_RING, x, y, z, f[o + 7] * 0.4, f[o + 7] * 2, 0.4, c.r, c.g, c.b);
          break;
        case FX_NOVA:
          this.addWave(0, 0, 0, 3.2, 0.8, c);
          this.shake = Math.max(this.shake, 0.4);
          break;
        case FX_STRIKE:
          this.addWave(x, y, z, f[o + 7] * 1.5, 0.7, col.set(3, 2.2, 1.2));
          this.addLine(x * 4, y * 4, z * 4, x, y, z, col.set(4, 3.6, 3), 0.5, 0.05);
          sp.spawn(SP_FLASH, x, y, z, 0.2, 0.8, 0.6, 4, 3, 1.8);
          sp.spawn(SP_RING, x, y, z, 0.1, 1.1, 0.8, 3, 2, 1);
          sp.spawn(SP_STAR, x, y, z, 0.5, 1.2, 0.5, 3, 3, 3);
          this.shake = Math.max(this.shake, 1.3);
          this.flash = Math.max(this.flash, 0.5);
          this.hitStop = Math.max(this.hitStop, 0.25);
          break;
        case FX_EMP:
          this.addWave(0, 0, 0, 3.5, 1.0, col.set(1.2, 2, 3.6));
          this.flash = Math.max(this.flash, 0.4);
          this.shake = Math.max(this.shake, 0.6);
          break;
        case FX_EVOLVE:
          this.addWave(0, 0, 0, 2.2, 1.2, col.set(3, 2.6, 1));
          this.flash = Math.max(this.flash, 0.7);
          this.shake = Math.max(this.shake, 0.8);
          this.hitStop = Math.max(this.hitStop, 0.5);
          break;
        case FX_CITY_FALL:
          sp.spawn(SP_FLASH, x, y, z, 0.15, 0.6, 0.9, 4, 1.4, 0.5);
          sp.spawn(SP_RING, x * 1.01, y * 1.01, z * 1.01, 0.05, 0.9, 1.0, 3, 0.9, 0.3);
          this.shake = Math.max(this.shake, 1.1);
          this.flash = Math.max(this.flash, 0.3);
          this.hitStop = Math.max(this.hitStop, 0.3);
          break;
        case FX_CITY_SHIELD:
          this.addWave(x, y, z, 0.25, 0.6, col.set(0.8, 2, 3.4));
          break;
      }
    }
  }

  private spawnMotes(x: number, y: number, z: number, n: number): void {
    for (let k = 0; k < n; k++) {
      const i = this.moteNext;
      this.moteNext = (this.moteNext + 1) % MAX_MOTES;
      this.moteX[i] = x;
      this.moteY[i] = y;
      this.moteZ[i] = z;
      this.moteVX[i] = (Math.random() - 0.5) * 0.9;
      this.moteVY[i] = (Math.random() - 0.5) * 0.9;
      this.moteVZ[i] = (Math.random() - 0.5) * 0.9;
      this.moteT[i] = 2.5;
    }
  }

  /** XP motes burst out of kills, then home into the planet (XP is collected automatically). */
  private updateMotes(dt: number): void {
    const gl = this.glows;
    for (let i = 0; i < MAX_MOTES; i++) {
      if (this.moteT[i] <= 0) continue;
      this.moteT[i] -= dt;
      const x = this.moteX[i];
      const y = this.moteY[i];
      const z = this.moteZ[i];
      const r = Math.hypot(x, y, z) || 1;
      const age = 2.5 - this.moteT[i];
      const pull = Math.min(14, age * age * 10);
      this.moteVX[i] += (-x / r) * pull * dt - this.moteVX[i] * 2 * dt;
      this.moteVY[i] += (-y / r) * pull * dt - this.moteVY[i] * 2 * dt;
      this.moteVZ[i] += (-z / r) * pull * dt - this.moteVZ[i] * 2 * dt;
      this.moteX[i] += this.moteVX[i] * dt;
      this.moteY[i] += this.moteVY[i] * dt;
      this.moteZ[i] += this.moteVZ[i] * dt;
      if (r < 1.04 || this.moteT[i] <= 0) {
        this.moteT[i] = 0;
        this.absorbed++;
        this.sprites.spawn(SP_FLASH, x, y, z, 0.01, 0.03, 0.15, 0.5, 1.6, 2.2);
        continue;
      }
      gl.push(x, y, z, 0.022, 0.5, 1.7, 2.4, SP_EMBER);
    }
  }

  update(dt: number): void {
    const g = this.game;
    PS2.time.value += dt;
    this.updateWeapons();
    this.consumeFx();
    this.hostile.consumeFx();
    this.updateAliens();
    this.updateAllies();
    this.updateProjectiles();
    this.glows.end();
    this.sprites.update(dt);
    this.ribbons.update(dt);
    this.tracers.update(dt);
    this.updateFields(dt);
    this.glows.begin();
    this.updateMotes(dt);
    this.updateWaves(dt);
    this.updateDomes();
    this.hostile.update(dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.flash = Math.max(0, this.flash - dt * 2);
    void g;
  }

  private updateWeapons(): void {
    const ws = this.game.arsenal.weapons;
    for (let i = 0; i < Math.max(ws.length, this.weapons.length); i++) {
      const w = ws[i];
      const key = w ? w.def.tiers[w.tier].model : '';
      let v = this.weapons[i];
      if (v && v.key !== key) {
        this.parent.remove(v.mesh);
        v.mesh.geometry.dispose();
        v = this.weapons[i] = null;
      }
      if (!w) continue;
      if (!v) {
        const made = psInstanced(buildTierModel(w.def, w.tier), MAX_EMITTERS);
        v = this.weapons[i] = { key, ...made };
        this.parent.add(v.mesh);
      }
      const sc = this.slotColor[i] ?? (this.slotColor[i] = new Color());
      const power = w.def.evolved ? 2 : 1 + w.tier * 0.22;
      this.slotPower[i] = power;
      sc.setRGB(w.def.shot.color[0], w.def.shot.color[1], w.def.shot.color[2]).multiplyScalar(0.75 + power * 0.25);

      const n = tierOf(w).emitters;
      const deploy = w.def.deploy;
      const size = (deploy === 'platform' ? 0.085 : deploy === 'groundBattery' ? 0.04 : deploy === 'droneWing' ? 0.045 : 0.055) * tierScale(w.def, w.tier);
      const jam = w.jam > 0;
      for (let k = 0; k < n; k++) {
        p.set(w.emitters[k * 3], w.emitters[k * 3 + 1], w.emitters[k * 3 + 2]);
        d.copy(p).normalize();
        q.setFromUnitVectors(UP, d);
        s.setScalar(size);
        m.compose(p, q, s);
        v.mesh.setMatrixAt(k, m);
        const down = w.emDown[k] > 0;
        if (down) {
          // Wrecked: shrunk, charred, rebuilding.
          s.setScalar(size * 0.55);
          m.compose(p, q, s);
          v.mesh.setMatrixAt(k, m);
        }
        v.mesh.setColorAt(k, down ? col.setRGB(0.3, 0.16, 0.12) : jam ? col.setRGB(1.6, 0.5, 0.4) : col.setRGB(1, 1, 1));
        v.data.setXYZW(k, -1, 0, 0, !down && jam ? 0.3 * (Math.sin(PS2.time.value * 12) + 1) : 0);
      }
      v.mesh.count = n;
      v.mesh.instanceMatrix.needsUpdate = true;
      v.mesh.instanceColor!.needsUpdate = true;
      v.data.needsUpdate = true;
    }
    this.weapons.length = ws.length;
  }

  private updateAliens(): void {
    const g = this.game;
    const e = g.enemies;
    const c = g.cities;
    this.hullCount.fill(0);
    let nf = 0;
    let sh = 0;
    let ha = 0;
    let bm = 0;
    let t = 0;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      const h = DEF_HULL[e.def[i]];
      const view = this.hull(h);
      p.set(e.x[i], e.y[i], e.z[i]);
      // Small ships render larger than their hit radius so silhouettes read at orbit distance;
      // big hulls are already readable and stay close to true size.
      let sc = e.scale[i] * (1 + (ALIEN_RENDER_SCALE - 1) * Math.min(1, Math.max(0, (0.14 - e.scale[i]) / 0.08)));
      if (CREATURE[e.def[i]]) sc *= 1 + 0.045 * Math.sin(PS2.time.value * 2.6 + e.seed[i]);
      if (e.state[i] === ST_SIEGE) d.copy(p).normalize().negate();
      else d.set(e.dx[i], e.dy[i], e.dz[i]);
      q.setFromUnitVectors(FWD, d);
      s.setScalar(sc);
      m.compose(p, q, s);
      const tier = ALIEN_TIERS[e.tier[i]];
      if (e.fodder[i]) {
        const fv = this.fodderView;
        fv.mesh.setMatrixAt(nf, m);
        fv.mesh.setColorAt(nf, col.setRGB(1, 1, 1));
        fv.data.setXYZW(nf++, e.species[i], e.flash[i] > 0 ? 0.8 : 0, e.cloaked[i] ? 0.8 : 0, 0.05);
      } else if (view) {
        const n = this.hullCount[h]++;
        view.mesh.setMatrixAt(n, m);
        // Rarity shows as a light tint plus the halo ring; the species palette stays readable.
        const tk = e.tier[i] === 0 ? 0 : 0.3;
        view.mesh.setColorAt(n, col.setRGB(1 + (Math.min(1.4, tier.color[0]) - 1) * tk, 1 + (Math.min(1.4, tier.color[1]) - 1) * tk, 1 + (Math.min(1.4, tier.color[2]) - 1) * tk));
        view.data.setXYZW(n, CREATURE[e.def[i]] ? -1 : e.species[i], e.flash[i] > 0 ? 0.8 : 0, e.cloaked[i] ? 0.8 : 0, e.tier[i] >= 2 ? 0.08 : 0);
      }
      if (e.shield[i] > 0 && !e.cloaked[i] && !e.fodder[i]) {
        s.setScalar(sc * 0.75);
        m.compose(p, q, s);
        this.shields.setMatrixAt(sh, m);
        const f = e.shield[i] / Math.max(1, e.maxShield[i]);
        this.shields.setColorAt(sh++, col.setRGB(0.2 * f, 0.6 * f, 1.2 * f));
      }
      if (e.tier[i] > 0 && !e.cloaked[i]) {
        s.setScalar(sc * 0.75);
        q.setFromUnitVectors(UP, d);
        m.compose(p, q, s);
        this.halos.setMatrixAt(ha, m);
        this.halos.setColorAt(ha++, col.setRGB(tier.color[0] * 0.5, tier.color[1] * 0.5, tier.color[2] * 0.5));
      }
      const k = e.city[i] * 3;
      if (e.role[i] === ROLE_ABDUCTOR && e.state[i] === ST_HOVER && bm < 64) {
        // Tractor beam: a cone from the saucer down to the city.
        const len = Math.hypot(e.x[i] - c.pos[k], e.y[i] - c.pos[k + 1], e.z[i] - c.pos[k + 2]);
        d.copy(p).normalize();
        q.setFromUnitVectors(UP, d);
        s.set(sc * 0.6, len, sc * 0.6);
        m.compose(p, q, s);
        this.beams.setMatrixAt(bm, m);
        const pulse = 0.7 + 0.3 * Math.sin(PS2.time.value * 9 + i);
        this.beams.setColorAt(bm++, col.setRGB(0.6 * pulse, 1.6 * pulse, 1.2 * pulse));
      }
      if (e.role[i] === ROLE_TENTACLE) {
        // Tentacle tips: a faint sickly glow; the limb itself is drawn by the hostile view.
        this.glows.push(e.x[i], e.y[i], e.z[i], 0.02, 0.5, 1.4, 0.9, SP_FLASH);
        continue;
      }
      if (!e.cloaked[i] && e.state[i] !== ST_SIEGE && !CREATURE[e.def[i]]) {
        // Engine glow behind the hull, in the species colour, flickering.
        const gc = SPECIES_GLOW[e.species[i]];
        const fl = 0.75 + 0.25 * Math.sin(PS2.time.value * 31 + i * 1.7);
        const off = sc * 0.55;
        // Fodder gets a pinprick; line ships and giants a proper exhaust.
        const gs = e.fodder[i] ? 0.35 : 0.7;
        const gi = e.fodder[i] ? 0.35 : 0.6;
        this.glows.push(e.x[i] - e.dx[i] * off, e.y[i] - e.dy[i] * off, e.z[i] - e.dz[i] * off, sc * gs * fl, gc[0] * fl * gi, gc[1] * fl * gi, gc[2] * fl * gi, SP_FLASH);
      }
      // Trajectories only for line ships: swarm fodder would bury the globe in lines.
      if (e.role[i] !== ROLE_INVADER && e.state[i] !== ST_SIEGE && e.state[i] !== ST_HOVER && e.state[i] !== ST_ATTACHED && !e.cloaked[i]) {
        // Trajectory: approaching ships show where they are headed; fleeing abductors show escape.
        const flee = e.state[i] === ST_FLEE;
        const sab = e.role[i] === ROLE_SABOTEUR;
        let tx = c.pos[k];
        let ty = c.pos[k + 1];
        let tz = c.pos[k + 2];
        if (flee) {
          tx = e.x[i] * 1.6;
          ty = e.y[i] * 1.6;
          tz = e.z[i] * 1.6;
        } else if (sab) {
          const w = g.arsenal.weapons[e.tgtW[i]];
          if (w && e.tgtE[i] >= 0) {
            tx = w.emitters[e.tgtE[i] * 3];
            ty = w.emitters[e.tgtE[i] * 3 + 1];
            tz = w.emitters[e.tgtE[i] * 3 + 2];
          }
        } else if (ALIENS[e.def[i]].roleParams.hoverAlt) {
          const a = ALIENS[e.def[i]].roleParams.hoverAlt;
          tx *= a;
          ty *= a;
          tz *= a;
        }
        const o = t * 6;
        this.trailPos[o] = e.x[i];
        this.trailPos[o + 1] = e.y[i];
        this.trailPos[o + 2] = e.z[i];
        this.trailPos[o + 3] = tx;
        this.trailPos[o + 4] = ty;
        this.trailPos[o + 5] = tz;
        const rr = flee ? 0.3 : sab ? 1.0 : 1.0;
        const gg = flee ? 1.0 : sab ? 0.8 : 0.2;
        const bb = flee ? 0.6 : sab ? 0.1 : 0.28;
        this.trailCol[o] = rr;
        this.trailCol[o + 1] = gg;
        this.trailCol[o + 2] = bb;
        this.trailCol[o + 3] = rr * 0.2;
        this.trailCol[o + 4] = gg * 0.2;
        this.trailCol[o + 5] = bb * 0.2;
        t++;
      }
    }
    for (let h = 0; h < HULLS.length; h++) {
      const v = this.hulls[h];
      if (!v) continue;
      v.mesh.count = this.hullCount[h];
      v.mesh.instanceMatrix.needsUpdate = true;
      v.mesh.instanceColor!.needsUpdate = true;
      v.data.needsUpdate = true;
    }
    this.fodderView.mesh.count = nf;
    this.fodderView.mesh.instanceMatrix.needsUpdate = true;
    this.fodderView.mesh.instanceColor!.needsUpdate = true;
    this.fodderView.data.needsUpdate = true;
    for (const [mesh, n] of [[this.shields, sh], [this.halos, ha], [this.beams, bm]] as const) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    }
    this.trails.geometry.setDrawRange(0, t * 2);
    this.trails.geometry.attributes.position.needsUpdate = true;
    this.trails.geometry.attributes.color.needsUpdate = true;
  }

  /** Allied fighters: friendly palette, cyan engines, banking with their velocity. */
  private updateAllies(): void {
    const a = this.game.allies;
    const counts = [0, 0, 0];
    for (let i = 0; i < MAX_ALLIES; i++) {
      if (!a.alive[i]) continue;
      const mi = a.model[i];
      let v = this.allyViews[mi];
      if (!v) {
        const geo = modelNow(`ally:${ALLIES.models[mi]}`);
        if (!geo) continue;
        v = this.allyViews[mi] = psInstanced(geo, MAX_ALLIES);
        this.parent.add(v.mesh);
      }
      p.set(a.x[i], a.y[i], a.z[i]);
      d.set(a.vx[i], a.vy[i], a.vz[i]).normalize();
      q.setFromUnitVectors(FWD, d);
      s.setScalar(0.045);
      m.compose(p, q, s);
      const n = counts[mi]++;
      v.mesh.setMatrixAt(n, m);
      v.mesh.setColorAt(n, col.setRGB(1, 1, 1));
      v.data.setXYZW(n, PAL_ALLY, 0, 0, 0.15);
      const fl = 0.8 + 0.2 * Math.sin(PS2.time.value * 40 + i);
      this.glows.push(p.x - d.x * 0.028, p.y - d.y * 0.028, p.z - d.z * 0.028, 0.035 * fl, 0.5 * fl, 1.6 * fl, 3 * fl, SP_FLASH);
    }
    this.allyViews.forEach((v, k) => {
      if (!v) return;
      v.mesh.count = counts[k];
      v.mesh.instanceMatrix.needsUpdate = true;
      v.mesh.instanceColor!.needsUpdate = true;
      v.data.needsUpdate = true;
    });
  }

  private updateProjectiles(): void {
    const g = this.game;
    const pr = g.projectiles;
    let nd = 0;
    this.tracers.begin();
    for (let i = 0; i < pr.high; i++) {
      if (!pr.alive[i]) continue;
      const w = g.arsenal.weapons[pr.weapon[i]];
      p.set(pr.x[i], pr.y[i], pr.z[i]);
      d.set(pr.dx[i], pr.dy[i], pr.dz[i]);
      q.setFromUnitVectors(FWD, d);
      const shot = w?.def.shot;
      const pw = this.slotPower[pr.weapon[i]] ?? 1;
      if (pr.kind[i] === PK_DRONE) {
        s.setScalar(0.018 * (shot?.width ?? 1) * (0.8 + pw * 0.3));
        m.compose(p, q, s);
        this.drones.mesh.setMatrixAt(nd, m);
        this.drones.mesh.setColorAt(nd, shot ? col.setRGB(shot.color[0] * 0.5, shot.color[1] * 0.5, shot.color[2] * 0.5) : col.set(1, 1, 1));
        this.drones.data.setXYZW(nd++, -1, 0, 0, 0.6);
        continue;
      }
      // Glowing tracer: a ribbon from the tail to the head, brighter and thicker with tier.
      const wd = (shot?.width ?? 1) * (pr.crit[i] ? 1.6 : 1) * (0.7 + pw * 0.35) * 0.006;
      const len = (shot?.length ?? 1) * (0.8 + pw * 0.25) * 0.07;
      const k = 0.75 + pw * 0.25;
      const cr = (shot?.color[0] ?? 2) * k;
      const cg = (shot?.color[1] ?? 2) * k;
      const cb = (shot?.color[2] ?? 2) * k;
      this.tracers.push(p.x - d.x * len, p.y - d.y * len, p.z - d.z * len, p.x, p.y, p.z, wd, cr, cg, cb);
      if (pw >= 1.6) this.glows.push(p.x, p.y, p.z, wd * 5, cr * 0.4, cg * 0.4, cb * 0.4, SP_FLASH);
    }
    this.drones.mesh.count = nd;
    this.drones.mesh.instanceMatrix.needsUpdate = true;
    this.drones.mesh.instanceColor!.needsUpdate = true;
    this.drones.data.needsUpdate = true;
  }

  private updateFields(_dt: number): void {
    const f = this.game.fields;
    let n = 0;
    for (let i = 0; i < MAX_FIELDS; i++) {
      if (!f.alive[i]) continue;
      p.set(f.x[i], f.y[i], f.z[i]);
      const life = f.ttl[i] / Math.max(0.01, f.maxTtl[i]);
      const grow = Math.min(1, (1 - life) * 8);
      const wob = 1 + 0.06 * Math.sin(PS2.time.value * 10 + i);
      s.setScalar(f.radius[i] * grow * wob);
      q.identity();
      m.compose(p, q, s);
      this.fields.setMatrixAt(n, m);
      const c = this.slotColor[f.weapon[i]] ?? col.set(1, 0.5, 2);
      const a = Math.min(1, life * 3);
      this.fields.setColorAt(n++, col.copy(c).multiplyScalar(0.6 * a));
    }
    this.fields.count = n;
    this.fields.instanceMatrix.needsUpdate = true;
    this.fields.instanceColor!.needsUpdate = true;
  }

  private updateWaves(dt: number): void {
    let n = 0;
    for (let i = 0; i < MAX_WAVES; i++) {
      const o = i * 8;
      if (this.waveData[o + 4] <= 0) continue;
      this.waveData[o + 4] -= dt;
      const t = 1 - Math.max(0, this.waveData[o + 4]) / this.waveData[o + 5];
      p.set(this.waveData[o], this.waveData[o + 1], this.waveData[o + 2]);
      const center = p.lengthSq() < 1e-6;
      // Planet-wide waves ring the globe facing the camera-ish (equatorial); local ones lie on the surface.
      if (center) q.setFromAxisAngle(X_AXIS, Math.PI / 2 + i * 0.7);
      else q.setFromUnitVectors(FWD, d.copy(p).normalize());
      s.setScalar(Math.max(0.01, this.waveData[o + 3] * (center ? 0.35 + t * 0.65 : t)));
      m.compose(center ? p : p.multiplyScalar(1.01), q, s);
      this.waves.setMatrixAt(n, m);
      this.waves.setColorAt(n++, col.copy(this.waveCol[i]).multiplyScalar(1 - t));
    }
    this.waves.count = n;
    this.waves.instanceMatrix.needsUpdate = true;
    this.waves.instanceColor!.needsUpdate = true;
  }

  private updateDomes(): void {
    const g = this.game;
    const c = g.cities;
    let n = 0;
    for (let i = 0; i < c.count; i++) {
      if (g.cityShield[i] <= 0 || c.health[i] <= 0) continue;
      p.set(c.pos[i * 3], c.pos[i * 3 + 1], c.pos[i * 3 + 2]);
      q.setFromUnitVectors(UP, d.copy(p).normalize());
      s.setScalar(0.07);
      m.compose(p, q, s);
      this.domes.setMatrixAt(n, m);
      const pulse = 0.8 + 0.2 * Math.sin(PS2.time.value * 6);
      this.domes.setColorAt(n++, col.setRGB(0.5 * pulse, 1.3 * pulse, 2.2 * pulse));
      if (n >= 32) break;
    }
    this.domes.count = n;
    this.domes.instanceMatrix.needsUpdate = true;
    this.domes.instanceColor!.needsUpdate = true;
  }

  /** Species palettes into the shared PS2 uniforms. */
  static initPalettes(): void {
    SPECIES.forEach((sp, i) => {
      PS2.palDark.value[i].set(...sp.palette[0]);
      PS2.palLight.value[i].set(...sp.palette[1]);
    });
    PS2.palDark.value[PAL_ALLY].set(0.06, 0.1, 0.24);
    PS2.palLight.value[PAL_ALLY].set(0.5, 0.62, 0.85);
  }
}
