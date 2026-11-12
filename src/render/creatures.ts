import { BufferAttribute, BufferGeometry, ConeGeometry, IcosahedronGeometry, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural bodies for the Outer Dark: lumpy flesh, clustered glowing eyes, teeth and spines.
 * Built in code (no asset), normalised like the hulls: about one unit long, facing +Z.
 * Vertex colours: grey flesh (the species palette maps it), > 1.5 marks self-lit eyes and maws.
 */

type RGB = [number, number, number];
/** Baked colours (creatures skip the species palette): bruised violet flesh, bone, sickly glow. */
const FLESH: RGB = [0.3, 0.13, 0.33];
const DARK: RGB = [0.13, 0.05, 0.16];
const BONE: RGB = [0.62, 0.56, 0.46];
const GLOW: RGB = [1.6, 2.7, 1.2];

type Part = BufferGeometry;

function tint(g: BufferGeometry, c: RGB | ((p: Vector3, n: Vector3) => RGB)): BufferGeometry {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const col = new Float32Array(pos.count * 3);
  const p = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const v = typeof c === 'function' ? c(p, n) : c;
    col[i * 3] = v[0];
    col[i * 3 + 1] = v[1];
    col[i * 3 + 2] = v[2];
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

/** Cheap deterministic 3D noise for lumpy flesh. */
function lump(p: Vector3, seed: number): number {
  return Math.sin(p.x * 7.1 + seed) * Math.sin(p.y * 6.3 + seed * 1.7) * Math.sin(p.z * 5.7 + seed * 2.3);
}

function blob(rx: number, ry: number, rz: number, at: [number, number, number], seed: number, rough = 0.12, detail = 2): Part {
  const g = new IcosahedronGeometry(1, detail);
  const pos = g.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + lump(v, seed) * rough;
    pos.setXYZ(i, v.x * rx * k + at[0], v.y * ry * k + at[1], v.z * rz * k + at[2]);
  }
  g.computeVertexNormals();
  // Darker underside and creases, paler ridges.
  return tint(g, (p): RGB => {
    const k = 1 + 0.7 * Math.max(-0.5, Math.min(0.5, (p.y - at[1]) / Math.max(0.01, ry))) + 0.25 * lump(p, seed + 3);
    // Pale, veined ridges on the bulges; near-black in the folds.
    const vein = Math.max(0, lump(p, seed + 7)) * 0.25;
    return [FLESH[0] * k + vein * 0.3, FLESH[1] * k + vein * 0.6, FLESH[2] * k + vein * 0.4];
  });
}

function eye(r: number, at: [number, number, number]): Part {
  const g = new SphereGeometry(r, 8, 6).translate(at[0], at[1], at[2]);
  return tint(g, GLOW);
}

const up = new Vector3(0, 1, 0);
const q = new Quaternion();
const m = new Matrix4();

/** A cone from `base` pointing along `dir` (spines, teeth, tendril stubs). */
function spike(r: number, len: number, base: [number, number, number], dir: [number, number, number], c: RGB = BONE, seg = 5): Part {
  const g = new ConeGeometry(r, len, seg).translate(0, len / 2, 0);
  const d = new Vector3(...dir).normalize();
  q.setFromUnitVectors(up, d);
  m.compose(new Vector3(...base), q, new Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return tint(g, c);
}

/** A curling limb of shrinking cones. */
function limb(base: [number, number, number], dir: [number, number, number], len: number, r: number, curl: number, segs = 4): Part[] {
  const out: Part[] = [];
  const p = new Vector3(...base);
  const d = new Vector3(...dir).normalize();
  const axis = new Vector3(1, 0, 0).cross(d).normalize();
  if (axis.lengthSq() < 0.01) axis.set(0, 1, 0);
  const step = len / segs;
  for (let k = 0; k < segs; k++) {
    const rr = r * (1 - k / segs) + 0.004;
    out.push(spike(rr, step * 1.15, [p.x, p.y, p.z], [d.x, d.y, d.z], k === segs - 1 ? FLESH : DARK, 6));
    p.addScaledVector(d, step);
    d.applyAxisAngle(axis, curl).normalize();
  }
  return out;
}

function ring<T>(n: number, f: (a: number, k: number) => T): T[] {
  return Array.from({ length: n }, (_, k) => f((k / n) * Math.PI * 2, k));
}

function finish(parts: Part[]): BufferGeometry {
  const flat = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    g.deleteAttribute('uv');
    return g;
  });
  const g = mergeGeometries(flat)!;
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const size = new Vector3();
  b.getSize(size);
  const c = new Vector3();
  b.getCenter(c);
  g.translate(-c.x, -c.y, -c.z);
  const s = 1 / Math.max(size.x, size.y, size.z);
  g.scale(s, s, s);
  return g;
}

