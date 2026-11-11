import {
  Camera,
  HalfFloatType,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

/** Internal vertical resolution; width follows the window aspect. */
export const INTERNAL_HEIGHT = 480;

/** Renders the scene to a low-res target, then upscales with nearest filtering.
 *  Post-processing passes (bloom, dither, CRT) slot in between in milestone 8. */
export class Pipeline {
  readonly renderer: WebGLRenderer;
  private target: WebGLRenderTarget;
  private blitScene = new Scene();
  private blitCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private blitMat: ShaderMaterial;
  width = 640;
  height = INTERNAL_HEIGHT;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000004, 1);
    this.target = new WebGLRenderTarget(this.width, this.height, {
      type: HalfFloatType,
      magFilter: NearestFilter,
      minFilter: NearestFilter,
      depthBuffer: true,
    });
    this.blitMat = new ShaderMaterial({
      uniforms: { tMap: { value: this.target.texture } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap;
        varying vec2 vUv;
        void main() {
          gl_FragColor = vec4(min(texture2D(tMap, vUv).rgb, vec3(1.0)), 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), this.blitMat);
    quad.frustumCulled = false;
    this.blitScene.add(quad);
  }

  resize(windowW: number, windowH: number): void {
    this.renderer.setSize(windowW, windowH, false);
    this.height = INTERNAL_HEIGHT;
    this.width = Math.max(320, Math.round((INTERNAL_HEIGHT * windowW) / windowH));
    this.target.setSize(this.width, this.height);
  }

  render(scene: Scene, camera: Camera): void {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.blitScene, this.blitCam);
  }
}
