export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Sets textContent only when the value changed, so idle frames touch no DOM. */
export class Cell {
  private last: string | number = '\u0000';
  constructor(readonly el: HTMLElement) {}
  set(v: string | number): void {
    if (v === this.last) return;
    this.last = v;
    this.el.textContent = String(v);
  }
}

export function fmtTime(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtPop(people: number): string {
  return people >= 1e6 ? `${(people / 1e6).toFixed(1)}M` : `${Math.round(people / 1000)}K`;
}

export function button(label: string, onClick: () => void, cls = 'cmd'): HTMLButtonElement {
  const b = h('button', cls, label);
  b.addEventListener('click', onClick);
  return b;
}
