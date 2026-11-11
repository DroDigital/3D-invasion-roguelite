/**
 * Plays N seeded runs with the bot and prints how far each got.
 *   npx vite-node tools/balance.ts [runs] [maxMinutes]
 */
import { Game, STEP } from '../src/sim/game';
import { Bot } from '../src/sim/bot';

const runs = Number(process.argv[2] ?? 8);
const maxMin = Number(process.argv[3] ?? 40);
const rows: string[] = [];
let waves = 0;
for (let r = 0; r < runs; r++) {
  const g = new Game({ seed: `BAL${r}`, abilities: r % 2 ? ['global_emp'] : [], abilitySlots: 1 });
  const bot = new Bot(r + 1);
  const t0 = performance.now();
  let maxEnemies = 0;
  let steps = 0;
  while (g.phase !== 'gameover' && g.time < maxMin * 60) {
    bot.act(g);
    g.step(STEP);
    g.fxCount = 0;
    steps++;
    if (g.enemies.count > maxEnemies) maxEnemies = g.enemies.count;
  }
  const ms = performance.now() - t0;
  waves += g.wave;
  const pop = (g.cities.totalPopulation() / g.cities.startPopulation) * 100;
  rows.push(
    `run ${r}: wave ${String(g.wave).padStart(2)}  t=${(g.time / 60).toFixed(1)}m  lvl ${g.level}  kills ${g.kills}  pop ${pop.toFixed(0)}%  ` +
      `peak enemies ${maxEnemies}  sim ${(ms / steps).toFixed(3)} ms/step  ` +
      `weapons ${g.arsenal.weapons.map((w) => `${w.def.icon}${w.def.evolved ? '*' : w.tier + 1}`).join(' ')}`,
  );
}
console.log(rows.join('\n'));
console.log(`mean wave ${(waves / runs).toFixed(1)}`);
