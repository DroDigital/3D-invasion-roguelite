import {
  BoxGeometry, BufferAttribute, BufferGeometry, ConeGeometry, CylinderGeometry, Euler, IcosahedronGeometry,
  Matrix4, Quaternion, TorusGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { modelNow } from '../core/assets';
import type { KitPart, WeaponDef } from '../data/types';

type RGB = [number, number, number];
const METAL: RGB = [0.55, 0.58, 0.63];
const DARK: RGB = [0.22, 0.24, 0.28];
const PANEL: RGB = [0.12, 0.2, 0.45];

interface Placed {
  part: KitPart;
  pos: [number, number, number];
  rot?: [number, number, number];
  scale: number | [number, number, number];
  color?: RGB;
  /** Multiply sourced parts' baked colours by this tint (0 = keep, 1 = full). */
  tint?: number;
}

function paint(g: BufferGeometry, c: RGB): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set(c, i * 3);
  geo.setAttribute('color', new BufferAttribute(col, 3));
  return geo;
}

/** Coded primitives. All are roughly unit-sized, standing on y = 0, +Y = outward. */
function coded(part: KitPart, c: RGB): BufferGeometry {
  switch (part) {
    case 'box': return paint(new BoxGeometry(0.8, 0.6, 0.8).translate(0, 0.3, 0), c);
    case 'cyl': return paint(new CylinderGeometry(0.4, 0.45, 0.7, 8).translate(0, 0.35, 0), c);
    case 'barrel': return paint(new CylinderGeometry(0.07, 0.09, 1, 6).translate(0, 0.5, 0), c);
    case 'gatling': {
      const parts: BufferGeometry[] = [];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        parts.push(new CylinderGeometry(0.035, 0.035, 0.9, 4).translate(Math.cos(a) * 0.12, 0.45, Math.sin(a) * 0.12));
      }
      parts.push(new CylinderGeometry(0.2, 0.2, 0.15, 6).translate(0, 0.1, 0));
      return paint(mergeGeometries(parts.map((p) => p.toNonIndexed()))!, c);
    }
    case 'dish': return paint(new CylinderGeometry(0.5, 0.08, 0.25, 10, 1, true).translate(0, 0.12, 0), c);
    case 'panel': return paint(new BoxGeometry(1.4, 0.04, 0.5), c);
    case 'ring': return paint(new TorusGeometry(0.75, 0.05, 4, 16).rotateX(Math.PI / 2), c);
    case 'emitter': return paint(new IcosahedronGeometry(0.16, 0).translate(0, 0.16, 0), c);
    case 'fin': return paint(new ConeGeometry(0.25, 0.7, 3).scale(1, 1, 0.15).translate(0, 0.35, 0), c);
    case 'coil': {
      const parts: BufferGeometry[] = [];
      for (let k = 0; k < 4; k++) parts.push(new TorusGeometry(0.16, 0.035, 3, 8).rotateX(Math.PI / 2).translate(0, 0.15 + k * 0.17, 0).toNonIndexed());
      parts.push(new CylinderGeometry(0.05, 0.05, 0.8, 4).translate(0, 0.4, 0).toNonIndexed());
      return paint(mergeGeometries(parts)!, c);
    }
    case 'pod': return paint(mergeGeometries([new CylinderGeometry(0.25, 0.25, 0.5, 6).translate(0, 0.25, 0).toNonIndexed(), new ConeGeometry(0.25, 0.3, 6).translate(0, 0.65, 0).toNonIndexed()])!, c);
    case 'orb': return paint(new IcosahedronGeometry(0.35, 1).translate(0, 0.35, 0), c);
    case 'spike': return paint(new ConeGeometry(0.1, 0.7, 4).translate(0, 0.35, 0), c);
    default: return paint(new BoxGeometry(0.5, 0.5, 0.5).translate(0, 0.25, 0), c);
  }
}

const CODED = new Set<KitPart>(['box', 'cyl', 'barrel', 'gatling', 'dish', 'panel', 'ring', 'emitter', 'fin', 'coil', 'pod', 'orb', 'spike']);

function partGeometry(p: Placed): BufferGeometry {
  if (CODED.has(p.part)) return coded(p.part, p.color ?? METAL);
  const src = modelNow(`kit:${p.part}`);
  if (!src) return coded('box', p.color ?? METAL);
  const g = src.clone();
  g.deleteAttribute('normal');
  if (p.color && p.tint) {
    const col = g.getAttribute('color') as BufferAttribute;
    for (let i = 0; i < col.count; i++) {
      col.setXYZ(i, col.getX(i) * (1 - p.tint + p.tint * p.color[0] * 1.6), col.getY(i) * (1 - p.tint + p.tint * p.color[1] * 1.6), col.getZ(i) * (1 - p.tint + p.tint * p.color[2] * 1.6));
    }
  }
  return g;
}

const glow = (c: RGB, k = 2.6): RGB => [c[0] * k + 0.4, c[1] * k + 0.4, c[2] * k + 0.4];
const ring = (n: number, r: number, y: number): [number, number, number][] =>
  Array.from({ length: n }, (_, k) => [Math.cos((k / n) * Math.PI * 2) * r, y, Math.sin((k / n) * Math.PI * 2) * r]);

/**
 * The recipe: which parts go where for a weapon at a tier. Each tier adds structure,
 * so tier 1 is a small crude unit and tier 5 a large elaborate one.
 */
