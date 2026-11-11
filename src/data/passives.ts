import type { ActionDef, Effect, Rarity, StatId, Tag, TagQuery, UpgradeDef } from './types';

const st = (stat: StatId, mode: 'add' | 'pct' | 'mul', value: number, where?: TagQuery): Effect => ({ op: 'stat', stat, mode, value, where });
const tr = (on: Extract<Effect, { op: 'trigger' }>['on'], d: ActionDef, chance?: number, where?: TagQuery): Effect => ({ op: 'trigger', on, do: d, chance, where });
const any = (...t: Tag[]): TagQuery => ({ any: t });
const P = (id: string, name: string, rarity: Rarity, tags: Tag[], maxStacks: number, effects: Effect[], unlock?: string): UpgradeDef =>
  ({ id, name, kind: 'passive', rarity, tags, maxStacks, effects, unlock });

/** Passive upgrades. Effects select weapons by tag, so new weapons pick up synergies for free. */
export const PASSIVES: readonly UpgradeDef[] = [
  // damage by family / tag
  P('tungsten_cores', 'Tungsten Cores', 'common', ['kinetic'], 5, [st('damage', 'pct', 0.2, any('kinetic'))]),
  P('shaped_warheads', 'Shaped Warheads', 'common', ['explosive'], 5, [st('damage', 'pct', 0.25, any('explosive'))]),
  P('focusing_optics', 'Focusing Optics', 'common', ['energy'], 5, [st('damage', 'pct', 0.2, any('energy'))]),
  P('graviton_lens', 'Graviton Lens', 'common', ['gravity'], 5, [st('damage', 'pct', 0.25, any('gravity'))]),
  P('swarm_ai', 'Swarm AI', 'common', ['drone'], 5, [st('damage', 'pct', 0.2, any('drone'))]),
  P('arc_capacitors', 'Arc Capacitors', 'common', ['chain'], 5, [st('damage', 'pct', 0.2, any('chain'))]),
  P('bunker_busters', 'Bunker Busters', 'common', ['ground'], 5, [st('damage', 'pct', 0.2, any('ground'))]),
  P('orbital_mirrors', 'Orbital Mirrors', 'common', ['orbital'], 5, [st('damage', 'pct', 0.12, any('orbital'))]),
  P('beam_collimator', 'Beam Collimator', 'uncommon', ['beam'], 5, [st('damage', 'pct', 0.22, any('beam'))]),
  P('area_saturation', 'Area Saturation', 'uncommon', ['area'], 4, [st('damage', 'pct', 0.15, any('area'))]),
  // fire rate
  P('overclocked_capacitors', 'Overclocked Capacitors', 'common', [], 5, [st('fireRate', 'pct', 0.12)]),
  P('autoloaders', 'Autoloaders', 'common', ['kinetic'], 4, [st('fireRate', 'pct', 0.18, any('kinetic'))]),
  P('thermal_sinks', 'Thermal Sinks', 'common', ['energy'], 4, [st('fireRate', 'pct', 0.18, any('energy'))]),
  P('drone_bays', 'Expanded Drone Bays', 'common', ['drone'], 4, [st('fireRate', 'pct', 0.2, any('drone'))]),
  P('rapid_rearm', 'Rapid Rearm', 'common', ['explosive'], 4, [st('fireRate', 'pct', 0.15, any('explosive'))]),
  P('battery_grid', 'Battery Grid', 'uncommon', ['ground'], 3, [st('fireRate', 'pct', 0.15, any('ground')), st('damage', 'pct', 0.05, any('ground'))]),
  P('orbital_command', 'Orbital Command', 'uncommon', ['orbital', 'crit'], 3, [st('fireRate', 'pct', 0.1, any('orbital')), st('critChance', 'add', 0.03, any('orbital'))]),
  // projectiles and targeting
  P('high_velocity_rounds', 'High-Velocity Rounds', 'common', [], 3, [st('projectileSpeed', 'pct', 0.3), st('damage', 'pct', 0.06)]),
  P('depleted_payloads', 'Depleted Payloads', 'uncommon', ['pierce'], 3, [st('pierce', 'add', 1, any('pierce', 'drone'))]),
  P('wide_detonators', 'Wide Detonators', 'common', ['area'], 4, [st('aoe', 'pct', 0.2, any('area'))]),
  P('overpressure', 'Overpressure', 'uncommon', ['explosive', 'area'], 3, [st('aoe', 'pct', 0.15, any('explosive')), st('damage', 'pct', 0.1, any('explosive'))]),
  P('targeting_uplink', 'Targeting Uplink', 'rare', ['single-target'], 2, [st('targets', 'add', 1, any('single-target'))]),
  P('multi_lock', 'Multi-Lock Radar', 'uncommon', ['multi-target'], 3, [st('targets', 'add', 1, any('multi-target'))]),
  P('fork_relays', 'Fork Relays', 'uncommon', ['chain'], 4, [st('chainJumps', 'add', 1, any('chain'))]),
  P('hive_mind', 'Hive Mind', 'uncommon', ['drone', 'pierce'], 3, [st('pierce', 'add', 2, any('drone'))]),
  P('drone_overseer', 'Drone Overseer', 'rare', ['drone'], 3, [st('damage', 'pct', 0.1, any('drone')), st('pierce', 'add', 1, any('drone')), st('fireRate', 'pct', 0.08, any('drone'))]),
  // crit
  P('critical_algorithms', 'Critical Algorithms', 'uncommon', ['crit'], 5, [st('critChance', 'add', 0.08)]),
  P('weak_point_scan', 'Weak Point Scan', 'uncommon', ['crit'], 4, [st('critMult', 'add', 0.5)]),
  P('sniper_doctrine', 'Sniper Doctrine', 'rare', ['crit', 'single-target'], 3, [st('critChance', 'add', 0.12, any('single-target'))]),
  // gravity / dot / special damage
  P('event_stabilizers', 'Event Stabilizers', 'uncommon', ['gravity', 'area'], 3, [st('fieldDuration', 'pct', 0.25, any('gravity'))]),
  P('tidal_compression', 'Tidal Compression', 'uncommon', ['gravity', 'area'], 3, [st('aoe', 'pct', 0.2, any('gravity'))]),
  P('thermite_lacing', 'Thermite Lacing', 'uncommon', ['dot'], 4, [st('dotDps', 'pct', 0.3, any('dot'))]),
  P('shield_breakers', 'Shield Breakers', 'uncommon', ['energy'], 3, [st('shieldDamage', 'pct', 0.5)]),
  P('giant_slayer', 'Giant Slayer', 'rare', [], 4, [st('bossDamage', 'pct', 0.25)]),
  P('glass_lenses', 'Glass Lenses', 'rare', ['energy'], 2, [st('damage', 'pct', 0.35, any('energy')), st('fireRate', 'pct', -0.1, any('energy'))]),
  P('heavy_ordnance', 'Heavy Ordnance', 'rare', ['explosive'], 2, [st('damage', 'pct', 0.4, any('explosive')), st('projectileSpeed', 'pct', -0.15, any('explosive'))]),
  P('conductive_hulls', 'Conductive Hulls', 'uncommon', ['chain', 'stun'], 3, [st('damage', 'pct', 0.12, any('chain')), st('chainJumps', 'add', 1, any('chain'))], 'content_passives2'),
  // economy
  P('salvage_analysis', 'Salvage Analysis', 'uncommon', ['economy'], 3, [st('xpGain', 'pct', 0.2)]),
  P('scrap_drones', 'Scrap Drones', 'common', ['economy'], 4, [st('salvageGain', 'pct', 0.15)]),
  P('trophy_hunters', 'Trophy Hunters', 'common', ['economy', 'on-kill'], 3, [tr('kill', { kind: 'salvage', amount: 1 }, 0.1)]),
  P('field_scholars', 'Field Scholars', 'common', ['economy'], 3, [tr('waveStart', { kind: 'xp', amount: 3 })]),
  P('combat_data', 'Combat Data', 'uncommon', ['economy', 'crit'], 3, [tr('crit', { kind: 'xp', amount: 0.5 }, 0.15)]),
  // defense
  P('hardened_bunkers', 'Hardened Bunkers', 'common', ['defense'], 4, [st('cityArmor', 'add', 0.12)]),
  P('field_hospitals', 'Field Hospitals', 'uncommon', ['defense'], 3, [st('cityRegen', 'add', 0.25)]),
  P('civil_defense', 'Civil Defense Grid', 'uncommon', ['defense', 'stun'], 3, [tr('cityHit', { kind: 'stunArea', radius: 0.15, duration: 1 }, 0.1)]),
  P('evac_protocols', 'Evacuation Protocols', 'uncommon', ['defense'], 3, [st('abductRecovery', 'add', 0.25)]),
  P('reconstruction', 'Reconstruction Crews', 'common', ['defense'], 3, [tr('waveStart', { kind: 'healCities', amount: 8 })]),
  P('interceptor_screens', 'Interceptor Screens', 'uncommon', ['defense', 'slow'], 3, [st('enemySpeed', 'pct', -0.06)]),
  P('orbital_nets', 'Orbital Nets', 'rare', ['defense', 'stun'], 2, [st('enemySpeed', 'pct', -0.04), tr('hit', { kind: 'stunArea', radius: 0.03, duration: 0.3 }, 0.05)]),
  // on-kill / on-hit
  P('volatile_payloads', 'Volatile Payloads', 'rare', ['on-kill', 'area'], 3, [tr('kill', { kind: 'explode', radius: 0.22, damageMul: 0.6 }, 0.25, any('kinetic', 'explosive'))]),
  P('chain_reaction', 'Chain Reaction', 'rare', ['on-kill', 'chain'], 3, [tr('kill', { kind: 'zap', jumps: 3, damageMul: 0.5 }, 0.15, any('energy'))]),
  P('morale_boost', 'Morale Broadcast', 'common', ['on-kill', 'defense'], 3, [tr('kill', { kind: 'healCity', amount: 0.3 })]),
  P('shockwave_cores', 'Shockwave Cores', 'rare', ['on-kill', 'stun'], 2, [tr('kill', { kind: 'stunArea', radius: 0.15, duration: 0.8 }, 0.1)]),
  P('static_discharge', 'Static Discharge', 'uncommon', ['on-hit', 'chain'], 3, [tr('hit', { kind: 'zap', jumps: 2, damageMul: 0.4 }, 0.05)]),
  P('micro_charges', 'Micro-Charges', 'uncommon', ['on-hit', 'area'], 3, [tr('hit', { kind: 'explode', radius: 0.06, damageMul: 0.4 }, 0.08)], 'content_passives2'),
  P('abductor_hunters', 'Abductor Hunters', 'rare', ['defense'], 1, [{ op: 'rule', rule: 'abductorBane' }]),
  // abilities and level-ups
  P('rapid_response', 'Rapid Response', 'uncommon', [], 3, [st('abilityCooldown', 'pct', -0.1)], 'content_passives2'),
  P('kinetic_feedback', 'Kinetic Feedback', 'uncommon', ['defense'], 2, [tr('abilityUse', { kind: 'healCities', amount: 10 })], 'content_passives2'),
  P('afterburners', 'Afterburners', 'common', ['economy'], 2, [tr('abilityUse', { kind: 'xp', amount: 5 })], 'content_passives2'),
  P('lucky_draw', 'Lucky Draw', 'epic', ['economy'], 1, [st('choices', 'add', 1)], 'content_passives2'),
  P('tactical_reserve', 'Tactical Reserve', 'common', ['economy'], 2, [st('rerolls', 'add', 2)]),
  P('purge_protocols', 'Purge Protocols', 'common', ['economy'], 2, [st('banishes', 'add', 2)]),
  P('adrenal_feed', 'Adrenal Feed', 'uncommon', ['defense'], 2, [tr('levelUp', { kind: 'healCities', amount: 15 })], 'content_passives2'),
];

