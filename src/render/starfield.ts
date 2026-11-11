import { BufferAttribute, BufferGeometry, Points, ShaderMaterial } from 'three';
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