const BUILDERS: Record<string, () => BufferGeometry> = {
  // Small squid-thing: the swarm.
  spawn: () => finish([
    blob(0.22, 0.2, 0.42, [0, 0, 0], 1, 0.15, 1),
    eye(0.05, [0.09, 0.07, 0.34]), eye(0.05, [-0.09, 0.07, 0.34]),
    ...ring(4, (a) => spike(0.06, 0.45, [Math.cos(a) * 0.1, Math.sin(a) * 0.1, -0.3], [Math.cos(a) * 0.3, Math.sin(a) * 0.3, -1], DARK)),
  ]),
  // A giant lidded eye trailing nerves.
  watcher: () => finish([
    blob(0.42, 0.42, 0.42, [0, 0, 0], 2, 0.06),
    tint(new SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, 0, 0.36), GLOW),
    tint(new TorusGeometry(0.24, 0.05, 6, 16).translate(0, 0, 0.36), DARK),
    ...ring(6, (a) => spike(0.05, 0.6, [Math.cos(a) * 0.25, Math.sin(a) * 0.25, -0.3], [Math.cos(a) * 0.2, Math.sin(a) * 0.2, -1], DARK)),
  ]),
  // A ring of teeth around a glowing gullet.
  maw: () => finish([
    blob(0.4, 0.4, 0.3, [0, 0, -0.1], 3, 0.14),
    tint(new SphereGeometry(0.2, 10, 6).scale(1, 1, 0.4).translate(0, 0, 0.16), GLOW),
    ...ring(12, (a) => spike(0.045, 0.22, [Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.14], [-Math.cos(a), -Math.sin(a), 0.6], BONE, 4)),
    ...ring(6, (a) => spike(0.07, 0.4, [Math.cos(a) * 0.3, Math.sin(a) * 0.3, -0.25], [Math.cos(a) * 0.6, Math.sin(a) * 0.6, -1], DARK)),
  ]),
  // Segmented leech with a lamprey mouth.
  leech: () => finish([
    ...[0, 1, 2, 3, 4].map((k) => blob(0.17 - k * 0.025, 0.17 - k * 0.025, 0.16, [Math.sin(k) * 0.03, 0, 0.25 - k * 0.2], 4 + k, 0.1, 1)),
    tint(new TorusGeometry(0.1, 0.03, 5, 10).translate(0, 0, 0.4), GLOW),
    ...ring(8, (a) => spike(0.02, 0.1, [Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.4], [-Math.cos(a), -Math.sin(a), 0.4], BONE, 3)),
  ]),
  lamprey: () => finish([
    ...[0, 1, 2, 3, 4, 5].map((k) => blob(0.13, 0.12, 0.14, [0, Math.sin(k * 1.3) * 0.04, 0.35 - k * 0.15], 9 + k, 0.1, 1)),
    tint(new TorusGeometry(0.11, 0.035, 5, 10).translate(0, 0, 0.47), GLOW),
    spike(0.03, 0.35, [0.12, 0, 0.1], [1, 0.2, -0.6], DARK), spike(0.03, 0.35, [-0.12, 0, 0.1], [-1, 0.2, -0.6], DARK),
    eye(0.03, [0.07, 0.08, 0.4]), eye(0.03, [-0.07, 0.08, 0.4]),
  ]),
  // Pulsing egg cluster.
  sac: () => finish([
    blob(0.32, 0.3, 0.36, [0, 0, 0], 5, 0.1),
    ...ring(5, (a, k) => blob(0.15, 0.15, 0.15, [Math.cos(a) * 0.28, Math.sin(a) * 0.22, -0.05 + (k % 2) * 0.1], 20 + k, 0.08, 1)),
    ...ring(7, (a, k) => eye(0.03, [Math.cos(a) * 0.31, Math.sin(a) * 0.27, 0.12 + (k % 3) * 0.05])),
  ]),
  // The Leviathan: a long whale-squid with eyes down its flanks.
  leviathan: () => finish([
    blob(0.3, 0.26, 0.85, [0, 0, 0], 6, 0.08),
    blob(0.22, 0.2, 0.3, [0, 0.05, 0.7], 7, 0.1),
    ...[-0.4, -0.15, 0.1, 0.35, 0.6].flatMap((z) => [eye(0.035, [0.27, 0.05, z]), eye(0.035, [-0.27, 0.05, z])]),
    spike(0.08, 0.6, [0.2, 0, -0.1], [1, -0.1, -0.4], DARK, 3), spike(0.08, 0.6, [-0.2, 0, -0.1], [-1, -0.1, -0.4], DARK, 3),
    ...ring(7, (a) => spike(0.03, 0.18, [Math.cos(a) * 0.1, 0.25 + Math.sin(a) * 0.02, Math.sin(a) * 0.6], [0, 1, 0], BONE, 3)),
  ]),
  // Star-spawn: a bulbous head, a beard of feelers, vestigial wings.
  horror: () => finish([
    blob(0.42, 0.46, 0.4, [0, 0.12, 0], 8, 0.14),
    blob(0.28, 0.22, 0.32, [0, -0.25, 0.08], 9, 0.12),
    ...ring(6, (a) => eye(0.045, [Math.cos(a) * 0.22, 0.2 + Math.sin(a) * 0.12, 0.34])),
    ...ring(8, (a) => spike(0.04, 0.35, [Math.cos(a) * 0.18, -0.38, 0.15 + Math.sin(a) * 0.12], [Math.cos(a) * 0.3, -1, 0.4], DARK)),
    spike(0.12, 0.7, [0.3, 0.3, -0.2], [1, 0.6, -0.8], DARK, 3), spike(0.12, 0.7, [-0.3, 0.3, -0.2], [-1, 0.6, -0.8], DARK, 3),
  ]),
  // Elder polyp: a tall spined cone ringed with eyes.
  polyp: () => finish([
    blob(0.32, 0.32, 0.5, [0, 0, 0], 10, 0.16),
    ...ring(10, (a) => eye(0.04, [Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.2])),
    ...ring(14, (a, k) => spike(0.035, 0.3 + (k % 3) * 0.08, [Math.cos(a) * 0.25, Math.sin(a) * 0.25, -0.15 + (k % 2) * 0.2], [Math.cos(a), Math.sin(a), 0.3], BONE, 4)),
    tint(new SphereGeometry(0.14, 10, 6).translate(0, 0, 0.46), GLOW),
  ]),
  // The Drowned Choir: five singing heads around a drowned heart.
  choir: () => finish([
    blob(0.26, 0.26, 0.26, [0, 0, 0], 11, 0.1),
    ...ring(5, (a, k) => blob(0.15, 0.17, 0.15, [Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0.05], 30 + k, 0.1, 1)),
    ...ring(5, (a) => eye(0.06, [Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0.2])),
    tint(new TorusGeometry(0.38, 0.03, 5, 24).translate(0, 0, 0.05), DARK),
    eye(0.09, [0, 0, 0.24]),
  ]),
  // The Hollow King: a crowned skull with burning sockets.
  hollow: () => finish([
    blob(0.38, 0.42, 0.38, [0, 0, 0], 12, 0.08),
    blob(0.24, 0.16, 0.26, [0, -0.3, 0.1], 13, 0.08, 1),
    tint(new SphereGeometry(0.09, 8, 6).translate(0.14, 0.06, 0.32), GLOW), tint(new SphereGeometry(0.09, 8, 6).translate(-0.14, 0.06, 0.32), GLOW),
    ...ring(9, (a, k) => spike(0.05, 0.3 + (k % 2) * 0.18, [Math.cos(a) * 0.28, 0.32, Math.sin(a) * 0.28], [Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3], BONE, 4)),
    ...ring(6, (a) => spike(0.04, 0.4, [Math.cos(a) * 0.15, -0.4, 0.15 + Math.sin(a) * 0.1], [0, -1, 0.3], DARK)),
  ]),
  // The Dreamer in the Dark: a vast head of eyes on great wings.
  dreamer: () => finish([
    blob(0.5, 0.55, 0.48, [0, 0.1, 0], 14, 0.15),
    blob(0.32, 0.25, 0.36, [0, -0.35, 0.1], 15, 0.12),
    ...Array.from({ length: 22 }, (_, k) => {
      const a = k * 2.39996;
      const y = 1 - (2 * (k + 0.5)) / 22;
      const r = Math.sqrt(1 - y * y);
      return eye(0.035 + (k % 4) * 0.012, [Math.cos(a) * r * 0.5, 0.1 + y * 0.52, Math.abs(Math.sin(a) * r) * 0.46 + 0.05]);
    }),
    ...ring(10, (a) => spike(0.05, 0.5, [Math.cos(a) * 0.25, -0.5, 0.15 + Math.sin(a) * 0.15], [Math.cos(a) * 0.4, -1, 0.5], DARK)),
    ...limb([0.4, 0.3, -0.2], [1, 0.4, -0.5], 1.1, 0.14, 0.35, 4), ...limb([-0.4, 0.3, -0.2], [-1, 0.4, -0.5], 1.1, 0.14, -0.35, 4),
    ...ring(7, (a) => spike(0.06, 0.35, [Math.cos(a) * 0.3, 0.55, Math.sin(a) * 0.2], [Math.cos(a) * 0.4, 1, Math.sin(a) * 0.3], BONE, 4)),
  ]),
  // The Brood Below: a mountain of egg sacs.
  brood: () => finish([
    blob(0.5, 0.42, 0.55, [0, 0, 0], 16, 0.12),
    ...Array.from({ length: 12 }, (_, k) => {
      const a = k * 2.39996;
      const y = 1 - (2 * (k + 0.5)) / 12;
      const r = Math.sqrt(1 - y * y);
      return blob(0.16, 0.16, 0.16, [Math.cos(a) * r * 0.5, y * 0.4, Math.sin(a) * r * 0.55], 40 + k, 0.1, 1);
    }),
    ...Array.from({ length: 16 }, (_, k) => {
      const a = k * 2.39996 + 1;
      const y = 1 - (2 * (k + 0.5)) / 16;
      const r = Math.sqrt(1 - y * y);
      return eye(0.035, [Math.cos(a) * r * 0.54, y * 0.44, Math.sin(a) * r * 0.58]);
    }),
  ]),
};

/** Decorative tentacles drawn on each creature body (the tentacle layer animates them). */
export const CREATURE_TENTACLES: Record<string, number> = {
  spawn: 0, watcher: 5, maw: 4, leech: 0, lamprey: 0, sac: 4, leviathan: 10, horror: 8, polyp: 7, choir: 6, hollow: 8, dreamer: 14, brood: 10,
};

const cache = new Map<string, BufferGeometry | null>();

/** Geometry for a `creature:<kind>` model id; null for bodiless parts (tentacles). */
export function creatureGeometry(model: string): BufferGeometry | null {
  const kind = model.slice('creature:'.length);
  if (cache.has(kind)) return cache.get(kind)!;
  const b = BUILDERS[kind];
  const g = b ? b() : null;
  cache.set(kind, g);
  return g;
}

export function isCreature(model: string): boolean {
  return model.startsWith('creature:');
}
