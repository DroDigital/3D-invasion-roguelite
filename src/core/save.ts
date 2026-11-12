import { COMMANDERS, UNLOCKS } from '../data/meta';

export interface Settings {
  /** Ordered dithering + colour quantisation. */
  dither: boolean;
  crt: boolean;
  /** PS2/PS1-style vertex snapping on ships and weapons. */
  vertexSnap: boolean;
  /** Affine (non-perspective) texture warp on ship detail textures. */
  affine: boolean;
  bloom: boolean;
  shake: boolean;
  damageNumbers: boolean;
  showFps: boolean;
  seenHint: boolean;
  master: number;
  sfx: number;
  music: number;
}

export interface Profile {
  version: 1;
  points: number;
  totalPoints: number;
  unlocks: string[];
  commander: string;
  loadout: string[];
  settings: Settings;
  stats: { runs: number; bestWave: number; kills: number; evolutions: number };
}

const KEY = 'orbital-watch/profile';

export function defaultProfile(): Profile {
  return {
    version: 1,
    points: 0,
    totalPoints: 0,
    unlocks: [],
    commander: 'vance',
    loadout: [],
    settings: { dither: true, crt: true, vertexSnap: true, affine: true, bloom: true, shake: true, damageNumbers: true, showFps: false, seenHint: false, master: 0.8, sfx: 0.8, music: 0.5 },
    stats: { runs: 0, bestWave: 0, kills: 0, evolutions: 0 },
  };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile();
    const p = JSON.parse(raw) as Partial<Profile>;
    const d = defaultProfile();
    return { ...d, ...p, settings: { ...d.settings, ...p.settings }, stats: { ...d.stats, ...p.stats }, version: 1 };
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage full or blocked (private mode): progress lives for this session only.
  }
}

export function owns(p: Profile, unlockId: string): boolean {
  return p.unlocks.includes(unlockId);
}

export function abilitySlots(p: Profile): number {
  return owns(p, 'ability_slot_2') ? 2 : 1;
}

export function unlockedAbilities(p: Profile): string[] {
  return UNLOCKS.filter((u) => u.kind === 'ability' && owns(p, u.id)).map((u) => u.grants!);
}

export function unlockedCommanders(p: Profile): string[] {
  return COMMANDERS.filter((c) => c.metaCost === 0 || UNLOCKS.some((u) => u.kind === 'commander' && u.grants === c.id && owns(p, u.id))).map((c) => c.id);
}

/** Buy an unlock with command points. Returns false if unaffordable or already owned. */
export function buyUnlock(p: Profile, unlockId: string): boolean {
  const u = UNLOCKS.find((x) => x.id === unlockId);
  if (!u || owns(p, u.id) || p.points < u.cost) return false;
  if (u.requires && !owns(p, u.requires)) return false;
  p.points -= u.cost;
  p.unlocks.push(u.id);
  if (u.kind === 'ability' && p.loadout.length < abilitySlots(p)) p.loadout.push(u.grants!);
  saveProfile(p);
  return true;
}
