import type { PrismDomain } from '../types';

const PENTATONIC_HZ = [523.25, 587.33, 659.25, 783.99, 880.0]; // C5 D5 E5 G5 A5
const DOMAIN_DETUNE: Record<PrismDomain, number> = {
  ember: 0,
  tide: -200, // Slightly warmer/deeper
  jade: 100,
  astral: 500, // Shimmering fourth higher
};

export class StarloomAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  private muted = false;
  private musicVolume = 0.32;
  private sfxVolume = 0.65;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private bossMode = false;
  private oathMode = false;
  private lastFireSoundTime = 0;

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();

      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    this.startBgmLoop();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolumes();
  }

  public setVolumes(music: number, sfx: number): void {
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
    this.applyVolumes();
  }

  public setIntensity(isBoss: boolean, isOath: boolean): void {
    this.bossMode = isBoss;
    this.oathMode = isOath;
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.musicGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 1, now, 0.03);
    this.musicGain.gain.setTargetAtTime(this.musicVolume, now, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.sfxVolume, now, 0.03);
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    dest: GainNode | null,
    delay = 0,
    freqEnd?: number
  ): void {
    if (!this.ctx || !dest || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t0 + duration);
    }

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  /** Warm porcelain-chime pluck when placing a prism */
  public playPlacePrism(domain: PrismDomain, rank: number): void {
    this.unlock();
    const idx = Math.max(0, Math.min(4, rank - 1));
    const baseHz = PENTATONIC_HZ[idx] * Math.pow(2, DOMAIN_DETUNE[domain] / 1200);
    this.playTone(baseHz, 0.36, 'sine', 0.24, this.sfxGain);
    this.playTone(baseHz * 2, 0.18, 'triangle', 0.08, this.sfxGain, 0.005);
  }

  /** Ascending arpeggio for Cascade, warm triad chord for Monolith, twin bell for Anchor */
  public playCircuitIgnite(kind: 'cascade' | 'monolith' | 'anchor', domain: PrismDomain): void {
    this.unlock();
    const shift = Math.pow(2, DOMAIN_DETUNE[domain] / 1200);
    if (kind === 'cascade') {
      [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => {
        this.playTone(hz * shift, 0.45, 'triangle', 0.18, this.sfxGain, i * 0.065);
        this.playTone(hz * shift * 2, 0.22, 'sine', 0.06, this.sfxGain, i * 0.065);
      });
    } else if (kind === 'monolith') {
      [392.0, 587.33, 783.99].forEach((hz) => {
        this.playTone(hz * shift, 0.65, 'triangle', 0.17, this.sfxGain);
      });
      this.playTone(196.0, 0.55, 'sine', 0.22, this.sfxGain);
    } else {
      this.playTone(659.25, 0.48, 'sine', 0.18, this.sfxGain);
      this.playTone(987.77, 0.55, 'sine', 0.16, this.sfxGain, 0.08);
    }
  }

  public playSupercharge(): void {
    this.unlock();
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((hz, i) => {
      this.playTone(hz, 0.65, 'triangle', 0.2, this.sfxGain, i * 0.055);
    });
    this.playTone(130.81, 0.75, 'sine', 0.25, this.sfxGain);
  }

  public playShatter(domain: PrismDomain): void {
    this.unlock();
    const startHz = domain === 'ember' ? 420 : domain === 'tide' ? 680 : domain === 'jade' ? 540 : 880;
    this.playTone(startHz, 0.28, 'triangle', 0.2, this.sfxGain, 0, startHz * 0.45);
    this.playTone(startHz * 1.5, 0.18, 'sine', 0.12, this.sfxGain, 0.04, startHz * 1.1);
  }

  public playSiphonPrompt(): void {
    this.unlock();
    this.playTone(880, 0.26, 'sine', 0.14, this.sfxGain);
    this.playTone(1318.5, 0.34, 'sine', 0.16, this.sfxGain, 0.07);
  }

  public playSiphonExecute(): void {
    this.unlock();
    this.playTone(440, 0.2, 'triangle', 0.22, this.sfxGain, 0, 880);
    this.playTone(1046.5, 0.42, 'sine', 0.2, this.sfxGain, 0.08);
  }

  public playOath(): void {
    this.unlock();
    // Deep temple chime + golden fifth
    this.playTone(196.0, 1.1, 'sine', 0.28, this.sfxGain);
    this.playTone(293.66, 0.95, 'triangle', 0.16, this.sfxGain, 0.05);
    this.playTone(587.33, 0.8, 'sine', 0.16, this.sfxGain, 0.12);
    this.playTone(880.0, 0.85, 'sine', 0.14, this.sfxGain, 0.2);
  }

  public playGrandConvergence(): void {
    this.unlock();
    const fanfare = [523.25, 659.25, 783.99, 880.0, 1046.5, 1318.5, 1567.98];
    fanfare.forEach((hz, i) => {
      this.playTone(hz, 0.95, 'triangle', 0.17, this.sfxGain, i * 0.075);
      this.playTone(hz * 0.5, 0.85, 'sine', 0.11, this.sfxGain, i * 0.075);
    });
    this.playTone(130.81, 1.4, 'sine', 0.28, this.sfxGain);
  }

  public playTowerFire(domain: PrismDomain, isCrit: boolean): void {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    // Throttle rapid fire SFX so large boards remain musical, never muddy
    if (now - this.lastFireSoundTime < 0.085) return;
    this.lastFireSoundTime = now;

    const hz =
      domain === 'ember' ? 320 : domain === 'tide' ? 480 : domain === 'jade' ? 560 : 720;
    this.playTone(hz * (isCrit ? 1.25 : 1), 0.09, 'sine', isCrit ? 0.09 : 0.05, this.sfxGain, 0, hz * 0.72);
  }

  public playCoreHit(): void {
    this.unlock();
    this.playTone(165, 0.35, 'sawtooth', 0.16, this.sfxGain, 0, 82);
  }

  public playWaveStart(isBoss: boolean): void {
    this.unlock();
    if (isBoss) {
      this.playTone(146.83, 0.9, 'triangle', 0.24, this.sfxGain);
      this.playTone(220.0, 0.75, 'sine', 0.18, this.sfxGain, 0.18);
    } else {
      this.playTone(440, 0.3, 'sine', 0.14, this.sfxGain);
      this.playTone(587.33, 0.38, 'sine', 0.14, this.sfxGain, 0.1);
    }
  }

  public playUiClick(): void {
    this.unlock();
    this.playTone(660, 0.07, 'sine', 0.09, this.sfxGain, 0, 740);
  }

  private startBgmLoop(): void {
    if (this.bgmTimer !== null || typeof window === 'undefined') return;

    // Gentle celestial pentatonic ostinato (Guzheng / Celesta feel)
    const melody = [
      261.63, 329.63, 392.0, 440.0,
      392.0, 329.63, 293.66, 392.0,
      261.63, 392.0, 523.25, 440.0,
      392.0, 329.63, 293.66, 261.63,
    ];
    const bass = [130.81, 130.81, 146.83, 164.81, 130.81, 110.0, 146.83, 196.0];

    this.bgmTimer = window.setInterval(() => {
      if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
      const step = this.bgmStep++;
      const note = melody[step % melody.length];
      const octaveBoost = this.oathMode ? 2 : 1;

      this.playTone(note * octaveBoost, 0.65, 'sine', 0.085, this.musicGain);
      if (step % 2 === 0) {
        const b = bass[Math.floor(step / 2) % bass.length];
        this.playTone(b, 1.35, 'triangle', this.bossMode ? 0.1 : 0.065, this.musicGain);
      }
      if ((this.bossMode || this.oathMode) && step % 4 === 2) {
        this.playTone(note * 1.5, 0.45, 'sine', 0.045, this.musicGain, 0.14);
      }
    }, 520);
  }

  public dispose(): void {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
