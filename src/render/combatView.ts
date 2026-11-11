import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, DoubleSide, DynamicDrawUsage,
  IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4,
  MeshBasicMaterial, Object3D, Quaternion, ShaderMaterial, SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import { modelNow } from '../core/assets';
import { ALIENS, ALIEN_TIERS, SPECIES } from '../data/aliens';
import {
  MAX_ENEMIES, ROLE_ABDUCTOR, ROLE_SABOTEUR, ST_ATTACHED, ST_FLEE, ST_HOVER, ST_SIEGE,
} from '../sim/enemies';
import type { Game } from '../sim/game';
import {
  FX_BEAM, FX_BOMB, FX_CHAIN, FX_CITY_SHIELD, FX_EMP, FX_EVOLVE, FX_NOVA, FX_STRIDE, FX_STRIKE,
} from '../sim/game';
import { MAX_FIELDS, MAX_PROJECTILES, PK_DRONE } from '../sim/projectiles';
import { MAX_EMITTERS, tierOf } from '../sim/weapons';
import { buildTierModel, tierScale } from './kit';
import { PS2, ps2Material } from './ps2Material';

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
const MAX_LINES = 1200;
const ALIEN_RENDER_SCALE = 1.6;
const MAX_WAVES = 24;

/** Instanced mesh with an `instData` attribute for the PS2 material. */
function psInstanced(geo: BufferGeometry, cap: number): { mesh: InstancedMesh; data: InstancedBufferAttribute } {
  const g = geo.clone();
  const data = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  data.setUsage(DynamicDrawUsage);
  g.setAttribute('instData', data);
  const mesh = new InstancedMesh(g, ps2Material(), cap);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.setColorAt(0, col.set(1, 1, 1));
  mesh.instanceColor!.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return { mesh, data };
}

