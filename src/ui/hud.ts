import { ALIENS } from '../data/aliens';
import { CITIES, CITY_MAX_HEALTH, POPULATION_LOSS_THRESHOLD } from '../data/cities';
import type { Game } from '../sim/game';
import { readyEvolutions } from '../sim/offers';
import { tierOf } from '../sim/weapons';
import { describeUpgrade, describeWeapon } from './describe';
import { button, Cell, fmtPop, fmtTime, h } from './dom';
import { partnerStrip, weaponIcon } from './icons';

export interface HudCallbacks {
  onCity(i: number): void;
  onCityHover(i: number): void;
  onAbility(i: number): void;
  onSpeed(speed: number): void;
  onPause(): void;
  onSettings(): void;
  onRetry(): void;
  onNewRun(): void;
  onMenu(): void;
}

const MAX_THREAT_ROWS = 7;

/** Command HUD: four corners plus a bottom dock, everything change-driven. */
export class Hud {
  readonly root = h('div', 'hud');
  private wave: Cell;
  private status: Cell;
  private hostiles: Cell;
  private salvage: Cell;
  private kills: Cell;
  private allies: Cell;
  private pop: Cell;
  private popFill: HTMLElement;
  private online: Cell;
  private fps: Cell;
  private speedBtns: HTMLElement[] = [];
  private pauseBtn: HTMLElement;
  private threatRows: HTMLElement;
  private threatKey = '\u0000';
  private showAll = false;
  private tiles: HTMLElement;
  private tileKey = '';
  private tileShare: HTMLElement[] = [];
  private tileJam: HTMLElement[] = [];
  private systems: HTMLElement;
  private systemsKey = '';
  private level: Cell;
  private xpFill: HTMLElement;
  private xpBar: HTMLElement;
  private abilityBar: HTMLElement;
  private abilityKey = '';
  private abilityCd: { cd: HTMLElement; txt: Cell; btn: HTMLElement }[] = [];
  private bossBar: HTMLElement;
  private bossName: Cell;
  private bossFill: HTMLElement;
  private bossShield: HTMLElement;
  private log: HTMLElement;
  private lastEntry: unknown = null;
  private banner: HTMLElement;
  private bannerUntil = 0;
  private tooltip: HTMLElement;
  private gameover: HTMLElement;
  private gameoverBody: HTMLElement;
  private gameoverTitle: HTMLElement;
  private overShown = false;
  showFps = false;

