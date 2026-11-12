/**
 * Converts sourced models into small, meshopt-compressed GLBs with baked vertex colours.
 *
 *   node tools/build-models.mjs <ultimate-spaceships-dir> <kenney-space-kit-dir>
 *
 * - Quaternius "Ultimate Spaceships" (CC0): OBJ + 2048px palette texture. The palette is
 *   sampled per vertex into COLOR_0 (no texture at runtime), large hulls are simplified,
 *   and every hull is normalised to length 1 with its nose along +Z.
 * - Kenney "Space Kit" (CC0): GLB parts with flat material colours, baked to COLOR_0 and
 *   re-based so the part stands on y = 0, centred on x/z, at height 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const [shipsDir, kitDir] = process.argv.slice(2);
if (!shipsDir || !kitDir) {
  console.error('usage: node tools/build-models.mjs <ultimate-spaceships-dir> <kenney-space-kit-dir>');
  process.exit(1);
}
const OUT = path.resolve('assets/models');
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
});

/** Hulls used by the alien roster, with the triangle budget each may keep. */
const HULLS = {
  Bob: 900, Challenger: 900, Dispatcher: 900, Executioner: 1400, Imperial: 1400, Insurgent: 1400,
  Omen: 900, Pancake: 1200, Spitfire: 1200, Striker: 1200, Zenith: 1000,
};

/** Kenney parts used by the weapon kit. */
const KIT_PARTS = [
  'satelliteDish', 'satelliteDish_detailed', 'satelliteDish_large', 'turret_single', 'turret_double',
  'machine_wireless', 'machine_generator', 'machine_generatorLarge', 'machine_barrel', 'rocket_topA',
  'rocket_topB', 'rocket_fuelA', 'rocket_finsA', 'rocket_sidesA', 'rocket_baseA', 'weapon_gun',
  'weapon_rifle', 'pipe_ring', 'structure_detailed', 'hangar_roundGlass', 'rock_crystals',
];

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function sample(png, u, v) {
  const x = Math.min(png.width - 1, Math.max(0, Math.floor((u - Math.floor(u)) * png.width)));
  const y = Math.min(png.height - 1, Math.max(0, Math.floor((1 - (v - Math.floor(v))) * png.height)));
  const i = (y * png.width + x) * 4;
  return [png.data[i] / 255, png.data[i + 1] / 255, png.data[i + 2] / 255];
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** Minimal OBJ reader: positions, uvs, polygon faces (fan-triangulated). */
function readObj(file) {
  const v = [];
  const vt = [];
  const tris = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') v.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'vt') vt.push([+p[1], +p[2]]);
    else if (p[0] === 'f') {
      const idx = p.slice(1).map((s) => s.split('/').map((n) => parseInt(n, 10) - 1));
      for (let i = 1; i + 1 < idx.length; i++) tris.push([idx[0], idx[i], idx[i + 1]]);
    }
  }
  return { v, vt, tris };
}

function writeMesh(name, positions, colors, outFile, targetTris) {
  const doc = new Document();
  const buf = doc.createBuffer();
  const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buf);
  const col = doc.createAccessor().setType('VEC3').setArray(new Float32Array(colors)).setBuffer(buf);
  const prim = doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('COLOR_0', col);
  const mesh = doc.createMesh(name).addPrimitive(prim);
  doc.createScene().addChild(doc.createNode(name).setMesh(mesh));
  return { doc, targetTris };
}

async function finish({ doc, targetTris }, outFile) {
  await doc.transform(weld());
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const tris = prim.getIndices().getCount() / 3;
  if (targetTris && tris > targetTris) {
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: targetTris / tris, error: 0.004 }));
  }
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await io.write(outFile, doc);
  const after = doc.getRoot().listMeshes()[0].listPrimitives()[0].getIndices().getCount() / 3;
  return { tris, after, bytes: fs.statSync(outFile).size };
}

