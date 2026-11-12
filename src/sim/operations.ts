import { DIRECTIVES } from '../data/aliens';
import { OP_NAMES, OpReward } from '../data/campaign';
import { CONSUMABLES } from '../data/consumables';
import { CITY_MAX_HEALTH } from '../data/cities';
import type { DirectiveDef } from '../data/types';
import { addItem } from './consumables';
import { gainSalvage, gainXp, healCities } from './damage';
import type { Game } from './game';

/** The player's pick for the next wave: extra directives in exchange for rewards on clearing it. */
export interface Operation {
  name: string;
  risk: 0 | 1 | 2;
  directives: DirectiveDef[];
  rewards: OpReward[];
}

function rollReward(g: Game, big: boolean): OpReward {
  const r = g.shopRng;
  const w = g.wave + 1;
  const k = r.int(big ? 5 : 4);
  if (k === 0) return { kind: 'salvage', amount: Math.round((18 + w * 2.5) * (big ? 1.8 : 1)) };
  if (k === 1) return { kind: 'levels', amount: big ? 2 : 1 };
  if (k === 2) return { kind: 'items', amount: big ? 3 : 2 };
  if (k === 3) return { kind: 'repair', amount: big ? 50 : 30 };
  return { kind: 'relic' };
}

/** Three operations for the next wave, rolled when the shop opens. */
export function rollOperations(g: Game): void {
  const r = g.shopRng;
  const next = g.wave + 1;
  if (next < 3) {
    g.ops = [{ name: OP_NAMES[0][0], risk: 0, directives: [], rewards: [] }];
    g.opChoice = 0;
    return;
  }
  const pool = DIRECTIVES.filter((d) => d.minWave <= next + 3 && !g.directives.includes(d));
  const pick = (n: number): DirectiveDef[] => {
    const left = [...pool];
    const out: DirectiveDef[] = [];
    while (out.length < n && left.length) {
      const i = r.weighted(left.map((d) => d.weight));
      out.push(left[i]);
      left.splice(i, 1);
    }
    return out;
  };
  g.ops = [
    { name: OP_NAMES[0][0], risk: 0, directives: [], rewards: [] },
    { name: r.pick(OP_NAMES[1]), risk: 1, directives: pick(1), rewards: [rollReward(g, false)] },
    { name: r.pick(OP_NAMES[2]), risk: 2, directives: pick(2), rewards: [rollReward(g, true), rollReward(g, false)] },
  ];
  g.opChoice = 0;
}

export function describeReward(rw: OpReward): string {
  switch (rw.kind) {
    case 'salvage': return `+${rw.amount} SALVAGE`;
    case 'levels': return `+${rw.amount} LEVEL${rw.amount > 1 ? 'S' : ''}`;
    case 'items': return `${rw.amount} TACTICAL ITEMS`;
    case 'repair': return `REPAIR ALL CITIES +${rw.amount}`;
    case 'relic': return 'A RELIC IN THE NEXT DEPOT';
  }
}

/** Pay out the active operation after its wave is cleared. */
export function payOperation(g: Game): void {
  const op = g.activeOp;
  g.activeOp = null;
  if (!op || op.rewards.length === 0) return;
  for (const rw of op.rewards) {
    switch (rw.kind) {
      case 'salvage':
        gainSalvage(g, rw.amount, false);
        break;
      case 'levels':
        for (let k = 0; k < rw.amount; k++) gainXp(g, Math.max(0, g.xpNeeded - g.xp) / g.build.xpGain + 0.01);
        break;
      case 'items':
        for (let k = 0; k < rw.amount; k++) addItem(g, CONSUMABLES[g.shopRng.int(CONSUMABLES.length)]);
        break;
      case 'repair':
        healCities(g, Math.min(CITY_MAX_HEALTH, rw.amount));
        break;
      case 'relic':
        g.relicOwed = true;
        break;
    }
  }
  g.addLog(`${op.name} COMPLETE: ${op.rewards.map(describeReward).join(', ')}`, 'good');
}
