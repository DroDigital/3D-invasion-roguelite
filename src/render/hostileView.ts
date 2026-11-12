import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DynamicDrawUsage,
  IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, Quaternion, ShaderMaterial,
  SphereGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ALIENS, SPECIES } from '../data/aliens';
import { AEGIS_R, MAX_MINES } from '../sim/defense';
import { MAX_ENEMIES, ROLE_TENTACLE, ST_ATTACHED } from '../sim/enemies';
import type { Game } from '../sim/game';
import {
  FX_AEGIS, FX_AEGIS_DOWN, FX_BOSS_PHASE, FX_CRYO, FX_ELASER, FX_EMITTER_DOWN, FX_ESHOT, FX_FLAK, FX_IMPACT, FX_INTERCEPT,
  FX_MINE, FX_NUKE, FX_PLACE, FX_SLAM, FX_STRIDE, FX_TENTACLE, FX_TESLA, FX_TURRET, FX_CITY_FALL, FX_CITY_HIT, FX_SCORCH, FX_STRIKE,
} from '../sim/game';
import { MAX_SHOTS, SHOT_MISSILE, SHOT_SIZE, SHOT_VOID } from '../sim/hostile';
import { MAX_WRECKS } from '../sim/wrecks';
import { MAX_EMITTERS, tierOf } from '../sim/weapons';
import { RibbonLayer, SP_EMBER, SP_FLASH, SP_PORTAL, SP_RING, SP_SMOKE, SP_SPARK, SP_STAR, SpriteFx, SpriteLayer } from './billboards';
import { CREATURE_TENTACLES, isCreature } from './creatures';
import { psInstanced } from './instanced';
import { PS2 } from './ps2Material';
import type { ScorchMap } from './earth';

/** Camera shake / flash / hit-stop requests, shared with the combat view. */
export interface Juice {
  shake: number;
  flash: number;
  hitStop: number;
}

const UP = new Vector3(0, 1, 0);
const m = new Matrix4();
const q = new Quaternion();
const p = new Vector3();
const a = new Vector3();
const b = new Vector3();
const d = new Vector3();
const s = new Vector3();
const side = new Vector3();
const col = new Color();

/** Shot colours by kind: plasma, missile, acid, laser, void. */
const SHOT_COLOR: [number, number, number][] = [
  [2.6, 0.7, 2.4],
  [3.0, 1.7, 0.7],
  [1.3, 3.0, 0.4],
  [0.7, 2.6, 3.2],
  [1.5, 0.4, 3.2],
];
const SPECIES_SHOT = SPECIES.map((sp) => SHOT_COLOR[['plasma', 'missile', 'acid', 'laser', 'void'].indexOf(sp.shot)]);
const MAX_SEG = 9000;
const TENT_SEGS = 14;
const DECO_SEGS = 7;
const CREATURE_KIND = ALIENS.map((al) => (isCreature(al.model) ? CREATURE_TENTACLES[al.model.slice(9)] ?? 0 : 0));
/** Flesh tones for tentacles (base) and their glowing suckers. */
const FLESH = [0.2, 0.07, 0.22];
/** Sucker-band segments carry this marker in green (> 1.2): the shader draws a thin glowing ring. */
const SUCKER = [0.2, 1.5, 0.22];

function turretGeometry(): BufferGeometry {
  const base = new CylinderGeometry(0.5, 0.7, 0.4, 6).translate(0, 0.2, 0).toNonIndexed();
  const gun = new ConeGeometry(0.22, 1.2, 4).translate(0, 0.9, 0).toNonIndexed();
  const g = mergeGeometries([base, gun])!;
  g.deleteAttribute('uv');
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3).fill(0.7);
  for (let i = base.getAttribute('position').count; i < n; i++) c.set([0.9, 0.9, 0.9], i * 3);
  g.setAttribute('color', new BufferAttribute(c, 3));
  g.computeVertexNormals();
  return g;
}

function shardGeometry(): BufferGeometry {
  const g = new IcosahedronGeometry(1, 0).toNonIndexed();
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * 0.6, pos.getY(i) * 0.35, pos.getZ(i));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const c = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) c.set(i % 9 < 3 ? [0.55, 0.5, 0.45] : [0.3, 0.28, 0.26], i * 3);
  g.setAttribute('color', new BufferAttribute(c, 3));
  return g;
}

function tentacleMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { sunView: PS2.sunView, sunColor: PS2.sunColor, ambient: PS2.ambient, time: PS2.time },
    vertexShader: /* glsl */ `
      uniform vec3 sunView; uniform vec3 sunColor; uniform vec3 ambient;
      varying vec3 vC; varying vec3 vL; varying float vRim; varying float vY; varying float vGlow;
      void main() {
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        float ndl = max(dot(n, sunView), 0.0);
        vL = ambient * 0.8 + sunColor * ndl;
        vRim = pow(1.0 - max(dot(n, normalize(-mv.xyz)), 0.0), 2.2);
        vC = instanceColor;
        vGlow = step(1.2, instanceColor.g);
        vY = position.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      varying vec3 vC; varying vec3 vL; varying float vRim; varying float vY; varying float vGlow;
      void main() {
        // Wet flesh: lit body, sickly green sheen at the rim, glowing sucker bands.
        vec3 flesh = vGlow > 0.5 ? vec3(vC.r, 0.07, vC.b) : vC;
        vec3 c = flesh * vL;
        // Thin glowing sucker rings on marked segments, pulsing slowly.
        float ring = vGlow * smoothstep(0.12, 0.0, abs(vY)) * (0.6 + 0.4 * sin(time * 4.0));
        c += vec3(0.5, 1.6, 0.9) * ring;
        c += vec3(0.25, 0.75, 0.55) * vRim * 0.12;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

/** Aegis Shell: a faint hex lattice that only really shows where it is struck. */
function aegisMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { hits: { value: Array.from({ length: 8 }, () => new Vector3()) }, ages: { value: new Float32Array(8).fill(99) }, strength: { value: 0 }, time: PS2.time },
    vertexShader: /* glsl */ `
      varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main() {
        vP = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 hits[8]; uniform float ages[8]; uniform float strength; uniform float time;
      varying vec3 vP; varying vec3 vN; varying vec3 vV;
      float hexEdge(vec2 uv) {
        vec2 r = vec2(1.0, 1.7320508);
        vec2 h = r * 0.5;
        vec2 a = mod(uv, r) - h;
        vec2 b = mod(uv - h, r) - h;
        vec2 g = dot(a, a) < dot(b, b) ? a : b;
        float dist = max(abs(g.x) * 0.866 + abs(g.y) * 0.5, abs(g.y));
        return smoothstep(0.42, 0.5, dist);
      }
      void main() {
        vec3 n = normalize(vP);
        float lat = asin(clamp(n.y, -1.0, 1.0));
        vec2 uv = vec2(atan(n.z, n.x) * cos(lat), lat) * 9.0;
        float lattice = hexEdge(uv);
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
        float hit = 0.0;
        for (int k = 0; k < 8; k++) {
          float age = ages[k];
          if (age > 1.4) continue;
          float dd = distance(n * ${AEGIS_R.toFixed(3)}, hits[k]);
          // A small ripple and a hot spot, both local to the impact.
          float ring = smoothstep(0.03, 0.0, abs(dd - age * 0.22)) * (1.0 - age / 1.4) * smoothstep(0.3, 0.1, dd);
          hit += ring * 0.9 + exp(-dd * dd * 300.0) * exp(-age * 7.0) * 1.6;
        }
        float shimmer = 0.75 + 0.25 * sin(time * 1.5 + n.y * 6.0);
        // Barely there at rest (a thin rim and a ghost of the lattice); it lights up where struck.
        float a = (rim * 0.12 + lattice * rim * rim * 0.1 * shimmer) * strength + hit * (0.3 + lattice * 0.45);
        gl_FragColor = vec4(vec3(0.35, 1.0, 2.2) * a, 1.0);
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

/**
 * Everything Earth fights against and with, beyond the weapons themselves: tentacles, alien
 * fire, burning wreckage, smoke, the Aegis Shell, flak batteries, mines, pylons and placed items.
 */
export class HostileView {
  private smoke: SpriteFx;
  private fx: SpriteFx;
  private lines: RibbonLayer;
  private trails: RibbonLayer;
  private glow: SpriteLayer;
  private tentacles: InstancedMesh;
  private wrecks = psInstanced(shardGeometry(), MAX_WRECKS);
  private turrets = psInstanced(turretGeometry(), 64 + 24);
  private aegis: Mesh;
  private aegisMat = aegisMaterial();
  private hole: InstancedMesh;
  private rnd = 0;
  /** Earth's burn map; impacts char the ground and set fires. */
  scorch: ScorchMap | null = null;
  private burnT = 0;

  constructor(private game: Game, parent: Object3D, private juice: Juice) {
    this.smoke = new SpriteFx(parent, 3000, true);
    this.fx = new SpriteFx(parent, 3000);
    this.lines = new RibbonLayer(parent, 2500, false);
    this.trails = new RibbonLayer(parent, MAX_SHOTS + MAX_WRECKS, true);
    this.glow = new SpriteLayer(parent, MAX_SHOTS + MAX_WRECKS + MAX_MINES + 400);
    const seg = new CylinderGeometry(0.85, 1, 1, 8, 1, false);
    this.tentacles = new InstancedMesh(seg, tentacleMaterial(), MAX_SEG);
    this.tentacles.instanceMatrix.setUsage(DynamicDrawUsage);
    this.tentacles.setColorAt(0, col.set(1, 1, 1));
    this.tentacles.instanceColor!.setUsage(DynamicDrawUsage);
    this.tentacles.frustumCulled = false;
    this.tentacles.count = 0;
    this.aegis = new Mesh(new SphereGeometry(AEGIS_R, 72, 40), this.aegisMat);
    this.aegis.renderOrder = 7;
    this.aegis.visible = false;
    this.hole = new InstancedMesh(new SphereGeometry(1, 16, 10), new MeshBasicMaterial({ color: 0x000000 }), 24);
    this.hole.frustumCulled = false;
    this.hole.count = 0;
    for (const o of [this.tentacles, this.wrecks.mesh, this.turrets.mesh, this.aegis, this.hole]) parent.add(o);
  }

  dispose(): void {
    for (const l of [this.smoke, this.fx, this.lines, this.trails, this.glow]) l.dispose();
    for (const o of [this.tentacles, this.wrecks.mesh, this.turrets.mesh, this.aegis, this.hole]) {
      o.removeFromParent();
      o.geometry.dispose();
    }
  }

  private rand(): number {
    // Cheap render-only noise (never touches the sim's RNG).
    this.rnd = (this.rnd * 1664525 + 1013904223) >>> 0;
    return this.rnd / 4294967296;
  }

  private puff(x: number, y: number, z: number, s0: number, s1: number, life: number, shade = 0.1, delay = 0): void {
    this.smoke.spawn(SP_SMOKE, x, y, z, s0, s1, life, shade * 1.1, shade, shade * 0.95, delay);
  }

  private bolt(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, r: number, g: number, bl: number, life: number, w: number): void {
    let px = x1;
    let py = y1;
    let pz = z1;
    const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
    for (let k = 1; k <= 4; k++) {
      const t = k / 4;
      const j = k === 4 ? 0 : len * 0.14;
      const nx = x1 + (x2 - x1) * t + (this.rand() - 0.5) * j;
      const ny = y1 + (y2 - y1) * t + (this.rand() - 0.5) * j;
      const nz = z1 + (z2 - z1) * t + (this.rand() - 0.5) * j;
      this.lines.add(px, py, pz, nx, ny, nz, w, life, r, g, bl);
      px = nx;
      py = ny;
      pz = nz;
    }
  }

  /** The frame's new fx events. Called before the sim fx buffer is cleared. */
  consumeFx(): void {
    const g = this.game;
    const f = g.fx;
    const sp = this.fx;
    const j = this.juice;
    // When the sky is full, secondary dressing thins out so the picture stays readable.
    const busy = Math.min(1, g.fxCount / 2500);
    for (let k = 0; k < g.fxCount; k++) {
      const o = k * FX_STRIDE;
      const kind = f[o];
      const x = f[o + 1];
      const y = f[o + 2];
      const z = f[o + 3];
      const pr = f[o + 7];
      const sc = this.scorch;
      if (sc) {
        if (kind === FX_IMPACT) sc.stamp(x, y, z, Math.max(0.012, pr * 1.3), 0.5 + pr * 4, 0.9);
        else if (kind === FX_SCORCH) sc.stamp(x, y, z, Math.max(0.01, pr), 0.35, 0.7);
        else if (kind === FX_SLAM) sc.stamp(x, y, z, 0.05, 0.4, 0.6);
        else if (kind === FX_CITY_HIT) sc.stamp(x, y, z, 0.025, 0.08, 0.5);
        else if (kind === FX_CITY_FALL) sc.stamp(x, y, z, 0.16, 1, 1);
        else if (kind === FX_STRIKE) sc.stamp(x, y, z, 0.2, 0.7, 1);
        else if (kind === FX_NUKE) sc.stamp(x, y, z, pr * 1.1, 1, 1);
      }
      if (kind < 24) continue;
      switch (kind) {
        case FX_IMPACT: {
          // Ground strike: hot flash, a ring across the surface, a rising column of smoke.
          const r = Math.max(0.015, pr);
          const lx = x * 1.006;
          const ly = y * 1.006;
          const lz = z * 1.006;
          sp.spawn(SP_FLASH, lx, ly, lz, r * 0.8, r * 2.4, 0.35, 3.2, 1.5, 0.5);
          if (r > 0.03 || this.rand() > busy) sp.spawn(SP_RING, lx, ly, lz, r * 0.5, r * 3.2, 0.5, 2.0, 1.0, 0.4);
          if (this.rand() > busy * 0.7) {
            const n = r > 0.06 ? 4 : 1;
            for (let i = 0; i < n; i++) this.puff(x * (1.01 + i * r * 0.5), y * (1.01 + i * r * 0.5), z * (1.01 + i * r * 0.5), r * 1.2, r * (4 + i), 2.2 + i * 0.5, 0.09, i * 0.08);
          }
          if (r > 0.08) {
            for (let i = 0; i < 6; i++) sp.spawn(SP_EMBER, x * (1.02 + this.rand() * r), y * (1.02 + this.rand() * r), z * (1.02 + this.rand() * r), 0.01, 0.02, 0.8 + this.rand() * 0.6, 3, 1.4, 0.4, this.rand() * 0.2);
            j.shake = Math.max(j.shake, Math.min(1.2, r * 4));
          }
          break;
        }
        case FX_ESHOT: {
          if (this.rand() < busy * 0.8) break;
          const c = SHOT_COLOR[pr | 0];
          sp.spawn(SP_FLASH, x, y, z, 0.012, 0.035, 0.12, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7);
          break;
        }
        case FX_ELASER: {
          const c = SPECIES_SHOT[pr | 0] ?? SHOT_COLOR[3];
          this.lines.add(x, y, z, f[o + 4], f[o + 5], f[o + 6], 0.007, 0.28, c[0], c[1], c[2]);
          this.lines.add(x, y, z, f[o + 4], f[o + 5], f[o + 6], 0.0025, 0.16, 3, 3, 3);
          sp.spawn(SP_FLASH, f[o + 4], f[o + 5], f[o + 6], 0.02, 0.06, 0.25, c[0], c[1], c[2]);
          break;
        }
        case FX_AEGIS:
          sp.spawn(SP_RING, x, y, z, 0.02, 0.09 + pr * 0.1, 0.4, 0.5, 1.4, 2.8);
          sp.spawn(SP_FLASH, x, y, z, 0.02, 0.05, 0.18, 0.8, 1.8, 3);
          break;
        case FX_AEGIS_DOWN:
          sp.spawn(SP_RING, 0, 0, 0, 1, AEGIS_R * 2.6, 0.9, 0.5, 1.5, 3);
          j.flash = Math.max(j.flash, 0.35);
          j.shake = Math.max(j.shake, 0.6);
          break;
        case FX_FLAK: {
          sp.spawn(SP_STAR, x, y, z, 0.012, 0.04, 0.16, 3, 2.2, 1.2);
          if (this.rand() > busy) this.puff(x, y, z, 0.01, 0.035, 0.9, 0.16);
          if (this.rand() > busy * 0.5) this.lines.add(f[o + 4], f[o + 5], f[o + 6], x, y, z, 0.0015, 0.08, 2.2, 1.8, 1.0);
          break;
        }
        case FX_EMITTER_DOWN:
          sp.spawn(SP_FLASH, x, y, z, 0.04, 0.12, 0.4, 3.2, 1.4, 0.4);
          sp.spawn(SP_RING, x, y, z, 0.02, 0.15, 0.5, 2.6, 1.0, 0.3);
          for (let i = 0; i < 8; i++) sp.spawn(SP_SPARK, x + (this.rand() - 0.5) * 0.06, y + (this.rand() - 0.5) * 0.06, z + (this.rand() - 0.5) * 0.06, 0.03, 0.05, 0.4, 3, 2, 0.8);
          this.puff(x, y, z, 0.03, 0.1, 1.6, 0.12);
          j.shake = Math.max(j.shake, 0.35);
          break;
        case FX_SLAM:
          sp.spawn(SP_RING, x * 1.004, y * 1.004, z * 1.004, 0.02, pr * 2.5, 0.6, 1.8, 0.7, 2.2);
          sp.spawn(SP_FLASH, x, y, z, 0.03, pr * 1.2, 0.3, 1.6, 0.6, 2.4);
          this.puff(x * 1.01, y * 1.01, z * 1.01, pr * 0.5, pr * 2, 1.8, 0.11);
          j.shake = Math.max(j.shake, 0.45);
          break;
        case FX_TENTACLE:
          sp.spawn(SP_PORTAL, x, y, z, 0.05, 0.2, 0.6, 1.2, 0.4, 2.4);
          sp.spawn(SP_RING, f[o + 4] * 1.01, f[o + 5] * 1.01, f[o + 6] * 1.01, 0.02, 0.12, 0.6, 1.4, 0.5, 2.4);
          break;
        case FX_TESLA:
          this.bolt(x, y, z, f[o + 4], f[o + 5], f[o + 6], 1.2, 2.0, 3.4, 0.12, 0.0035);
          sp.spawn(SP_FLASH, f[o + 4], f[o + 5], f[o + 6], 0.015, 0.04, 0.12, 1.2, 2, 3.2);
          break;
        case FX_INTERCEPT: {
          // A climbing arc from the silo, bright head, white-hot burst at the target.
          const tx = f[o + 4];
          const ty = f[o + 5];
          const tz = f[o + 6];
          const mx = (x + tx) * 0.5;
          const my = (y + ty) * 0.5;
          const mz = (z + tz) * 0.5;
          const ml = Math.hypot(mx, my, mz) || 1;
          const lift = 1 + Math.hypot(tx - x, ty - y, tz - z) * 0.35;
          const cx = (mx / ml) * ml * lift;
          const cy = (my / ml) * ml * lift;
          const cz = (mz / ml) * ml * lift;
          let px0 = x;
          let py0 = y;
          let pz0 = z;
          for (let i = 1; i <= 6; i++) {
            const t = i / 6;
            const u = 1 - t;
            const nx = u * u * x + 2 * u * t * cx + t * t * tx;
            const ny = u * u * y + 2 * u * t * cy + t * t * ty;
            const nz = u * u * z + 2 * u * t * cz + t * t * tz;
            this.lines.add(px0, py0, pz0, nx, ny, nz, 0.002, 0.35, 2.2, 2.2, 2.4);
            px0 = nx;
            py0 = ny;
            pz0 = nz;
          }
          sp.spawn(SP_FLASH, tx, ty, tz, 0.03, 0.08, 0.25, 3, 2.6, 2.2);
          break;
        }
        case FX_MINE:
          sp.spawn(SP_FLASH, x, y, z, pr * 0.4, pr * 1.6, 0.3, 3.2, 0.9, 0.5);
          sp.spawn(SP_RING, x, y, z, pr * 0.2, pr * 1.8, 0.4, 2.8, 0.7, 0.4);
          break;
        case FX_BOSS_PHASE:
          sp.spawn(SP_RING, x, y, z, pr, pr * 7, 1.0, 2.6, 0.8, 2.4);
          sp.spawn(SP_STAR, x, y, z, pr * 2, pr * 5, 0.5, 3, 1.5, 3);
          j.shake = Math.max(j.shake, 1.0);
          j.flash = Math.max(j.flash, 0.3);
          j.hitStop = Math.max(j.hitStop, 0.3);
          break;
        case FX_NUKE: {
          const r = pr;
          sp.spawn(SP_FLASH, x, y, z, r * 0.5, r * 3.5, 0.9, 5, 4, 3);
          sp.spawn(SP_STAR, x, y, z, r * 2, r * 5, 0.6, 4, 3.6, 3);
          sp.spawn(SP_RING, x, y, z, r * 0.3, r * 3, 1.1, 3.4, 2.0, 1.0);
          sp.spawn(SP_RING, x, y, z, r * 0.2, r * 5, 1.8, 2, 1.0, 0.5, 0.15);
          const l = Math.hypot(x, y, z) || 1;
          for (let i = 0; i < 9; i++) {
            const h = 1.0 + i * r * 0.18;
            this.puff((x / l) * h, (y / l) * h, (z / l) * h, r * 0.4, r * (1.4 + i * 0.12), 4 + i * 0.3, 0.13 + i * 0.01, 0.2 + i * 0.12);
          }
          j.shake = Math.max(j.shake, 1.5);
          j.flash = Math.max(j.flash, 0.8);
          j.hitStop = Math.max(j.hitStop, 0.4);
          break;
        }
        case FX_CRYO:
          sp.spawn(SP_RING, x, y, z, pr * 0.3, pr * 2.2, 0.8, 1.2, 2.4, 3.4);
          sp.spawn(SP_FLASH, x, y, z, pr * 0.4, pr * 1.6, 0.5, 1.4, 2.4, 3.4);
          for (let i = 0; i < 12; i++) sp.spawn(SP_STAR, x + (this.rand() - 0.5) * pr, y + (this.rand() - 0.5) * pr, z + (this.rand() - 0.5) * pr, 0.01, 0.04, 0.9, 1.6, 2.6, 3.4, this.rand() * 0.3);
          break;
        case FX_PLACE:
          sp.spawn(SP_RING, x * 1.005, y * 1.005, z * 1.005, 0.01, Math.max(0.12, pr), 0.6, 0.8, 2.2, 2.6);
          break;
        case FX_TURRET:
          this.lines.add(x, y, z, f[o + 4], f[o + 5], f[o + 6], 0.0018, 0.07, 3, 2.4, 1.0);
          if (this.rand() > busy) sp.spawn(SP_FLASH, f[o + 4], f[o + 5], f[o + 6], 0.01, 0.025, 0.08, 3, 2.2, 1);
          break;
      }
    }
  }

  update(dt: number): void {
    // Damaged cities keep burning.
    this.burnT -= dt;
    if (this.burnT <= 0 && this.scorch) {
      this.burnT = 0.5;
      const c = this.game.cities;
      for (let k = 0; k < c.count; k++) {
        const h = c.health[k];
        if (h > 0 && h < 70) this.scorch.stamp(c.pos[k * 3], c.pos[k * 3 + 1], c.pos[k * 3 + 2], 0.018 + (70 - h) * 0.0006, 0.02, 0.35 + (70 - h) / 140);
      }
    }
    this.glow.begin();
    this.trails.begin();
    this.updateTentacles();
    this.updateShots();
    this.updateWrecks();
    this.updateDefense();
    this.glow.end();
    this.smoke.update(dt);
    this.fx.update(dt);
    this.lines.update(dt);
    this.trails.update(dt);
  }

  private segCount = 0;

  /** One tapered segment between a and b. */
  private seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, cr: number, cg: number, cb: number): void {
    if (this.segCount >= MAX_SEG) return;
    a.set(ax, ay, az);
    b.set(bx, by, bz);
    d.subVectors(b, a);
    const len = d.length();
    if (len < 1e-5) return;
    d.multiplyScalar(1 / len);
    q.setFromUnitVectors(UP, d);
    p.addVectors(a, b).multiplyScalar(0.5);
    s.set(r, len * 1.22, r);
    m.compose(p, q, s);
    const n = this.segCount++;
    this.tentacles.setMatrixAt(n, m);
    this.tentacles.setColorAt(n, col.setRGB(cr, cg, cb));
  }

  /** A quadratic curve of segments with a travelling wiggle, thick at the root. */
  private limb(bx: number, by: number, bz: number, cx: number, cy: number, cz: number, tx: number, ty: number, tz: number, r0: number, segs: number, phase: number, wig: number): void {
    side.set(tx - bx, ty - by, tz - bz).cross(p.set(cx, cy, cz)).normalize();
    const time = PS2.time.value;
    let px0 = bx;
    let py0 = by;
    let pz0 = bz;
    for (let k = 1; k <= segs; k++) {
      const t = k / segs;
      const u = 1 - t;
      const w = Math.sin(time * 2.4 - t * 7 + phase) * wig * Math.sin(Math.PI * t);
      const nx = u * u * bx + 2 * u * t * cx + t * t * tx + side.x * w;
      const ny = u * u * by + 2 * u * t * cy + t * t * ty + side.y * w;
      const nz = u * u * bz + 2 * u * t * cz + t * t * tz + side.z * w;
      const r = r0 * (1 - Math.pow(t, 0.8) * 0.85);
      const glow = k % 3 === 0 && k < segs;
      if (glow) this.seg(px0, py0, pz0, nx, ny, nz, r * 1.08, SUCKER[0], SUCKER[1], SUCKER[2]);
      else this.seg(px0, py0, pz0, nx, ny, nz, r, FLESH[0] + t * 0.1, FLESH[1] + t * 0.06, FLESH[2] + t * 0.05);
      px0 = nx;
      py0 = ny;
      pz0 = nz;
    }
  }

  private updateTentacles(): void {
    const g = this.game;
    const e = g.enemies;
    this.segCount = 0;
    for (let i = 0; i < e.high && this.segCount < MAX_SEG; i++) {
      if (!e.alive[i]) continue;
      if (e.role[i] === ROLE_TENTACLE) {
        const pa = e.parent[i];
        if (pa < 0 || !e.alive[pa]) continue;
        const bx = e.x[pa];
        const by = e.y[pa];
        const bz = e.z[pa];
        let tx = e.x[i];
        let ty = e.y[i];
        let tz = e.z[i];
        if (e.state[i] === ST_ATTACHED) {
          // Rear up, then slam.
          const ph = e.timer[i] / (ALIENS[e.def[i]].roleParams.slamPeriod || 3);
          const lift = (smooth(0.55, 0.9, ph) * (1 - smooth(0.93, 1, ph))) * 0.14;
          tx *= 1 + lift;
          ty *= 1 + lift;
          tz *= 1 + lift;
        }
        const mx = (bx + tx) * 0.5;
        const my = (by + ty) * 0.5;
        const mz = (bz + tz) * 0.5;
        const ml = Math.hypot(mx, my, mz) || 1;
        const len = Math.hypot(tx - bx, ty - by, tz - bz);
        const k = (ml + len * 0.3) / ml;
        const r0 = 0.008 + e.scale[pa] * 0.035;
        this.limb(bx, by, bz, mx * k, my * k, mz * k, tx, ty, tz, r0, TENT_SEGS, e.seed[i], len * 0.06);
        continue;
      }
      const deco = CREATURE_KIND[e.def[i]];
      if (deco === 0 || e.fodder[i] || e.cloaked[i]) continue;
      // Dangling tentacles trail behind creature bodies and sway toward the planet.
      const sc = e.scale[i] * (e.scale[i] < 0.14 ? 1.6 : 0.8);
      const fx = e.dx[i];
      const fy = e.dy[i];
      const fz = e.dz[i];
      const r = Math.hypot(e.x[i], e.y[i], e.z[i]) || 1;
      const dnx = -e.x[i] / r;
      const dny = -e.y[i] / r;
      const dnz = -e.z[i] / r;
      a.set(fx, fy, fz);
      b.set(dnx, dny, dnz).cross(a).normalize();
      d.copy(a).cross(b).normalize();
      const n = Math.min(deco, 14);
      for (let t = 0; t < n; t++) {
        const ang = (t / n) * Math.PI * 2 + e.seed[i];
        const ox = (b.x * Math.cos(ang) + d.x * Math.sin(ang)) * sc * 0.28;
        const oy = (b.y * Math.cos(ang) + d.y * Math.sin(ang)) * sc * 0.28;
        const oz = (b.z * Math.cos(ang) + d.z * Math.sin(ang)) * sc * 0.28;
        const bx = e.x[i] + ox - fx * sc * 0.15;
        const by = e.y[i] + oy - fy * sc * 0.15;
        const bz = e.z[i] + oz - fz * sc * 0.15;
        const sway = Math.sin(PS2.time.value * 1.7 + t * 1.3 + e.seed[i]) * sc * 0.35;
        const L = sc * (1.1 + (t % 3) * 0.25);
        const tx = bx - fx * L + dnx * L * 0.45 + ox * 1.2 + b.x * sway;
        const ty = by - fy * L + dny * L * 0.45 + oy * 1.2 + b.y * sway;
        const tz = bz - fz * L + dnz * L * 0.45 + oz * 1.2 + b.z * sway;
        this.limb(bx, by, bz, bx - fx * L * 0.5 + ox, by - fy * L * 0.5 + oy, bz - fz * L * 0.5 + oz, tx, ty, tz, sc * 0.035, DECO_SEGS, t + e.seed[i], L * 0.15);
      }
    }
    this.tentacles.count = this.segCount;
    this.tentacles.instanceMatrix.needsUpdate = true;
    this.tentacles.instanceColor!.needsUpdate = true;
  }

  private updateShots(): void {
    const sh = this.game.hostile;
    const gl = this.glow;
    for (let i = 0; i < sh.high; i++) {
      if (!sh.alive[i]) continue;
      const k = sh.kind[i];
      const c = SHOT_COLOR[k];
      const sz = SHOT_SIZE[k];
      const x = sh.x[i];
      const y = sh.y[i];
      const z = sh.z[i];
      const len = k === SHOT_MISSILE ? 0.09 : k === SHOT_VOID ? 0.05 : 0.06;
      this.trails.push(x - sh.dx[i] * len, y - sh.dy[i] * len, z - sh.dz[i] * len, x, y, z, sz * 0.3, c[0] * 0.6, c[1] * 0.6, c[2] * 0.6);
      const fl = 0.8 + 0.2 * Math.sin(PS2.time.value * 30 + i);
      gl.push(x, y, z, sz * (k === SHOT_VOID ? 1.8 : 1.2) * fl, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, SP_FLASH);
      if (k === SHOT_MISSILE && this.rand() < 0.3) this.puff(x - sh.dx[i] * 0.03, y - sh.dy[i] * 0.03, z - sh.dz[i] * 0.03, 0.006, 0.025, 0.8, 0.2);
    }
  }

  private updateWrecks(): void {
    const w = this.game.wrecks;
    const v = this.wrecks;
    const time = PS2.time.value;
    let n = 0;
    for (let i = 0; i < MAX_WRECKS; i++) {
      if (!w.alive[i]) continue;
      const x = w.x[i];
      const y = w.y[i];
      const z = w.z[i];
      const sz = Math.max(0.006, w.size[i]);
      p.set(x, y, z);
      q.setFromAxisAngle(a.set(Math.sin(w.seed[i]), Math.cos(w.seed[i] * 1.3), Math.sin(w.seed[i] * 0.7)).normalize(), time * (2 + (w.seed[i] % 3)));
      s.setScalar(sz);
      m.compose(p, q, s);
      v.mesh.setMatrixAt(n, m);
      v.mesh.setColorAt(n, col.setRGB(0.55, 0.45, 0.4));
      v.data.setXYZW(n++, w.species[i] === 255 ? -1 : w.species[i], 0, 0, 0.05);
      // Burning: a flickering fire, a short fiery tail, and smoke left behind.
      const sp = Math.hypot(w.vx[i], w.vy[i], w.vz[i]) || 1;
      const tail = Math.min(0.2, 0.05 + sp * 0.12);
      const fl = 0.7 + 0.3 * Math.sin(time * 37 + i * 1.7);
      this.trails.push(x - (w.vx[i] / sp) * tail, y - (w.vy[i] / sp) * tail, z - (w.vz[i] / sp) * tail, x, y, z, sz * 0.4, 2.2 * fl, 0.9 * fl, 0.3 * fl);
      this.glow.push(x, y, z, sz * 2.4 * fl, 2.6 * fl, 1.1 * fl, 0.35 * fl, SP_FLASH);
      if (this.rand() < 0.18) this.puff(x, y, z, sz * 0.8, sz * 3.5, 1.4, 0.08);
    }
    v.mesh.count = n;
    v.mesh.instanceMatrix.needsUpdate = true;
    v.mesh.instanceColor!.needsUpdate = true;
    v.data.needsUpdate = true;
  }

  private updateDefense(): void {
    const g = this.game;
    const dg = g.defense;
    const t = PS2.time.value;
    // Aegis Shell.
    this.aegis.visible = dg.aegisMax > 0;
    if (this.aegis.visible) {
      const u = this.aegisMat.uniforms;
      u.strength.value = 0.25 + 0.75 * (dg.aegis / dg.aegisMax);
      const hits = u.hits.value as Vector3[];
      const ages = u.ages.value as Float32Array;
      for (let k = 0; k < 8; k++) {
        hits[k].set(dg.aegisHits[k * 4], dg.aegisHits[k * 4 + 1], dg.aegisHits[k * 4 + 2]);
        ages[k] = dg.aegisHits[k * 4 + 3];
      }
    }
    const tv = this.turrets;
    let nt = 0;
    const place = (x: number, y: number, z: number, size: number, cr: number, cg: number, cb: number): void => {
      if (nt >= 88) return;
      p.set(x, y, z);
      q.setFromUnitVectors(UP, d.copy(p).normalize());
      s.setScalar(size);
      m.compose(p, q, s);
      tv.mesh.setMatrixAt(nt, m);
      tv.mesh.setColorAt(nt, col.setRGB(cr, cg, cb));
      tv.data.setXYZW(nt++, -1, 0, 0, 0.1);
    };
    // Flak batteries on the ground.
    for (let k = 0; k < dg.siteCount; k++) place(dg.sites[k * 3], dg.sites[k * 3 + 1], dg.sites[k * 3 + 2], 0.022, 1.1, 0.9, 0.6);
    // Tesla pylons at every living city: a crackling coil glow.
    if (dg.owns('tesla')) {
      const c = g.cities;
      for (let k = 0; k < c.count; k++) {
        if (c.health[k] <= 0) continue;
        const fl = 0.6 + 0.4 * Math.sin(t * 13 + k * 2.1);
        this.glow.push(c.pos[k * 3] * 1.035, c.pos[k * 3 + 1] * 1.035, c.pos[k * 3 + 2] * 1.035, 0.02 * fl, 0.8 * fl, 1.4 * fl, 2.6 * fl, SP_FLASH);
      }
    }
    // Mines: blinking red when armed, dim while re-arming.
    for (let k = 0; k < dg.mineCount; k++) {
      const o = k * 6;
      const armed = dg.mines[o + 3] <= 0;
      const bl = armed ? 0.5 + 0.5 * Math.max(0, Math.sin(t * 4 + k)) : 0.15;
      this.glow.push(dg.mines[o], dg.mines[o + 1], dg.mines[o + 2], armed ? 0.012 : 0.007, 2.6 * bl, 0.5 * bl, 0.3 * bl, SP_EMBER);
    }
    // Placed consumables.
    let nh = 0;
    for (const pl of g.placed) {
      const life = Math.min(1, pl.ttl / 1.5);
      if (pl.kind === 'turret') {
        place(pl.x, pl.y, pl.z, 0.03, 1.4, 1.3, 0.7);
        this.glow.push(pl.x * 1.02, pl.y * 1.02, pl.z * 1.02, 0.02, 2.2 * life, 1.8 * life, 0.6 * life, SP_FLASH);
      } else if (pl.kind === 'decoy') {
        const pulse = 0.6 + 0.4 * Math.sin(t * 5);
        this.glow.push(pl.x * 1.01, pl.y * 1.01, pl.z * 1.01, 0.05 * pulse, 2.4 * life, 0.8 * life, 2.2 * life, SP_FLASH);
        this.glow.push(pl.x * 1.01, pl.y * 1.01, pl.z * 1.01, pl.radius * 0.5, 0.25 * life, 0.1 * life, 0.25 * life, SP_RING);
      } else if (pl.kind === 'well') {
        this.glow.push(pl.x, pl.y, pl.z, pl.radius * 1.4, 0.9 * life, 0.4 * life, 2.2 * life, SP_PORTAL);
        this.glow.push(pl.x, pl.y, pl.z, 0.05, 1.6 * life, 0.8 * life, 3 * life, SP_FLASH);
      } else if (nh < 24) {
        // Singularity: a black core inside a white-hot accretion swirl.
        const sz = 0.05 * life;
        p.set(pl.x, pl.y, pl.z);
        q.identity();
        s.setScalar(sz);
        m.compose(p, q, s);
        this.hole.setMatrixAt(nh++, m);
        this.glow.push(pl.x, pl.y, pl.z, sz * 6, 3 * life, 2.2 * life, 1.6 * life, SP_PORTAL);
        this.glow.push(pl.x, pl.y, pl.z, sz * 3.2, 1.4 * life, 1 * life, 2.6 * life, SP_RING);
      }
    }
    this.hole.count = nh;
    this.hole.instanceMatrix.needsUpdate = true;
    // Destroyed emitters smoulder until rebuilt.
    for (const w of g.arsenal.weapons) {
      const n = tierOf(w).emitters;
      for (let k = 0; k < n && k < MAX_EMITTERS; k++) {
        if (w.emDown[k] <= 0) continue;
        const x = w.emitters[k * 3];
        const y = w.emitters[k * 3 + 1];
        const z = w.emitters[k * 3 + 2];
        const fl = 0.5 + 0.5 * Math.sin(t * 21 + k);
        this.glow.push(x, y, z, 0.018 * fl, 2.4 * fl, 0.7 * fl, 0.2 * fl, SP_FLASH);
        if (this.rand() < 0.05) this.puff(x, y, z, 0.01, 0.04, 1.2, 0.12);
      }
    }
    tv.mesh.count = nt;
    tv.mesh.instanceMatrix.needsUpdate = true;
    tv.mesh.instanceColor!.needsUpdate = true;
    tv.data.needsUpdate = true;
  }
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export { MAX_ENEMIES };
