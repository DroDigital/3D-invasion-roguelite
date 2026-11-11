import { BufferAttribute, BufferGeometry, Mesh, Texture, TextureLoader } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import manifest from '../../assets/manifest.json';

type Entry = { path: string; preload: boolean };
const textures = manifest.textures as Record<string, Entry>;
const models = manifest.models as Record<string, Entry>;
const audio = manifest.audio as Record<string, Entry>;
const base = import.meta.env.BASE_URL;

const texLoader = new TextureLoader();
const gltf = new GLTFLoader();
gltf.setMeshoptDecoder(MeshoptDecoder);

const geoCache = new Map<string, Promise<BufferGeometry>>();
const loadedGeo = new Map<string, BufferGeometry>();

export function loadTexture(id: keyof typeof manifest.textures): Promise<Texture> {
  return texLoader.loadAsync(base + textures[id].path);
}

/**
 * Load a model as one flat-shaded, non-indexed geometry with a `color` attribute.
 * Cached; resolves the same geometry for every caller.
 */
export function loadModel(id: string): Promise<BufferGeometry> {
  let p = geoCache.get(id);
  if (!p) {
    const entry = models[id];
    if (!entry) return Promise.reject(new Error(`Unknown model ${id}`));
    p = gltf.loadAsync(base + entry.path).then((g) => {
      let geo: BufferGeometry | null = null;
      g.scene.traverse((o) => {
        if (!geo && (o as Mesh).isMesh) geo = (o as Mesh).geometry;
      });
      if (!geo) throw new Error(`No mesh in ${id}`);
      const flat = (geo as BufferGeometry).index ? (geo as BufferGeometry).toNonIndexed() : (geo as BufferGeometry);
      // Meshopt quantization leaves normalized integer attributes; the shaders want floats.
      for (const name of ['position', 'color']) {
        const a = flat.getAttribute(name);
        if (!a || a.array instanceof Float32Array) continue;
        const f = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
        flat.setAttribute(name, new BufferAttribute(f, a.itemSize));
      }
      flat.deleteAttribute('normal');
      flat.computeVertexNormals();
      loadedGeo.set(id, flat);
      return flat;
    });
    geoCache.set(id, p);
  }
  return p;
}

/** Geometry if already loaded, else null (and starts loading). */
export function modelNow(id: string): BufferGeometry | null {
  const g = loadedGeo.get(id);
  if (!g && !geoCache.has(id) && models[id]) void loadModel(id);
  return g ?? null;
}

export function preloadModels(): Promise<unknown> {
  return Promise.all(Object.entries(models).filter(([, e]) => e.preload).map(([id]) => loadModel(id)));
}

/** Everything not needed for the first wave, fetched in the background. */
export function lazyLoadModels(): void {
  for (const [id, e] of Object.entries(models)) if (!e.preload) void loadModel(id);
}

export function audioUrl(id: string): string | null {
  const e = audio[id];
  return e ? base + e.path : null;
}

export function audioIds(prefix: string): string[] {
  return Object.keys(audio).filter((k) => k.startsWith(prefix));
}
