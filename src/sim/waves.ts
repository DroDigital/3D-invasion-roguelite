import { ALIENS, ALIEN_TIERS, SPECIES, WAVES, WAVE_RULES } from '../data/aliens';
import type { AlienRole } from '../data/types';
import type { Rng } from '../core/rng';
import { spawnAlien } from './aliens';
import { gainSalvage, runTriggers } from './damage';
import type { Game } from './game';
import { SHOP_RULES } from '../data/shop';

/** Budget cost multiplier of each rarity tier. */
const TIER_COST = [1, 2.2, 4.5, 10];

function tierWeights(wave: number): number[] {
  return ALIEN_TIERS.map((t) => (wave >= t.weight.minWave ? t.weight.base + t.weight.perWave * (wave - 1) : 0));
}

function speciesFor(wave: number): string[] {
  return SPECIES.filter((s) => s.minWave <= wave).map((s) => s.id);
}

function alienFor(species: string, role: AlienRole): number {
  return ALIENS.findIndex((a) => a.species === species && a.role === role);
}

/** Build this wave's spawn list: clusters of one species each, spending the threat budget. */
export function planWave(g: Game, r: Rng): void {
  const wave = g.wave;
  const def = WAVES[wave - 1];
  const boss = wave % WAVE_RULES.bossEvery === 0;
  let budget = def ? def.budget : WAVE_RULES.budgetBase + WAVE_RULES.budgetLinear * wave + WAVE_RULES.budgetQuad * wave * wave;
  if (boss) budget *= 0.6;
  const weights = def ? def.roleWeights : WAVE_RULES.defaultRoleWeights;
  const species = def?.species ?? speciesFor(wave);
  // A species' debut wave leans heavily on it.
  const debut = SPECIES.find((s) => s.minWave === wave && species.includes(s.id));
  const tw = tierWeights(wave);
  const queue: Game['spawnQueue'] = [];
  let cluster = 0;

  if (boss) {
    const sp = SPECIES.filter((s) => s.minWave <= wave);
    const pick = sp[(Math.floor(wave / WAVE_RULES.bossEvery) - 1) % sp.length];
    queue.push({ def: alienFor(pick.id, 'boss'), tier: 0, cluster: cluster++ });
  }

  const roles = (Object.keys(weights) as AlienRole[]).filter((role) => role !== 'boss');
  let guard = 0;
  while (budget > 0.5 && guard++ < 400) {
    const sp = debut && r.chance(0.6) ? debut.id : r.pick(species);
    const spDef = SPECIES.find((s) => s.id === sp)!;
    const size = Math.max(1, Math.round((WAVE_RULES.clusterMin + r.int(WAVE_RULES.clusterMax - WAVE_RULES.clusterMin + 1)) * spDef.clusterMul));
    for (let k = 0; k < size && budget > 0.5; k++) {
      const avail = roles.filter((role) => {
        const a = ALIENS[alienFor(sp, role)];
        return a.minWave <= wave && a.threat <= budget;
      });
      const role = avail.length ? avail[r.weighted(avail.map((x) => weights[x] ?? 0))] : 'invader';
      const idx = alienFor(sp, role);
      let tier = r.weighted(tw);
      while (tier > 0 && ALIENS[idx].threat * TIER_COST[tier] > budget * 1.2) tier--;
      budget -= ALIENS[idx].threat * TIER_COST[tier];
      queue.push({ def: idx, tier, cluster });
    }
    cluster++;
  }
  g.spawnQueue = queue;
  const duration = Math.min(30, WAVE_RULES.duration + wave * 0.4);
  g.spawnInterval = duration / Math.max(1, queue.length);
  g.spawnTimer = 0;
  g.clusterId = -1;
}

function newDirection(g: Game, r: Rng): void {
  const u = r.range(-1, 1);
  const a = r.range(0, Math.PI * 2);
  const s = Math.sqrt(1 - u * u);
  g.clusterDir[0] = s * Math.cos(a);
  g.clusterDir[1] = u;
  g.clusterDir[2] = s * Math.sin(a);
}

/** A living city on the side of the planet facing (x,y,z); any living city as a fallback. */
function pickCity(g: Game, x: number, y: number, z: number, r: Rng): number {
  const c = g.cities;
  let facing = 0;
  let living = 0;
  for (let i = 0; i < c.count; i++) {
    if (c.health[i] <= 0) continue;
    living++;
    if (c.pos[i * 3] * x + c.pos[i * 3 + 1] * y + c.pos[i * 3 + 2] * z > 0.2) facing++;
  }
  if (living === 0) return -1;
  const useFacing = facing > 0;
  let pick = r.int(useFacing ? facing : living);
  for (let i = 0; i < c.count; i++) {
    if (c.health[i] <= 0) continue;
    if (useFacing && c.pos[i * 3] * x + c.pos[i * 3 + 1] * y + c.pos[i * 3 + 2] * z <= 0.2) continue;
    if (pick-- === 0) return i;
  }
  return -1;
}

function spawnNext(g: Game): void {
  const r = g.waveRng;
  const item = g.spawnQueue.shift();
  if (!item) return;
  if (item.cluster !== g.clusterId) {
    g.clusterId = item.cluster;
    newDirection(g, r);
  }
  const d = g.clusterDir;
  let x = d[0] + r.range(-0.12, 0.12);
  let y = d[1] + r.range(-0.12, 0.12);
  let z = d[2] + r.range(-0.12, 0.12);
  const rad = (WAVE_RULES.spawnRadius + r.range(-0.4, 0.4)) / Math.hypot(x, y, z);
  x *= rad;
  y *= rad;
  z *= rad;
  const city = pickCity(g, x, y, z, r);
  if (city < 0) return;
  spawnAlien(g, item.def, item.tier, x, y, z, city, r);
}

export function startWave(g: Game): void {
  g.wave++;
  planWave(g, g.waveRng);
  g.phase = 'spawning';
  g.addLog(`WAVE ${g.wave} INBOUND`, g.wave % WAVE_RULES.bossEvery === 0 ? 'boss' : 'info');
  runTriggers(g, 'waveStart', -1, 0, 0, 0, -1);
}

export function updateWaves(g: Game, dt: number): void {
  if (g.phase === 'intermission') {
    g.phaseTimer -= dt;
    if (g.phaseTimer <= 0) startWave(g);
  } else if (g.phase === 'spawning') {
    g.spawnTimer -= dt;
    while (g.spawnTimer <= 0 && g.spawnQueue.length > 0) {
      spawnNext(g);
      g.spawnTimer += g.spawnInterval;
    }
    if (g.spawnQueue.length === 0) g.phase = 'clearing';
  } else if (g.phase === 'clearing' && g.enemies.count === 0) {
    gainSalvage(g, SHOP_RULES.clearBonus + SHOP_RULES.clearPerWave * g.wave, true);
    g.addLog(`WAVE ${g.wave} CLEARED`, 'good');
    g.onWaveCleared();
  }
}
