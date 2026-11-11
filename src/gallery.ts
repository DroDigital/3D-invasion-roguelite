import { Color, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Scene, Vector3 } from 'three';
import { BASE_WEAPONS, WEAPONS } from './data/weapons';
import type { Earth } from './render/earth';
import { buildTierModel, tierScale } from './render/kit';
import type { OrbitCamera } from './render/orbitCamera';
import { ps2Material } from './render/ps2Material';

/**
 * ?gallery=N: every weapon's five tier models side by side (8 weapons per page, pages 0-2),
 * page 3 shows the evolved weapons. A visual check that each tier really is a distinct model.
 */
export function showGallery(scene: Scene, earth: Earth, orbit: OrbitCamera, page: number): void {
  earth.root.visible = false;
  const group = new Group();
  scene.add(group);
  const labels = document.createElement('div');
  labels.id = 'gallery-labels';
  document.body.append(labels);
  const rows: { name: string; geos: { geo: ReturnType<typeof buildTierModel>; s: number }[] }[] = [];
  if (page < 3) {
    for (const w of BASE_WEAPONS.slice(page * 8, page * 8 + 8)) rows.push({ name: w.name, geos: w.tiers.map((_, t) => ({ geo: buildTierModel(w, t), s: tierScale(w, t) })) });
  } else {
    const evo = WEAPONS.filter((w) => w.evolved);
    for (let r = 0; r < 3; r++) rows.push({ name: '', geos: evo.slice(r * 5, r * 5 + 5).map((w) => ({ geo: buildTierModel(w, 0), s: 1.2, name: w.name })) });
  }
  const m = new Matrix4();
  const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.35);
  const spacing = 1.25;
  const anchors: { pos: Vector3; text: string }[] = [];
  rows.forEach((row, r) => {
    row.geos.forEach(({ geo, s }, c) => {
      const g = geo.clone();
      g.setAttribute('instData', new InstancedBufferAttribute(new Float32Array([-1, 0, 0, 0]), 4));
      const mesh = new InstancedMesh(g, ps2Material(), 1);
      const pos = new Vector3((c - 2) * spacing * 1.3, ((rows.length - 1) / 2 - r) * spacing, 0);
      m.compose(pos, q, new Vector3(s * 0.8, s * 0.8, s * 0.8));
      mesh.setMatrixAt(0, m);
      mesh.setColorAt(0, new Color(1, 1, 1));
      group.add(mesh);
      const nm = (row.geos[c] as { name?: string }).name;
      anchors.push({ pos: pos.clone().add(new Vector3(0, -0.55, 0)), text: nm ?? (c === 0 ? `${row.name.toUpperCase()}  T1` : `T${c + 1}`) });
    });
  });
  orbit.yaw = 0;
  orbit.pitch = 0;
  orbit.dist = 2.5 + rows.length * 1.5;
  (orbit as unknown as { targetDist: number }).targetDist = orbit.dist;
  const els = anchors.map((a) => {
    const el = document.createElement('div');
    el.className = 'glabel';
    el.textContent = a.text;
    labels.append(el);
    return el;
  });
  const v = new Vector3();
  const tick = (): void => {
    group.rotation.y = Math.sin(performance.now() / 2500) * 0.6;
    orbit.camera.updateMatrixWorld();
    anchors.forEach((a, i) => {
      v.copy(a.pos).project(orbit.camera);
      els[i].style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
      els[i].style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
    });
    requestAnimationFrame(tick);
  };
  tick();
}
