import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import type { Game } from '../sim/game';
import { FX_DAMAGE, FX_KILL, FX_STRIDE } from '../sim/game';
import { h } from './dom';

const POOL = 64;
const LIFE = 0.75;
const COMBO_WINDOW = 2.5;
const COMBO_TIERS: [number, string][] = [
  [1000, 'EXTINCTION EVENT'],
  [500, 'ANNIHILATION'],
  [250, 'MASSACRE'],
  [120, 'RAMPAGE'],
  [50, 'KILLING SPREE'],
  [20, 'COMBO'],
];

function fmt(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

/**
 * Floating damage numbers (pooled DOM) and the kill-combo counter.
 * Crits always show; normal hits are sampled so the screen never turns into a spreadsheet.
 */
export class Floaters {
  readonly root = h('div', 'floaters');
  private els: HTMLElement[] = [];
  private pos = new Float32Array(POOL * 3);
  private age = new Float32Array(POOL).fill(LIFE);
  private drift = new Float32Array(POOL);
  private next = 0;
  private combo = h('div', 'combo');
  private comboNum = h('b');
  private comboLabel = h('span');
  private kills: number[] = [];
  private comboShown = 0;
  private comboTimer = 0;
  private v = new Vector3();
  enabled = true;

  constructor(parent: HTMLElement, private game: Game, private surface: Object3D) {
    for (let i = 0; i < POOL; i++) {
      const el = h('span', 'dmg');
      this.root.append(el);
      this.els.push(el);
    }
    this.combo.append(this.comboNum, this.comboLabel);
    parent.append(this.root, this.combo);
  }

  dispose(): void {
    this.root.remove();
    this.combo.remove();
  }

  private spawn(x: number, y: number, z: number, amount: number, crit: boolean): void {
    const i = this.next;
    this.next = (this.next + 1) % POOL;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.age[i] = 0;
    this.drift[i] = (Math.random() - 0.5) * 30;
    const el = this.els[i];
    el.textContent = crit ? `${fmt(amount)}!` : fmt(amount);
    el.className = crit ? 'dmg crit' : amount > 200 ? 'dmg big' : 'dmg';
  }

  update(dt: number, camera: PerspectiveCamera, w: number, h2: number): void {
    const g = this.game;
    const f = g.fx;
    let shown = 0;
    const now = g.time;
    for (let k = 0; k < g.fxCount; k++) {
      const o = k * FX_STRIDE;
      if (f[o] === FX_KILL) this.kills.push(now);
      else if (f[o] === FX_DAMAGE && this.enabled) {
        const crit = f[o + 7] > 0;
        // Crits always; ordinary hits only a few per frame.
        if (crit || (shown < 3 && Math.random() < 0.25)) {
          this.spawn(f[o + 1], f[o + 2], f[o + 3], f[o + 4], crit);
          shown++;
        }
      }
    }

    for (let i = 0; i < POOL; i++) {
      const el = this.els[i];
      if (this.age[i] >= LIFE) {
        if (el.style.display !== 'none') el.style.display = 'none';
        continue;
      }
      this.age[i] += dt;
      const t = this.age[i] / LIFE;
      this.v.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]).applyMatrix4(this.surface.matrixWorld).project(camera);
      if (this.v.z > 1) {
        el.style.display = 'none';
        continue;
      }
      const sx = (this.v.x * 0.5 + 0.5) * w + this.drift[i] * t;
      const sy = (-this.v.y * 0.5 + 0.5) * h2 - 38 * t;
      const sc = t < 0.15 ? 0.6 + t * 4 : 1.2 - t * 0.3;
      el.style.display = 'block';
      el.style.opacity = String(Math.min(1, (1 - t) * 2.5));
      el.style.transform = `translate3d(${sx.toFixed(0)}px, ${sy.toFixed(0)}px, 0) translate(-50%, -50%) scale(${sc.toFixed(2)})`;
    }

    // Kill combo: kills inside a rolling window of sim time.
    while (this.kills.length && now - this.kills[0] > COMBO_WINDOW) this.kills.shift();
    const n = this.kills.length;
    if (n >= 10) {
      this.comboTimer = 1.2;
      if (n !== this.comboShown) {
        this.comboShown = n;
        this.comboNum.textContent = `${n}`;
        const tier = COMBO_TIERS.find(([k]) => n >= k);
        this.comboLabel.textContent = tier ? tier[1] : 'KILLS';
        this.combo.className = `combo on t${tier ? COMBO_TIERS.length - COMBO_TIERS.indexOf(tier) : 0}`;
        // Re-trigger the pop animation.
        this.comboNum.classList.remove('pop');
        void this.comboNum.offsetWidth;
        this.comboNum.classList.add('pop');
      }
    } else if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo.className = 'combo';
        this.comboShown = 0;
      }
    }
  }
}