// ---- hulls ----
for (const [name, budget] of Object.entries(HULLS)) {
  const dir = path.join(shipsDir, name);
  const obj = readObj(path.join(dir, 'OBJ', `${name}.obj`));
  const texFile = fs.readdirSync(path.join(dir, 'Textures')).sort()[0];
  const png = readPng(path.join(dir, 'Textures', texFile));

  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const p of obj.v) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const len = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);

  const positions = [];
  const colors = [];
  for (const t of obj.tris) {
    for (const [vi, ti] of t) {
      const p = obj.v[vi];
      // Source noses point to -Z; flip so the nose is +Z (x mirrors to keep winding).
      positions.push(-(p[0] - c[0]) / len, (p[1] - c[1]) / len, -(p[2] - c[2]) / len);
      const uv = obj.vt[ti] ?? [0, 0];
      const s = sample(png, uv[0], uv[1]);
      colors.push(srgbToLinear(s[0]), srgbToLinear(s[1]), srgbToLinear(s[2]));
    }
  }
  const r = await finish(writeMesh(name, positions, colors, null, budget), path.join(OUT, 'hulls', `${name.toLowerCase()}.glb`));
  console.log(`hull ${name.padEnd(12)} ${r.tris} -> ${r.after} tris, ${r.bytes} B`);
}

/** Kenney craft used for the allied defence squadrons, normalised like the hulls (length 1, nose +Z). */
const ALLY_CRAFT = ['craft_speederA', 'craft_speederD', 'craft_racer'];

async function bakeKenney(name) {
  const src = await new NodeIO().read(path.join(kitDir, 'Models', 'GLTF format', `${name}.glb`));
  const positions = [];
  const colors = [];
  for (const node of src.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const base = prim.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1];
      const pa = prim.getAttribute('POSITION');
      const ia = prim.getIndices();
      const n = ia ? ia.getCount() : pa.getCount();
      const tmp = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        pa.getElement(ia ? ia.getScalar(i) : i, tmp);
        positions.push(
          m[0] * tmp[0] + m[4] * tmp[1] + m[8] * tmp[2] + m[12],
          m[1] * tmp[0] + m[5] * tmp[1] + m[9] * tmp[2] + m[13],
          m[2] * tmp[0] + m[6] * tmp[1] + m[10] * tmp[2] + m[14],
        );
        colors.push(base[0], base[1], base[2]);
      }
    }
  }
  return { positions, colors };
}

for (const name of ALLY_CRAFT) {
  const { positions, colors } = await bakeKenney(name);
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], positions[i + k]); max[k] = Math.max(max[k], positions[i + k]); }
  const len = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  for (let i = 0; i < positions.length; i += 3) {
    // Kenney craft face -Z; flip to +Z (mirror x to keep winding).
    positions[i] = -(positions[i] - (min[0] + max[0]) / 2) / len;
    positions[i + 1] = (positions[i + 1] - (min[1] + max[1]) / 2) / len;
    positions[i + 2] = -(positions[i + 2] - (min[2] + max[2]) / 2) / len;
  }
  const r = await finish(writeMesh(name, positions, colors, null, 600), path.join(OUT, 'allies', `${name}.glb`));
  console.log(`ally ${name.padEnd(24)} ${r.tris} -> ${r.after} tris, ${r.bytes} B`);
}

// ---- kit parts ----
for (const name of KIT_PARTS) {
  const src = await new NodeIO().read(path.join(kitDir, 'Models', 'GLTF format', `${name}.glb`));
  const positions = [];
  const colors = [];
  for (const node of src.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const base = prim.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1];
      const pa = prim.getAttribute('POSITION');
      const ia = prim.getIndices();
      const n = ia ? ia.getCount() : pa.getCount();
      const tmp = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        pa.getElement(ia ? ia.getScalar(i) : i, tmp);
        const x = m[0] * tmp[0] + m[4] * tmp[1] + m[8] * tmp[2] + m[12];
        const y = m[1] * tmp[0] + m[5] * tmp[1] + m[9] * tmp[2] + m[13];
        const z = m[2] * tmp[0] + m[6] * tmp[1] + m[10] * tmp[2] + m[14];
        positions.push(x, y, z);
        colors.push(base[0], base[1], base[2]);
      }
    }
  }
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], positions[i + k]); max[k] = Math.max(max[k], positions[i + k]); }
  }
  const h = max[1] - min[1] || 1;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] - (min[0] + max[0]) / 2) / h;
    positions[i + 1] = (positions[i + 1] - min[1]) / h;
    positions[i + 2] = (positions[i + 2] - (min[2] + max[2]) / 2) / h;
  }
  const r = await finish(writeMesh(name, positions, colors, null, 600), path.join(OUT, 'kit', `${name}.glb`));
  console.log(`kit  ${name.padEnd(24)} ${r.tris} -> ${r.after} tris, ${r.bytes} B`);
}
