import {
  NormalBlending,
  AdditiveBlending, BufferGeometry, DynamicDrawUsage, Float32BufferAttribute, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, Object3D, ShaderMaterial,
} from 'three';

/** Sprite looks, shared by transient and persistent layers. */
export const SP_FLASH = 0; // soft radial glow with a hot core
export const SP_RING = 1; // expanding shockwave annulus
export const SP_STAR = 2; // four-point lens star
export const SP_EMBER = 3; // small soft dot
export const SP_PORTAL = 4; // swirling warp portal
export const SP_SMOKE = 5; // soft billowing smoke (smoke layers only)
export const SP_SPARK = 6; // stretched hot streak

/** Minimum ribbon width per unit of depth: about 2.5 internal pixels at the current resolution. */
export const RIBBON_PX = { value: 0.004 };

const SHAPES = /* glsl */ `
float shapeRaw(float kind, vec2 uv, float t, float r) {
  if (kind < 0.5) {
    return exp(-r * r * 12.0) * 0.9 + exp(-r * r * 60.0) * 1.6;
  } else if (kind < 1.5) {
    float w = mix(0.07, 0.015, t);
    return smoothstep(w, 0.0, abs(r - 0.42)) * 1.3 + exp(-r * r * 12.0) * 0.25 * (1.0 - t);
  } else if (kind < 2.5) {
    float s = exp(-abs(uv.x) * 40.0) * exp(-abs(uv.y) * 3.0) + exp(-abs(uv.y) * 40.0) * exp(-abs(uv.x) * 3.0);
    return s * 1.4 + exp(-r * r * 30.0) * 1.5;
  } else if (kind < 3.5) {
    return exp(-r * r * 22.0) * 1.4;
  } else if (kind > 5.5) {
    return exp(-uv.y * uv.y * 220.0) * exp(-uv.x * uv.x * 5.0) * 1.6;
  } else if (kind > 4.5) {
    float n = sin(uv.x * 9.0 + t * 3.0) * sin(uv.y * 8.0 - t * 2.0) * 0.18 + sin((uv.x + uv.y) * 17.0) * 0.08;
    return smoothstep(0.5, 0.05, r + n * 0.6);
  } else {
    float a = atan(uv.y, uv.x);
    float swirl = 0.5 + 0.5 * sin(a * 5.0 + r * 18.0 - t * 20.0);
    float disc = smoothstep(0.5, 0.2, r);
    return disc * (0.35 + swirl * 0.9) * smoothstep(0.0, 0.12, r) + smoothstep(0.06, 0.0, abs(r - 0.42)) * 1.2;
  }
}
float shape(float kind, vec2 uv, float t) {
  float r = length(uv);
  // Every shape fades to nothing before the quad edge, so no sprite ever shows a hard border.
  float edge = (kind > 0.5 && kind < 1.5) || (kind > 3.5 && kind < 4.5) ? smoothstep(0.5, 0.47, r) : smoothstep(0.5, 0.36, kind > 1.5 && kind < 2.5 ? max(abs(uv.x), abs(uv.y)) : r);
  return shapeRaw(kind, uv, t, r) * edge;
}`;

