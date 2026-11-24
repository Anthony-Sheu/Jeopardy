// Tiny synthesized sound effects (no audio files needed).
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem('jeopardy:muted') === '1';
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;
export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem('jeopardy:muted', value ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine', volume = 0.18): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + start;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

export const sounds = {
  /** Someone buzzed in. */
  buzz() {
    tone(880, 0, 0.12, 'square', 0.12);
    tone(1320, 0.1, 0.2, 'square', 0.12);
  },
  /** Buzzers are open. */
  open() {
    tone(660, 0, 0.08, 'triangle', 0.15);
  },
  correct() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.25, 'triangle', 0.16));
  },
  wrong() {
    tone(140, 0, 0.45, 'sawtooth', 0.12);
    tone(110, 0.02, 0.45, 'sawtooth', 0.1);
  },
  reveal() {
    tone(392, 0, 0.18, 'sine', 0.14);
    tone(587, 0.08, 0.3, 'sine', 0.14);
  },
  fanfare() {
    [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.16));
  },
};

/** Call from a click handler so browsers allow audio later on. */
export function unlockAudio(): void {
  audio();
}