  constructor(parent: HTMLElement, private game: Game, seed: string, private cb: HudCallbacks) {
    // ---- top-left: wave ----
    const tl = h('div', 'hpanel');
    tl.id = 'hud-wave';
    const wv = h('div', 'wave-num');
    tl.append(h('div', 'lbl', 'WAVE'), wv);
    this.wave = new Cell(wv);
    const st = h('div', 'wave-status');
    this.status = new Cell(st);
    const hs = h('div', 'wave-hostiles');
    this.hostiles = new Cell(hs);
    tl.append(st, hs);

    // ---- top-centre: population ----
    const tc = h('div', 'hpanel');
    tc.id = 'hud-pop';
    const popHead = h('div', 'pop-head');
    const popV = h('b');
    this.pop = new Cell(popV);
    const onl = h('span', 'online');
    this.online = new Cell(onl);
    popHead.append(h('span', 'lbl', 'POPULATION'), popV, onl);
    const bar = h('div', 'popbar');
    this.popFill = h('i');
    const mark = h('b');
    mark.style.left = `${POPULATION_LOSS_THRESHOLD * 100}%`;
    mark.title = 'Run ends below this line';
    bar.append(this.popFill, mark);
    tc.append(popHead, bar);
    this.bossBar = h('div', 'bossbar');
    const bn = h('div', 'bname');
    this.bossName = new Cell(bn);
    const bt = h('div', 'btrack');
    this.bossFill = h('i');
    this.bossShield = h('b');
    bt.append(this.bossFill, this.bossShield);
    this.bossBar.append(bn, bt);
    tc.append(this.bossBar);

    // ---- top-right: economy + controls ----
    const tr = h('div', 'hpanel');
    tr.id = 'hud-ctrl';
    const stats = h('div', 'stats');
    const mk = (label: string, cls: string): Cell => {
      const v = h('b');
      const d = h('div', `stat ${cls}`);
      d.append(h('span', 'lbl', label), v);
      stats.append(d);
      return new Cell(v);
    };
    this.salvage = mk('SALVAGE', 'salv');
    this.kills = mk('KILLS', 'kills');
    this.allies = mk('ALLIES', 'ally');
    const ctrl = h('div', 'ctrl');
    this.pauseBtn = button('II', () => cb.onPause(), 'cbtn');
    this.pauseBtn.title = 'Pause (Space)';
    ctrl.append(this.pauseBtn);
    for (const s of [1, 2, 3]) {
      const b = button(`${s}x`, () => cb.onSpeed(s), 'cbtn');
      b.title = `Game speed ${s}x (Tab cycles)`;
      this.speedBtns.push(b);
      ctrl.append(b);
    }
    const gear = button('⚙', () => cb.onSettings(), 'cbtn');
    gear.title = 'Settings (Esc)';
    ctrl.append(gear);
    tr.append(stats, ctrl);
    const fpsEl = h('div', 'fps');
    this.fps = new Cell(fpsEl);
    tr.append(fpsEl);

    // ---- left: threat board ----
    const threats = h('div', 'hpanel');
    threats.id = 'threats';
    const th = h('div', 'phead');
    const toggle = h('button', 'mini', 'ALL');
    toggle.addEventListener('click', () => {
      this.showAll = !this.showAll;
      toggle.classList.toggle('on', this.showAll);
      this.threatKey = '';
    });
    th.append(h('span', undefined, 'THREAT BOARD'), toggle);
    this.threatRows = h('div', 'rows');
    threats.append(th, this.threatRows);

    // ---- right: arsenal ----
    const ars = h('div', 'hpanel');
    ars.id = 'arsenal';
    ars.append(h('div', 'phead', 'ARSENAL'));
    this.tiles = h('div', 'tiles');
    this.systems = h('div', 'syschips');
    ars.append(this.tiles, this.systems);

    // ---- bottom: abilities + xp ----
    const bottom = h('div');
    bottom.id = 'dock';
    this.abilityBar = h('div', 'abilities');
    bottom.append(this.abilityBar);
    this.xpBar = h('div');
    this.xpBar.id = 'xpbar';
    const lv = h('span', 'lv');
    this.level = new Cell(lv);
    const track = h('div', 'track');
    this.xpFill = h('i');
    track.append(this.xpFill);
    this.xpBar.append(lv, track);

    this.log = h('div');
    this.log.id = 'log';
    this.banner = h('div');
    this.banner.id = 'banner';
    this.tooltip = h('div', 'tooltip');

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
    void seed;

    this.root.append(tl, tc, tr, threats, ars, bottom, this.xpBar, this.log, this.banner, this.tooltip, this.gameover);
    parent.append(this.root);
  }

  dispose(): void {
    this.root.remove();
  }

  // ---- tooltips ----
  private tip(el: HTMLElement, build: () => HTMLElement): void {
    el.addEventListener('mouseenter', () => {
      this.tooltip.textContent = '';
      this.tooltip.append(build());
      this.tooltip.classList.add('on');
      const r = el.getBoundingClientRect();
      const tw = 300;
      const left = r.left > window.innerWidth / 2 ? r.left - tw - 10 : r.right + 10;
      this.tooltip.style.left = `${Math.max(8, left)}px`;
      this.tooltip.style.top = `${Math.min(window.innerHeight - 220, Math.max(8, r.top))}px`;
    });
    el.addEventListener('mouseleave', () => {
      this.tooltip.classList.remove('on');
    });
  }

  showBanner(text: string, kind: string, now: number, ms = 2600): void {
    this.banner.textContent = text;
    this.banner.className = '';
    void this.banner.offsetWidth;
    this.banner.className = `on ${kind}`;
    this.bannerUntil = now + ms;
  }

