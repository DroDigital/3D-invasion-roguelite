import { AdditiveBlending, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';

export const SUN_DISTANCE = 300;

/**
 * The sun: a camera-facing HDR billboard (disc, corona, slow rays) placed along the
 * lighting direction. Additive with depth test, so Earth occludes it and bloom does the rest.
 */
export function createSun(dir: Vector3): Mesh {
  const mat = new ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xy += position.xy;
        gl_Position = projectionMatrix * mv;
        vUv = position.xy / 60.0;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      varying vec2 vUv;
      void main() {
        float r = length(vUv);
        float a = atan(vUv.y + 1e-6, vUv.x + 1e-6);
        float disc = smoothstep(0.075, 0.065, r) * 9.0;
        float corona = exp(-r * 9.0) * 2.6 + exp(-r * 28.0) * 4.0;
        float rays = pow(0.5 + 0.5 * sin(a * 12.0 + sin(a * 5.0 + time * 0.3) * 1.5), 6.0) * exp(-r * 5.0) * 1.4;
        vec3 col = vec3(1.0, 0.86, 0.62) * (corona + rays) + vec3(1.0, 0.97, 0.9) * disc;
        gl_FragColor = vec4(col * smoothstep(0.5, 0.3, r), 1.0);
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const sun = new Mesh(new PlaneGeometry(60, 60), mat);
  sun.position.copy(dir).multiplyScalar(SUN_DISTANCE);
  sun.frustumCulled = false;
  sun.renderOrder = -900;
  sun.onBeforeRender = () => {
    mat.uniforms.time.value = performance.now() / 1000;
  };
  return sun;
}

const v = new Vector3();
const toSun = new Vector3();

/**
 * Where the sun is on screen (uv) and how visible it is: 0 when behind Earth or off screen,
 * fading through the atmosphere. Drives the lens flare in the composite pass.
 */
export function sunScreen(dir: Vector3, camera: import('three').PerspectiveCamera, out: { x: number; y: number; vis: number }): void {
  v.copy(dir).multiplyScalar(SUN_DISTANCE).project(camera);
  out.x = v.x * 0.5 + 0.5;
  out.y = v.y * 0.5 + 0.5;
  const onScreen = v.z < 1 && Math.abs(v.x) < 1.25 && Math.abs(v.y) < 1.25;
  if (!onScreen) {
    out.vis = 0;
    return;
  }
  // Closest approach of the camera->sun ray to Earth's centre.
  const o = camera.position;
  toSun.copy(dir).normalize();
  const b = o.dot(toSun);
  const closest = b > 0 ? Math.sqrt(Math.max(0, o.lengthSq() - b * b)) : o.length();
  const edge = Math.min(1, Math.max(0, (closest - 0.98) / 0.12));
  out.vis = edge * Math.min(1, (1.25 - Math.max(Math.abs(v.x), Math.abs(v.y))) * 3);
}
