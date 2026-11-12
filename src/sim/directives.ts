import { DIRECTIVES, WAVE_RULES } from '../data/aliens';
import type { DirectiveDef } from '../data/types';
import type { Game } from './game';

/** Aggregated effect of this wave's directives. */
export interface DirectiveMods {
  hpMul: number;
  armorAdd: number;
  speedMul: number;
  fireRateMul: number;
  cloakAll: boolean;
  splitFodder: boolean;
  kamikaze: boolean;
  fodderMul: number;
  gunships: number;
  horrors: number;
  salvageMul: number;
}

export function noDirectives(): DirectiveMods {
  return { hpMul: 1, armorAdd: 0, speedMul: 1, fireRateMul: 1, cloakAll: false, splitFodder: false, kamikaze: false, fodderMul: 1, gunships: 0, horrors: 0, salvageMul: 1 };
}

/** How many directives a wave carries: none early, then one, stacking up to four. */
export function directiveCount(wave: number): number {
  if (wave < WAVE_RULES.directiveFrom) return 0;
  return Math.min(4, 1 + Math.floor((wave - WAVE_RULES.directiveFrom) / WAVE_RULES.directiveStep));
}

/** Roll this wave's directives (deterministic: wave stream). */
export function rollDirectives(g: Game): void {
  const r = g.waveRng;
  const n = directiveCount(g.wave);
  const pool = DIRECTIVES.filter((d) => d.minWave <= g.wave);
  const out: DirectiveDef[] = [];
  while (out.length < n && pool.length > 0) {
    const i = r.weighted(pool.map((d) => d.weight));
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  g.directives = out;
  const m = noDirectives();
  for (const d of out) {
    m.hpMul *= d.hpMul ?? 1;
    m.armorAdd += d.armorAdd ?? 0;
    m.speedMul *= d.speedMul ?? 1;
    m.fireRateMul *= d.fireRateMul ?? 1;
    m.cloakAll ||= d.cloakAll ?? false;
    m.splitFodder ||= d.splitFodder ?? false;
    m.kamikaze ||= d.kamikaze ?? false;
    m.fodderMul *= d.fodderMul ?? 1;
    m.gunships += d.gunships ?? 0;
    m.horrors += d.horrors ?? 0;
    m.salvageMul *= d.salvageMul ?? 1;
  }
  g.dir = m;
  for (const d of out) g.addLog(`DIRECTIVE: ${d.name} - ${d.text}`, 'warn');
}