  setSpeed(speed: number, paused: boolean): void {
    this.speedBtns.forEach((b, i) => b.classList.toggle('on', i + 1 === speed && !paused));
    this.pauseBtn.classList.toggle('on', paused);
    this.pauseBtn.textContent = paused ? '▶' : 'II';
  }

  /** Brief XP-bar pulse when motes are absorbed. */
  pulseXp(): void {
    this.xpBar.classList.remove('pulse');
    void this.xpBar.offsetWidth;
    this.xpBar.classList.add('pulse');
  }

  update(fps: number, now: number, points: number): void {
    const g = this.game;
    const c = g.cities;
    this.wave.set(g.wave);
    const fighting = g.phase === 'spawning' || g.phase === 'clearing';
    this.status.set(g.phase === 'intermission' ? (g.wave === 0 ? 'STAND BY' : `NEXT WAVE ${Math.ceil(g.nextWaveIn)}s`) : g.phase === 'shop' ? 'RESUPPLY' : fighting ? 'ENGAGED' : '');
    this.hostiles.set(fighting ? `${g.hostiles} HOSTILE` : '');
    this.salvage.set(Math.floor(g.salvage));
    this.kills.set(g.kills.toLocaleString('en-US'));
    this.allies.set(g.allies.count);
    const total = c.totalPopulation();
    this.pop.set(fmtPop(total));
    const frac = Math.min(1, total / c.startPopulation);
    this.popFill.style.transform = `scaleX(${frac.toFixed(3)})`;
    this.popFill.className = frac < 0.4 ? 'crit' : frac < 0.65 ? 'warn' : '';
    let alive = 0;
    for (let i = 0; i < c.count; i++) if (c.health[i] > 0) alive++;
    this.online.set(`${alive}/${c.count} CITIES`);
    this.fps.set(this.showFps ? `${Math.round(fps)} FPS` : '');

    this.updateThreats();
    this.updateArsenal();
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

    const L = g.log;
    let start = L.length;
    for (let k = L.length - 1; k >= 0 && L[k] !== this.lastEntry; k--) start = k;
    for (let k = start; k < L.length; k++) {
      const entry = L[k];
      const line = h('div', `entry ${entry.kind}`, entry.text);
      this.log.prepend(line);
      while (this.log.childElementCount > 4) this.log.lastElementChild!.remove();
      setTimeout(() => line.classList.add('old'), 6000);
      if (entry.kind === 'boss') this.showBanner(entry.text, 'boss', now, 3500);
      else if (entry.text.startsWith('WAVE') && entry.text.endsWith('INBOUND')) this.showBanner(entry.text, 'info', now);
      else if (entry.text.startsWith('EVOLUTION')) this.showBanner(entry.text.replace('EVOLUTION: ', ''), 'good', now, 3500);
      else if (entry.text.endsWith('HAS FALLEN')) this.showBanner(entry.text, 'warn', now, 2500);
    }
    if (L.length) this.lastEntry = L[L.length - 1];
    if (this.bannerUntil && now > this.bannerUntil) {
      this.bannerUntil = 0;
      this.banner.classList.remove('on');
    }

    if (g.phase === 'gameover' && !this.overShown) this.showGameOver(points);
  }

