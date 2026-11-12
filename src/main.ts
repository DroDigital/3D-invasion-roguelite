import '@fontsource/share-tech-mono';
import './ui/style.css';
import { Raycaster, Scene, Vector2, Vector3 } from 'three';
import { audio } from './audio/audio';
import { lazyLoadModels, loadTexture, preloadModels } from './core/assets';
import { randomSeed, Rng } from './core/rng';
import { abilitySlots, loadProfile, Profile, saveProfile } from './core/save';
import { runReward } from './data/meta';
import { CityMarkers } from './render/cityMarkers';
import { CombatView } from './render/combatView';
import { Earth } from './render/earth';
import { Indicators } from './render/indicators';
import { OrbitCamera } from './render/orbitCamera';
import { Particles } from './render/particles';
import { Pipeline } from './render/pipeline';
import { PS2, setDetailTexture } from './render/ps2Material';
import { createNebula, createStarfield } from './render/starfield';
import { createSun, sunScreen } from './render/sun';
import { Bot } from './sim/bot';
import { devTools } from './dev';
import { Game, STEP } from './sim/game';
import { h } from './ui/dom';
import { Floaters } from './ui/floaters';
import { Hud } from './ui/hud';
import { LevelUpScreen } from './ui/levelup';
import { Menu, openPause } from './ui/menu';
import { openSettings } from './ui/settings';
import { ShopScreen } from './ui/shop';

interface Run {
  game: Game;
  seed: string;
  combat: CombatView;
  particles: Particles;
  indicators: Indicators;
  markers: CityMarkers;
  hud: Hud;
  levelUp: LevelUpScreen;
  shop: ShopScreen;
  floaters: Floaters;
  rewarded: boolean;
  points: number;
  evolutions: number;
}

const params = new URLSearchParams(location.search);
// ?speed=N runs N sim steps per frame and ?auto=1 lets the bot play; both are for automated checks.
const speed = Math.max(1, Math.min(40, Number(params.get('speed')) || 1));
const auto = params.get('auto') === '1';

