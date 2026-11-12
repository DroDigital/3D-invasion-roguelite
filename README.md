# ORBITAL WATCH (working title)

3D roguelite planetary-defense auto-battler. TypeScript + Three.js + Vite, runs in the browser, no backend.

You command Earth's orbital defense. Aliens arrive in waves from every side; every weapon fires and
targets on its own. You build: pick upgrades on level-up, buy in the shop between waves, merge
max-tier weapon pairs into evolutions, and fire one or two long-cooldown abilities at the right moment.

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build
```

## Controls

| Input | Action |
|---|---|
| Drag / scroll / pinch | Rotate / zoom the globe (with inertia) |
| Click a city in the list | Fly the camera to it |
| 1–5, R | Pick a level-up card, reroll |
| Q / E (or the on-screen buttons) | Active abilities. Point and city abilities then take a click on the globe (or a city row) |
| Space / Tab | Pause / cycle game speed 1x-2x-3x (also the buttons top-right) |
| F | Jump the camera to the most threatened city |
| F3 | Toggle the FPS readout |
| 1–6, R, Enter (shop) | Buy, restock, launch the next wave |
| Esc | Pause menu (settings, abandon run) / cancel ability targeting |

## URL flags

| Flag | Effect |
|---|---|
| `?seed=ABCD1234` | Start a run on this seed immediately (same seed + same choices = same run) |
| `?gallery=0..3` | Every weapon's five tier models side by side (pages 0–2), evolved weapons (page 3) |
| `?auto=1` | The bot plays (used for automated checks) |
| `?speed=N` | Run N simulation steps per frame |
| `?dev=1` | Exposes `window.__ow.dev` helpers (spawn aliens, give weapons, offer evolutions) |

## Layout

```
src/data/     all content: weapons, evolutions, aliens, species, tiers, modifiers, waves, passives, relics,
              abilities, shop, commanders, unlocks, cities
src/sim/      deterministic fixed-step simulation (no DOM, no three.js scene): game, waves, aliens, combat,
              damage, offers, shop, abilities, build (tag-driven effect engine), targeting, bot
src/render/   earth, starfield, PS2 material, kit builder (weapon tier models), combat view (instancing),
              GPU particles, indicators, post-processing pipeline
src/ui/       DOM HUD, level-up, shop, command menu, settings
src/audio/    WebAudio SFX + lazy music
tools/        asset build scripts (models, audio) and the bot balance runner
assets/       shipped assets + manifest.json
```

New content is one entry in a table in `src/data/`. Weapons pick up passive synergies by tag, never by id.

- Design and data schema: `docs/design.md`
- Asset credits: `CREDITS.md`; assets still to source: `TODO-ASSETS.md`
- Balance check: `npx vite-node tools/balance.ts [runs] [maxMinutes]`

## Milestones

1. [x] Earth, camera controls, starfield, cities
2. [x] One enemy, one auto-targeting weapon, wave spawner, city damage, game over
3. [x] XP, level-up screen, data-driven upgrade tables
4. [x] Shop phase and salvage economy
5. [x] All alien behaviors, species, rarity tiers and modifiers
6. [x] Full content tables, tier models, evolutions and pairing UI
7. [x] Active abilities, meta-progression and save
8. [x] Visual pass (PS2 shaders, post-processing), audio, balance
