import { ALIENS } from '../data/aliens';
import { CITIES, CITY_MAX_HEALTH, POPULATION_LOSS_THRESHOLD } from '../data/cities';
import type { Game } from '../sim/game';
import { tierOf } from '../sim/weapons';
import { button, Cell, fmtPop, fmtTime, h } from './dom';
import { partnerStrip, weaponIcon } from './icons';

export interface HudCallbacks {
  onCity(i: number): void;
  onAbility(i: number): void;
  onRetry(): void;
  onNewRun(): void;
  onMenu(): void;
}

function stat(parent: HTMLElement, label: string, cls = ''): Cell {
  const box = h('div', cls);
  const val = h('span');
  box.append(h('span', 'k', label), val);
  parent.append(box);
  return new Cell(val);
}

/** Command-console HUD for a run. All updates are change-driven. */
export class Hud {
  readonly root = h('div', 'hud');
  private wave: Cell;
  private hostiles: Cell;
  private kills: Cell;
  private salvage: Cell;
  private pop: Cell;
  private popFill: HTMLElement;
  private fps: Cell;
  private rowPop: Cell[] = [];
  private rowHp: HTMLElement[] = [];
  private rows: HTMLElement[] = [];
  private shownHp = new Float32Array(CITIES.length).fill(-1);
  private shownState = new Int8Array(CITIES.length).fill(-1);
  private buildRows: HTMLElement;
  private buildKey = '';
  private wpnStat: Cell[] = [];
  private wpnJam: HTMLElement[] = [];
  private systemsRows: HTMLElement;
  private systemsKey = '';
  private level: Cell;
  private xpFill: HTMLElement;
  private abilityBar: HTMLElement;
  private abilityKey = '';
  private abilityCd: { fill: HTMLElement; txt: Cell; btn: HTMLElement }[] = [];
  private bossBar: HTMLElement;
  private bossName: Cell;
  private bossFill: HTMLElement;
  private bossShield: HTMLElement;
  private log: HTMLElement;
  private lastEntry: unknown = null;
  private banner: HTMLElement;
  private bannerUntil = 0;
  private gameover: HTMLElement;
  private gameoverBody: HTMLElement;
  private gameoverTitle!: HTMLElement;
  private overShown = false;
  private status: Cell;

