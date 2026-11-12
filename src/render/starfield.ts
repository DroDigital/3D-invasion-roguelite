import { BackSide, BufferAttribute, BufferGeometry, Mesh, Points, ShaderMaterial, SphereGeometry } from 'three';
import type { Rng } from '../core/rng';

/** Seeded point starfield on a far shell. Drawn first, never depth-tested. */
export function createStarfield(rng: Rng, count = 2600, radius = 400): Points {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // Uniform on the sphere, with extra density near a tilted "galactic" band.
    let x = 0, y = 0, z = 0;
    for (let tries = 0; tries < 4; tries++) {
      const u = rng.range(-1, 1);
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(1 - u * u);
      x = r * Math.cos(a); y = u; z = r * Math.sin(a);
      const band = Math.abs(y * 0.85 + x * 0.5);
      if (rng.next() > band * 0.9) break;
    }
    pos[i * 3] = x * radius;
    pos[i * 3 + 1] = y * radius;
    pos[i * 3 + 2] = z * radius;

    const mag = Math.pow(rng.next(), 5); // most stars are faint
    const b = 0.25 + 0.75 * mag;
    const tint = rng.next();
    col[i * 3] = b * (tint < 0.2 ? 1.0 : tint > 0.8 ? 0.7 : 0.95);
    col[i * 3 + 1] = b * (tint < 0.2 ? 0.8 : tint > 0.8 ? 0.82 : 0.95);
    col[i * 3 + 2] = b * (tint < 0.2 ? 0.65 : 1.0);
    size[i] = mag > 0.5 ? 2 : 1;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setAttribute('size', new BufferAttribute(size, 1));

  const mat = new ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      void main() {
        vColor = color;
        // Rotation only: stars stay at infinity regardless of zoom.
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = p.xyww;
        gl_PointSize = size;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() { gl_FragColor = vec4(vColor, 1.0); }`,
    depthTest: false,
    depthWrite: false,
  });
  const pts = new Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -1000;
  return pts;
}

/** Faint procedural nebula behind the stars: two colour layers of 3D fbm on the view direction. */
export function createNebula(): Mesh {
  const mat = new ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x) {
        vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float band = exp(-pow(d.y * 0.85 + d.x * 0.5, 2.0) * 6.0);
        float n1 = fbm(d * 2.2 + 4.0);
        float n2 = fbm(d * 4.5 - 7.0);
        vec3 c = vec3(0.10, 0.04, 0.16) * smoothstep(0.42, 0.85, n1) + vec3(0.02, 0.09, 0.12) * smoothstep(0.45, 0.9, n2);
        c *= 0.35 + band * 1.1;
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: BackSide,
    depthTest: false,
    depthWrite: false,
  });
  const m = new Mesh(new SphereGeometry(450, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -1001;
  return m;
}
