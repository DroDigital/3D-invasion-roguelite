import type { Effect } from './types';

/** A campaign is three sectors of ten waves; the last wave of the last sector is the final battle. */
export const SECTORS = [
  { from: 1, name: 'SECTOR I // FIRST CONTACT' },
  { from: 11, name: 'SECTOR II // THE SIEGE OF EARTH' },
  { from: 21, name: 'SECTOR III // THE OUTER DARK' },
] as const;
export const FINAL_WAVE = 30;

export function sectorOf(wave: number): number {
  let s = 0;
  for (let i = 0; i < SECTORS.length; i++) if (wave >= SECTORS[i].from) s = i;
  return s;
}

/** Threat Levels: optional difficulty tiers unlocked by winning. Each includes all below it. */
export const THREAT_LEVELS = [
  { level: 0, name: 'STANDARD', text: 'The invasion as briefed.' },
  { level: 1, name: 'THREAT I', text: 'Aliens have 20% more health.' },
  { level: 2, name: 'THREAT II', text: 'Directives start at wave 5, and every wave carries one more.' },
  { level: 3, name: 'THREAT III', text: 'Salvage income is cut by a quarter.' },
  { level: 4, name: 'THREAT IV', text: 'Alien weapons hit 25% harder.' },
  { level: 5, name: 'THREAT V', text: 'Bosses and horrors have 40% more health; horrors arrive from wave 7.' },
] as const;
export const MAX_THREAT = THREAT_LEVELS.length - 1;

/** Command point multiplier for a run at a threat level. */
export function threatRewardMul(threat: number): number {
  return 1 + 0.25 * threat;
}

/** Each city gives Earth a bonus while it stands; lose the city, lose the bonus. */
export type CityPerk = 'industry' | 'research' | 'launch' | 'fortress' | 'command' | 'shipyard' | 'reactor' | 'relay';

export const CITY_PERKS: Record<CityPerk, { name: string; text: string; effects: Effect[] }> = {
  industry: { name: 'INDUSTRY', text: '+8% salvage', effects: [{ op: 'stat', stat: 'salvageGain', mode: 'pct', value: 0.08 }] },
  research: { name: 'RESEARCH', text: '+8% XP', effects: [{ op: 'stat', stat: 'xpGain', mode: 'pct', value: 0.08 }] },
  launch: { name: 'LAUNCH SITE', text: '+6 allied fighters', effects: [] },
  fortress: { name: 'FORTRESS', text: 'Cities take 4% less damage', effects: [{ op: 'stat', stat: 'cityDamageTaken', mode: 'pct', value: -0.04 }] },
  command: { name: 'COMMAND', text: '+5% weapon damage', effects: [{ op: 'stat', stat: 'damage', mode: 'pct', value: 0.05 }] },
  shipyard: { name: 'SHIPYARD', text: 'Emitters rebuild 25% faster', effects: [] },
  reactor: { name: 'REACTOR', text: '+4% fire rate', effects: [{ op: 'stat', stat: 'fireRate', mode: 'pct', value: 0.04 }] },
  relay: { name: 'RELAY', text: '-6% ability cooldowns', effects: [{ op: 'stat', stat: 'abilityCooldown', mode: 'pct', value: -0.06 }] },
};

/** Operation rewards, paid when the wave is cleared. */
export type OpReward = { kind: 'salvage'; amount: number } | { kind: 'levels'; amount: number } | { kind: 'relic' } | { kind: 'items'; amount: number } | { kind: 'repair'; amount: number };

export const OP_NAMES = [
  ['STANDARD PATROL'],
  ['OPERATION HAMMER', 'OPERATION LANTERN', 'OPERATION TIDEBREAK', 'OPERATION BLUE SKY', 'OPERATION ANVIL'],
  ['OPERATION LAST LIGHT', 'OPERATION DEEP WATCH', 'OPERATION NIGHTFALL', 'OPERATION IRON VEIL'],
] as const;