  constructor(parent: HTMLElement, private game: Game, seed: string, private cb: HudCallbacks) {
    const top = h('div', 'panel');
    top.id = 'topbar';
    const title = h('div', 'title');
    title.append('ORBITAL WATCH', h('span', undefined, ' // PLANETARY DEFENSE COMMAND'));
    top.append(title, h('div', 'spacer'));
    this.wave = stat(top, 'WAVE');
    this.status = stat(top, '', 'status');
    this.hostiles = stat(top, 'HOSTILES');
    this.kills = stat(top, 'KILLS');
    this.salvage = stat(top, 'SALVAGE', 'salvage');
    this.pop = stat(top, 'POP');
    const bar = h('div', 'popbar');
    this.popFill = h('i');
    const mark = h('b');
    mark.style.left = `${POPULATION_LOSS_THRESHOLD * 100}%`;
    bar.append(this.popFill, mark);
    top.append(bar);
    stat(top, 'SEED', 'seed').set(seed);
    this.fps = stat(top, 'FPS', 'fps');

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
      row.append(h('span', 'cname', c.name), p, hp);
      row.addEventListener('click', () => cb.onCity(i));
      rows.append(row);
      this.rows.push(row);
      this.rowPop.push(new Cell(p));
      this.rowHp.push(fill);
    });
    list.append(rows);

    const right = h('div');
    right.id = 'rightcol';
    const build = h('div', 'panel');
    build.id = 'build';
    build.append(h('h2', undefined, 'BUILD // WEAPONS'));
    this.buildRows = h('div', 'rows');
    build.append(this.buildRows);
    const systems = h('div', 'panel');
    systems.id = 'systems';
    systems.append(h('h2', undefined, 'SYSTEMS'));
    this.systemsRows = h('div', 'rows');
    systems.append(this.systemsRows);
    right.append(build, systems);

    const bottom = h('div');
    bottom.id = 'bottom';
    const xp = h('div');
    xp.id = 'xpbar';
    const lv = h('span', 'lv');
    this.level = new Cell(lv);
    const track = h('div', 'track');
    this.xpFill = h('i');
    track.append(this.xpFill);
    xp.append(lv, track);
    this.abilityBar = h('div');
    this.abilityBar.id = 'abilities';
    bottom.append(this.abilityBar, xp);

    this.bossBar = h('div', 'panel');
    this.bossBar.id = 'bossbar';
    const bn = h('div', 'bname');
    this.bossName = new Cell(bn);
    const bt = h('div', 'btrack');
    this.bossFill = h('i');
    this.bossShield = h('b');
    bt.append(this.bossFill, this.bossShield);
    this.bossBar.append(bn, bt);

    this.log = h('div');
    this.log.id = 'log';
    this.banner = h('div');
    this.banner.id = 'banner';

    this.gameover = h('div');
    this.gameover.id = 'gameover';
    const panel = h('div', 'panel');
    this.gameoverTitle = h('h2', undefined, 'DEFENSE FAILED // EARTH HAS FALLEN');
    panel.append(this.gameoverTitle);
    this.gameoverBody = h('div', 'body');
    const btns = h('div', 'btns');
    btns.append(button('RETRY SEED', () => cb.onRetry()), button('NEW RUN', () => cb.onNewRun()), button('COMMAND', () => cb.onMenu()));
    panel.append(this.gameoverBody, btns);
    this.gameover.append(panel);

    this.root.append(top, list, right, bottom, this.bossBar, this.log, this.banner, this.gameover);
    parent.append(this.root);
  }

  dispose(): void {
    this.root.remove();
  }

  showBanner(text: string, kind: string, now: number, ms = 2600): void {
    this.banner.textContent = text;
    this.banner.className = `on ${kind}`;
    this.bannerUntil = now + ms;
  }

  update(fps: number, now: number, points: number): void {
    const g = this.game;
    const c = g.cities;
    this.wave.set(g.wave);
    this.status.set(g.phase === 'intermission' && g.wave > 0 ? `NEXT ${Math.ceil(g.nextWaveIn)}s` : g.phase === 'shop' ? 'RESUPPLY' : '');
    this.hostiles.set(g.hostiles);
    this.kills.set(g.kills);
    this.salvage.set(Math.floor(g.salvage));
    const total = c.totalPopulation();
    this.pop.set(fmtPop(total));
    this.popFill.style.transform = `scaleX(${Math.min(1, total / c.startPopulation).toFixed(3)})`;
    this.fps.set(Math.round(fps));

    for (let i = 0; i < c.count; i++) {
      this.rowPop[i].set(fmtPop(c.population[i]));
      if (c.health[i] !== this.shownHp[i]) {
        this.shownHp[i] = c.health[i];
        const r = c.health[i] / CITY_MAX_HEALTH;
        this.rowHp[i].style.transform = `scaleX(${r.toFixed(3)})`;
        this.rowHp[i].style.background = r > 0.5 ? 'var(--ph)' : r > 0.25 ? 'var(--amber)' : 'var(--red)';
      }
      const st = c.health[i] <= 0 ? 0 : g.cityShield[i] > 0 ? 3 : g.threat[i] > 0 ? 2 : 1;
      if (st !== this.shownState[i]) {
        this.shownState[i] = st;
        this.rows[i].className = `city-row${st === 0 ? ' dead' : st === 2 ? ' siege' : st === 3 ? ' shielded' : ''}`;
      }
    }

    this.updateBuild();
    this.updateSystems();
    this.updateAbilities();

    this.level.set(`LV ${g.level}`);
    this.xpFill.style.transform = `scaleX(${(g.xp / g.xpNeeded).toFixed(3)})`;

    const b = g.bossSlot;
    const e = g.enemies;
    if (b >= 0 && e.alive[b]) {
      this.bossBar.classList.add('on');
      this.bossName.set(ALIENS[e.def[b]].name.toUpperCase());
      this.bossFill.style.transform = `scaleX(${Math.max(0, e.hp[b] / e.maxHp[b]).toFixed(3)})`;
      this.bossShield.style.transform = `scaleX(${e.maxShield[b] > 0 ? (e.shield[b] / e.maxShield[b]).toFixed(3) : '0'})`;
    } else this.bossBar.classList.remove('on');

    // New log entries since the last frame (the sim's log is a capped, shifting list).
    const L = g.log;
    let start = L.length;
    for (let k = L.length - 1; k >= 0 && L[k] !== this.lastEntry; k--) start = k;
    for (let k = start; k < L.length; k++) {
      const entry = L[k];
      const line = h('div', `entry ${entry.kind}`, `[${fmtTime(entry.t)}] ${entry.text}`);
      this.log.prepend(line);
      while (this.log.childElementCount > 5) this.log.lastElementChild!.remove();
      if (entry.kind === 'boss') this.showBanner(entry.text, 'boss', now, 3500);
      else if (entry.text.startsWith('WAVE') && entry.text.endsWith('INBOUND')) this.showBanner(entry.text, 'info', now);
      else if (entry.text.startsWith('EVOLUTION')) this.showBanner(entry.text.replace('EVOLUTION: ', ''), 'good', now, 3500);
    }
    if (L.length) this.lastEntry = L[L.length - 1];
    if (this.bannerUntil && now > this.bannerUntil) {
      this.bannerUntil = 0;
      this.banner.className = '';
    }

    if (g.phase === 'gameover' && !this.overShown) this.showGameOver(points);
  }

  private showGameOver(points: number): void {
    const g = this.game;
    const c = g.cities;
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
      line('LEVEL', String(g.level)),
      line('TIME SURVIVED', fmtTime(g.time)),
      line('HOSTILES DESTROYED', String(g.kills)),
      line('BOSSES DESTROYED', String(g.bossKills)),
      line('CITIES LOST', `${lost} / ${c.count}`),
      line('PEOPLE RESCUED FROM ABDUCTORS', fmtPop(g.peopleRescued)),
      line('SURVIVORS', fmtPop(c.totalPopulation())),
      line('COMMAND POINTS EARNED', `+${points}`),
    );
    this.gameoverBody.lastElementChild!.classList.add('points');
    const lostRun = c.isLost();
    this.gameoverTitle.textContent = lostRun ? 'DEFENSE FAILED // EARTH HAS FALLEN' : 'RUN ABANDONED // COMMAND RELIEVED';
    this.gameover.classList.add('on');
  }

  /** Build panel: every weapon, its tier, its damage dealt and its evolution partners. */
  private updateBuild(): void {
    const g = this.game;
    const a = g.arsenal;
    let key = `${a.slots}|${g.build.rules.has('earlyEvolution')}`;
    for (const w of a.weapons) key += `|${w.def.id}:${w.tier}`;
    if (key !== this.buildKey) {
      this.buildKey = key;
      this.buildRows.textContent = '';
      this.wpnStat = [];
      this.wpnJam = [];
      for (const w of a.weapons) {
        const row = h('div', 'wpn');
        const head = h('div', 'whead');
        const pips = h('span', 'pips');
        if (w.def.evolved) pips.append(h('b', 'evo', 'EVOLVED'));
        else for (let t = 0; t < 5; t++) pips.append(h('i', t <= w.tier ? 'on' : ''));
        const jam = h('span', 'jam', 'JAMMED');
        head.append(weaponIcon(w.def), h('span', 'name', w.def.name.toUpperCase()), jam, pips);
        const s = h('div', 'stat');
        row.append(head, s, partnerStrip(g, w.def, true));
        this.buildRows.append(row);
        this.wpnStat.push(new Cell(s));
        this.wpnJam.push(jam);
      }
      for (let i = a.weapons.length; i < a.slots; i++) this.buildRows.append(h('div', 'empty-slot', '-- EMPTY SLOT --'));
    }
    let total = 0;
    for (const w of a.weapons) total += w.damageDealt;
    for (let i = 0; i < a.weapons.length; i++) {
      const w = a.weapons[i];
      const share = total > 0 ? Math.round((w.damageDealt / total) * 100) : 0;
      this.wpnStat[i].set(`DMG ${Math.round(w.damageDealt).toLocaleString('en-US')} (${share}%)  //  KILLS ${w.kills}  //  x${tierOf(w).emitters}`);
      this.wpnJam[i].style.display = w.jam > 0 ? '' : 'none';
    }
  }

  private updateSystems(): void {
    const b = this.game.build;
    let sk = '';
    for (const u of b.owned) sk += `${u.id}${b.stacksOf(u.id)}`;
    if (sk === this.systemsKey) return;
    this.systemsKey = sk;
    this.systemsRows.textContent = '';
    if (b.owned.length === 0) this.systemsRows.append(h('div', 'empty-slot', '-- NO UPGRADES --'));
    for (const u of b.owned) {
      const row = h('div', `sys${u.kind === 'relic' ? ' relic' : ''}`, (u.kind === 'relic' ? '◆ ' : '') + u.name.toUpperCase());
      row.append(h('b', undefined, u.kind === 'relic' ? 'RELIC' : `x${b.stacksOf(u.id)}`));
      this.systemsRows.append(row);
    }
  }

  private updateAbilities(): void {
    const g = this.game;
    const key = `${g.abilitySlots}|${g.abilities.map((a) => a.def.id).join(',')}`;
    if (key !== this.abilityKey) {
      this.abilityKey = key;
      this.abilityBar.textContent = '';
      this.abilityCd = [];
      for (let i = 0; i < 2; i++) {
        const a = g.abilities[i];
        const locked = i >= g.abilitySlots;
        const btn = h('div', `ability${a ? '' : ' empty'}${locked ? ' locked' : ''}`);
        btn.append(h('span', 'key', i === 0 ? 'Q' : 'E'));
        btn.append(h('span', 'aname', a ? a.def.name.toUpperCase() : locked ? 'SLOT LOCKED' : 'NO ABILITY'));
        const fill = h('i', 'cd');
        const txt = h('span', 'cdtxt');
        btn.append(fill, txt);
        if (a) {
          btn.title = a.def.text;
          btn.addEventListener('click', () => this.cb.onAbility(i));
        }
        this.abilityBar.append(btn);
        this.abilityCd.push({ fill, txt: new Cell(txt), btn });
      }
    }
    for (let i = 0; i < this.abilityCd.length; i++) {
      const a = g.abilities[i];
      const v = this.abilityCd[i];
      if (!a) continue;
      const f = a.cd / (a.def.cooldown * g.build.abilityCooldown);
      v.fill.style.transform = `scaleY(${Math.max(0, f).toFixed(3)})`;
      v.txt.set(a.cd > 0 ? `${Math.ceil(a.cd)}s` : 'READY');
      v.btn.classList.toggle('ready', a.cd <= 0);
    }
  }

  setTargeting(i: number | null): void {
    this.abilityCd.forEach((v, k) => v.btn.classList.toggle('targeting', k === i));
  }
}