export function recipe(def: WeaponDef, tier: number): Placed[] {
  const L = def.look;
  const acc = L.accent;
  const out: Placed[] = [];
  const evo = !!def.evolved;
  const t = evo ? 5 : tier;
  const ground = def.deploy === 'groundBattery';

  if (ground) out.push({ part: 'box', pos: [0, 0, 0], scale: [1.4 + t * 0.15, 0.25, 1.4 + t * 0.15], color: DARK });
  const by = ground ? 0.12 : 0;
  out.push({ part: L.body, pos: [0, by, 0], scale: 0.7 + t * 0.06, color: METAL, tint: 0.25 });
  const top = by + 0.55 + t * 0.04;

  // Guns: one, then two, three, four, then a full ring.
  const guns = [1, 1, 2, 3, 4, 6][t];
  const gunPos = guns === 1 ? [[0, top, 0]] : ring(guns, 0.22 + t * 0.03, top);
  for (const p of gunPos) out.push({ part: L.gun, pos: p as [number, number, number], scale: 0.55 + t * 0.07, color: L.gun === 'emitter' || L.gun === 'coil' || L.gun === 'orb' ? glow(acc) : acc, tint: 0.5 });

  if (t >= 1 && !ground) {
    out.push({ part: 'panel', pos: [0.75 + t * 0.08, by + 0.3, 0], scale: [0.9 + t * 0.12, 1, 1], color: PANEL });
    out.push({ part: 'panel', pos: [-0.75 - t * 0.08, by + 0.3, 0], scale: [0.9 + t * 0.12, 1, 1], color: PANEL });
  }
  if (t >= 1) out.push({ part: 'spike', pos: [0.25, top - 0.1, 0.25], scale: 0.6, color: METAL });
  if (t >= 2) out.push({ part: L.hero, pos: [0, by - 0.05, -0.55 - t * 0.04], rot: [-0.5, 0, 0], scale: 0.55 + t * 0.06, color: acc, tint: 0.3 });
  if (t >= 3) {
    out.push({ part: 'ring', pos: [0, by + 0.35, 0], scale: 0.8 + t * 0.08, color: acc });
    for (const p of ring(2, 0.5, by + 0.6)) out.push({ part: 'emitter', pos: p as [number, number, number], scale: 0.8, color: glow(acc) });
    if (!ground) {
      out.push({ part: 'panel', pos: [0, by + 0.3, 0.8 + t * 0.06], rot: [0, Math.PI / 2, 0], scale: [0.9, 1, 1], color: PANEL });
      out.push({ part: 'panel', pos: [0, by + 0.3, -0.8 - t * 0.06], rot: [0, Math.PI / 2, 0], scale: [0.9, 1, 1], color: PANEL });
    }
  }
  if (t >= 4) {
    out.push({ part: 'ring', pos: [0, by + 0.5, 0], rot: [0.6, 0, 0.3], scale: 1.05 + t * 0.05, color: glow(acc, 1.2) });
    out.push({ part: 'orb', pos: [0, top + 0.35, 0], scale: 0.45, color: glow(acc, 3) });
    for (const p of ring(4, 0.55, by)) out.push({ part: 'fin', pos: p as [number, number, number], rot: [0, Math.atan2(p[0], p[2]), 0], scale: 0.9, color: DARK });
    out.push({ part: L.hero, pos: [0, by - 0.05, 0.6], rot: [0.5, Math.PI, 0], scale: 0.6, color: acc, tint: 0.3 });
  }
  if (evo) {
    out.push({ part: 'ring', pos: [0, by + 0.7, 0], rot: [-0.7, 0.4, 0], scale: 1.5, color: glow(acc, 1.6) });
    out.push({ part: 'orb', pos: [0, by + 0.45, 0], scale: 0.75, color: glow(acc, 3.4) });
    for (const p of ring(6, 1.0, by + 0.25)) out.push({ part: 'spike', pos: p as [number, number, number], rot: [Math.PI / 2, Math.atan2(p[0], p[2]), 0], scale: 0.9, color: glow(acc, 1.4) });
  }
  return out;
}

const cache = new Map<string, BufferGeometry>();
const m = new Matrix4();
const q = new Quaternion();
const v = new Vector3();
const sv = new Vector3();

/** Build (or fetch) the merged geometry for one weapon tier model. */
export function buildTierModel(def: WeaponDef, tier: number): BufferGeometry {
  const key = def.tiers[tier].model;
  const hit = cache.get(key);
  if (hit) return hit;
  const geos: BufferGeometry[] = [];
  for (const p of recipe(def, tier)) {
    const g = partGeometry(p);
    q.setFromEuler(new Euler(...(p.rot ?? [0, 0, 0])));
    const s = p.scale;
    sv.set(...(typeof s === 'number' ? ([s, s, s] as [number, number, number]) : s));
    m.compose(v.set(...p.pos), q, sv);
    geos.push(g.applyMatrix4(m));
  }
  const merged = mergeGeometries(geos)!;
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  // Normalise: tallest dimension = 1 so instance scale alone sets on-screen size.
  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  const size = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) || 1;
  merged.scale(1 / size, 1 / size, 1 / size);
  cache.set(key, merged);
  return merged;
}

/** On-screen size multiplier per tier, so the defence visibly grows during a run. */
export function tierScale(def: WeaponDef, tier: number): number {
  return def.evolved ? 1.7 : [0.75, 0.9, 1.05, 1.25, 1.45][tier];
}
