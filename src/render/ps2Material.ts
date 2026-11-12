import { Color, NearestFilter, RepeatWrapping, ShaderMaterial, Texture, Vector2, Vector3 } from 'three';

/** Shared uniforms: every PS2 material reads the same objects, so one update covers all. */
export const PS2 = {
  sunView: { value: new Vector3(1, 0.3, 0.5).normalize() },
  sunColor: { value: new Color(1.15, 1.1, 1.0) },
  ambient: { value: new Color(0.26, 0.28, 0.38) },
  /** Snap grid in pixels (internal resolution); 0 disables snapping. */
  snapRes: { value: new Vector2(0, 0) },
  affine: { value: 1 },
  detail: { value: null as Texture | null },
  time: { value: 0 },
  /** Species gradient maps (dark, light), indexed by instance data.x. */
  palDark: { value: Array.from({ length: 6 }, () => new Vector3()) },
  palLight: { value: Array.from({ length: 6 }, () => new Vector3()) },
};

export function setDetailTexture(t: Texture): void {
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = RepeatWrapping;
  PS2.detail.value = t;
}

const VERT = /* glsl */ `
attribute vec4 instData; // x: palette index (-1 none), y: flash, z: cloak, w: emissive
uniform vec3 sunView;
uniform vec3 sunColor;
uniform vec3 ambient;
uniform vec2 snapRes;
uniform float affine;
uniform vec3 palDark[6];
uniform vec3 palLight[6];
varying vec3 vCol;
varying vec3 vLight;
varying vec3 vUvW;   // detail uv * w, w (affine path)
varying vec2 vUvP;   // perspective-correct uv
varying vec4 vData;
varying float vGlow;
void main() {
  vec3 base = color;
  // Vertex colours above 1.5 mark self-lit parts (lenses, coils, engines).
  vGlow = step(1.5, max(max(base.r, base.g), base.b));
  #ifdef USE_INSTANCING
    mat4 im = instanceMatrix;
  #else
    mat4 im = mat4(1.0);
  #endif
  // Species palette: gradient map by luminance, keeping a little of the source hue.
  if (instData.x >= 0.0) {
    int p = int(instData.x + 0.5);
    float l = dot(base, vec3(0.3, 0.55, 0.15));
    vec3 g = mix(palDark[p], palLight[p], clamp(l * 1.6, 0.0, 1.0));
    base = mix(g, base * g * 2.0, 0.25);
  }
  #ifdef USE_INSTANCING_COLOR
    base *= instanceColor;
  #endif
  vCol = base;

  vec4 world = modelMatrix * im * vec4(position, 1.0);
  vec4 mv = viewMatrix * world;
  vec3 n = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(im) * normal);
  // Per-vertex lighting, the PS2 way.
  float ndl = max(dot(n, sunView), 0.0);
  float rim = pow(max(1.0 - max(dot(n, normalize(-mv.xyz)), 0.0), 0.0), 3.0) * 0.35;
  vLight = ambient + sunColor * ndl + vec3(0.25, 0.35, 0.6) * rim;
  vData = instData;

  vec4 clip = projectionMatrix * mv;
  if (snapRes.x > 0.0) {
    vec2 ndc = clip.xy / clip.w;
    ndc = floor(ndc * snapRes * 0.5 + 0.5) / (snapRes * 0.5);
    clip.xy = ndc * clip.w;
  }
  gl_Position = clip;
  vec2 uv = position.xz * 3.0 + position.y * 1.7;
  vUvP = uv;
  vUvW = vec3(uv * clip.w, clip.w);
}`;

const FRAG = /* glsl */ `
uniform sampler2D detail;
uniform float affine;
uniform float time;
varying vec3 vCol;
varying vec3 vLight;
varying vec3 vUvW;
varying vec2 vUvP;
varying vec4 vData;
varying float vGlow;
void main() {
  // Affine mapping: divide by w per pixel of a w-weighted interpolant -> classic PS1/PS2 warp.
  vec2 uv = affine > 0.5 ? vUvW.xy / vUvW.z : vUvP;
  float d = texture2D(detail, uv).r;
  vec3 col = vCol * vLight * (0.6 + 0.45 * d);
  col = mix(col, vCol, vGlow);                 // self-lit parts ignore lighting
  col += vCol * vData.w;                       // per-instance emissive boost
  col = mix(col, vec3(4.0), clamp(vData.y, 0.0, 1.0));   // hit flash
  float a = 1.0;
  if (vData.z > 0.0) {
    // Cloak: shimmering, mostly transparent dither.
    float n = fract(sin(dot(gl_FragCoord.xy + time * 60.0, vec2(12.9898, 78.233))) * 43758.5453);
    if (n < vData.z * 0.85) discard;
    col = mix(col, vec3(0.4, 0.7, 1.0), vData.z * 0.6);
  }
  gl_FragColor = vec4(col, a);
}`;

/** Vertex-lit, optionally snapped and affine-warped material for vertex-coloured instanced meshes. */
export function ps2Material(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: PS2,
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: true,
  });
}
