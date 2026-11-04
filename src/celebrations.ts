// What happens when a puzzle is finished. Each win picks a different one, so it stays exciting:
// confetti, fireworks, side cannons, a star shower, raining animals or floating balloons, each with
// its own fanfare, and the finished picture does a little dance.

import confetti from 'canvas-confetti';

export interface Celebration {
  emoji: string; // shown on the "You did it!" card
  tune: number; // which fanfare plays (see sfx.ts)
  cheer: string; // what the voice says; {name} is ", Sam" or nothing
  /** Starts the effect and returns a function that stops it early */
  run: () => () => void;
}

const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const burst = (opts: confetti.Options) => {
  try {
    confetti({ disableForReducedMotion: true, ...opts });
  } catch {}
};

/** Calls `step` every `ms` for `duration` ms */
const repeat = (step: () => void, ms: number, duration: number) => {
  step();
  const id = window.setInterval(step, ms);
  const end = window.setTimeout(() => window.clearInterval(id), duration);
  return () => {
    window.clearInterval(id);
    window.clearTimeout(end);
  };
};

const stopConfetti = () => {
  try {
    confetti.reset();
  } catch {}
};

/** Emoji that drift up the screen from the bottom, like balloons let go */
const floatUp = (emojis: string[], count: number) => {
  if (reducedMotion()) return () => {};
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', overflow: 'hidden', zIndex: '100' });
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.textContent = emojis[i % emojis.length];
    const size = 36 + Math.random() * 32;
    Object.assign(el.style, {
      position: 'absolute',
      left: `${4 + Math.random() * 88}%`,
      top: '100%',
      fontSize: `${size}px`,
      lineHeight: '1',
    });
    layer.appendChild(el);
    const sway = (Math.random() - 0.5) * 120;
    el.animate(
      [
        { transform: 'translate(0, 0) rotate(-6deg)' },
        { transform: `translate(${sway / 2}px, -60vh) rotate(6deg)`, offset: 0.5 },
        { transform: `translate(${sway}px, calc(-100vh - ${size * 2}px)) rotate(-6deg)` },
      ],
      { duration: 3200 + Math.random() * 1800, delay: Math.random() * 1200, easing: 'ease-in', fill: 'forwards' }
    );
  }
  document.body.appendChild(layer);
  const remove = window.setTimeout(() => layer.remove(), 6500);
  return () => {
    window.clearTimeout(remove);
    layer.remove();
  };
};

const RAINBOW = ['#f43f5e', '#f59e0b', '#facc15', '#22c55e', '#3b82f6', '#a855f7'];

