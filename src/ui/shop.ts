import { audio } from '../audio/audio';
import type { Game } from '../sim/game';
import { rerollCost, ShopStock } from '../sim/shop';
import { describeUpgrade } from './describe';
import { button, h } from './dom';
import { partnerStrip, weaponIcon } from './icons';

/** Resupply screen between waves. */
export class ShopScreen {
  readonly root = h('div');
  private cards = h('div', 'shop-cards');
  private armory = h('div', 'armory');
  private salvage = h('span', 'shop-salvage');
  private rerollBtn: HTMLButtonElement;
  private key = '';
  private onKey = (e: KeyboardEvent): void => {
    const g = this.game;
    if (!g.shop || e.target instanceof HTMLInputElement) return;
    const n = Number(e.key);
    if (n >= 1 && n <= g.shop.stock.length) {
      if (g.buy(n - 1)) audio.play('buy', 0.7);
    } else if (e.key === 'r' || e.key === 'R') {
      if (g.rerollShop()) audio.play('ui_click', 0.6);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      audio.play('wave', 0.7);
      g.leaveShop();
    }
  };

  constructor(parent: HTMLElement, private game: Game) {
    this.root.id = 'shop';
    const head = h('div', 'shop-head');
    head.append(h('div', 'lu-title', 'RESUPPLY // ORBITAL DEPOT'), this.salvage);
    this.rerollBtn = button('', () => {
      if (game.rerollShop()) audio.play('ui_click', 0.6);
    });
    const leave = button('[ENTER] LAUNCH NEXT WAVE >', () => {
      audio.play('wave', 0.7);
      game.leaveShop();
    }, 'cmd primary');
    const foot = h('div', 'lu-foot');
    foot.append(this.rerollBtn, leave);
    this.root.append(head, this.cards, this.armory, foot);
    parent.append(this.root);
    window.addEventListener('keydown', this.onKey);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }

  update(): void {
    const g = this.game;
    const s = g.shop;
    const key = s ? `${s.stock.map((x) => x.name + x.sold).join(',')}|${s.armory.map((a) => a.def.id + a.bought).join(',')}|${g.items.map((it) => it.count).join(',')}|${Math.floor(g.salvage)}|${g.wave}` : '';
    if (key === this.key) return;
    this.key = key;
    this.root.classList.toggle('on', !!s);
    if (!s) return;
    this.salvage.textContent = `SALVAGE: ${Math.floor(g.salvage)}`;
    const rc = rerollCost(g);
    this.rerollBtn.textContent = rc === 0 ? '[R] REROLL STOCK (FREE)' : `[R] REROLL STOCK (${rc})`;
    this.rerollBtn.disabled = g.salvage < rc;
    this.cards.textContent = '';
    s.stock.forEach((item, i) => this.cards.append(this.card(item, i)));
    // Armory: consumables never sell out, but each copy this visit costs more.
    this.armory.textContent = '';
    this.armory.append(h('h3', undefined, 'ARMORY // ONE-SHOT TACTICAL ITEMS'));
    const row = h('div', 'arow');
    s.armory.forEach((a, i) => {
      const held = g.items.find((it) => it.def.id === a.def.id)?.count ?? 0;
      const full = held >= a.def.maxStack;
      const el = h('div', `aitem${g.salvage < a.price || full ? ' poor' : ''}`);
      el.append(h('b', undefined, `${a.def.icon}  ${a.def.name.toUpperCase()}`), h('span', 'ap', full ? `FULL (${held}/${a.def.maxStack})` : `${a.price} SALVAGE  //  HELD ${held}/${a.def.maxStack}`), h('span', 'at', a.def.text));
      el.addEventListener('click', () => {
        if (g.buyArmory(i)) audio.play('buy', 0.7);
        else audio.play('ui_hover', 0.5, 0.6);
      });
      row.append(el);
    });
    this.armory.append(row);
  }

  private card(item: ShopStock, i: number): HTMLElement {
    const g = this.game;
    const afford = g.salvage >= item.price;
    const card = h('div', `lu-card shop-card r-${item.rarity}${item.sold ? ' sold' : ''}${!afford && !item.sold ? ' poor' : ''}`);
    const kindLabel: Record<string, string> = {
      passive: 'PASSIVE', relic: 'RELIC // RUN-ALTERING', repair: 'CITY REPAIR', repairAll: 'CITY REPAIR', slot: 'WEAPON SLOT',
      rerolls: 'LEVEL-UP REROLLS', tierUp: 'WEAPON REFIT', ability: 'ACTIVE ABILITY // RARE', defenseSlot: 'DEFENSE SLOT', defenseRefit: 'DEFENSE REFIT',
    };
    card.append(h('div', 'shop-key', `[${i + 1}]`), h('div', 'lu-kind', kindLabel[item.def.kind]));
    const head = h('div', 'lu-head');
    if (item.def.kind === 'tierUp' && item.slot !== undefined) head.append(weaponIcon(g.arsenal.weapons[item.slot].def));
    head.append(h('div', 'lu-name', item.name.toUpperCase()));
    card.append(head, h('div', 'lu-rarity', item.rarity.toUpperCase()));
    const body = h('div', 'lu-body');
    const lines = item.upgrade ? describeUpgrade(item.upgrade) : [item.text];
    if (item.ability) lines.push(`Cooldown ${item.ability.cooldown}s. Bound to ${g.abilities.length === 0 ? 'Q' : 'E'}.`);
    for (const l of lines) body.append(h('div', undefined, l));
    card.append(body);
    if (item.def.kind === 'tierUp' && item.slot !== undefined) card.append(partnerStrip(g, g.arsenal.weapons[item.slot].def));
    const price = h('div', 'price', item.sold ? 'ACQUIRED' : `${item.price} SALVAGE`);
    card.append(price);
    if (!item.sold) {
      card.addEventListener('click', () => {
        if (g.buy(i)) audio.play('buy', 0.7);
        else audio.play('ui_hover', 0.5, 0.6);
      });
      card.addEventListener('mouseenter', () => audio.play('ui_hover', 0.3));
    }
    return card;
  }
}
