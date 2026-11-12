import { audioIds, audioUrl } from '../core/assets';
import type { Game } from '../sim/game';
import {
  FX_BLAST, FX_CITY_FALL, FX_CITY_HIT, FX_CITY_SHIELD, FX_EMP, FX_ESCAPE, FX_EVOLVE, FX_EXPLOSION, FX_HIT,
  FX_SHIELD_HIT, FX_SHOT, FX_STRIDE, FX_STRIKE, FX_IMPACT, FX_ELASER, FX_AEGIS, FX_EMITTER_DOWN, FX_SLAM, FX_BOSS_PHASE,
  FX_NUKE, FX_CRYO, FX_MINE, FX_TESLA, FX_INTERCEPT, FX_AEGIS_DOWN, FX_ESHOT, FX_FLAK,
} from '../sim/game';

/** Minimum seconds between two plays of the same sound, so 600 ships don't make 600 explosions. */
const GAP: Record<string, number> = {
  hit: 0.05, explode_small: 0.06, shot_kinetic: 0.07, shot_artillery: 0.08, shot_laser: 0.09, shot_missile: 0.12,
  shot_tesla: 0.1, shot_gravity: 0.2, shot_drone: 0.12, city_hit: 0.4, alarm: 1.5,
};

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private last = new Map<string, number>();
  private music: { id: string; el: HTMLAudioElement; node: MediaElementAudioSourceNode; gain: GainNode } | null = null;
  private wantMusic = '';
  volumes = { master: 0.8, sfx: 0.8, music: 0.5 };

  /** Must be called from a user gesture (browser autoplay rules). */
  async unlock(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(ctx.destination);
    this.applyVolumes();
    await Promise.all(
      audioIds('sfx:').map(async (id) => {
        try {
          const res = await fetch(audioUrl(id)!);
          this.buffers.set(id.slice(4), await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          // A missing or undecodable clip just stays silent.
        }
      }),
    );
    if (this.wantMusic) this.playMusic(this.wantMusic);
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfxBus.gain.value = this.volumes.sfx * 0.7;
    this.musicBus.gain.value = this.volumes.music * 0.6;
  }

  play(id: string, volume = 1, rate = 1): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(id);
    if (!ctx || !buf) return;
    const now = ctx.currentTime;
    const gap = GAP[id] ?? 0.03;
    if (now - (this.last.get(id) ?? -1) < gap) return;
    this.last.set(id, now);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.sfxBus);
    src.start();
  }

  /** Streams a music track (lazy: only fetched when first requested) and crossfades to it. */
  playMusic(id: string): void {
    this.wantMusic = id;
    const ctx = this.ctx;
    if (!ctx || this.music?.id === id) return;
    const url = audioUrl(`music:${id}`);
    if (!url) return;
    const el = new window.Audio(url);
    el.loop = true;
    el.crossOrigin = 'anonymous';
    const node = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    node.connect(gain).connect(this.musicBus);
    void el.play().catch(() => undefined);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    const old = this.music;
    if (old) {
      old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2);
      setTimeout(() => {
        old.el.pause();
        old.node.disconnect();
      }, 2200);
    }
    this.music = { id, el, node, gain };
  }

  /** Turn this frame's sim events into sounds. */
  consume(g: Game): void {
    if (!this.ctx) return;
    const f = g.fx;
    for (let k = 0; k < g.fxCount; k++) {
      const o = k * FX_STRIDE;
      switch (f[o]) {
        case FX_SHOT: {
          const w = g.arsenal.weapons[f[o + 7] | 0];
          if (w) this.play(w.def.sfx, 0.35);
          break;
        }
        case FX_HIT: this.play('hit', 0.25); break;
        case FX_SHIELD_HIT: this.play('hit', 0.2, 1.6); break;
        case FX_EXPLOSION: this.play(f[o + 7] > 0.2 ? 'explode_big' : 'explode_small', f[o + 7] > 0.2 ? 0.9 : 0.4); break;
        case FX_BLAST: this.play('explode_small', 0.5, 0.8); break;
        case FX_CITY_HIT: this.play('city_hit', 0.5); break;
        case FX_CITY_FALL: this.play('explode_big', 1); this.play('alarm', 0.7); break;
        case FX_ESCAPE: this.play('escape', 0.7); break;
        case FX_STRIKE: this.play('explode_big', 1, 0.8); break;
        case FX_EMP: this.play('emp', 0.8); break;
        case FX_EVOLVE: this.play('evolve', 0.9); break;
        case FX_CITY_SHIELD: this.play('shield', 0.8); break;
        case FX_IMPACT: this.play(f[o + 7] > 0.06 ? 'explode_big' : 'explode_small', Math.min(0.8, 0.2 + f[o + 7] * 3), 0.7); break;
        case FX_ELASER: this.play('hit', 0.35, 0.5); break;
        case FX_ESHOT: this.play('hit', 0.12, 0.7); break;
        case FX_AEGIS: this.play('shield', 0.25, 1.6); break;
        case FX_AEGIS_DOWN: this.play('alarm', 0.6); break;
        case FX_EMITTER_DOWN: this.play('explode_small', 0.6, 0.6); break;
        case FX_SLAM: this.play('explode_big', 0.55, 0.5); break;
        case FX_BOSS_PHASE: this.play('alarm', 0.7, 0.8); this.play('explode_big', 0.8, 0.6); break;
        case FX_NUKE: this.play('explode_big', 1, 0.5); break;
        case FX_CRYO: this.play('emp', 0.7, 1.4); break;
        case FX_MINE: this.play('explode_small', 0.35, 1.1); break;
        case FX_TESLA: this.play('hit', 0.15, 1.8); break;
        case FX_INTERCEPT: this.play('explode_small', 0.2, 1.4); break;
        case FX_FLAK: this.play('hit', 0.08, 2); break;
      }
    }
  }
}

export const audio = new Audio();
