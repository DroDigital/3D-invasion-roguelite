import { audio } from '../audio/audio';
import { abilityById } from '../data/abilities';
import { COMMANDERS, UNLOCKS } from '../data/meta';
import { FINAL_WAVE, THREAT_LEVELS, threatRewardMul } from '../data/campaign';
import { abilitySlots, buyUnlock, owns, Profile, saveProfile, unlockedAbilities, unlockedCommanders } from '../core/save';
import { button, h } from './dom';
import { openSettings } from './settings';

export interface MenuCallbacks {
  onLaunch(seed: string | null): void;
  onSettingsChanged(): void;
}

const KIND_LABEL: Record<string, string> = {
  abilitySlot: 'ABILITY SLOTS', ability: 'ACTIVE ABILITIES', commander: 'COMMANDERS', startWeapon: 'STARTING WEAPONS', content: 'RESEARCH // NEW CONTENT',
};

/** Command screen: launch a run, pick commander and abilities, spend command points. */
export class Menu {
  readonly root = h('div');
  constructor(private parent: HTMLElement, private profile: Profile, private cb: MenuCallbacks) {
    this.root.id = 'menu';
    parent.append(this.root);
    this.render();
  }

  dispose(): void {
    this.root.remove();
  }

  private render(): void {
    const p = this.profile;
    this.root.textContent = '';
    const head = h('div', 'menu-head');
    head.append(h('div', 'menu-title', 'ORBITAL WATCH'), h('div', 'menu-sub', 'PLANETARY DEFENSE COMMAND // EARTH ORBIT'));
    const pts = h('div', 'menu-points');
    pts.append(h('span', 'k', 'COMMAND POINTS '), h('b', undefined, String(p.points)));
    head.append(pts);

    const left = h('div', 'panel menu-col');
    left.append(h('h2', undefined, 'DEPLOYMENT'));
    const body = h('div', 'body');
    const seedRow = h('div', 'seed-row');
    const seed = h('input', 'seed-input');
    seed.placeholder = 'RANDOM SEED';
    seed.maxLength = 12;
    seedRow.append(h('span', 'k', 'SEED'), seed);
    const launch = button('LAUNCH DEFENSE >', () => {
      void audio.unlock();
      audio.play('wave', 0.8);
      this.cb.onLaunch(seed.value.trim() ? seed.value.trim().toUpperCase() : null);
    }, 'cmd primary big');
    body.append(launch, seedRow);

    // Threat Levels: unlocked one at a time by winning the campaign.
    const maxT = p.stats.maxThreat ?? 0;
    body.append(h('h3', undefined, maxT > 0 ? 'THREAT LEVEL' : 'CAMPAIGN'));
    if (maxT === 0) body.append(h('div', 'tdesc-solo', `Hold Earth through ${FINAL_WAVE} waves to break the invasion. Victory unlocks Threat Levels.`));
    else {
      const sel = h('div', 'threat-sel');
      const desc = h('div', 'tdesc');
      const paint = (): void => {
        sel.querySelectorAll('button').forEach((b, i) => b.classList.toggle('sel', i === (p.threat ?? 0)));
        const t = THREAT_LEVELS[p.threat ?? 0];
        desc.textContent = `${t.text}${t.level ? ` (all lower levels apply)  //  POINTS x${threatRewardMul(t.level).toFixed(2)}` : ''}`;
      };
      for (let t = 0; t <= maxT; t++) {
        sel.append(button(t === 0 ? 'STD' : `T${t}`, () => {
          p.threat = t;
          saveProfile(p);
          paint();
        }, 'cmd'));
      }
      sel.append(desc);
      body.append(sel);
      paint();
    }

    body.append(h('h3', undefined, 'COMMANDER'));
    const cmds = h('div', 'choice-list');
    const avail = unlockedCommanders(p);
    for (const c of COMMANDERS) {
      if (!avail.includes(c.id)) continue;
      const row = h('div', `choice${p.commander === c.id ? ' sel' : ''}`);
      row.append(h('b', undefined, c.name.toUpperCase()), h('span', undefined, c.text));
      row.addEventListener('click', () => {
        p.commander = c.id;
        saveProfile(p);
        audio.play('ui_click', 0.5);
        this.render();
      });
      cmds.append(row);
    }
    body.append(cmds);

    const slots = abilitySlots(p);
    body.append(h('h3', undefined, `ACTIVE ABILITIES // ${p.loadout.length}/${slots} EQUIPPED`));
    const abs = h('div', 'choice-list');
    const unlocked = unlockedAbilities(p);
    if (!unlocked.length) abs.append(h('div', 'note', 'No abilities unlocked. Earn command points and unlock them in the research list, or find one in a shop.'));
    for (const id of unlocked) {
      const a = abilityById(id);
      const on = p.loadout.includes(id);
      const row = h('div', `choice${on ? ' sel' : ''}`);
      row.append(h('b', undefined, `${a.name.toUpperCase()} // ${a.cooldown}s`), h('span', undefined, a.text));
      row.addEventListener('click', () => {
        if (on) p.loadout = p.loadout.filter((x) => x !== id);
        else {
          p.loadout.push(id);
          while (p.loadout.length > slots) p.loadout.shift();
        }
        saveProfile(p);
        audio.play('ui_click', 0.5);
        this.render();
      });
      abs.append(row);
    }
    body.append(abs);

    const misc = h('div', 'btns');
    misc.append(button('CREDITS', () => openCredits(this.parent)), button('SETTINGS', () => openSettings(this.parent, p.settings, () => {
      saveProfile(p);
      this.cb.onSettingsChanged();
    })));
    body.append(misc);
    const st = p.stats;
    body.append(h('div', 'note', `RUNS ${st.runs}  //  VICTORIES ${st.wins ?? 0}  //  BEST WAVE ${st.bestWave}  //  KILLS ${st.kills}  //  EVOLUTIONS ${st.evolutions}`));
    left.append(body);

    const right = h('div', 'panel menu-col');
    right.append(h('h2', undefined, 'RESEARCH & UNLOCKS'));
    const rb = h('div', 'body scroll');
    const kinds = ['abilitySlot', 'ability', 'commander', 'startWeapon', 'content'];
    for (const k of kinds) {
      rb.append(h('h3', undefined, KIND_LABEL[k]));
      for (const u of UNLOCKS.filter((x) => x.kind === k)) {
        const have = owns(p, u.id);
        const row = h('div', `unlock${have ? ' owned' : p.points >= u.cost ? ' afford' : ''}`);
        row.append(h('b', undefined, u.name.toUpperCase()), h('span', undefined, u.text));
        const btn = button(have ? 'OWNED' : `${u.cost} CP`, () => {
          if (buyUnlock(p, u.id)) {
            audio.play('buy', 0.7);
            this.render();
          }
        });
        btn.disabled = have || p.points < u.cost;
        row.append(btn);
        rb.append(row);
      }
    }
    right.append(rb);

    const cols = h('div', 'menu-cols');
    cols.append(left, right);
    this.root.append(head, cols, h('div', 'menu-foot', 'DRAG: ROTATE  //  SCROLL: ZOOM  //  Q / E: ABILITIES  //  1-5: PICK  //  R: REROLL  //  ESC: PAUSE'));
  }
}

