import '@fontsource/share-tech-mono';
import './ui/style.css';
import { AmbientLight, DirectionalLight, Scene, Vector3 } from 'three';
import { loadTexture } from './core/assets';
import { randomSeed } from './core/rng';
import { CityMarkers } from './render/cityMarkers';
import { Earth } from './render/earth';
import { OrbitCamera } from './render/orbitCamera';
import { Pipeline } from './render/pipeline';
import { createStarfield } from './render/starfield';
import { CombatView } from './render/combatView';
import { Indicators } from './render/indicators';
import { Particles } from './render/particles';
import { Game, STEP } from './sim/game';
import { Hud } from './ui/hud';
import { LevelUpScreen } from './ui/levelup';

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const seed = (params.get('seed') ?? randomSeed()).toUpperCase();
  // ?speed=N runs N sim steps per frame; used by automated checks.
  const speed = Math.max(1, Math.min(40, Number(params.get('speed')) || 1));
  const game = new Game(seed);

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const pipeline = new Pipeline(canvas);
  const orbit = new OrbitCamera(canvas, window.innerWidth / window.innerHeight);
  const scene = new Scene();

  const [dayMap, nightMap] = await Promise.all([loadTexture('earthDay'), loadTexture('earthNight')]);
  const earth = new Earth(dayMap, nightMap);
  scene.add(earth.root, createStarfield(game.rng.stream('starfield')));

  const sun = new DirectionalLight(0xffffff, 2.6);
  sun.position.copy(earth.sunDir);
  scene.add(sun, new AmbientLight(0x5a6a90, 1.1));

  // The sim runs in the Earth-fixed frame, so every game object parents to the spinning surface.
  const labels = document.getElementById('labels')!;
  const markers = new CityMarkers(game.cities, earth.surface, labels);
  const combat = new CombatView(game, earth.surface);
  const particles = new Particles(game, earth.surface);
  const indicators = new Indicators(game, earth.surface, labels);
  const tmp = new Vector3();
  const hud = new Hud(document.getElementById('ui')!, game, seed, (i) => orbit.focusOn(markers.worldDir(i, tmp)));

  const levelUp = new LevelUpScreen(document.getElementById('ui')!, game);
  // ?auto=1 picks the first card automatically; used by automated checks.
  const auto = params.get('auto') === '1';

  const resize = (): void => {
    pipeline.resize(window.innerWidth, window.innerHeight);
    orbit.setAspect(window.innerWidth / window.innerHeight);
  };
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  let time = 0;
  let fps = 60;
  let acc = 0;
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    if (dt > 0) fps += (1 / dt - fps) * 0.05;

    // Fixed-step simulation; rendering reads whatever state the last step left.
    acc = Math.min(acc + dt * speed, STEP * Math.max(5, speed));
    while (acc >= STEP) {
      if (auto && game.offer) game.choose(0);
      game.step(STEP);
      acc -= STEP;
    }

    earth.update(dt, time);
    orbit.update(dt);
    scene.updateMatrixWorld();
    combat.update();
    particles.update(dt);
    indicators.update(orbit.camera, time, window.innerWidth, window.innerHeight);
    markers.update(orbit.camera, window.innerWidth, window.innerHeight);
    hud.update(fps, now);
    levelUp.update();
    pipeline.render(scene, orbit.camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Debug handle for automated checks.
  (window as unknown as { __ow: unknown }).__ow = { orbit, game, earth, pipeline };
}

void boot();
