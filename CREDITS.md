# Credits

Every third-party asset shipped in `/assets`, with source, author and license.
Build scripts that produced the shipped files: `tools/build-models.mjs`, `tools/build-audio.sh`.

## Textures

| Asset | File | Author | Source | License | Changes |
|---|---|---|---|---|---|
| Earth day map (Blue Marble) | `assets/textures/earth_day.webp` | NASA Earth Observatory / Visible Earth | https://visibleearth.nasa.gov/collection/1484/blue-marble (copy from https://github.com/vasturiano/three-globe, `example/img/earth-blue-marble.jpg`, because the NASA host was unreachable) | Public domain (NASA media usage guidelines) | Downscaled to 1024x512, WebP |
| Earth night lights (Black Marble) | `assets/textures/earth_night.webp` | NASA Earth Observatory / NOAA NGDC | https://earthobservatory.nasa.gov/features/NightLights (copy from https://github.com/vasturiano/three-globe, `example/img/earth-night.jpg`) | Public domain (NASA media usage guidelines) | Downscaled to 1024x512, WebP |
| Hull detail ("Metal Plate") | `assets/textures/hull_plates.webp` | Rob Tuytel / Poly Haven | https://polyhaven.com/a/metal_plate | CC0 | Diffuse map, greyscale, 64x64, WebP |

## 3D models

| Asset | Files | Author | Source | License | Changes |
|---|---|---|---|---|---|
| Ultimate Spaceships (Bob, Challenger, Dispatcher, Executioner, Imperial, Insurgent, Omen, Pancake, Spitfire, Striker, Zenith) | `assets/models/hulls/*.glb` | Quaternius | https://quaternius.com/packs/ultimatespaceships.html (download via https://opengameart.org/content/lowpoly-spaceships-pack) | CC0 | Palette texture baked to vertex colours, simplified to ≤ ~2k triangles, normalised, meshopt-compressed GLB; recoloured per alien species at runtime |
| Space Kit 2.0 (21 parts: satellite dishes, turrets, machines, rocket parts, weapons, pipe ring, structure, hangar, crystals) | `assets/models/kit/*.glb` | Kenney (www.kenney.nl) | https://kenney.nl/assets/space-kit (download via https://opengameart.org/content/space-kit-remade) | CC0 | Material colours baked to vertex colours, re-based to unit height, meshopt-compressed GLB; combined with coded parts into weapon tier models |

## Audio

| Asset | Files | Author | Source | License | Changes |
|---|---|---|---|---|---|
| Digital SFX Set (laser4, zap1, phaserDown2, pepSound1, lowThreeTone, powerUp1/5/10, threeTone1, phaseJump1, zapThreeToneUp, highUp, lowDown) | `assets/audio/sfx/{shot_laser,shot_tesla,shot_gravity,shot_drone,city_hit,levelup,shield,evolve,buy,ability,emp,wave,gameover}.ogg` | Kenney (www.kenney.nl) | https://opengameart.org/content/63-digital-sound-effects-lasers-phasers-space-etc | CC0 | Trimmed, loudness-normalised, mono 22 kHz OGG |
| 50 CC0 Sci-Fi SFX (shoot_01, shoot_02, rocket_01, terminal_02, retro_beep_03, teleport_01, teleport_02, weird_01) | `assets/audio/sfx/{shot_kinetic,shot_artillery,shot_missile,hit,alarm,abduct,escape,boss}.ogg` | rubberduck | https://opengameart.org/content/50-cc0-sci-fi-sfx | CC0 | Trimmed, loudness-normalised, mono 22 kHz OGG |
| Explosions (explode, explodemini) | `assets/audio/sfx/{explode_big,explode_small}.ogg` | Michel Baradari (apollo-music.de) | https://opengameart.org/content/2-high-quality-explosions | **CC-BY 3.0** — "Sounds (c) by Michel Baradari apollo-music.de" | Trimmed, loudness-normalised, mono 22 kHz OGG |
| Buttons and clicks (button01, Clic01) | `assets/audio/sfx/{ui_click,ui_hover}.ogg` | Independent nu ljudbank (uploaded by qubodup) | https://opengameart.org/content/16-button-clicks | CC0 | Trimmed, mono 22 kHz OGG |
| Observing The Star | `assets/audio/music/calm.ogg` | yd | https://opengameart.org/content/another-space-background-track | CC0 | Re-encoded 32 kHz OGG |
| My Very Own Dead Ship | `assets/audio/music/combat.ogg` | yd | https://opengameart.org/content/background-space-track | CC0 | Re-encoded 32 kHz OGG |
| Galactic Temple | `assets/audio/music/menu.ogg` | yd | https://opengameart.org/content/galactic-temple | CC0 | Re-encoded 32 kHz OGG |
| Blackmoor Colossus (Colossal Boss Battle Theme) | `assets/audio/music/boss.ogg` | Matthew Pablo (www.matthewpablo.com) | https://opengameart.org/content/colossal-boss-battle-theme | **CC-BY 3.0** — "Music by Matthew Pablo, http://www.matthewpablo.com" | Re-encoded 32 kHz OGG |

## Fonts

| Asset | Author | Source | License |
|---|---|---|---|
| Share Tech Mono (UI font, npm `@fontsource/share-tech-mono`) | Carrois Apostrophe | https://fonts.google.com/specimen/Share+Tech+Mono | SIL Open Font License 1.1 |

## Made in code

The Outer Dark creatures (bodies and animated tentacles), alien weapon fire, wreckage, smoke, the Aegis Shell
and the planet's scorch and fire map are generated procedurally in `src/render/` — no third-party assets.

## Libraries

- three.js — MIT — https://threejs.org
- meshoptimizer (decoder at runtime, encoder at build time) — MIT — https://github.com/zeux/meshoptimizer
- glTF Transform (build time) — MIT — https://gltf-transform.dev

## In-game attribution

The CC-BY 3.0 assets (Michel Baradari's explosions and Matthew Pablo's boss theme) are also credited
on the in-game command screen (CREDITS button).