async function boot(): Promise<void> {
  const profile: Profile = loadProfile();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui')!;
  const labels = document.getElementById('labels')!;
  const pipeline = new Pipeline(canvas);
  const orbit = new OrbitCamera(canvas, window.innerWidth / window.innerHeight);
  const scene = new Scene();

  const loading = h('div', 'loading', 'ESTABLISHING UPLINK...');
  uiRoot.append(loading);
  const [dayMap, nightMap, plates] = await Promise.all([loadTexture('earthDay'), loadTexture('earthNight'), loadTexture('hullPlates'), preloadModels()]);
  loading.remove();
  setDetailTexture(plates);
  CombatView.initPalettes();
  const earth = new Earth(dayMap, nightMap);
  scene.add(createNebula(), earth.root, createStarfield(new Rng(20260101)), createSun(earth.sunDir));

  const applySettings = (): void => {
    const s = profile.settings;
    pipeline.settings.bloom = s.bloom;
    pipeline.settings.dither = s.dither;
    pipeline.settings.crt = s.crt;
    PS2.affine.value = s.affine ? 1 : 0;
    audio.volumes = { master: s.master, sfx: s.sfx, music: s.music };
    audio.applyVolumes();
  };
  applySettings();

  let run: Run | null = null;
  let menu: Menu | null = null;
  let paused = false;
  /** Player-selected game speed (1-3x); URL ?speed multiplies it for automation. */
  let gameSpeed = 1;
  let hitStop = 0;
  let absorbedShown = 0;
  let pauseEl: HTMLElement | null = null;
  let targeting: number | null = null;
  const bot = auto ? new Bot(1) : null;
  const tmp = new Vector3();

  const showMenu = (): void => {
    menu?.dispose();
    menu = new Menu(uiRoot, profile, { onLaunch: (seed) => startRun(seed ?? randomSeed()), onSettingsChanged: applySettings });
    audio.playMusic('menu');
  };

  const endRun = (): void => {
    if (!run) return;
    run.combat.dispose();
    run.particles.dispose();
    run.indicators.dispose();
    run.markers.dispose();
    run.hud.dispose();
    run.levelUp.dispose();
    run.shop.dispose();
    run.floaters.dispose();
    run = null;
    targeting = null;
    canvas.classList.remove('targeting');
  };

  /** Award command points once, when the run ends. */
  const settle = (r: Run): void => {
    if (r.rewarded) return;
    r.rewarded = true;
    const g = r.game;
    r.points = runReward(g.wave, g.kills, g.bossKills);
    profile.points += r.points;
    profile.totalPoints += r.points;
    profile.stats.runs++;
    profile.stats.bestWave = Math.max(profile.stats.bestWave, g.wave);
    profile.stats.kills += g.kills;
    profile.stats.evolutions += r.evolutions;
    saveProfile(profile);
    audio.play('gameover', 0.9);
  };

  const startRun = (seed: string): void => {
    endRun();
    menu?.dispose();
    menu = null;
    const game = new Game({
      seed,
      commander: profile.commander,
      abilities: profile.loadout,
      abilitySlots: abilitySlots(profile),
      unlocks: profile.unlocks,
    });
    const markers = new CityMarkers(game.cities, earth.surface, labels);
    const r: Run = {
      game,
      seed,
      combat: new CombatView(game, earth.surface),
      particles: new Particles(game, earth.surface),
      indicators: new Indicators(game, earth.surface, labels),
      markers,
      hud: new Hud(uiRoot, game, seed, {
        onCity: (i) => {
          if (targeting !== null && run?.game.abilities[targeting]?.def.targeting === 'city') fireAbility(targeting, { city: i });
          else orbit.focusOn(markers.worldDir(i, tmp));
        },
        onAbility: (i) => tryAbility(i),
        onCityHover: (i) => {
          markers.hover = i;
        },
        onSpeed: (n) => setSpeed(n),
        onPause: () => togglePause(),
        onSettings: () => openSettings(uiRoot, profile.settings, () => {
          saveProfile(profile);
          applySettings();
          if (run) {
            run.floaters.enabled = profile.settings.damageNumbers;
            run.hud.showFps = profile.settings.showFps;
          }
        }),
        onRetry: () => startRun(seed),
        onNewRun: () => startRun(randomSeed()),
        onMenu: () => {
          endRun();
          showMenu();
        },
      }),
      levelUp: new LevelUpScreen(uiRoot, game),
      shop: new ShopScreen(uiRoot, game),
      floaters: new Floaters(uiRoot, game, earth.surface),
      rewarded: false,
      points: 0,
      evolutions: 0,
    };
    run = r;
    paused = false;
    r.hud.setSpeed(gameSpeed, false);
    r.hud.showFps = profile.settings.showFps;
    r.floaters.enabled = profile.settings.damageNumbers;
    if (profile.stats.runs === 0 && !profile.settings.seenHint) {
      // First run: a short, dismissable briefing on what the player actually does.
      const hint = h('div', 'hpanel hint');
      hint.innerHTML =
        '<b>BRIEFING</b> // Your weapons aim and fire on their own. You build: pick upgrades with <b>1-5</b>, ' +
        'buy in the depot between waves, and fire abilities with <b>Q</b>/<b>E</b>. <b>TAB</b> game speed, ' +
        '<b>SPACE</b> pause, <b>F</b> jump to the hottest city, drag/scroll to look around.';
      const ok = h('button', 'cmd', 'UNDERSTOOD');
      ok.addEventListener('click', () => {
        hint.remove();
        profile.settings.seenHint = true;
        saveProfile(profile);
      });
      hint.prepend(ok);
      r.hud.root.append(hint);
    }
    lazyLoadModels();
    audio.playMusic('calm');
    (window as unknown as { __ow: unknown }).__ow = { orbit, game, earth, pipeline, profile, startRun, run, dev: params.get('dev') === '1' ? devTools(game) : undefined };
  };

  const setSpeed = (n: number): void => {
    gameSpeed = n;
    paused = false;
    run?.hud.setSpeed(gameSpeed, paused);
  };
  const togglePause = (): void => {
    if (!run || run.game.phase === 'gameover') return;
    paused = !paused;
    run.hud.setSpeed(gameSpeed, paused);
  };

  // ---- abilities: Q/E, on-screen buttons, and click-on-globe targeting ----
  const fireAbility = (i: number, target?: { point?: [number, number, number]; city?: number }): void => {
    if (!run) return;
    if (run.game.useAbility(i, target)) audio.play(run.game.abilities[i].def.sfx, 0.9);
    targeting = null;
    canvas.classList.remove('targeting');
    run.hud.setTargeting(null);
  };
  const tryAbility = (i: number): void => {
    if (!run || run.game.paused) return;
    const a = run.game.abilities[i];
    if (!a || a.cd > 0) return;
    if (a.def.targeting === 'none') fireAbility(i);
    else {
      targeting = targeting === i ? null : i;
      canvas.classList.toggle('targeting', targeting !== null);
      run.hud.setTargeting(targeting);
    }
  };
  const ray = new Raycaster();
  const ndc = new Vector2();
  let downX = 0;
  let downY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (targeting === null || !run || Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, orbit.camera);
    // Ray vs unit sphere.
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    const b = o.dot(d);
    const c = o.lengthSq() - 1;
    const disc = b * b - c;
    if (disc < 0) return;
    const hit = tmp.copy(d).multiplyScalar(-b - Math.sqrt(disc)).add(o);
    const local = earth.surface.worldToLocal(hit).normalize();
    const a = run.game.abilities[targeting];
    if (a.def.targeting === 'point') fireAbility(targeting, { point: [local.x, local.y, local.z] });
    else {
      const cs = run.game.cities;
      let best = -1;
      let bd = 0.97;
      for (let k = 0; k < cs.count; k++) {
        const dot = cs.pos[k * 3] * local.x + cs.pos[k * 3 + 1] * local.y + cs.pos[k * 3 + 2] * local.z;
        if (cs.health[k] > 0 && dot > bd) {
          bd = dot;
          best = k;
        }
      }
      if (best >= 0) fireAbility(targeting, { city: best });
    }
  });

  window.addEventListener('keydown', (e) => {
    if (!run) return;
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === ' ' && !run.game.offer) {
      e.preventDefault();
      togglePause();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setSpeed((gameSpeed % 3) + 1);
    } else if (e.key === 'F3') {
      e.preventDefault();
      run.hud.showFps = profile.settings.showFps = !profile.settings.showFps;
      saveProfile(profile);
    } else if (e.key === 'f' || e.key === 'F') {
      // Focus the most threatened city.
      const g = run.game;
      let best = -1;
      for (let k = 0; k < g.cities.count; k++) if (g.threat[k] > 0 && (best < 0 || g.threat[k] > g.threat[best])) best = k;
      if (best >= 0) orbit.focusOn(run.markers.worldDir(best, tmp));
    } else if (e.key === 'q' || e.key === 'Q') tryAbility(0);
    else if (e.key === 'e' || e.key === 'E') tryAbility(1);
    else if (e.key === 'Escape') {
      if (targeting !== null) {
        targeting = null;
        canvas.classList.remove('targeting');
        run.hud.setTargeting(null);
      } else if (!run.game.offer && run.game.phase !== 'gameover' && !pauseEl) {
        paused = true;
        pauseEl = openPause(uiRoot, profile, () => {
          paused = false;
          pauseEl = null;
        }, () => {
          paused = false;
          pauseEl = null;
          if (run) {
            run.game.phase = 'gameover';
          }
        }, () => {
          saveProfile(profile);
          applySettings();
        });
      }
    }
  });
  // Browsers only allow audio after a gesture.
  window.addEventListener('pointerdown', () => void audio.unlock(), { once: true });
  window.addEventListener('keydown', () => void audio.unlock(), { once: true });

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
  const sunView = new Vector3();
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    if (dt > 0) fps += (1 / dt - fps) * 0.05;

    const r = run;
    if (r) {
      const g = r.game;
      // Fixed-step simulation; rendering reads whatever state the last step left.
      if (!paused) {
        // Hit-stop: big moments play out in slow motion for a beat.
        const slow = hitStop > 0 ? 0.25 : 1;
        hitStop = Math.max(0, hitStop - dt);
        const mul = speed * gameSpeed * slow;
        acc = Math.min(acc + dt * mul, STEP * Math.max(5, mul * 2));
        while (acc >= STEP) {
          if (bot) bot.act(g);
          const evoBefore = g.log.length && g.log[g.log.length - 1];
          g.step(STEP);
          acc -= STEP;
          const lastLog = g.log[g.log.length - 1];
          if (lastLog && lastLog !== evoBefore && lastLog.text.startsWith('EVOLUTION')) r.evolutions++;
          if (g.paused) break;
        }
      }
      if (bot && g.paused) bot.act(g);
      if (g.phase === 'gameover') settle(r);
      // Music follows the fight.
      audio.playMusic(g.bossSlot >= 0 ? 'boss' : g.phase === 'spawning' || g.phase === 'clearing' ? 'combat' : 'calm');
    } else if (menu) {
      orbit.yaw += dt * 0.05;
    }

    earth.update(dt, time);
    orbit.update(dt);
    if (r) {
      const shake = profile.settings.shake ? Math.min(1.5, r.combat.shake) : 0;
      if (shake > 0) {
        orbit.camera.position.x += (Math.random() - 0.5) * shake * 0.03;
        orbit.camera.position.y += (Math.random() - 0.5) * shake * 0.03;
      }
    }
    scene.updateMatrixWorld();
    orbit.camera.updateMatrixWorld();
    PS2.sunView.value.copy(sunView.copy(earth.sunDir).transformDirection(orbit.camera.matrixWorldInverse));
    PS2.snapRes.value.set(profile.settings.vertexSnap ? pipeline.width * 0.5 : 0, profile.settings.vertexSnap ? pipeline.height * 0.5 : 0);

    sunScreen(earth.sunDir, orbit.camera, pipeline.sun);
    if (r) {
      r.combat.update(dt);
      hitStop = Math.max(hitStop, r.combat.hitStop);
      r.combat.hitStop = 0;
      pipeline.aberration = profile.settings.shake ? Math.min(1, r.combat.shake * 0.8) : 0;
      if (r.combat.absorbed > absorbedShown + 4) {
        absorbedShown = r.combat.absorbed;
        r.hud.pulseXp();
      }
      r.floaters.update(dt, orbit.camera, window.innerWidth, window.innerHeight);
      r.particles.update(dt, pipeline.height / 480);
      audio.consume(r.game);
      r.game.fxCount = 0;
      r.indicators.update(orbit.camera, time, window.innerWidth, window.innerHeight);
      r.markers.update(orbit.camera, window.innerWidth, window.innerHeight, r.game.threat);
      r.hud.update(fps, now, r.points);
      r.hud.root.classList.toggle('choosing', r.game.offer !== null || r.game.phase === 'shop');
      r.levelUp.update();
      r.shop.update();
      pipeline.flash = r.combat.flash;
    } else pipeline.flash = 0;
    pipeline.render(scene, orbit.camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  (window as unknown as { __ow: unknown }).__ow = { orbit, earth, pipeline, profile, startRun };
  if (params.get('gallery') !== null) {
    const { showGallery } = await import('./gallery');
    showGallery(scene, earth, orbit, Number(params.get('gallery')) || 0);
    return;
  }
  if (params.get('seed') || auto) startRun((params.get('seed') ?? randomSeed()).toUpperCase());
  else showMenu();
}

void boot();