/** Unit quad (-0.5..0.5) shared by every billboard/ribbon geometry. */
function fillQuad(g: BufferGeometry): void {
  g.setAttribute('position', new Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
}

/**
 * Fire-and-forget animated billboards. The CPU writes each sprite once (centre, colour,
 * size from/to, birth, life, kind); growth and fade run entirely in the vertex shader.
 */
export class SpriteFx {
  private readonly cap: number;
  private center: InstancedBufferAttribute;
  private color: InstancedBufferAttribute;
  private anim: InstancedBufferAttribute;
  private next = 0;
  private dirtyFrom = Infinity;
  private dirtyTo = 0;
  private mat: ShaderMaterial;
  readonly mesh: Mesh;
  now = 0;

  constructor(parent: Object3D, cap = 6000, smoke = false) {
    this.cap = cap;
    const g = new InstancedBufferGeometry();
    fillQuad(g);
    g.instanceCount = cap;
    this.center = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.color = new InstancedBufferAttribute(new Float32Array(cap * 4), 4); // rgb, kind
    this.anim = new InstancedBufferAttribute(new Float32Array(cap * 4).fill(-1000), 4); // size0, size1, birth, life
    for (const a of [this.center, this.color, this.anim]) a.setUsage(DynamicDrawUsage);
    g.setAttribute('center', this.center);
    g.setAttribute('pcolor', this.color);
    g.setAttribute('anim', this.anim);
    this.mat = new ShaderMaterial({
      uniforms: { now: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec3 center; attribute vec4 pcolor; attribute vec4 anim;
        uniform float now;
        varying vec2 vUv; varying vec3 vColor; varying float vKind; varying float vT; varying float vFade;
        void main() {
          float t = (now - anim.z) / anim.w;
          if (t < 0.0 || t > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          float e = 1.0 - pow(1.0 - t, 3.0);
          float size = mix(anim.x, anim.y, e);
          vec4 mv = modelViewMatrix * vec4(center, 1.0);
          mv.xy += position.xy * size;
          gl_Position = projectionMatrix * mv;
          vUv = position.xy;
          vKind = pcolor.w;
          vT = t;
          float fade = pcolor.w > 0.5 && pcolor.w < 1.5 ? 1.0 - t : pcolor.w > 4.5 && pcolor.w < 5.5 ? (1.0 - t) * smoothstep(0.0, 0.12, t) : (1.0 - t) * (1.0 - t);
          vColor = pcolor.rgb * (SMOKE ? 1.0 : fade);
          vFade = fade;
          // Smoke puffs turn slowly; everything else stays upright.
          if (SMOKE) {
            float a = anim.z * 7.0 + t * 0.6;
            vUv = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
          }
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vColor; varying float vKind; varying float vT; varying float vFade;
        ${SHAPES}
        void main() {
          float s = shape(vKind, vUv, vT);
          gl_FragColor = SMOKE ? vec4(vColor, s * vFade * 0.75) : vec4(vColor * s, 1.0);
        }`,
      defines: { SMOKE: smoke ? 'true' : 'false' },
      blending: smoke ? NormalBlending : AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = smoke ? 8 : 10;
    parent.add(this.mesh);
  }

  spawn(kind: number, x: number, y: number, z: number, size0: number, size1: number, life: number, r: number, g: number, b: number, delay = 0): void {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    if (i < this.dirtyFrom) this.dirtyFrom = i;
    if (i + 1 > this.dirtyTo) this.dirtyTo = i + 1;
    this.center.setXYZ(i, x, y, z);
    this.color.setXYZW(i, r, g, b, kind);
    this.anim.setXYZW(i, size0, size1, this.now + delay, life);
  }

  update(dt: number): void {
    this.now += dt;
    this.mat.uniforms.now.value = this.now;
    if (this.dirtyTo > this.dirtyFrom) {
      for (const a of [this.center, this.color, this.anim]) {
        a.clearUpdateRanges();
        a.addUpdateRange(this.dirtyFrom * a.itemSize, (this.dirtyTo - this.dirtyFrom) * a.itemSize);
        a.needsUpdate = true;
      }
      this.dirtyFrom = Infinity;
      this.dirtyTo = 0;
    }
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/** Billboards rewritten every frame (engine glows, XP motes). */
export class SpriteLayer {
  private center: InstancedBufferAttribute;
  private color: InstancedBufferAttribute;
  private geo: InstancedBufferGeometry;
  readonly mesh: Mesh;
  private n = 0;

  constructor(parent: Object3D, private cap: number) {
    const g = new InstancedBufferGeometry();
    fillQuad(g);
    this.center = new InstancedBufferAttribute(new Float32Array(cap * 4), 4); // xyz, size
    this.color = new InstancedBufferAttribute(new Float32Array(cap * 4), 4); // rgb, kind
    this.center.setUsage(DynamicDrawUsage);
    this.color.setUsage(DynamicDrawUsage);
    g.setAttribute('center', this.center);
    g.setAttribute('pcolor', this.color);
    g.instanceCount = 0;
    this.geo = g;
    const mat = new ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec4 center; attribute vec4 pcolor;
        varying vec2 vUv; varying vec3 vColor; varying float vKind;
        void main() {
          vec4 mv = modelViewMatrix * vec4(center.xyz, 1.0);
          mv.xy += position.xy * center.w;
          gl_Position = projectionMatrix * mv;
          vUv = position.xy; vColor = pcolor.rgb; vKind = pcolor.w;
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vColor; varying float vKind;
        ${SHAPES}
        void main() { gl_FragColor = vec4(vColor * shape(vKind, vUv, 0.5), 1.0); }`,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    parent.add(this.mesh);
  }

  begin(): void {
    this.n = 0;
  }

  push(x: number, y: number, z: number, size: number, r: number, g: number, b: number, kind: number): void {
    if (this.n >= this.cap) return;
    this.center.setXYZW(this.n, x, y, z, size);
    this.color.setXYZW(this.n, r, g, b, kind);
    this.n++;
  }

  end(): void {
    this.geo.instanceCount = this.n;
    this.center.clearUpdateRanges();
    this.center.addUpdateRange(0, this.n * 4);
    this.center.needsUpdate = true;
    this.color.clearUpdateRanges();
    this.color.addUpdateRange(0, this.n * 4);
    this.color.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
  }
}

const RIBBON_VERT = /* glsl */ `
attribute vec3 pa; attribute vec3 pb; attribute vec4 rcolor; attribute vec4 ranim; // width, birth, life, jitter
uniform float now; uniform float persistent; uniform float pxScale;
varying vec2 vUv; varying vec3 vColor;
void main() {
  float t = persistent > 0.5 ? 0.0 : (now - ranim.y) / ranim.z;
  if (t < 0.0 || t > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 a = modelViewMatrix * vec4(pa, 1.0);
  vec4 b = modelViewMatrix * vec4(pb, 1.0);
  // Screen-facing ribbon: widen perpendicular to the segment as seen from the camera.
  vec3 d = b.xyz - a.xyz;
  vec3 side = normalize(cross(d, normalize(a.xyz + b.xyz)));
  vec4 p = mix(a, b, position.x + 0.5);
  // Never thinner than ~2.5 internal pixels, whatever the zoom (1 px ~ 0.0016 * depth at 480 lines).
  float w = max(ranim.x, -p.z * pxScale) * (persistent > 0.5 ? 1.0 : (1.0 - t * 0.6));
  p.xyz += side * position.y * w;
  gl_Position = projectionMatrix * p;
  vUv = vec2(position.x + 0.5, position.y * 2.0);
  float fade = persistent > 0.5 ? 1.0 : (1.0 - t);
  // Tracers fade toward their tail.
  vColor = rcolor.rgb * fade * (persistent > 0.5 ? mix(0.15, 1.0, vUv.x) : 1.0);
}`;

const RIBBON_FRAG = /* glsl */ `
varying vec2 vUv; varying vec3 vColor;
void main() {
  float v = abs(vUv.y);
  float core = exp(-v * v * 30.0) * 1.6;
  float glow = exp(-v * v * 4.0) * 0.6;
  gl_FragColor = vec4(vColor * (core + glow), 1.0);
}`;

/**
 * Thick, glowing segments that always face the camera: beams, lightning, bombardment,
 * and (persistent mode) projectile tracers. Replaces 1-pixel GL lines.
 */
export class RibbonLayer {
  private pa: InstancedBufferAttribute;
  private pb: InstancedBufferAttribute;
  private col: InstancedBufferAttribute;
  private anim: InstancedBufferAttribute;
  private geo: InstancedBufferGeometry;
  private mat: ShaderMaterial;
  readonly mesh: Mesh;
  private next = 0;
  private n = 0;
  private dirtyFrom = Infinity;
  private dirtyTo = 0;
  now = 0;

  constructor(parent: Object3D, private cap: number, private persistent: boolean) {
    const g = new InstancedBufferGeometry();
    fillQuad(g);
    this.pa = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.pb = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.col = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.anim = new InstancedBufferAttribute(new Float32Array(cap * 4).fill(-1000), 4);
    for (const a of [this.pa, this.pb, this.col, this.anim]) a.setUsage(DynamicDrawUsage);
    g.setAttribute('pa', this.pa);
    g.setAttribute('pb', this.pb);
    g.setAttribute('rcolor', this.col);
    g.setAttribute('ranim', this.anim);
    g.instanceCount = persistent ? 0 : cap;
    this.geo = g;
    this.mat = new ShaderMaterial({
      uniforms: { now: { value: 0 }, persistent: { value: persistent ? 1 : 0 }, pxScale: RIBBON_PX },
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    parent.add(this.mesh);
  }

  /** Transient: add a fading segment. */
  add(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, width: number, life: number, r: number, g: number, b: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    if (i < this.dirtyFrom) this.dirtyFrom = i;
    if (i + 1 > this.dirtyTo) this.dirtyTo = i + 1;
    this.write(i, x1, y1, z1, x2, y2, z2, width, r, g, b);
    this.anim.setXYZW(i, width, this.now, life, 0);
  }

  /** Persistent: rewrite all segments each frame between begin/end. */
  begin(): void {
    this.n = 0;
  }

  push(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, width: number, r: number, g: number, b: number): void {
    if (this.n >= this.cap) return;
    this.write(this.n, x1, y1, z1, x2, y2, z2, width, r, g, b);
    this.anim.setXYZW(this.n, width, 0, 1, 0);
    this.n++;
  }

  private write(i: number, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, _w: number, r: number, g: number, b: number): void {
    this.pa.setXYZ(i, x1, y1, z1);
    this.pb.setXYZ(i, x2, y2, z2);
    this.col.setXYZW(i, r, g, b, 0);
  }

  update(dt: number): void {
    this.now += dt;
    this.mat.uniforms.now.value = this.now;
    if (this.persistent) {
      this.geo.instanceCount = this.n;
      for (const a of [this.pa, this.pb, this.col, this.anim]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, this.n * a.itemSize);
        a.needsUpdate = true;
      }
    } else if (this.dirtyTo > this.dirtyFrom) {
      for (const a of [this.pa, this.pb, this.col, this.anim]) {
        a.clearUpdateRanges();
        a.addUpdateRange(this.dirtyFrom * a.itemSize, (this.dirtyTo - this.dirtyFrom) * a.itemSize);
        a.needsUpdate = true;
      }
      this.dirtyFrom = Infinity;
      this.dirtyTo = 0;
    }
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
