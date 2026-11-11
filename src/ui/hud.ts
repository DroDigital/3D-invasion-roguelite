import { CITIES, CITY_MAX_HEALTH, POPULATION_LOSS_THRESHOLD } from '../data/cities';
import type { Game } from '../sim/game';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

function stat(parent: HTMLElement, label: string): HTMLElement {
  const box = h('div');
  const val = h('span');
  box.append(h('span', 'k', label), val);
  parent.append(box);
  return val;
}

function fmtTime(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Sets textContent only when the value changed, so idle frames touch no DOM. */
class Cell {
  private last: string | number = '';
  constructor(private el: HTMLElement) {}
  set(v: string | number): void {
    if (v === this.last) return;
    this.last = v;
    this.el.textContent = String(v);
  }
}

/** Command-console HUD. */
export class Hud {
  private pop: Cell;
  private popFill: HTMLElement;
  private wave: Cell;
  private hostiles: Cell;
  private kills: Cell;
  private fps: Cell;
  private rowPop: Cell[] = [];
  private rowHp: HTMLElement[] = [];
  private rows: HTMLElement[] = [];
  private shownHp = new Float32Array(CITIES.length).fill(-1);
  private shownSiege = new Uint8Array(CITIES.length);
  private shownTotal = -1;
  private arsenalRows: HTMLElement;
  private arsenalKey = '';
  private wpnStats: Cell[] = [];
  private banner: HTMLElement;
  private bannerWave = 0;
  private bannerUntil = 0;
  private gameover: HTMLElement;
  private gameoverBody: HTMLElement;
  private overShown = false;

  constructor(root: HTMLElement, private game: Game, seed: string, onCity: (i: number) => void) {
    const top = h('div', 'panel');
    top.id = 'topbar';
    const title = h('div', 'title');
    title.append('ORBITAL WATCH', h('span', undefined, ' // PLANETARY DEFENSE COMMAND'));
    top.append(title, h('div', 'spacer'));
    this.wave = new Cell(stat(top, 'WAVE'));
    this.hostiles = new Cell(stat(top, 'HOSTILES'));
    this.kills = new Cell(stat(top, 'KILLS'));
    this.pop = new Cell(stat(top, 'POPULATION'));
    const bar = h('div', 'popbar');
    this.popFill = h('i');
    const mark = h('b');
    mark.style.left = `${POPULATION_LOSS_THRESHOLD * 100}%`;
    bar.append(this.popFill, mark);
    top.append(bar);
    stat(top, 'SEED').textContent = seed;
    this.fps = new Cell(stat(top, 'FPS'));

    const list = h('div', 'panel');
    list.id = 'citylist';
    list.append(h('h2', undefined, 'CITIES'));
    const rows = h('div', 'rows');
    CITIES.forEach((c, i) => {
      const row = h('div', 'city-row');
      const p = h('span', 'pop');
      const hp = h('span', 'hp');
      const fill = h('i');
      hp.append(fill);
      row.append(h('span', undefined, c.name), p, hp);
      row.addEventListener('click', () => onCity(i));
      rows.append(row);
      this.rows.push(row);
      this.rowPop.push(new Cell(p));
      this.rowHp.push(fill);
    });
    list.append(rows);

    const arsenal = h('div', 'panel');
    arsenal.id = 'arsenal';
    arsenal.append(h('h2', undefined, 'ARSENAL'));
    this.arsenalRows = h('div', 'rows');
    arsenal.append(this.arsenalRows);

    this.banner = h('div');
    this.banner.id = 'banner';

    this.gameover = h('div');
    this.gameover.id = 'gameover';
    const panel = h('div', 'panel');
    panel.append(h('h2', undefined, 'DEFENSE FAILED // EARTH HAS FALLEN'));
    this.gameoverBody = h('div', 'body');
    const btns = h('div', 'btns');
    const retry = h('button', 'cmd', 'RETRY SEED');
    retry.addEventListener('click', () => location.assign(`?seed=${seed}`));
    const fresh = h('button', 'cmd', 'NEW RUN');
    fresh.addEventListener('click', () => location.assign(location.pathname));
    btns.append(retry, fresh);
    panel.append(this.gameoverBody, btns);
    this.gameover.append(panel);

    const hint = h('div', 'panel', 'DRAG: ROTATE  //  SCROLL: ZOOM  //  CLICK CITY: LOCATE');
    hint.id = 'hint';
    root.append(top, list, arsenal, this.banner, hint, this.gameover);
  }

  update(fps: number, now: number): void {
    const g = this.game;
    const c = g.cities;
    const total = Math.round(c.totalPopulation() / 1e5);
    if (total !== this.shownTotal) {
      this.shownTotal = total;
      this.pop.set(`${(total / 10).toFixed(1)}M`);
      this.popFill.style.transform = `scaleX(${Math.min(1, (total * 1e5) / c.startPopulation)})`;
    }
    this.wave.set(g.wave);
    this.hostiles.set(g.hostiles);
    this.kills.set(g.kills);
    this.fps.set(Math.round(fps));

    for (let i = 0; i < c.count; i++) {
      this.rowPop[i].set(`${(Math.round(c.population[i] / 1e5) / 10).toFixed(1)}M`);
      if (c.health[i] !== this.shownHp[i]) {
        this.shownHp[i] = c.health[i];
        const r = c.health[i] / CITY_MAX_HEALTH;
        this.rowHp[i].style.transform = `scaleX(${r})`;
        this.rowHp[i].style.background = r > 0.5 ? 'var(--ph)' : r > 0.25 ? 'var(--amber)' : 'var(--red)';
        this.rows[i].classList.toggle('dead', r <= 0);
      }
      const sieged = g.siege[i] > 0 ? 1 : 0;
      if (sieged !== this.shownSiege[i]) {
        this.shownSiege[i] = sieged;
        this.rows[i].classList.toggle('siege', sieged === 1);
      }
    }

    this.updateArsenal();

    if (g.wave !== this.bannerWave) {
      this.bannerWave = g.wave;
      this.banner.textContent = `WAVE ${g.wave} INBOUND`;
      this.banner.classList.add('on');
      this.bannerUntil = now + 2600;
    } else if (this.bannerUntil && now > this.bannerUntil) {
      this.bannerUntil = 0;
      this.banner.classList.remove('on');
    }

    if (g.phase === 'gameover' && !this.overShown) {
      this.overShown = true;
      const line = (k: string, v: string): HTMLElement => {
        const d = h('div', undefined, k);
        d.append(h('b', undefined, v));
        return d;
      };
      let lost = 0;
      for (let i = 0; i < c.count; i++) if (c.health[i] <= 0) lost++;
      this.gameoverBody.append(
        line('WAVE REACHED', String(g.wave)),
        line('TIME SURVIVED', fmtTime(g.time)),
        line('HOSTILES DESTROYED', String(g.kills)),
        line('CITIES LOST', `${lost} / ${c.count}`),
        line('SURVIVORS', `${(c.totalPopulation() / 1e6).toFixed(1)}M`),
      );
      this.gameover.classList.add('on');
    }
  }

  /** Build panel: every weapon, its tier and its damage dealt. Rebuilt only when the loadout changes. */
  private updateArsenal(): void {
    const a = this.game.arsenal;
    let key = String(a.slots);
    for (const w of a.weapons) key += `|${w.def.id}:${w.tier}`;
    if (key !== this.arsenalKey) {
      this.arsenalKey = key;
      this.arsenalRows.textContent = '';
      this.wpnStats = [];
      for (const w of a.weapons) {
        const row = h('div', 'wpn');
        const s = h('span', 'stat');
        row.append(h('span', 'name', w.def.name.toUpperCase()), h('span', 'tier', `T${w.tier + 1}`), s);
        this.arsenalRows.append(row);
        this.wpnStats.push(new Cell(s));
      }
      for (let i = a.weapons.length; i < a.slots; i++) this.arsenalRows.append(h('div', 'empty-slot', '-- EMPTY SLOT --'));
    }
    for (let i = 0; i < a.weapons.length; i++) {
      const w = a.weapons[i];
      this.wpnStats[i].set(`DMG ${Math.round(w.damageDealt)}  //  KILLS ${w.kills}`);
    }
  }
}
