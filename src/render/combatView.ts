import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ENEMY_SIEGE, MAX_ENEMIES } from '../sim/enemies';
import type { Game } from '../sim/game';
import { MAX_PROJECTILES } from '../sim/projectiles';
import { MAX_EMITTERS, tierOf } from '../sim/weapons';


const FWD = new Vector3(0, 0, 1);
const m = new Matrix4();
const q = new Quaternion();
const p = new Vector3();
const d = new Vector3();
const s = new Vector3();
const ENEMY_COLOR = new Color(0xc23cff);
const FLASH_COLOR = new Color(4, 4, 4);
const SAT_COLOR = new Color(0xb8c4d0);
const PLATFORM_COLOR = new Color(0xd0a070);
const GROUND_COLOR = new Color(0x8fd08f);
const col = new Color();

/** Placeholder alien hull: a faceted dart, nose along +Z. Sourced hulls replace it in milestone 5. */
function podGeometry(): BufferGeometry {
  const nose = new ConeGeometry(0.016, 0.05, 5);
  nose.rotateX(Math.PI / 2);
  nose.translate(0, 0, 0.012);
  const tail = new ConeGeometry(0.016, 0.02, 5);
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0, -0.023);
  const fin = new BoxGeometry(0.06, 0.003, 0.018);
  fin.translate(0, 0, -0.012);
  return mergeGeometries([nose, tail, fin])!.toNonIndexed();
}

/** Placeholder tier-1 satellite, barrel along +Z. Kit-built tier models replace it in milestone 6. */
function satelliteGeometry(): BufferGeometry {
  const body = new BoxGeometry(0.022, 0.022, 0.03);
  const panelL = new BoxGeometry(0.04, 0.002, 0.02);
  panelL.translate(-0.032, 0, 0);
  const panelR = new BoxGeometry(0.04, 0.002, 0.02);
  panelR.translate(0.032, 0, 0);
  const barrel = new CylinderGeometry(0.004, 0.004, 0.04, 5);
  barrel.rotateX(Math.PI / 2);
  barrel.translate(0, 0, 0.032);
  return mergeGeometries([body, panelL, panelR, barrel])!.toNonIndexed();
}

/** Instanced views of everything in the sim. One draw call per archetype. */
export class CombatView {
  private enemies: InstancedMesh;
  private shots: InstancedMesh;
  private sats: InstancedMesh;
  private trails: LineSegments;
  private trailPos: Float32Array;

  constructor(private game: Game, parent: Object3D) {
    this.enemies = new InstancedMesh(podGeometry(), new MeshLambertMaterial({ flatShading: true, emissive: 0x5a1486 }), MAX_ENEMIES);
    this.enemies.setColorAt(0, ENEMY_COLOR);
    this.enemies.instanceMatrix.setUsage(DynamicDrawUsage);

    const bolt = new BoxGeometry(0.005, 0.005, 0.06);
    this.shots = new InstancedMesh(
      bolt,
      new MeshBasicMaterial({ blending: AdditiveBlending, depthWrite: false }),
      MAX_PROJECTILES,
    );
    this.shots.instanceMatrix.setUsage(DynamicDrawUsage);

    this.sats = new InstancedMesh(
      satelliteGeometry(),
      new MeshLambertMaterial({ flatShading: true }),
      MAX_EMITTERS * 6,
    );
    this.sats.instanceMatrix.setUsage(DynamicDrawUsage);

    this.trailPos = new Float32Array(MAX_ENEMIES * 6);
    const tg = new BufferGeometry();
    const attr = new BufferAttribute(this.trailPos, 3);
    attr.setUsage(DynamicDrawUsage);
    tg.setAttribute('position', attr);
    this.trails = new LineSegments(
      tg,
      new LineBasicMaterial({ color: 0xff3048, transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false }),
    );

    for (const o of [this.enemies, this.shots, this.sats, this.trails]) {
      o.frustumCulled = false;
      parent.add(o);
    }
  }

  update(): void {
    const g = this.game;
    const e = g.enemies;
    const c = g.cities;
    let n = 0;
    let t = 0;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      p.set(e.x[i], e.y[i], e.z[i]);
      if (e.state[i] === ENEMY_SIEGE) {
        // Landed: nose buried in the city.
        d.copy(p).normalize().negate();
      } else {
        d.set(e.dx[i], e.dy[i], e.dz[i]);
        const k = e.city[i] * 3;
        this.trailPos[t++] = p.x;
        this.trailPos[t++] = p.y;
        this.trailPos[t++] = p.z;
        this.trailPos[t++] = c.pos[k];
        this.trailPos[t++] = c.pos[k + 1];
        this.trailPos[t++] = c.pos[k + 2];
      }
      q.setFromUnitVectors(FWD, d);
      s.setScalar(2);
      m.compose(p, q, s);
      this.enemies.setMatrixAt(n, m);
      this.enemies.setColorAt(n, e.flash[i] > 0 ? FLASH_COLOR : ENEMY_COLOR);
      n++;
    }
    this.enemies.count = n;
    this.enemies.instanceMatrix.needsUpdate = true;
    if (this.enemies.instanceColor) this.enemies.instanceColor.needsUpdate = true;
    this.trails.geometry.setDrawRange(0, t / 3);
    (this.trails.geometry.attributes.position as BufferAttribute).needsUpdate = true;

    const pr = g.projectiles;
    n = 0;
    for (let i = 0; i < pr.high; i++) {
      if (!pr.alive[i]) continue;
      p.set(pr.x[i], pr.y[i], pr.z[i]);
      d.set(pr.dx[i], pr.dy[i], pr.dz[i]);
      q.setFromUnitVectors(FWD, d);
      const shot = g.arsenal.weapons[pr.weapon[i]]?.def.shot;
      if (shot) {
        s.set(shot.width, shot.width, shot.length);
        col.setRGB(shot.color[0], shot.color[1], shot.color[2]);
      } else s.setScalar(1);
      m.compose(p, q, s);
      this.shots.setMatrixAt(n, m);
      this.shots.setColorAt(n, col);
      n++;
    }
    this.shots.count = n;
    this.shots.instanceMatrix.needsUpdate = true;
    if (this.shots.instanceColor) this.shots.instanceColor.needsUpdate = true;

    n = 0;
    const ws = g.arsenal.weapons;
    for (let w = 0; w < ws.length; w++) {
      const em = ws[w].emitters;
      const count = tierOf(ws[w]).emitters;
      for (let k = 0; k < count; k++) {
        p.set(em[k * 3], em[k * 3 + 1], em[k * 3 + 2]);
        // Barrels point away from the planet.
        d.copy(p).normalize();
        q.setFromUnitVectors(FWD, d);
        const deploy = ws[w].def.deploy;
        s.setScalar(deploy === 'platform' ? 2.6 : deploy === 'groundBattery' ? 0.8 : 1.3);
        m.compose(p, q, s);
        this.sats.setMatrixAt(n, m);
        this.sats.setColorAt(n, deploy === 'platform' ? PLATFORM_COLOR : deploy === 'groundBattery' ? GROUND_COLOR : SAT_COLOR);
        n++;
      }
    }
    this.sats.count = n;
    this.sats.instanceMatrix.needsUpdate = true;
    if (this.sats.instanceColor) this.sats.instanceColor.needsUpdate = true;
  }
}