export const RELICS: readonly UpgradeDef[] = [
  { id: 'glass_cannon', name: 'Glass Cannon', kind: 'relic', rarity: 'epic', tags: [], maxStacks: 1, text: 'All weapons hit far harder. Cities pay for it.', effects: [st('damage', 'pct', 0.5), st('cityDamageTaken', 'pct', 0.4)] },
  { id: 'scrap_economy', name: 'Scrap Economy', kind: 'relic', rarity: 'rare', tags: ['economy'], maxStacks: 1, text: 'Strip every wreck. Learn less from it.', effects: [st('salvageGain', 'pct', 0.6), st('xpGain', 'pct', -0.2)] },
  { id: 'second_wind', name: 'Second Wind', kind: 'relic', rarity: 'epic', tags: ['defense'], maxStacks: 1, text: 'Once per run, at 40% population, every surviving city is fully rebuilt.', effects: [{ op: 'rule', rule: 'secondWind' }] },
  { id: 'overcharge_core', name: 'Overcharge Core', kind: 'relic', rarity: 'rare', tags: ['crit'], maxStacks: 1, text: 'Every eighth volley of each weapon is a guaranteed critical.', effects: [{ op: 'rule', rule: 'overcharge' }] },
  { id: 'wide_draft', name: 'Wide Draft', kind: 'relic', rarity: 'epic', tags: ['economy'], maxStacks: 1, text: 'Level-ups offer one more choice.', effects: [st('choices', 'add', 1)] },
  { id: 'bounty_hunter', name: 'Bounty Ledger', kind: 'relic', rarity: 'rare', tags: ['economy'], maxStacks: 1, text: 'Elite and stronger aliens drop triple salvage.', effects: [{ op: 'rule', rule: 'bountyHunter' }] },
  { id: 'extra_ring', name: 'Extra Ring', kind: 'relic', rarity: 'epic', tags: [], maxStacks: 1, text: 'Two more weapon slots, at the cost of a little fire rate.', effects: [st('slots', 'add', 2), st('fireRate', 'pct', -0.1)] },
  { id: 'black_box', name: 'Black Box', kind: 'relic', rarity: 'rare', tags: ['economy'], maxStacks: 1, text: 'Three more rerolls and three more banishes.', effects: [st('rerolls', 'add', 3), st('banishes', 'add', 3)] },
  { id: 'quartermaster', name: 'Quartermaster', kind: 'relic', rarity: 'rare', tags: ['economy'], maxStacks: 1, text: 'Shop prices drop 15% and the first reroll each visit is free.', effects: [st('shopDiscount', 'add', 0.15), { op: 'rule', rule: 'freeShopReroll' }] },
  { id: 'stasis_lattice', name: 'Stasis Lattice', kind: 'relic', rarity: 'epic', tags: ['slow'], maxStacks: 1, text: 'Every alien moves 20% slower.', effects: [st('enemySpeed', 'pct', -0.2)] },
  { id: 'catalyst', name: 'Evolution Catalyst', kind: 'relic', rarity: 'legendary', tags: ['evolved'], maxStacks: 1, text: 'Evolutions unlock when both partners reach tier 4.', effects: [{ op: 'rule', rule: 'earlyEvolution' }], unlock: 'content_relics2' },
  { id: 'martyr_protocol', name: 'Martyr Protocol', kind: 'relic', rarity: 'rare', tags: ['defense'], maxStacks: 1, text: 'A falling city takes every nearby non-boss alien with it.', effects: [{ op: 'rule', rule: 'martyr' }], unlock: 'content_relics2' },
  { id: 'lucky_star', name: 'Lucky Star', kind: 'relic', rarity: 'epic', tags: ['economy'], maxStacks: 1, text: 'Rare, epic and legendary offers roll far more often.', effects: [{ op: 'rule', rule: 'luckyStar' }], unlock: 'content_relics2' },
  { id: 'insurance_policy', name: 'Insurance Policy', kind: 'relic', rarity: 'rare', tags: ['economy', 'defense'], maxStacks: 1, text: 'Every million people lost pays out 2 salvage.', effects: [{ op: 'rule', rule: 'insurance' }], unlock: 'content_relics2' },
  { id: 'siphon_array', name: 'Siphon Array', kind: 'relic', rarity: 'rare', tags: ['defense', 'on-kill'], maxStacks: 1, text: 'Every kill repairs the city that alien was attacking.', effects: [tr('kill', { kind: 'healCity', amount: 0.6 })], unlock: 'content_relics2' },
  { id: 'aegis_matrix', name: 'Aegis Matrix', kind: 'relic', rarity: 'epic', tags: ['defense'], maxStacks: 1, text: 'Cities shrug off 30% of damage. You learn 25% slower.', effects: [st('cityArmor', 'add', 0.3), st('xpGain', 'pct', -0.25)], unlock: 'content_relics2' },
];

const all = new Map([...PASSIVES, ...RELICS].map((p) => [p.id, p]));
export function upgradeById(id: string): UpgradeDef {
  const p = all.get(id);
  if (!p) throw new Error(`Unknown upgrade: ${id}`);
  return p;
}
/** @deprecated kept for tests written against milestone 3. */
export const passiveById = upgradeById;