export const CELEBRATIONS: Celebration[] = [
  {
    emoji: '🎉',
    tune: 0,
    cheer: 'Hooray{name}! You put your picture back together!',
    run: () => {
      burst({ particleCount: 140, spread: 100, origin: { y: 0.6 } });
      return stopConfetti;
    },
  },
  {
    emoji: '🎆',
    tune: 4,
    cheer: 'Wow{name}! Fireworks for you!',
    run: () => {
      const stop = repeat(
        () =>
          burst({
            particleCount: 60,
            startVelocity: 28,
            spread: 360,
            ticks: 70,
            gravity: 0.6,
            scalar: 0.9,
            colors: [RAINBOW[Math.floor(Math.random() * RAINBOW.length)], '#ffffff'],
            origin: { x: 0.15 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.35 },
          }),
        420,
        2600
      );
      return () => {
        stop();
        stopConfetti();
      };
    },
  },
  {
    emoji: '🎊',
    tune: 1,
    cheer: 'Ta-da! You did it{name}!',
    run: () => {
      const stop = repeat(
        () => {
          burst({ particleCount: 7, angle: 60, spread: 55, startVelocity: 60, origin: { x: 0, y: 0.75 }, colors: RAINBOW });
          burst({ particleCount: 7, angle: 120, spread: 55, startVelocity: 60, origin: { x: 1, y: 0.75 }, colors: RAINBOW });
        },
        60,
        1800
      );
      return () => {
        stop();
        stopConfetti();
      };
    },
  },
  {
    emoji: '⭐',
    tune: 4,
    cheer: "You're a superstar{name}!",
    run: () => {
      const stars = { shapes: ['star' as const], colors: ['#facc15', '#fbbf24', '#fde68a', '#f59e0b'], gravity: 0.7 };
      burst({ ...stars, particleCount: 50, spread: 120, startVelocity: 40, scalar: 1.6, origin: { y: 0.55 } });
      const t = window.setTimeout(
        () => burst({ ...stars, particleCount: 40, spread: 160, startVelocity: 30, scalar: 1.2, origin: { y: 0.5 } }),
        350
      );
      return () => {
        window.clearTimeout(t);
        stopConfetti();
      };
    },
  },
  {
    emoji: '🦄',
    tune: 3,
    cheer: 'Yippee{name}! The animals are cheering for you!',
    run: () => {
      let shapes: confetti.Shape[] = [];
      try {
        shapes = ['🐶', '🐱', '🐰', '🦄', '🐸', '🐻', '🦁', '🐥'].map((text) => confetti.shapeFromText({ text, scalar: 3 }));
      } catch {}
      if (!shapes.length) {
        burst({ particleCount: 140, spread: 100, origin: { y: 0.6 } });
        return stopConfetti;
      }
      const stop = repeat(
        () =>
          burst({
            shapes,
            scalar: 3,
            particleCount: 3,
            startVelocity: 0,
            gravity: 0.5,
            ticks: 260,
            flat: true,
            origin: { x: Math.random(), y: -0.1 },
          }),
        110,
        2400
      );
      return () => {
        stop();
        stopConfetti();
      };
    },
  },
  {
    emoji: '🎈',
    tune: 2,
    cheer: 'Woohoo{name}! Balloons for you!',
    run: () => floatUp(['🎈', '🎈', '🎈', '🎈', '🎈', '⭐', '💖'], 18),
  },
];

/** The finished picture wiggles, bounces or spins for joy */
export const dance = (el: Element | null) => {
  if (!el || reducedMotion() || typeof (el as HTMLElement).animate !== 'function') return;
  const moves: Keyframe[][] = [
    // Bounce
    [
      { transform: 'translateY(0) scale(1)' },
      { transform: 'translateY(-6%) scale(1.03)', offset: 0.2 },
      { transform: 'translateY(0) scale(0.98, 1.02)', offset: 0.4 },
      { transform: 'translateY(-3%) scale(1.02)', offset: 0.6 },
      { transform: 'translateY(0) scale(1)' },
    ],
    // Wiggle
    [
      { transform: 'rotate(0)' },
      { transform: 'rotate(-3deg)', offset: 0.15 },
      { transform: 'rotate(3deg)', offset: 0.35 },
      { transform: 'rotate(-2deg)', offset: 0.55 },
      { transform: 'rotate(2deg)', offset: 0.75 },
      { transform: 'rotate(0)' },
    ],
    // Jelly
    [
      { transform: 'scale(1, 1)' },
      { transform: 'scale(1.06, 0.94)', offset: 0.25 },
      { transform: 'scale(0.95, 1.05)', offset: 0.5 },
      { transform: 'scale(1.03, 0.97)', offset: 0.75 },
      { transform: 'scale(1, 1)' },
    ],
    // Twirl
    [
      { transform: 'rotate(0) scale(1)' },
      { transform: 'rotate(4deg) scale(1.05)', offset: 0.5 },
      { transform: 'rotate(0) scale(1)' },
    ],
  ];
  (el as HTMLElement).animate(moves[Math.floor(Math.random() * moves.length)], {
    duration: 1100,
    easing: 'ease-in-out',
  });
};

/** A random celebration, never the same one twice in a row */
export const pickCelebration = (last: Celebration | null): Celebration => {
  const options = CELEBRATIONS.filter((c) => c !== last);
  return options[Math.floor(Math.random() * options.length)];
};
