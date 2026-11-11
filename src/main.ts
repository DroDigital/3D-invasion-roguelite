import '@fontsource/share-tech-mono';
import './ui/style.css';
import { Scene, Vector3 } from 'three';
import { loadTexture } from './core/assets';
import { randomSeed, RunRng } from './core/rng';
import { CityMarkers } from './render/cityMarkers';
import { Earth } from './render/earth';
import { OrbitCamera } from './render/orbitCamera';
import { Pipeline } from './render/pipeline';
import { createStarfield } from './render/starfield';
import { CityState } from './sim/cities';
import { Hud } from './ui/hud';

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const seed = (params.get('seed') ?? randomSeed()).toUpperCase();
  const rng = new RunRng(seed);

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const pipeline = new Pipeline(canvas);
  const orbit = new OrbitCamera(canvas, window.innerWidth / window.innerHeight);
  const scene = new Scene();

  const [dayMap, nightMap] = await Promise.all([loadTexture('earthDay'), loadTexture('earthNight')]);
  const earth = new Earth(dayMap, nightMap);
  scene.add(earth.root, createStarfield(rng.stream('starfield')));

  const cities = new CityState();
  const markers = new CityMarkers(cities, earth.surface, document.getElementById('labels')!);
  const tmp = new Vector3();
  const hud = new Hud(document.getElementById('ui')!, cities, seed, (i) => orbit.focusOn(markers.worldDir(i, tmp)));

  const resize = (): void => {
    pipeline.resize(window.innerWidth, window.innerHeight);
    orbit.setAspect(window.innerWidth / window.innerHeight);
  };
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  let time = 0;
  let fps = 60;
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    if (dt > 0) fps += (1 / dt - fps) * 0.05;

    earth.update(dt, time);
    orbit.update(dt);
    scene.updateMatrixWorld();
    markers.update(orbit.camera, window.innerWidth, window.innerHeight);
    hud.update(fps);
    pipeline.render(scene, orbit.camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Debug handle for automated checks.
  (window as unknown as { __ow: unknown }).__ow = { orbit, cities, earth, pipeline };
}

void boot();
