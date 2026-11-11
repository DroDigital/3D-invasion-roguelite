import { Texture, TextureLoader } from 'three';
import manifest from '../../assets/manifest.json';

type TextureId = keyof typeof manifest.textures;

const loader = new TextureLoader();
const base = import.meta.env.BASE_URL;

export function loadTexture(id: TextureId): Promise<Texture> {
  return loader.loadAsync(base + manifest.textures[id].path);
}