  /** Only cities that need attention: under attack or damaged, worst first. */
  private updateThreats(): void {
    const g = this.game;
    const c = g.cities;
    const idx: number[] = [];
    for (let i = 0; i < c.count; i++) {
      if (this.showAll || (c.health[i] > 0 && (g.threat[i] > 0 || c.health[i] < CITY_MAX_HEALTH - 0.5 || g.cityShield[i] > 0))) idx.push(i);
    }
    if (!this.showAll) {
      idx.sort((a, b) => g.threat[b] - g.threat[a] || c.health[a] - c.health[b]);
      idx.length = Math.min(idx.length, MAX_THREAT_ROWS);
    }
    let key = idx.join(',');
    for (const i of idx) key += `|${Math.round(c.health[i])}:${g.threat[i] > 0 ? 1 : 0}:${g.cityShield[i] > 0 ? 1 : 0}:${Math.round(c.population[i] / 1e5)}`;
    if (key === this.threatKey) return;
    this.threatKey = key;
    this.threatRows.textContent = '';
    if (idx.length === 0) {
      this.threatRows.append(h('div', 'secure', 'ALL CITIES SECURE'));
      return;
    }
    for (const i of idx) {
      const r = c.health[i] / CITY_MAX_HEALTH;
      const dead = c.health[i] <= 0;
      const row = h('div', `trow${dead ? ' dead' : g.threat[i] > 0 ? ' hot' : ''}${g.cityShield[i] > 0 ? ' shield' : ''}`);
      const bar = h('span', 'hp');
      const fill = h('i');
      fill.style.transform = `scaleX(${r.toFixed(3)})`;
      fill.className = r > 0.6 ? '' : r > 0.3 ? 'warn' : 'crit';
      bar.append(fill);
      row.append(h('span', 'cname', CITIES[i].name), h('span', 'tpop', fmtPop(c.population[i])), bar, h('span', 'tthreat', g.threat[i] > 0 ? `▲${g.threat[i]}` : g.cityShield[i] > 0 ? '◈' : ''));
      row.addEventListener('click', () => this.cb.onCity(i));
      row.addEventListener('mouseenter', () => this.cb.onCityHover(i));
      row.addEventListener('mouseleave', () => this.cb.onCityHover(-1));
      this.threatRows.append(row);
    }
  }

  /** Compact weapon tiles: icon, tier pips, share of total damage. Details on hover. */
  private updateArsenal(): void {
    const g = this.game;
    const a = g.arsenal;
    const ready = new Set(readyEvolutions(g).flatMap((o) => (o.kind === 'evolve' ? [o.a, o.b] : [])));
    let key = `${a.slots}|${[...ready].join(',')}`;
    for (const w of a.weapons) key += `|${w.def.id}:${w.tier}`;
    if (key !== this.tileKey) {
      this.tileKey = key;
      this.tiles.textContent = '';
      this.tileShare = [];
      this.tileJam = [];
      a.weapons.forEach((w, i) => {
        const tile = h('div', `tile${ready.has(i) ? ' ready' : ''}${w.def.evolved ? ' evolved' : ''}`);
        const pips = h('div', 'pips');
        if (w.def.evolved) pips.append(h('b', undefined, 'EVOLVED'));
        else for (let t = 0; t < 5; t++) pips.append(h('i', t <= w.tier ? 'on' : ''));
        const meta = h('div', 'tmeta');
        meta.append(h('div', 'tname', w.def.name.toUpperCase()), pips);
        const share = h('div', 'tshare');
        const fill = h('i');
        share.append(fill);
        const jam = h('span', 'tjam', 'JAM');
        tile.append(weaponIcon(w.def), meta, jam, share);
        if (ready.has(i)) tile.append(h('span', 'tready', 'EVOLVE'));
        this.tip(tile, () => this.weaponTip(i));
        this.tiles.append(tile);
        this.tileShare.push(fill);
        this.tileJam.push(jam);
      });
      for (let i = a.weapons.length; i < a.slots; i++) this.tiles.append(h('div', 'tile empty', '+'));
    }
    let total = 0;
    let max = 0;
    for (const w of a.weapons) {
      total += w.damageDealt;
      max = Math.max(max, w.damageDealt);
    }
    for (let i = 0; i < a.weapons.length; i++) {
      const w = a.weapons[i];
      this.tileShare[i].style.transform = `scaleX(${max > 0 ? (w.damageDealt / max).toFixed(3) : '0'})`;
      this.tileJam[i].style.display = w.jam > 0 ? '' : 'none';
    }
    void total;

    const b = g.build;
    let sk = '';
    for (const u of b.owned) sk += `${u.id}${b.stacksOf(u.id)}`;
    if (sk !== this.systemsKey) {
      this.systemsKey = sk;
      this.systems.textContent = '';
      const passives = b.owned.filter((u) => u.kind === 'passive');
      const relics = b.owned.filter((u) => u.kind === 'relic');
      const p = h('div', 'chip', `▣ ${passives.reduce((n, u) => n + b.stacksOf(u.id), 0)} PASSIVES`);
      const r = h('div', 'chip relic', `◆ ${relics.length} RELICS`);
      this.tip(p, () => this.listTip('PASSIVE SYSTEMS', passives.map((u) => [`${u.name.toUpperCase()} x${b.stacksOf(u.id)}`, describeUpgrade(u).join(' / ')])));
      this.tip(r, () => this.listTip('RELICS', relics.map((u) => [u.name.toUpperCase(), u.text ?? ''])));
      this.systems.append(p, r);
    }
  }

