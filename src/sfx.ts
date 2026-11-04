// Web Audio sound effects (offline & instant)

let audioCtx: AudioContext | null = null;
let enabled = false;

/** Turns the sound effects on or off (a grown-up setting, off by default) */
export const setSfxEnabled = (on: boolean) => {
  enabled = on;
};

const getAudioContext = (): AudioContext | null => {
  if (!enabled || typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
};

// Pop when a piece clicks into place
export const playPlop = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.12);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  } catch (e) {}
};

// A bright glassy "tink" when a glass shard clicks into place
export const playClink = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // A few high partials that don't line up, which is what makes glass sound like glass
    const base = 1400 + Math.random() * 300;
    [1, 2.76, 5.4].forEach((ratio, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * ratio, now);
      gain.gain.setValueAtTime(0.18 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35 / (idx + 1));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    });
  } catch (e) {}
};

// Fanfares for a finished puzzle, as [note Hz, start s, length s]. One is picked to match the celebration.
const C5 = 523.25, D5 = 587.33, E5 = 659.25, F5 = 698.46, G5 = 783.99, A5 = 880, B5 = 987.77, C6 = 1046.5;
const TUNES: [number, number, number][][] = [
  // Up the chord
  [[C5, 0, 0.25], [E5, 0.1, 0.25], [G5, 0.2, 0.25], [C6, 0.3, 0.4]],
  // Ta-da!
  [[G5, 0, 0.12], [G5, 0.14, 0.12], [C5, 0.3, 0.6], [E5, 0.3, 0.6], [G5, 0.3, 0.6], [C6, 0.3, 0.6]],
  // A quick run up the scale
  [[C5, 0, 0.1], [D5, 0.07, 0.1], [E5, 0.14, 0.1], [F5, 0.21, 0.1], [G5, 0.28, 0.1], [A5, 0.35, 0.1], [B5, 0.42, 0.1], [C6, 0.49, 0.45]],
  // Bouncy
  [[E5, 0, 0.15], [G5, 0.15, 0.15], [E5, 0.3, 0.15], [C6, 0.45, 0.5]],
  // Twinkly bells
  [[C6, 0, 0.3], [G5, 0.12, 0.3], [E5, 0.24, 0.3], [G5, 0.36, 0.3], [C6, 0.48, 0.5]],
];
export const FANFARE_COUNT = TUNES.length;

// Little fanfare when the puzzle is finished
export const playFanfare = (tune = 0) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    TUNES[tune % TUNES.length].forEach(([freq, start, length]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteTime = now + start;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.22, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.01, noteTime + length);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + length);
    });
  } catch (e) {}
};
