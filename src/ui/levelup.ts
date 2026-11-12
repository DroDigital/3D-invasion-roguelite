import type { Game } from '../sim/game';
import type { Offer } from '../sim/offers';
import { audio } from '../audio/audio';
import { describeDefense, describeTierUp, describeUpgrade, describeWeapon } from './describe';
import { h } from './dom';
import { partnerStrip, weaponIcon } from './icons';

/** Pause overlay for the starting-weapon pick and every level-up. */
export class LevelUpScreen {
  readonly root = h('div');
  private title = h('div', 'lu-title');
  private cards = h('div', 'lu-cards');
  private rerollBtn = h('button', 'cmd');
  private info = h('span', 'lu-info');
  private shown: Offer[] | null = null;
  private shownKey = '';
  private onKey = (e: KeyboardEvent): void => {
    const g = this.game;
    if (!g.offer) return;
    const n = Number(e.key);
    if (n >= 1 && n <= g.offer.length) this.pick(n - 1);
    else if (e.key === 'r' || e.key === 'R') g.reroll();
  };

  constructor(parent: HTMLElement, private game: Game) {
    this.root.id = 'levelup';
    const foot = h('div', 'lu-foot');
    this.rerollBtn.addEventListener('click', () => game.reroll());
    foot.append(this.rerollBtn, this.info);
    this.root.append(this.title, this.cards, foot);
    parent.append(this.root);
    window.addEventListener('keydown', this.onKey);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }

  private pick(i: number): void {
    const o = this.game.offer?.[i];
    audio.play(o?.kind === 'evolve' ? 'evolve' : 'ui_click', 0.7);
    this.game.choose(i);
  }

  /** Rebuilds only when the offer or the reroll/banish counts change. */
  update(): void {
    const g = this.game;
    const key = g.offer ? `${g.offer.map((o) => o.key).join(',')}|${g.rerolls}|${g.banishes}|${g.level}` : '';
    if (g.offer === this.shown && key === this.shownKey) return;
    if (g.offer && !this.shown && g.offerKind === 'levelup') audio.play('levelup', 0.6);
    this.shown = g.offer;
    this.shownKey = key;
    this.root.classList.toggle('on', !!g.offer);
    if (!g.offer) return;

    const start = g.offerKind === 'start';
    this.title.textContent = start ? 'SELECT STARTING WEAPON' : `LEVEL ${g.level} // SELECT UPGRADE`;
    this.rerollBtn.style.display = start ? 'none' : '';
    this.rerollBtn.textContent = `[R] REROLL (${g.rerolls})`;
    this.rerollBtn.disabled = g.rerolls <= 0;
    this.info.textContent = start ? '' : `BANISHES LEFT: ${g.banishes}`;

    this.cards.textContent = '';
    g.offer.forEach((o, i) => {
      const rarity = o.kind === 'passive' ? o.upgrade.rarity : o.kind === 'weapon' ? o.weapon.rarity : o.kind === 'evolve' ? 'legendary' : o.kind === 'defense' ? o.defense.rarity : o.kind === 'overdrive' ? 'epic' : 'common';
      const card = h('div', `lu-card r-${rarity}${o.kind === 'evolve' ? ' evolve' : ''}`);
      card.append(h('div', 'lu-key', `[${i + 1}]`));
      if (o.kind === 'defense' || o.kind === 'defenseTier' || o.kind === 'overdrive') {
        const def = o.kind === 'overdrive' ? null : o.defense;
        card.classList.add(o.kind === 'overdrive' ? 'overdrive' : 'defense');
        card.append(h('div', 'lu-kind', o.kind === 'defense' ? 'NEW DEFENSE MODULE' : o.kind === 'defenseTier' ? `DEFENSE TIER ${o.toTier} > ${o.toTier + 1}` : `OVERDRIVE ${o.level}`));
        const head = h('div', 'lu-head');
        if (def) head.append(h('span', 'wicon dicon', def.icon));
        else head.append(weaponIcon((o as { weapon: import('../data/types').WeaponDef }).weapon, 'lit'));
        head.append(h('div', 'lu-name', (def ? def.name : (o as { weapon: { name: string } }).weapon.name).toUpperCase()));
        card.append(head, h('div', 'lu-rarity', def ? (o.kind === 'defense' ? def.rarity.toUpperCase() + ' // DEFENSE' : 'DEFENSE UPGRADE') : 'MAX TIER // ENDLESS'));
        const body = h('div', 'lu-body');
        const lines = o.kind === 'overdrive' ? [`+12% damage and +4% fire rate for this weapon.`, `Stacks without limit, each a little weaker.`] : describeDefense(def!, o.kind === 'defenseTier' ? o.toTier : 0, o.kind === 'defenseTier');
        for (const l of lines) body.append(h('div', undefined, l));
        card.append(body);
      } else if (o.kind === 'evolve') {
        const a = g.arsenal.weapons[o.a].def;
        const b = g.arsenal.weapons[o.b].def;
        card.append(h('div', 'lu-kind', 'EVOLUTION'));
        const merge = h('div', 'lu-merge');
        merge.append(weaponIcon(a, 'lit'), h('span', undefined, '+'), weaponIcon(b, 'lit'), h('span', undefined, '='), weaponIcon(o.result, 'lit big'));
        card.append(merge, h('div', 'lu-name', o.result.name.toUpperCase()), h('div', 'lu-rarity', 'MERGES TWO MAX-TIER WEAPONS // FREES A SLOT'));
        const body = h('div', 'lu-body');
        for (const l of describeWeapon(o.result)) body.append(h('div', undefined, l));
        card.append(body);
      } else {
        const kind = o.kind === 'weapon' ? 'NEW WEAPON' : o.kind === 'tier' ? `WEAPON TIER ${o.toTier} > ${o.toTier + 1}` : 'PASSIVE';
        const name = o.kind === 'passive' ? o.upgrade.name : o.weapon.name;
        const head = h('div', 'lu-head');
        if (o.kind !== 'passive') head.append(weaponIcon(o.weapon));
        head.append(h('div', 'lu-name', name.toUpperCase()));
        card.append(h('div', 'lu-kind', kind), head, h('div', 'lu-rarity', o.kind === 'tier' ? 'UPGRADE' : rarity.toUpperCase()));
        const lines = o.kind === 'weapon' ? describeWeapon(o.weapon) : o.kind === 'tier' ? describeTierUp(o.weapon, o.toTier) : describeUpgrade(o.upgrade);
        const body = h('div', 'lu-body');
        for (const l of lines) body.append(h('div', undefined, l));
        card.append(body);
        if (o.kind !== 'passive') card.append(partnerStrip(g, o.weapon));
        if (o.kind === 'passive') card.append(h('div', 'lu-stack', `STACK ${o.stacks + 1} / ${o.upgrade.maxStacks}`));
        const tagRow = h('div', 'lu-tags');
        for (const t of o.kind === 'passive' ? o.upgrade.tags : o.weapon.tags) tagRow.append(h('span', undefined, t));
        card.append(tagRow);
      }
      card.addEventListener('click', () => this.pick(i));
      card.addEventListener('mouseenter', () => audio.play('ui_hover', 0.3));
      if (!start && (o.kind === 'weapon' || o.kind === 'passive' || o.kind === 'defense')) {
        const ban = h('button', 'cmd lu-ban', 'BANISH');
        ban.disabled = g.banishes <= 0;
        ban.addEventListener('click', (ev) => {
          ev.stopPropagation();
          g.banish(i);
        });
        card.append(ban);
      }
      this.cards.append(card);
    });
  }
}
