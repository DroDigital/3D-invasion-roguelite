import type { Game } from '../sim/game';
import type { Offer } from '../sim/offers';
import { describeTierUp, describeUpgrade, describeWeapon } from './describe';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Pause overlay for the starting-weapon pick and every level-up. */
export class LevelUpScreen {
  private root: HTMLElement;
  private title: HTMLElement;
  private cards: HTMLElement;
  private rerollBtn: HTMLButtonElement;
  private info: HTMLElement;
  private shown: Offer[] | null = null;
  private shownKey = '';

  constructor(parent: HTMLElement, private game: Game) {
    this.root = h('div');
    this.root.id = 'levelup';
    this.title = h('div', 'lu-title');
    this.cards = h('div', 'lu-cards');
    const foot = h('div', 'lu-foot');
    this.rerollBtn = h('button', 'cmd');
    this.rerollBtn.addEventListener('click', () => game.reroll());
    this.info = h('span', 'lu-info');
    foot.append(this.rerollBtn, this.info);
    this.root.append(this.title, this.cards, foot);
    parent.append(this.root);

    window.addEventListener('keydown', (e) => {
      if (!game.offer) return;
      if (e.key >= '1' && e.key <= '3') game.choose(Number(e.key) - 1);
      else if (e.key === 'r' || e.key === 'R') game.reroll();
    });
  }

  /** Rebuilds only when the offer or the reroll/banish counts change. */
  update(): void {
    const g = this.game;
    const key = g.offer ? `${g.offer.map((o) => o.key).join(',')}|${g.rerolls}|${g.banishes}|${g.level}` : '';
    if (g.offer === this.shown && key === this.shownKey) return;
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
      const rarity = o.kind === 'passive' ? o.upgrade.rarity : o.kind === 'weapon' ? o.weapon.rarity : 'common';
      const card = h('div', `lu-card r-${rarity}`);
      const kind = o.kind === 'weapon' ? 'NEW WEAPON' : o.kind === 'tier' ? `WEAPON TIER ${o.toTier} > ${o.toTier + 1}` : 'PASSIVE';
      const name = o.kind === 'passive' ? o.upgrade.name : o.weapon.name;
      const lines = o.kind === 'weapon' ? describeWeapon(o.weapon) : o.kind === 'tier' ? describeTierUp(o.weapon, o.toTier) : describeUpgrade(o.upgrade);
      const tags = o.kind === 'passive' ? o.upgrade.tags : o.weapon.tags;

      card.append(h('div', 'lu-key', `[${i + 1}]`), h('div', 'lu-kind', kind), h('div', 'lu-name', name.toUpperCase()));
      card.append(h('div', 'lu-rarity', o.kind === 'tier' ? 'UPGRADE' : rarity.toUpperCase()));
      const body = h('div', 'lu-body');
      for (const l of lines) body.append(h('div', undefined, l));
      card.append(body);
      if (o.kind === 'passive') card.append(h('div', 'lu-stack', `STACK ${o.stacks + 1} / ${o.upgrade.maxStacks}`));
      const tagRow = h('div', 'lu-tags');
      for (const t of tags) tagRow.append(h('span', undefined, t));
      card.append(tagRow);

      card.addEventListener('click', () => g.choose(i));
      if (!start && o.kind !== 'tier') {
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