  private weaponTip(i: number): HTMLElement {
    const g = this.game;
    const w = g.arsenal.weapons[i];
    const d = h('div');
    if (!w) return d;
    const head = h('div', 'tt-head');
    head.append(weaponIcon(w.def), h('b', undefined, w.def.name.toUpperCase()), h('span', undefined, w.def.evolved ? 'EVOLVED' : `TIER ${w.tier + 1}/5`));
    d.append(head);
    for (const l of describeWeapon(w.def, w.tier)) d.append(h('div', 'tt-line', l));
    d.append(h('div', 'tt-line hi', `DAMAGE ${Math.round(w.damageDealt).toLocaleString('en-US')}  //  KILLS ${w.kills}  //  ${tierOf(w).emitters} EMITTERS`));
    d.append(partnerStrip(g, w.def));
    return d;
  }

  private listTip(title: string, rows: [string, string][]): HTMLElement {
    const d = h('div');
    d.append(h('div', 'tt-head', title));
    if (!rows.length) d.append(h('div', 'tt-line', 'None yet.'));
    for (const [a, b] of rows) {
      const r = h('div', 'tt-row');
      r.append(h('b', undefined, a), h('span', undefined, b));
      d.append(r);
    }
    return d;
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
        if (!a && locked) continue;
        const btn = h('div', `ability${a ? '' : ' empty'}`);
        btn.append(h('span', 'key', i === 0 ? 'Q' : 'E'), h('span', 'aname', a ? a.def.name.toUpperCase() : 'EMPTY'));
        const cd = h('i', 'cd');
        const txt = h('span', 'cdtxt');
        btn.append(cd, txt);
        if (a) {
          this.tip(btn, () => this.listTip(a.def.name.toUpperCase(), [[`${a.def.cooldown}s COOLDOWN`, a.def.text]]));
          btn.addEventListener('click', () => this.cb.onAbility(i));
        }
        this.abilityBar.append(btn);
        this.abilityCd.push({ cd, txt: new Cell(txt), btn });
      }
    }
    for (let i = 0; i < this.abilityCd.length; i++) {
      const a = g.abilities[i];
      const v = this.abilityCd[i];
      if (!a) continue;
      const f = Math.max(0, a.cd / (a.def.cooldown * g.build.abilityCooldown));
      v.cd.style.background = f > 0 ? `conic-gradient(rgba(2, 8, 12, 0.78) ${(f * 360).toFixed(0)}deg, transparent 0)` : 'none';
      v.txt.set(a.cd > 0 ? `${Math.ceil(a.cd)}` : '');
      v.btn.classList.toggle('ready', a.cd <= 0);
    }
  }

  setTargeting(i: number | null): void {
    this.abilityCd.forEach((v, k) => v.btn.classList.toggle('targeting', k === i));
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
      line('HOSTILES DESTROYED', g.kills.toLocaleString('en-US')),
      line('ALLIED SQUADRON KILLS', g.allies.kills.toLocaleString('en-US')),
      line('BOSSES DESTROYED', String(g.bossKills)),
      line('CITIES LOST', `${lost} / ${c.count}`),
      line('PEOPLE RESCUED FROM ABDUCTORS', fmtPop(g.peopleRescued)),
      line('SURVIVORS', fmtPop(c.totalPopulation())),
      line('COMMAND POINTS EARNED', `+${points}`),
    );
    this.gameoverBody.lastElementChild!.classList.add('points');
    this.gameoverTitle.textContent = c.isLost() ? 'DEFENSE FAILED // EARTH HAS FALLEN' : 'RUN ABANDONED // COMMAND RELIEVED';
    this.gameover.classList.add('on');
  }
}
