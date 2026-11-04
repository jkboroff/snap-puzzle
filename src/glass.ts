// "Broken glass" pieces: the board is cracked into straight-edged shards instead of jigsaw pieces.
// The pane is cracked in two along a straight line, then each part is cracked again, and so on, so
// cracks run long and stop where they meet an older crack, like real broken glass. Every shard has the
// same area as a jigsaw piece of the same puzzle, so nothing is too tiny for small fingers.

type Pt = [number, number];

export interface Shard {
  path: string; // in the shard's own units: its centre sits at 0.5, 0.5 like a jigsaw piece
  hx: number; // where the shard's 0,0 goes on the board when it's in the right spot
  hy: number;
}

const MAX_REACH = 0.95; // furthest a shard's corner may be from its centre, so it fits its tray slot
const MIN_CHUNK = 0.3; // no thin splinters (see chunkiness)
const MIN_ANGLE = 35; // sharpest corner allowed, in degrees
const ANGLES = 24; // crack directions tried for each split
const TRIES = 4;
const BUDGET = 400; // cracks tried per attempt before settling for less

const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const f = (n: number) => Number(n.toFixed(4));

/** The part of convex polygon `poly` on one side of the line through `o` with direction `d` */
const half = (poly: Pt[], o: Pt, d: Pt, keep: 1 | -1): Pt[] => {
  const side = (p: Pt) => keep * ((p[0] - o[0]) * d[1] - (p[1] - o[1]) * d[0]);
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
};

/** Area and centroid of a polygon */
const measure = (poly: Pt[]) => {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  a /= 2;
  return a === 0 ? { area: 0, cx: poly[0][0], cy: poly[0][1] } : { area: Math.abs(a), cx: cx / (6 * a), cy: cy / (6 * a) };
};

const span = (poly: Pt[]) => {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};

/** How far the furthest corner is from the centre (a jigsaw piece's knob tips reach about 0.75) */
const reach = (poly: Pt[]) => {
  const { cx, cy } = measure(poly);
  return Math.max(...poly.map(([x, y]) => Math.hypot(x - cx, y - cy)));
};

/** How chunky a shard is: 1-ish for a fat triangle or square, near 0 for a splinter */
const chunkiness = (poly: Pt[]) => measure(poly).area / span(poly) ** 2;

/** The smallest inside angle of a convex polygon, in degrees */
const sharpest = (poly: Pt[]) => {
  let min = 180;
  for (let i = 0; i < poly.length; i++) {
    const [px, py] = poly[(i + poly.length - 1) % poly.length];
    const [x, y] = poly[i];
    const [qx, qy] = poly[(i + 1) % poly.length];
    const a = Math.atan2(py - y, px - x);
    const b = Math.atan2(qy - y, qx - x);
    let deg = (Math.abs(a - b) * 180) / Math.PI;
    if (deg > 180) deg = 360 - deg;
    // Clipping can leave a point in the middle of a straight side (180 degrees) or a doubled point
    if (deg > 1 && Math.hypot(qx - x, qy - y) > 1e-6 && Math.hypot(px - x, py - y) > 1e-6) min = Math.min(min, deg);
  }
  return min;
};

/**
 * Cracks `piece` into `k` shards of equal area: one straight crack splits it into two parts meant for
 * about half the shards each, then each part is cracked again. If a part can't be cracked into good
 * shards, it gives up (null) so the caller tries another direction. Each try spends some of `budget`;
 * once that's gone it stops being fussy and takes the best crack it has, so it always finishes.
 */
const crack = (piece: Pt[], k: number, budget: { left: number }): Pt[][] | null => {
  if (k === 1) return [piece];
  const k1 = Math.random() < 0.5 ? Math.floor(k / 2) : Math.ceil(k / 2);
  const { area, cx, cy } = measure(piece);
  const target = (area * k1) / k;
  // No needle-sharp corners: one would end up in a shard that has to be long and thin. A part that
  // becomes a single shard must already be chunky and fit a tray slot; bigger parts must be compact
  // enough for their size that they can still be cracked into good shards.
  const fits = (p: Pt[], shards: number) =>
    sharpest(p) >= MIN_ANGLE &&
    reach(p) <= MAX_REACH * (shards === 1 ? 1 : Math.sqrt(shards) * 1.08) &&
    chunkiness(p) >= (shards === 1 ? MIN_CHUNK : 0.2);
  const options = Array.from({ length: ANGLES }, () => {
    const t = rnd(0, Math.PI);
    const d: Pt = [Math.cos(t), Math.sin(t)];
    const nx = d[1];
    const ny = -d[0];
    // Slide the crack sideways until the first part has exactly its share of the area
    const proj = piece.map(([x, y]) => (x - cx) * nx + (y - cy) * ny);
    let lo = Math.min(...proj);
    let hi = Math.max(...proj);
    for (let i = 0; i < 18; i++) {
      const s = (lo + hi) / 2;
      const a = measure(half(piece, [cx + s * nx, cy + s * ny], d, 1)).area;
      if (a > target) lo = s;
      else hi = s;
    }
    const s = (lo + hi) / 2;
    const o: Pt = [cx + s * nx, cy + s * ny];
    const a = half(piece, o, d, 1);
    const b = half(piece, o, d, -1);
    return { a, b, ok: fits(a, k1) && fits(b, k - k1), score: Math.min(chunkiness(a), chunkiness(b)) };
  });
  // Any crack direction that works will do, tried in random order: that's what makes each pane
  // break differently
  const good = options.filter((x) => x.ok).sort(() => Math.random() - 0.5);
  if (budget.left > 0) {
    for (const option of good) {
      budget.left--;
      const a = crack(option.a, k1, budget);
      const b = a && crack(option.b, k - k1, budget);
      if (a && b) return [...a, ...b];
      if (budget.left <= 0) break;
    }
    if (budget.left > 0) return null;
  }
  const pick = good[0] ?? options.reduce((x, y) => (y.score > x.score ? y : x));
  return [...crack(pick.a, k1, budget)!, ...crack(pick.b, k - k1, budget)!];
};

/** `cols * rows` shards covering a cols x rows board */
export const makeShards = (cols: number, rows: number): Shard[] => {
  // Keep the best cracking out of a few tries, stopping early once no shard is too long or thin
  let best: Pt[][] = [];
  let bestScore = -Infinity;
  const pane: Pt[] = [
    [0, 0],
    [cols, 0],
    [cols, rows],
    [0, rows],
  ];
  for (let t = 0; t < TRIES; t++) {
    // The last try has no budget, so it can't fail
    const polys = crack(pane, cols * rows, { left: t < TRIES - 1 ? BUDGET : 0 });
    if (!polys) continue;
    const maxReach = Math.max(...polys.map(reach));
    const minChunk = Math.min(...polys.map(chunkiness));
    const score = Math.min(MAX_REACH - maxReach, minChunk - MIN_CHUNK);
    if (score > bestScore) {
      best = polys;
      bestScore = score;
    }
    if (score >= 0) break;
  }
  return best.map((poly) => {
    const { cx, cy } = measure(poly);
    const hx = cx - 0.5;
    const hy = cy - 0.5;
    const pts = poly.map(([x, y]) => `${f(x - hx)} ${f(y - hy)}`);
    return { path: `M${pts.join('L')}Z`, hx, hy };
  });
};