/** Instanced bubble that glows at its rim and is clear in the middle (shields, gravity fields). */
function fresnel(geo: BufferGeometry, cap: number, power: number, strength: number): InstancedMesh {
  const mat = new ShaderMaterial({
    uniforms: { power: { value: power }, strength: { value: strength }, time: PS2.time },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vC; varying vec3 vP;
      void main() {
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vV = normalize(-mv.xyz);
        vC = instanceColor;
        vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float power; uniform float strength; uniform float time;
      varying vec3 vN; varying vec3 vV; varying vec3 vC; varying vec3 vP;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), power);
        float bands = 0.75 + 0.25 * sin(vP.y * 18.0 + time * 6.0);
        gl_FragColor = vec4(vC * rim * strength * bands, 1.0);
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new InstancedMesh(geo, mat, cap);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.setColorAt(0, col.set(1, 1, 1));
  mesh.instanceColor!.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

function additive(geo: BufferGeometry, cap: number, opacity = 1): InstancedMesh {
  const mesh = new InstancedMesh(geo, new MeshBasicMaterial({ blending: AdditiveBlending, depthWrite: false, transparent: true, opacity, side: DoubleSide }), cap);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.setColorAt(0, col.set(1, 1, 1));
  mesh.instanceColor!.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
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
  private halos = additive(new TorusGeometry(1, 0.06, 3, 18), MAX_ENEMIES, 0.8);
  private beams = additive(new ConeGeometry(1, 1, 10, 1, true).translate(0, -0.5, 0), 64, 0.35);
  private bolts = additive(new BoxGeometry(0.006, 0.006, 0.05), MAX_PROJECTILES);
  private drones: { mesh: InstancedMesh; data: InstancedBufferAttribute };
  private fields = fresnel(new SphereGeometry(1, 20, 12), MAX_FIELDS, 3.0, 0.45);
  private waves = additive(new TorusGeometry(1, 0.02, 3, 48), MAX_WAVES, 0.9);
  private domes = additive(new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 32, 0.35);
  private weapons: (WeaponMesh | null)[] = [];
  private trails: LineSegments;
  private trailPos = new Float32Array(MAX_ENEMIES * 6);
  private trailCol = new Float32Array(MAX_ENEMIES * 6);
  private lines: LineSegments;
  private linePos = new Float32Array(MAX_LINES * 6);
  private lineCol = new Float32Array(MAX_LINES * 6);
  private lineBase = new Float32Array(MAX_LINES * 3);
  private lineTtl = new Float32Array(MAX_LINES);
  private lineMax = new Float32Array(MAX_LINES);
  private lineNext = 0;
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
    this.trails = mkLines(this.trailPos, this.trailCol, 0.35);
    this.lines = mkLines(this.linePos, this.lineCol, 1);

    for (const o of [this.shields, this.halos, this.beams, this.bolts, this.drones.mesh, this.fields, this.waves, this.domes, this.trails, this.lines]) parent.add(o);
  }

  dispose(): void {
    const objs = [this.shields, this.halos, this.beams, this.bolts, this.drones.mesh, this.fields, this.waves, this.domes, this.trails, this.lines];
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
    const geo = modelNow(`hull:${HULLS[h]}`);
    if (!geo) return null;
    v = psInstanced(geo, MAX_ENEMIES);
    this.parent.add(v.mesh);
    this.hulls[h] = v;
    return v;
  }

  private addLine(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, c: Color, ttl: number): void {
    const i = this.lineNext;
    this.lineNext = (this.lineNext + 1) % MAX_LINES;
    const o = i * 6;
    this.linePos[o] = x1;
    this.linePos[o + 1] = y1;
    this.linePos[o + 2] = z1;
    this.linePos[o + 3] = x2;
    this.linePos[o + 4] = y2;
    this.linePos[o + 5] = z2;
    this.lineBase[i * 3] = c.r;
    this.lineBase[i * 3 + 1] = c.g;
    this.lineBase[i * 3 + 2] = c.b;
    this.lineTtl[i] = this.lineMax[i] = ttl;
  }

  /** Lightning: a jagged polyline between two points. */
  private addBolt(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, c: Color, ttl: number): void {
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
      this.addLine(px, py, pz, nx, ny, nz, c, ttl);
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

  /** Consume the frame's sim fx for lines and shockwaves (particles read the same buffer). */
  consumeFx(): void {
    const g = this.game;
    const f = g.fx;
    for (let k = 0; k < g.fxCount; k++) {
      const o = k * FX_STRIDE;
      const kind = f[o];
      const slot = f[o + 7] | 0;
      const c = this.slotColor[slot] ?? col.set(2, 2, 2);
      switch (kind) {
        case FX_BEAM: {
          const pw = this.slotPower[slot] ?? 1;
          const ttl = (0.12 + (g.arsenal.weapons[slot]?.def.shot.width ?? 1) * 0.04) * (0.8 + pw * 0.25);
          this.addLine(f[o + 1], f[o + 2], f[o + 3], f[o + 4], f[o + 5], f[o + 6], c, ttl);
          // Higher tiers fire a visibly heavier beam: a second, offset core line.
          if (pw >= 1.6) {
            const e = 0.006 * pw;
            this.addLine(f[o + 1] + e, f[o + 2] + e, f[o + 3], f[o + 4] + e, f[o + 5] + e, f[o + 6], c, ttl * 0.8);
          }
          break;
        }
        case FX_CHAIN: {
          const pw = this.slotPower[slot] ?? 1;
          this.addBolt(f[o + 1], f[o + 2], f[o + 3], f[o + 4], f[o + 5], f[o + 6], c, 0.14 + pw * 0.05);
          if (pw >= 1.6) this.addBolt(f[o + 1], f[o + 2], f[o + 3], f[o + 4], f[o + 5], f[o + 6], c, 0.12);
          break;
        }
        case FX_BOMB:
          this.addLine(f[o + 1], f[o + 2], f[o + 3], f[o + 4], f[o + 5], f[o + 6], col.set(3, 0.6, 0.3), 0.35);
          break;
        case FX_NOVA:
          this.addWave(0, 0, 0, 3.2, 0.8, c);
          this.shake = Math.max(this.shake, 0.3);
          break;
        case FX_STRIKE:
          this.addWave(f[o + 1], f[o + 2], f[o + 3], f[o + 7] * 1.5, 0.7, col.set(3, 2.2, 1.2));
          this.addLine(f[o + 1] * 3, f[o + 2] * 3, f[o + 3] * 3, f[o + 1], f[o + 2], f[o + 3], col.set(4, 3.6, 3), 0.4);
          this.shake = Math.max(this.shake, 1);
          this.flash = Math.max(this.flash, 0.5);
          break;
        case FX_EMP:
          this.addWave(0, 0, 0, 3.5, 1.0, col.set(1.2, 2, 3.6));
          this.flash = Math.max(this.flash, 0.4);
          break;
        case FX_EVOLVE:
          this.addWave(0, 0, 0, 2.2, 1.2, col.set(3, 2.6, 1));
          this.flash = Math.max(this.flash, 0.6);
          this.shake = Math.max(this.shake, 0.5);
          break;
        case FX_CITY_SHIELD:
          this.addWave(f[o + 1], f[o + 2], f[o + 3], 0.25, 0.6, col.set(0.8, 2, 3.4));
          break;
      }
    }
  }

  update(dt: number): void {
    const g = this.game;
    PS2.time.value += dt;
    this.updateWeapons();
    this.consumeFx();
    this.updateAliens();
    this.updateProjectiles();
    this.updateFields(dt);
    this.updateLines(dt);
    this.updateWaves(dt);
    this.updateDomes();
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
        v.mesh.setColorAt(k, jam ? col.setRGB(1.6, 0.5, 0.4) : col.setRGB(1, 1, 1));
        v.data.setXYZW(k, -1, 0, 0, jam ? 0.3 * (Math.sin(PS2.time.value * 12) + 1) : 0);
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
      const sc = e.scale[i] * (1 + (ALIEN_RENDER_SCALE - 1) * Math.min(1, Math.max(0, (0.14 - e.scale[i]) / 0.08)));
      if (e.state[i] === ST_SIEGE) d.copy(p).normalize().negate();
      else d.set(e.dx[i], e.dy[i], e.dz[i]);
      q.setFromUnitVectors(FWD, d);
      s.setScalar(sc);
      m.compose(p, q, s);
      const tier = ALIEN_TIERS[e.tier[i]];
      if (view) {
        const n = this.hullCount[h]++;
        view.mesh.setMatrixAt(n, m);
        // Rarity shows as a light tint plus the halo ring; the species palette stays readable.
        const tk = e.tier[i] === 0 ? 0 : 0.3;
        view.mesh.setColorAt(n, col.setRGB(1 + (Math.min(1.4, tier.color[0]) - 1) * tk, 1 + (Math.min(1.4, tier.color[1]) - 1) * tk, 1 + (Math.min(1.4, tier.color[2]) - 1) * tk));
        view.data.setXYZW(n, e.species[i], e.flash[i] > 0 ? 0.8 : 0, e.cloaked[i] ? 0.8 : 0, e.tier[i] >= 2 ? 0.08 : 0);
      }
      if (e.shield[i] > 0 && !e.cloaked[i]) {
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
        this.halos.setColorAt(ha++, col.setRGB(tier.color[0] * 0.8, tier.color[1] * 0.8, tier.color[2] * 0.8));
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
      if (e.state[i] !== ST_SIEGE && e.state[i] !== ST_HOVER && e.state[i] !== ST_ATTACHED && !e.cloaked[i]) {
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
    for (const [mesh, n] of [[this.shields, sh], [this.halos, ha], [this.beams, bm]] as const) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    }
    this.trails.geometry.setDrawRange(0, t * 2);
    this.trails.geometry.attributes.position.needsUpdate = true;
    this.trails.geometry.attributes.color.needsUpdate = true;
  }

  private updateProjectiles(): void {
    const g = this.game;
    const pr = g.projectiles;
    let nb = 0;
    let nd = 0;
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
      if (shot) {
        const wd = shot.width * (pr.crit[i] ? 1.6 : 1) * (0.75 + pw * 0.3);
        s.set(wd, wd, shot.length * (0.8 + pw * 0.25));
        col.setRGB(shot.color[0], shot.color[1], shot.color[2]).multiplyScalar(0.75 + pw * 0.25);
      } else {
        s.setScalar(1);
        col.set(2, 2, 2);
      }
      m.compose(p, q, s);
      this.bolts.setMatrixAt(nb, m);
      this.bolts.setColorAt(nb++, col);
    }
    this.bolts.count = nb;
    this.bolts.instanceMatrix.needsUpdate = true;
    this.bolts.instanceColor!.needsUpdate = true;
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

  private updateLines(dt: number): void {
    let any = false;
    for (let i = 0; i < MAX_LINES; i++) {
      if (this.lineTtl[i] <= 0) {
        if (this.lineCol[i * 6] !== 0 || this.lineCol[i * 6 + 3] !== 0) {
          this.lineCol.fill(0, i * 6, i * 6 + 6);
          any = true;
        }
        continue;
      }
      this.lineTtl[i] -= dt;
      const a = Math.max(0, this.lineTtl[i] / this.lineMax[i]);
      const o = i * 6;
      for (let k = 0; k < 2; k++) {
        this.lineCol[o + k * 3] = this.lineBase[i * 3] * a;
        this.lineCol[o + k * 3 + 1] = this.lineBase[i * 3 + 1] * a;
        this.lineCol[o + k * 3 + 2] = this.lineBase[i * 3 + 2] * a;
      }
      any = true;
    }
    if (any) {
      this.lines.geometry.attributes.position.needsUpdate = true;
      this.lines.geometry.attributes.color.needsUpdate = true;
    }
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
  }
}
