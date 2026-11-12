import {
  AdditiveBlending,
  BackSide,
  ClampToEdgeWrapping,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NearestFilter,
  RepeatWrapping,
  RGBAFormat,
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
uniform sampler2D scorchMap;
uniform vec3 sunDir;
uniform float time;
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vLocalPos;
${NOISE_GLSL}
void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(cameraPosition - vWorldPos);
  float ndl = dot(n, sunDir);
  float day = smoothstep(-0.12, 0.25, ndl);
  vec3 albedo = texture2D(dayMap, vUv).rgb;
  vec3 lights = texture2D(nightMap, vUv).rgb;

  // Ocean glint: Blue Marble oceans are much bluer than they are red.
  float ocean = smoothstep(0.02, 0.12, albedo.b - albedo.r);
  vec3 lp = normalize(vLocalPos);
  // Wind-ruffled water: a little normal noise breaks the glint into a shimmering field.
  float ripple = vnoise(lp * 140.0 + time * 0.2) - 0.5;
  vec3 h = normalize(sunDir + v);
  // Never hand pow() a negative base: the ripple term can dip nh below zero, and GLSL leaves
  // that undefined (NaN on some GPUs, which the tone map then paints white).
  float nh = max(max(dot(n, h), 0.0) + ripple * 0.02 * ocean, 0.0);
  float fresW = pow(max(1.0 - max(dot(n, v), 0.0), 0.0), 5.0);
  float spec = (pow(nh, 90.0) * 0.9 + pow(nh, 14.0) * 0.08) * ocean * (0.6 + fresW * 2.0);
  // Deep water reads darker and bluer; land keeps a hint of relief from the albedo itself.
  vec3 base = mix(albedo, albedo * vec3(0.7, 0.85, 1.05), ocean * 0.6);
  float relief = (1.0 - ocean) * (vnoise(lp * 60.0) - 0.5) * 0.18;
  vec3 lit = base * (0.035 + 1.15 * max(ndl, 0.0)) * (1.0 + relief) + vec3(1.0, 0.9, 0.75) * spec * max(ndl, 0.0);
  // City lights: warm, only on the night side.
  // The night map carries a dim blue land tint with almost no red; city lights
  // are neutral grey, so the (linear) red channel isolates them.
  float glow = smoothstep(0.006, 0.11, lights.r);
  float twinkle = 0.85 + 0.15 * vnoise(lp * 300.0 + time * 0.7);
  vec3 night = vec3(1.0, 0.76, 0.4) * glow * 2.4 * twinkle + albedo * vec3(0.012, 0.016, 0.03);
  vec3 col = mix(night, lit, day);

  // Scars of the war: charred ground (R) and burning fires (G), stamped by impacts.
  float phi = atan(lp.z + 1e-6, -lp.x);
  if (phi < 0.0) phi += 6.2831853;
  vec2 suv = vec2(phi / 6.2831853, 1.0 - acos(clamp(lp.y, -1.0, 1.0)) / 3.1415927);
  vec4 sc = texture2D(scorchMap, suv);
  float grain = vnoise(lp * 220.0);
  float charV = smoothstep(0.04, 0.55, sc.r * (0.75 + grain * 0.5));
  col = mix(col, col * 0.1 + vec3(0.018, 0.012, 0.008), charV * 0.92);
  float heat = sc.g * (0.6 + grain * 0.7);
  float flick = 0.65 + 0.35 * sin(time * 9.0 + grain * 30.0);
  col += (vec3(3.2, 1.0, 0.25) * pow(max(heat, 0.0), 1.6) * flick * 1.5 + vec3(1.2, 0.22, 0.04) * heat * 0.5) * (1.0 - day * 0.35);

  // Scattering: blue rim on the lit limb, red-orange band at the terminator.
  float fres = pow(max(1.0 - max(dot(n, v), 0.0), 0.0), 3.0);
  // Aerial perspective: the limb hazes toward sky blue on the day side.
  col = mix(col, vec3(0.3, 0.55, 1.0) * (0.15 + 0.85 * day), fres * 0.55 * smoothstep(-0.2, 0.3, ndl));
  col += vec3(0.25, 0.5, 1.0) * fres * (0.1 + 0.6 * day);
  float term = smoothstep(-0.15, 0.05, ndl) * (1.0 - smoothstep(0.05, 0.35, ndl));
  col += vec3(0.9, 0.35, 0.12) * term * 0.06;

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

const SCORCH_W = 512;
const SCORCH_H = 256;

/**
 * Equirectangular burn map in the planet's own frame: impacts char the ground (R) and set
 * fires (G) that flicker and die down. Updated on the CPU at 15 Hz.
 */
export class ScorchMap {
  readonly data = new Uint8Array(SCORCH_W * SCORCH_H * 4);
  readonly texture = new DataTexture(this.data, SCORCH_W, SCORCH_H, RGBAFormat);
  private acc = 0;
  private hot = false;
  private dirty = false;

  constructor() {
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearFilter;
    this.texture.wrapS = RepeatWrapping;
    this.texture.wrapT = ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  reset(): void {
    this.data.fill(0);
    this.texture.needsUpdate = true;
    this.hot = false;
  }

  /** Burn a disc of `radius` (Earth radii) around unit-ish point (x,y,z). */
  stamp(x: number, y: number, z: number, radius: number, charAmt: number, heatAmt: number): void {
    const l = Math.hypot(x, y, z) || 1;
    const nx = x / l;
    const ny = y / l;
    const nz = z / l;
    let phi = Math.atan2(nz, -nx);
    if (phi < 0) phi += Math.PI * 2;
    const theta = Math.acos(Math.max(-1, Math.min(1, ny)));
    const cx = (phi / (Math.PI * 2)) * SCORCH_W;
    const cy = (1 - theta / Math.PI) * SCORCH_H;
    const ry = Math.max(1.2, (radius / Math.PI) * SCORCH_H);
    const rx = Math.min(SCORCH_W / 2, ry / Math.max(0.12, Math.sin(theta)));
    const d = this.data;
    for (let py = Math.floor(cy - ry); py <= Math.ceil(cy + ry); py++) {
      if (py < 0 || py >= SCORCH_H) continue;
      const fy = (py + 0.5 - cy) / ry;
      for (let px = Math.floor(cx - rx); px <= Math.ceil(cx + rx); px++) {
        const fx = (px + 0.5 - cx) / rx;
        const r2 = fx * fx + fy * fy;
        if (r2 >= 1) continue;
        // Ragged edge: a cheap hash keeps craters from looking stamped.
        const hsh = ((px * 73856093) ^ (py * 19349663)) & 1023;
        const f = (1 - r2) * (0.75 + (hsh / 1023) * 0.5);
        const o = ((py * SCORCH_W + (((px % SCORCH_W) + SCORCH_W) % SCORCH_W)) * 4) | 0;
        d[o] = Math.min(255, d[o] + charAmt * f * 255);
        d[o + 1] = Math.max(d[o + 1], Math.min(255, heatAmt * f * 255));
      }
    }
    if (heatAmt > 0) this.hot = true;
    this.dirty = true;
  }

  update(dt: number): void {
    this.acc += dt;
    if (this.acc < 1 / 15) {
      if (this.dirty) {
        this.texture.needsUpdate = true;
        this.dirty = false;
      }
      return;
    }
    this.acc = 0;
    if (this.hot) {
      // Fires burn down over about ten seconds.
      let any = false;
      const d = this.data;
      for (let o = 1; o < d.length; o += 4) {
        const v = d[o];
        if (v === 0) continue;
        d[o] = v > 3 ? v - Math.max(1, v >> 6) : 0;
        any = true;
      }
      this.hot = any;
      this.dirty = true;
    }
    if (this.dirty) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }
}

export class Earth {
  /** Everything fixed to the planet surface (cities, ground batteries) parents here. */
  readonly surface = new Group();
  readonly root = new Group();
  readonly sunDir = new Vector3(1, 0.28, 0.55).normalize();
  private clouds: Mesh;
  private cloudMat: ShaderMaterial;
  private earthMat: ShaderMaterial;
  readonly scorch = new ScorchMap();
  private maps: Texture[] = [];

  constructor(dayMap: Texture, nightMap: Texture) {
    this.maps = [dayMap, nightMap];
    for (const t of [dayMap, nightMap]) {
      t.colorSpace = SRGBColorSpace;
      t.magFilter = LinearFilter;
      t.minFilter = LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = 4;
      t.needsUpdate = true;
    }

    const geo = new SphereGeometry(1, 128, 80);
    const earthMat = new ShaderMaterial({
      uniforms: { dayMap: { value: dayMap }, nightMap: { value: nightMap }, scorchMap: { value: this.scorch.texture }, sunDir: { value: this.sunDir }, time: { value: 0 } },
      vertexShader: SURFACE_VERT,
      fragmentShader: EARTH_FRAG,
    });
    this.earthMat = earthMat;
    this.surface.add(new Mesh(geo, earthMat));

    this.cloudMat = new ShaderMaterial({
      uniforms: { sunDir: { value: this.sunDir }, time: { value: 0 } },
      vertexShader: SURFACE_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.clouds = new Mesh(new SphereGeometry(1.014, 96, 64), this.cloudMat);

    const atmo = new Mesh(
      new SphereGeometry(1.15, 96, 64),
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

  /** Retro: chunky nearest-neighbour texels; HD: smooth mipmapped filtering. */
  setRetro(on: boolean): void {
    for (const t of this.maps) {
      t.magFilter = on ? NearestFilter : LinearFilter;
      t.minFilter = on ? NearestFilter : LinearMipmapLinearFilter;
      t.generateMipmaps = !on;
      t.needsUpdate = true;
    }
  }

  update(dt: number, time: number): void {
    this.surface.rotation.y += EARTH_SPIN_RATE * dt;
    // Clouds drift slightly faster than the ground.
    this.clouds.rotation.y += EARTH_SPIN_RATE * 1.25 * dt;
    this.cloudMat.uniforms.time.value = time;
    this.earthMat.uniforms.time.value = time;
    this.scorch.update(dt);
  }
}
