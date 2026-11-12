import type { Settings } from '../core/save';
import { button, h } from './dom';

const TOGGLES: [keyof Settings, string][] = [
  ['hd', 'HIGH DEFINITION (OFF = RETRO 480 LINES)'],
  ['dither', 'DITHER (RETRO: COLOUR QUANTISE)'],
  ['crt', 'CRT / SCANLINES'],
  ['vertexSnap', 'VERTEX SNAPPING'],
  ['affine', 'AFFINE TEXTURE WARP'],
  ['bloom', 'BLOOM'],
  ['shake', 'SCREEN SHAKE + IMPACT PULSE'],
  ['damageNumbers', 'DAMAGE NUMBERS'],
  ['showFps', 'SHOW FPS (F3)'],
];
const SLIDERS: [keyof Settings, string][] = [
  ['master', 'MASTER VOLUME'],
  ['sfx', 'EFFECTS VOLUME'],
  ['music', 'MUSIC VOLUME'],
];

/** Modal settings panel shared by the command screen and the pause menu. */
export function openSettings(parent: HTMLElement, s: Settings, onChange: () => void): void {
  const overlay = h('div', 'modal');
  const panel = h('div', 'panel settings');
  panel.append(h('h2', undefined, 'SETTINGS'));
  const body = h('div', 'body');
  for (const [key, label] of TOGGLES) {
    const row = h('label', 'toggle');
    const box = h('input');
    box.type = 'checkbox';
    box.checked = s[key] as boolean;
    box.addEventListener('change', () => {
      (s[key] as boolean) = box.checked;
      onChange();
    });
    row.append(box, h('span', undefined, label));
    body.append(row);
  }
  for (const [key, label] of SLIDERS) {
    const row = h('label', 'slider');
    const r = h('input');
    r.type = 'range';
    r.min = '0';
    r.max = '1';
    r.step = '0.05';
    r.value = String(s[key]);
    r.addEventListener('input', () => {
      (s[key] as number) = Number(r.value);
      onChange();
    });
    row.append(h('span', undefined, label), r);
    body.append(row);
  }
  panel.append(body);
  const btns = h('div', 'btns');
  btns.append(button('CLOSE', () => overlay.remove()));
  panel.append(btns);
  overlay.append(panel);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  parent.append(overlay);
}
