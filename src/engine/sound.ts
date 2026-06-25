/**
 * Sound loading + playback. Ported from the original utils.ts `loadSound`,
 * wrapped in a small manager with a global mute flag the React UI can toggle.
 */
export function loadSound(src: string, loop = false): HTMLAudioElement {
  const sound = document.createElement('audio');
  sound.src = src;
  sound.setAttribute('preload', 'auto');
  sound.loop = loop;
  sound.style.display = 'none';
  return sound;
}

export class SoundManager<Name extends string> {
  private sounds: Record<Name, HTMLAudioElement>;
  muted = false;

  constructor(basePath: string, defs: Record<Name, { file: string; loop?: boolean }>) {
    const base = basePath.replace(/\/$/, '');
    this.sounds = {} as Record<Name, HTMLAudioElement>;
    (Object.keys(defs) as Name[]).forEach((name) => {
      this.sounds[name] = loadSound(`${base}/${defs[name].file}`, defs[name].loop);
    });
  }

  /** Play from the start; no-op when muted. */
  play(name: Name): void {
    if (this.muted) return;
    const s = this.sounds[name];
    s.pause();
    s.currentTime = 0;
    void s.play().catch(() => undefined);
  }

  loop(name: Name): void {
    if (this.muted) return;
    void this.sounds[name].play().catch(() => undefined);
  }

  stop(name: Name): void {
    const s = this.sounds[name];
    s.pause();
    s.currentTime = 0;
  }

  pauseAll(): void {
    (Object.values(this.sounds) as HTMLAudioElement[]).forEach((s) => s.pause());
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.pauseAll();
  }

  destroy(): void {
    this.pauseAll();
  }
}
