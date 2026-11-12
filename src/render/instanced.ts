import {
  AdditiveBlending, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh,
  MeshBasicMaterial, ShaderMaterial,
} from 'three';
import { PS2, ps2Material } from './ps2Material';

const col = new Color();

/** Instanced mesh with an `instData` attribute for the PS2 material. */
export function psInstanced(geo: BufferGeometry, cap: number): { mesh: InstancedMesh; data: InstancedBufferAttribute } {
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
export function fresnel(geo: BufferGeometry, cap: number, power: number, strength: number): InstancedMesh {
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
        float rim = pow(max(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0), power);
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

export function additive(geo: BufferGeometry, cap: number, opacity = 1): InstancedMesh {
  const mesh = new InstancedMesh(geo, new MeshBasicMaterial({ blending: AdditiveBlending, depthWrite: false, transparent: true, opacity, side: DoubleSide }), cap);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.setColorAt(0, col.set(1, 1, 1));
  mesh.instanceColor!.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