/** In-run pause overlay. */
export function openPause(parent: HTMLElement, profile: Profile, onResume: () => void, onAbandon: () => void, onSettings: () => void): HTMLElement {
  const overlay = h('div', 'modal');
  const panel = h('div', 'panel settings');
  panel.append(h('h2', undefined, 'PAUSED'));
  const btns = h('div', 'btns col');
  btns.append(
    button('RESUME', () => {
      overlay.remove();
      onResume();
    }),
    button('SETTINGS', () => openSettings(parent, profile.settings, onSettings)),
    button('ABANDON RUN', () => {
      overlay.remove();
      onAbandon();
    }),
  );
  panel.append(btns);
  overlay.append(panel);
  parent.append(overlay);
  return overlay;
}

/** Asset credits, including the attribution CC-BY requires. Full list in CREDITS.md. */
export function openCredits(parent: HTMLElement): void {
  const overlay = h('div', 'modal');
  const panel = h('div', 'panel settings credits');
  panel.append(h('h2', undefined, 'CREDITS'));
  const body = h('div', 'body');
  const lines = [
    ['EARTH IMAGERY', 'NASA Blue Marble & Black Marble (public domain)'],
    ['ALIEN SHIPS', 'Ultimate Spaceships by Quaternius (CC0)'],
    ['WEAPON PARTS', 'Space Kit by Kenney, www.kenney.nl (CC0)'],
    ['HULL TEXTURE', 'Metal Plate by Rob Tuytel, Poly Haven (CC0)'],
    ['SOUND EFFECTS', 'Kenney (CC0), rubberduck (CC0), Independent nu ljudbank (CC0)'],
    ['EXPLOSIONS', 'Sounds (c) by Michel Baradari apollo-music.de (CC-BY 3.0)'],
    ['MUSIC', 'yd (CC0): Observing The Star, My Very Own Dead Ship, Galactic Temple'],
    ['BOSS MUSIC', 'Music by Matthew Pablo, www.matthewpablo.com (CC-BY 3.0)'],
    ['FONT', 'Share Tech Mono by Carrois Apostrophe (OFL 1.1)'],
    ['ENGINE', 'three.js (MIT), meshoptimizer (MIT)'],
  ];
  for (const [k, v] of lines) {
    const row = h('div', 'credit');
    row.append(h('b', undefined, k), h('span', undefined, v));
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
