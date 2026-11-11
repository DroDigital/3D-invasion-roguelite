import type { WeaponDef } from '../data/types';
import { evolutionsOf, weaponById } from '../data/weapons';
import type { Game } from '../sim/game';
import { isMaxTier } from '../sim/weapons';
import { h } from './dom';

/** Square two-letter glyph, coloured by family. */
export function weaponIcon(def: WeaponDef, extra = ''): HTMLElement {
  const el = h('span', `wicon fam-${def.family}${def.evolved ? ' evo' : ''}${extra ? ' ' + extra : ''}`, def.icon);
  el.title = def.name;
  return el;
}

/**
 * Evolution pairing strip for a weapon: one entry per partner, showing the partner's icon
 * (lit when owned), both tiers as progress toward the merge, and the evolved result.
 */
export function partnerStrip(g: Game, def: WeaponDef, compact = false): HTMLElement {
  const wrap = h('div', 'partners');
  if (def.evolved) return wrap;
  const early = g.build.rules.has('earlyEvolution');
  const need = early ? 4 : 5;
  for (const { evo, partner } of evolutionsOf(def.id)) {
    const pdef = weaponById(partner);
    const mine = g.arsenal.get(def.id);
    const theirs = g.arsenal.get(partner);
    const row = h('div', `partner${theirs ? ' owned' : ''}`);
    row.append(h('span', 'plus', '+'), weaponIcon(pdef, theirs ? 'lit' : 'dim'));
    const a = mine ? mine.tier + 1 : 0;
    const b = theirs ? theirs.tier + 1 : 0;
    const ready = mine && theirs && (isMaxTier(mine) || (early && mine.tier >= 3)) && (isMaxTier(theirs) || (early && theirs.tier >= 3));
    if (!compact) {
      const bar = h('span', 'merge');
      const fill = h('i');
      fill.style.width = `${(Math.min(a, need) + Math.min(b, need)) / (need * 2) * 100}%`;
      bar.append(fill);
      row.append(bar);
    }
    row.append(h('span', `mtxt${ready ? ' ready' : ''}`, ready ? 'READY' : `${a}/${need} ${b}/${need}`));
    const res = weaponById(evo.result);
    row.append(h('span', 'arrow', '>'), weaponIcon(res, ready ? 'lit' : 'dim'));
    row.title = `${def.name} + ${pdef.name} at tier ${need} evolve into ${res.name}`;
    wrap.append(row);
  }
  return wrap;
}
