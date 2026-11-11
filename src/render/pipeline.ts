import {
  Camera, HalfFloatType, LinearFilter, Mesh, NearestFilter, OrthographicCamera, PlaneGeometry, Scene,
  ShaderMaterial, Texture, Vector2, WebGLRenderer, WebGLRenderTarget,
} from 'three';

/** Internal vertical resolution; width follows the window aspect. */
export const INTERNAL_HEIGHT = 480;

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export interface PostSettings {
  bloom: boolean;
  dither: boolean;
  crt: boolean;
}

/**
 * Scene -> low-res HDR target -> bloom (bright pass + 2-level separable blur)
 * -> composite with tone map, optional colour quantise + 4x4 ordered dither at internal res
 * -> nearest upscale to the screen with an optional CRT/scanline pass.
 */
export class Pipeline {
  readonly renderer: WebGLRenderer;
  private sceneRT: WebGLRenderTarget;
  private compRT: WebGLRenderTarget;
  private bloomA: WebGLRenderTarget[] = [];
  private bloomB: WebGLRenderTarget[] = [];
  private quadScene = new Scene();
  private quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: Mesh;
  private brightMat: ShaderMaterial;
  private blurMat: ShaderMaterial;
  private compMat: ShaderMaterial;
  private outMat: ShaderMaterial;
  width = 640;
  height = INTERNAL_HEIGHT;
  settings: PostSettings = { bloom: true, dither: true, crt: true };
  /** Full-screen white flash amount (abilities, evolutions). */
  flash = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000004, 1);
    const rt = (w: number, h: number, filter: typeof NearestFilter | typeof LinearFilter, depth: boolean): WebGLRenderTarget =>
      new WebGLRenderTarget(w, h, { type: HalfFloatType, magFilter: filter, minFilter: filter, depthBuffer: depth });
    this.sceneRT = rt(this.width, this.height, NearestFilter, true);
    this.compRT = rt(this.width, this.height, NearestFilter, false);
    for (let k = 0; k < 2; k++) {
      this.bloomA.push(rt(8, 8, LinearFilter, false));
      this.bloomB.push(rt(8, 8, LinearFilter, false));
    }
    this.brightMat = new ShaderMaterial({
      uniforms: { tMap: { value: null }, threshold: { value: 1.0 } },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap; uniform float threshold; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tMap, vUv).rgb;
          float l = max(max(c.r, c.g), c.b);
          gl_FragColor = vec4(c * smoothstep(threshold, threshold + 0.6, l), 1.0);
        }`,
    });
    this.blurMat = new ShaderMaterial({
      uniforms: { tMap: { value: null }, dir: { value: new Vector2() } },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap; uniform vec2 dir; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tMap, vUv).rgb * 0.227;
          c += (texture2D(tMap, vUv + dir * 1.385).rgb + texture2D(tMap, vUv - dir * 1.385).rgb) * 0.316;
          c += (texture2D(tMap, vUv + dir * 3.231).rgb + texture2D(tMap, vUv - dir * 3.231).rgb) * 0.070;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.compMat = new ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tBloom0: { value: null }, tBloom1: { value: null },
        bloom: { value: 1 }, dither: { value: 1 }, res: { value: new Vector2() }, flash: { value: 0 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene, tBloom0, tBloom1;
        uniform float bloom, dither, flash;
        uniform vec2 res;
        varying vec2 vUv;
        float bayer(vec2 p) {
          ivec2 i = ivec2(mod(p, 4.0));
          int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
          return (float(m[i.y * 4 + i.x]) + 0.5) / 16.0;
        }
        void main() {
          vec3 c = texture2D(tScene, vUv).rgb;
          if (bloom > 0.5) c += texture2D(tBloom0, vUv).rgb * 0.55 + texture2D(tBloom1, vUv).rgb * 0.45;
          c = mix(c, vec3(1.6), flash);
          // Soft-knee tone map so HDR beams and engines roll off instead of clipping hard.
          c = c / (1.0 + max(c - 1.0, 0.0) * 0.6);
          c = min(c, vec3(1.0));
          if (dither > 0.5) {
            // Quantise to 5 bits per channel in sRGB-ish space with ordered dither: PS2 framebuffer look.
            vec3 g = pow(c, vec3(1.0 / 2.2));
            float levels = 31.0;
            g = floor(g * levels + bayer(vUv * res)) / levels;
            c = pow(clamp(g, 0.0, 1.0), vec3(2.2));
          }
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.outMat = new ShaderMaterial({
      uniforms: { tMap: { value: null }, crt: { value: 1 }, res: { value: new Vector2() }, outRes: { value: new Vector2() } },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap; uniform float crt; uniform vec2 res; uniform vec2 outRes;
        varying vec2 vUv;
        void main() {
          vec3 c;
          if (crt > 0.5) {
            // Slight RGB fringing, scanline per internal line, aperture-grille columns, vignette.
            float px = 1.0 / res.x;
            c.r = texture2D(tMap, vUv + vec2(px * 0.35, 0.0)).r;
            c.g = texture2D(tMap, vUv).g;
            c.b = texture2D(tMap, vUv - vec2(px * 0.35, 0.0)).b;
            float line = fract(vUv.y * res.y);
            c *= 0.78 + 0.22 * smoothstep(0.0, 0.5, line) * smoothstep(1.0, 0.5, line) * 1.6;
            float col = mod(floor(vUv.x * outRes.x), 3.0);
            c *= col == 0.0 ? vec3(1.06, 0.97, 0.97) : col == 1.0 ? vec3(0.97, 1.06, 0.97) : vec3(0.97, 0.97, 1.06);
            vec2 v = vUv * (1.0 - vUv.yx);
            c *= pow(v.x * v.y * 16.0, 0.12);
          } else {
            c = texture2D(tMap, vUv).rgb;
          }
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.brightMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  get sceneTexture(): Texture {
    return this.sceneRT.texture;
  }

  resize(windowW: number, windowH: number): void {
    this.renderer.setSize(windowW, windowH, false);
    this.height = INTERNAL_HEIGHT;
    this.width = Math.max(320, Math.round((INTERNAL_HEIGHT * windowW) / windowH));
    this.sceneRT.setSize(this.width, this.height);
    this.compRT.setSize(this.width, this.height);
    for (let k = 0; k < 2; k++) {
      const w = Math.max(8, this.width >> (k + 1));
      const h = Math.max(8, this.height >> (k + 1));
      this.bloomA[k].setSize(w, h);
      this.bloomB[k].setSize(w, h);
    }
    (this.outMat.uniforms.outRes.value as Vector2).set(windowW, windowH);
  }

  private pass(mat: ShaderMaterial, target: WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(scene: Scene, camera: Camera): void {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);

    if (this.settings.bloom) {
      let src: Texture = this.sceneRT.texture;
      for (let k = 0; k < 2; k++) {
        this.brightMat.uniforms.tMap.value = src;
        this.brightMat.uniforms.threshold.value = k === 0 ? 1.1 : 0.8;
        this.pass(this.brightMat, this.bloomA[k]);
        const w = this.bloomA[k].width;
        const h = this.bloomA[k].height;
        this.blurMat.uniforms.tMap.value = this.bloomA[k].texture;
        (this.blurMat.uniforms.dir.value as Vector2).set(1 / w, 0);
        this.pass(this.blurMat, this.bloomB[k]);
        this.blurMat.uniforms.tMap.value = this.bloomB[k].texture;
        (this.blurMat.uniforms.dir.value as Vector2).set(0, 1 / h);
        this.pass(this.blurMat, this.bloomA[k]);
        src = this.bloomA[k].texture;
      }
    }

    const cu = this.compMat.uniforms;
    cu.tScene.value = this.sceneRT.texture;
    cu.tBloom0.value = this.bloomA[0].texture;
    cu.tBloom1.value = this.bloomA[1].texture;
    cu.bloom.value = this.settings.bloom ? 1 : 0;
    cu.dither.value = this.settings.dither ? 1 : 0;
    cu.flash.value = Math.min(0.7, this.flash);
    (cu.res.value as Vector2).set(this.width, this.height);
    this.pass(this.compMat, this.compRT);

    const ou = this.outMat.uniforms;
    ou.tMap.value = this.compRT.texture;
    ou.crt.value = this.settings.crt ? 1 : 0;
    (ou.res.value as Vector2).set(this.width, this.height);
    this.pass(this.outMat, null);
  }
}
