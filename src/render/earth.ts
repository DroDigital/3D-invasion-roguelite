import {
  AdditiveBlending,
  BackSide,
  Group,
  Mesh,
  NearestFilter,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Vector3,
} from 'three';

const NOISE_GLSL = /* glsl */ `
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return s;
}`;

const SURFACE_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vLocalPos;
void main() {
  vUv = uv;
  vLocalPos = position;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const EARTH_FRAG = /* glsl */ `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform vec3 sunDir;
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(cameraPosition - vWorldPos);
  float ndl = dot(n, sunDir);
  float day = smoothstep(-0.12, 0.25, ndl);
  vec3 albedo = texture2D(dayMap, vUv).rgb;
  vec3 lights = texture2D(nightMap, vUv).rgb;

  // Ocean glint: Blue Marble oceans are much bluer than they are red.
  float ocean = smoothstep(0.02, 0.12, albedo.b - albedo.r);
  vec3 h = normalize(sunDir + v);
  float spec = pow(max(dot(n, h), 0.0), 48.0) * ocean * 0.55;

  vec3 lit = albedo * (0.04 + 1.15 * max(ndl, 0.0)) + vec3(1.0, 0.92, 0.8) * spec;
  // City lights: warm, only on the night side.
  // The night map carries a dim blue land tint with almost no red; city lights
  // are neutral grey, so the (linear) red channel isolates them.
  float glow = smoothstep(0.006, 0.11, lights.r);
  vec3 night = vec3(1.0, 0.78, 0.42) * glow * 2.4 + albedo * vec3(0.012, 0.016, 0.03);
  vec3 col = mix(night, lit, day);

  // Scattering: blue rim on the lit limb, red-orange band at the terminator.
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += vec3(0.25, 0.5, 1.0) * fres * (0.15 + 0.85 * day);
  float term = smoothstep(-0.15, 0.05, ndl) * (1.0 - smoothstep(0.05, 0.35, ndl));
  col += vec3(0.9, 0.35, 0.12) * term * 0.05;

  gl_FragColor = vec4(col, 1.0);
}`;

const CLOUD_FRAG = /* glsl */ `
uniform vec3 sunDir;
uniform float time;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;
${NOISE_GLSL}
void main() {
  vec3 p = normalize(vLocalPos);
  // Stretch along latitude bands so the cover reads as weather systems.
  vec3 q = vec3(p.x, p.y * 1.9, p.z) * 3.2;
  float warp = fbm(q * 0.6 + time * 0.004);
  float d = fbm(q + warp * 1.6 + vec3(0.0, time * 0.002, 0.0));
  float a = smoothstep(0.5, 0.72, d);
  float ndl = dot(normalize(vWorldNormal), sunDir);
  float day = smoothstep(-0.15, 0.3, ndl);
  vec3 col = vec3(1.0) * (0.03 + 1.05 * max(ndl, 0.0));
  gl_FragColor = vec4(col, a * (0.12 + 0.78 * day));
}`;

const ATMO_VERT = /* glsl */ `
varying vec3 vViewNormal;
varying vec3 vViewDir;
varying vec3 vWorldNormal;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewNormal = normalize(normalMatrix * normal);
  vViewDir = normalize(-mv.xyz);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * mv;
}`;

const ATMO_FRAG = /* glsl */ `
uniform vec3 sunDir;
varying vec3 vViewNormal;
varying vec3 vViewDir;
varying vec3 vWorldNormal;
void main() {
  // Back faces of the shell: 0 at the shell silhouette, ~0.49 at the planet limb.
  float d = clamp(-dot(normalize(vViewNormal), normalize(vViewDir)) / 0.49, 0.0, 1.0);
  float glow = pow(d, 2.6);
  float sun = dot(normalize(vWorldNormal), sunDir);
  float lit = 0.03 + 0.97 * smoothstep(-0.3, 0.45, sun);
  // Sunset tint only in a narrow band around the terminator.
  float dusk = smoothstep(-0.3, -0.05, sun) * (1.0 - smoothstep(-0.05, 0.3, sun));
  vec3 col = mix(vec3(0.3, 0.6, 1.0), vec3(1.0, 0.5, 0.25), dusk * 0.7);
  gl_FragColor = vec4(col * glow * lit * 1.1, 1.0);
}`;

export const EARTH_SPIN_RATE = 0.02; // rad/s, one turn in about five minutes

export class Earth {
  /** Everything fixed to the planet surface (cities, ground batteries) parents here. */
  readonly surface = new Group();
  readonly root = new Group();
  readonly sunDir = new Vector3(1, 0.28, 0.55).normalize();
  private clouds: Mesh;
  private cloudMat: ShaderMaterial;

  constructor(dayMap: Texture, nightMap: Texture) {
    for (const t of [dayMap, nightMap]) {
      t.colorSpace = SRGBColorSpace;
      t.magFilter = NearestFilter;
      t.minFilter = NearestFilter;
      t.generateMipmaps = false;
    }

    // Deliberately coarse sphere: the silhouette should read as low-poly.
    const geo = new SphereGeometry(1, 40, 28);
    const earthMat = new ShaderMaterial({
      uniforms: { dayMap: { value: dayMap }, nightMap: { value: nightMap }, sunDir: { value: this.sunDir } },
      vertexShader: SURFACE_VERT,
      fragmentShader: EARTH_FRAG,
    });
    this.surface.add(new Mesh(geo, earthMat));

    this.cloudMat = new ShaderMaterial({
      uniforms: { sunDir: { value: this.sunDir }, time: { value: 0 } },
      vertexShader: SURFACE_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.clouds = new Mesh(new SphereGeometry(1.014, 40, 28), this.cloudMat);

    const atmo = new Mesh(
      new SphereGeometry(1.15, 40, 28),
      new ShaderMaterial({
        uniforms: { sunDir: { value: this.sunDir } },
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        side: BackSide,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );

    this.root.add(this.surface, this.clouds, atmo);
  }

  update(dt: number, time: number): void {
    this.surface.rotation.y += EARTH_SPIN_RATE * dt;
    // Clouds drift slightly faster than the ground.
    this.clouds.rotation.y += EARTH_SPIN_RATE * 1.25 * dt;
    this.cloudMat.uniforms.time.value = time;
  }
}
