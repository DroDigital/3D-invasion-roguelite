# ORBITAL WATCH (working title)

3D roguelite planetary-defense auto-battler. TypeScript + Three.js + Vite, no backend.

```bash
npm install
npm run dev      # http://localhost:5173 — add ?seed=XXXX to reproduce a run
npm test
npm run build
```

- Design and data schema: `docs/design.md`
- Asset credits: `CREDITS.md`; assets still to source: `TODO-ASSETS.md`

## Milestones

1. [x] Earth, camera controls, starfield, cities
2. [x] One enemy, one auto-targeting weapon, wave spawner, city damage, game over
3. [x] XP, level-up screen, data-driven upgrade tables
4. [ ] Shop phase and salvage economy
5. [ ] All alien behaviors, species, rarity tiers and modifiers
6. [ ] Full content tables, tier models, evolutions and pairing UI
7. [ ] Active abilities, meta-progression and save
8. [ ] Visual pass, audio, balance
