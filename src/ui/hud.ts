import { CITIES, CITY_MAX_HEALTH, POPULATION_LOSS_THRESHOLD } from '../data/cities';
import type { CityState } from '../sim/cities';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Command-console HUD. Text nodes are only touched when their value changes. */
export class Hud {
  private popText: HTMLElement;
  private popFill: HTMLElement;
  private fpsText: HTMLElement;
  private rowPop: HTMLElement[] = [];
  private rowHp: HTMLElement[] = [];
  private shownPop = new Float64Array(CITIES.length).fill(-1);
  private shownHp = new Float32Array(CITIES.length).fill(-1);
  private shownTotal = -1;
  private shownFps = -1;

  constructor(root: HTMLElement, private cities: CityState, seed: string, onCity: (i: number) => void) {
    const top = h('div', 'panel');
    top.id = 'topbar';
    const title = h('div', 'title');
    title.append('ORBITAL WATCH', h('span', undefined, ' // PLANETARY DEFENSE COMMAND'));
    const pop = h('div');
    pop.append(h('span', 'k', 'POPULATION'));
    this.popText = h('span');
    pop.append(this.popText);
    const bar = h('div', 'popbar');
    this.popFill = h('i');
    const mark = h('b');
    mark.style.left = `${POPULATION_LOSS_THRESHOLD * 100}%`;
    bar.append(this.popFill, mark);
    const seedEl = h('div');
    seedEl.append(h('span', 'k', 'SEED'), seed);
    const fps = h('div');
    fps.append(h('span', 'k', 'FPS'));
    this.fpsText = h('span');
    fps.append(this.fpsText);
    top.append(title, h('div', 'spacer'), pop, bar, seedEl, fps);

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
      this.rowPop.push(p);
      this.rowHp.push(fill);
    });
    list.append(rows);

    const hint = h('div', 'panel', 'DRAG: ROTATE  //  SCROLL: ZOOM  //  CLICK CITY: LOCATE');
    hint.id = 'hint';
    root.append(top, list, hint);
  }

  update(fps: number): void {
    const c = this.cities;
    const total = Math.round(c.totalPopulation() / 1e5);
    if (total !== this.shownTotal) {
      this.shownTotal = total;
      this.popText.textContent = `${(total / 10).toFixed(1)}M`;
      this.popFill.style.transform = `scaleX(${Math.min(1, (total * 1e5) / c.startPopulation)})`;
    }
    const f = Math.round(fps);
    if (f !== this.shownFps) {
      this.shownFps = f;
      this.fpsText.textContent = String(f);
    }
    for (let i = 0; i < c.count; i++) {
      const p = Math.round(c.population[i] / 1e5);
      if (p !== this.shownPop[i]) {
        this.shownPop[i] = p;
        this.rowPop[i].textContent = `${(p / 10).toFixed(1)}M`;
      }
      if (c.health[i] !== this.shownHp[i]) {
        this.shownHp[i] = c.health[i];
        const r = c.health[i] / CITY_MAX_HEALTH;
        this.rowHp[i].style.transform = `scaleX(${r})`;
        this.rowHp[i].style.background = r > 0.5 ? 'var(--ph)' : r > 0.25 ? 'var(--amber)' : 'var(--red)';
      }
    }
  }
}
