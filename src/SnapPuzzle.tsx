import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Camera, ImagePlus, ArrowLeft, Shuffle, Eye, EyeOff, Trash2, RotateCcw, Settings, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { speak, setSpeechEnabled } from './speech';
import { playPlop, playFanfare, setSfxEnabled } from './sfx';
import { addPhoto, deletePhoto, listPhotos, type PuzzlePhoto } from './photoStore';

// Board coordinates are in "cells": the board is cols x rows, one unit per piece.
const TAB = 0.25; // how far a knob sticks out past its cell
const PAD = TAB + 0.15; // margin around the board and tray
const GAP = 0.6; // space between the board and the tray
const STEP = 1.3; // spacing between tray slots (knobs may overlap a little)
const SNAP = 0.35; // drop within this distance of the right spot and the piece clicks in

// Starts at 12: a 6-year-old finds fewer too easy. 10 would need a 5x2 grid, which
// crops a camera photo to a thin strip, so these grids all stay close to a photo's 4:3 shape.
const GRID_SIZES = [
  { cols: 4, rows: 3, emoji: '🐰' },
  { cols: 5, rows: 4, emoji: '🦊' },
  { cols: 6, rows: 5, emoji: '🦁' },
  { cols: 7, rows: 6, emoji: '🐉' },
];

const PRAISE = ['It fits!', 'Click!', 'Great job!', 'Nice!', 'You found it!', 'Yay!'];

interface Piece {
  id: number;
  col: number;
  row: number;
  path: string;
  slot: number; // tray slot it starts in
  jx: number; // small random offset so the tray looks scattered
  jy: number;
  free: { x: number; y: number; layoutKey: string } | null; // where it was dropped, if not in its tray slot
  placed: boolean;
}

interface Layout {
  key: string;
  width: number;
  height: number;
  boardX: number;
  boardY: number;
  tray: { x: number; y: number; w: number; h: number };
  slots: { x: number; y: number }[]; // relative to the board origin
  scale: number; // px per cell
}

// Portrait photos get portrait puzzles
const gridFor = (photo: PuzzlePhoto | null, sizeIdx: number) => {
  const g = GRID_SIZES[sizeIdx];
  return photo && photo.height > photo.width ? { cols: g.rows, rows: g.cols } : { cols: g.cols, rows: g.rows };
};

type Pt = [number, number];

const f = (n: number) => Number(n.toFixed(4));
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const CORNER_JITTER = 0.05; // inside corners drift off the grid a little, like a real cut

/**
 * One edge from a to b as a cubic bezier chain [a, c1, c2, p, c1, c2, p, ...], so reversing the
 * list walks the same curve backwards and the two pieces sharing an edge always fit.
 * Every inner edge gets its own knob: a little off-centre, bigger or smaller, leaning, lopsided,
 * with wavy shoulders. sign ±1 picks the side it bulges to, 0 = flat border.
 */
const makeEdge = (a: Pt, b: Pt, sign: number): Pt[] => {
  if (!sign) return [a, a, b, b];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const pt = (u: number, v: number): Pt => [a[0] + dx * u - dy * v * sign, a[1] + dy * u + dx * v * sign];

  const mid = 0.5 + rnd(-0.06, 0.06); // where the knob sits along the edge
  const size = rnd(0.82, 1.02);
  const tall = rnd(0.92, 1.04); // stays within TAB
  const lean = rnd(-0.04, 0.04); // head tips toward one end
  const widthL = rnd(0.88, 1.12);
  const widthR = rnd(0.88, 1.12);
  // (x, v) from the classic knob shape centred at 0, 0.25 tall; x < 0 is the left half
  const k = (x: number, v: number) =>
    pt(mid + x * size * (x < 0 ? widthL : widthR) + (lean * v) / 0.25, v * size * tall);

  const baseL = mid - 0.14 * size * widthL;
  const baseR = mid + 0.14 * size * widthR;
  const dipL = rnd(-0.035, 0.035);
  const dipR = rnd(-0.035, 0.035);
  return [
    a,
    pt(baseL * 0.4, dipL), pt(baseL - 0.08, 0), k(-0.14, 0),
    k(-0.08, 0), k(-0.07, 0.06), k(-0.11, 0.11),
    k(-0.16, 0.18), k(-0.1, 0.25), k(0, 0.25),
    k(0.1, 0.25), k(0.16, 0.18), k(0.11, 0.11),
    k(0.07, 0.06), k(0.08, 0), k(0.14, 0),
    pt(baseR + 0.08, 0), pt(baseR + (1 - baseR) * 0.6, dipR), b,
  ];
};

const makePieceShapes = (cols: number, rows: number): string[][] => {
  const flip = () => (Math.random() < 0.5 ? 1 : -1);
  // Grid corners in board units. Border corners only slide along the border so the outside stays straight.
  const corner = Array.from({ length: rows + 1 }, (_, r) =>
    Array.from({ length: cols + 1 }, (_, c): Pt => [
      c + (c > 0 && c < cols ? rnd(-CORNER_JITTER, CORNER_JITTER) : 0),
      r + (r > 0 && r < rows ? rnd(-CORNER_JITTER, CORNER_JITTER) : 0),
    ])
  );
  // h[r][c]: edge above row r, left to right. v[r][c]: edge left of col c, top to bottom.
  const h = Array.from({ length: rows + 1 }, (_, r) =>
    Array.from({ length: cols }, (_, c) =>
      makeEdge(corner[r][c], corner[r][c + 1], r === 0 || r === rows ? 0 : flip())
    )
  );
  const v = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols + 1 }, (_, c) =>
      makeEdge(corner[r][c], corner[r + 1][c], c === 0 || c === cols ? 0 : flip())
    )
  );
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      // Clockwise, in the piece's own units (its cell's top-left corner is 0,0)
      const loop = [h[r][c], v[r][c + 1], [...h[r + 1][c]].reverse(), [...v[r][c]].reverse()];
      const p = ([x, y]: Pt) => `${f(x - c)} ${f(y - r)}`;
      let d = `M${p(loop[0][0])}`;
      for (const edge of loop) {
        for (let i = 1; i < edge.length; i += 3) d += `C${p(edge[i])} ${p(edge[i + 1])} ${p(edge[i + 2])}`;
      }
      return `${d}Z`;
    })
  );
};

/** Tries the tray beside and below the board in every grid shape and keeps whichever lets pieces be biggest */
const buildLayout = (cols: number, rows: number, n: number, availW: number, availH: number): Layout => {
  const span = (k: number) => (k - 1) * STEP + 1;
  let best: Layout | null = null;
  for (const side of ['right', 'bottom'] as const) {
    for (let a = 1; a <= n; a++) {
      const b = Math.ceil(n / a);
      if ((a - 1) * b >= n) continue; // a column of slots would be empty
      const trayW = span(a);
      const trayH = span(b);
      let width, height, boardX, boardY, trayX, trayY;
      if (side === 'right') {
        width = PAD * 2 + cols + GAP + trayW;
        height = PAD * 2 + Math.max(rows, trayH);
        boardX = PAD;
        boardY = PAD + Math.max(0, (trayH - rows) / 2);
        trayX = PAD + cols + GAP;
        trayY = PAD + Math.max(0, (rows - trayH) / 2);
      } else {
        width = PAD * 2 + Math.max(cols, trayW);
        height = PAD * 2 + rows + GAP + trayH;
        boardX = PAD + Math.max(0, (trayW - cols) / 2);
        boardY = PAD;
        trayX = PAD + Math.max(0, (cols - trayW) / 2);
        trayY = PAD + rows + GAP;
      }
      const scale = Math.min(availW / width, availH / height);
      if (!best || scale > best.scale + 1e-6) {
        best = {
          key: `${side}-${a}x${b}`,
          width,
          height,
          boardX,
          boardY,
          tray: { x: trayX - PAD / 2, y: trayY - PAD / 2, w: trayW + PAD, h: trayH + PAD },
          slots: Array.from({ length: n }, (_, i) => ({
            x: trayX + (i % a) * STEP - boardX,
            y: trayY + Math.floor(i / a) * STEP - boardY,
          })),
          scale,
        };
      }
    }
  }
  return best!;
};

const readString = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

const readNumber = (key: string, fallback: number) => {
  const s = readString(key, '');
  return s ? parseInt(s, 10) : fallback;
};

const save = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

export const SnapPuzzle: React.FC = () => {
  const [photos, setPhotos] = useState<PuzzlePhoto[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<PuzzlePhoto | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [sizeIdx, setSizeIdx] = useState<number>(() => {
    const saved = readNumber('snap_puzzle_pieces', 0);
    return Math.max(0, GRID_SIZES.findIndex((g) => g.cols * g.rows === saved));
  });
  // Grown-up settings: the child's name makes the cheers personal. Sound (voice and effects) starts off
  // so the app is quiet until a grown-up turns it on.
  const [childName, setChildName] = useState<string>(() => readString('snap_puzzle_name', ''));
  const [soundOn, setSoundOn] = useState<boolean>(() => readString('snap_puzzle_sound', 'off') === 'on');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const name = childName.trim();
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [draggingIds, setDraggingIds] = useState<number[]>([]);
  const [showPeek, setShowPeek] = useState<boolean>(true);
  const [isSolved, setIsSolved] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [solvedCount, setSolvedCount] = useState<number>(() => readNumber('snap_puzzle_solved', 0));
  const [areaWidth, setAreaWidth] = useState<number>(0);
  const [viewportH, setViewportH] = useState<number>(() => window.innerHeight);
  const [areaTop, setAreaTop] = useState<number>(0);

  const areaRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const winRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef(new Map<number, SVGGElement>());
  // Active drags by pointer id, so two fingers can move two pieces
  const dragsRef = useRef(new Map<number, { id: number; offX: number; offY: number; x: number; y: number }>());
  // Set when a puzzle starts; the board is scrolled into view once it has rendered
  const scrollPendingRef = useRef(false);

  // Set before the first speak() call below so a muted app stays quiet on launch
  setSpeechEnabled(soundOn);
  setSfxEnabled(soundOn);

  useEffect(() => {
    let alive = true;
    listPhotos().then((list) => alive && setPhotos(list));
    speak("Take a picture, and I'll turn it into a puzzle!");
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => save('snap_puzzle_name', childName.trim()), [childName]);
  useEffect(() => save('snap_puzzle_sound', soundOn ? 'on' : 'off'), [soundOn]);

  // Android back button: close settings, then leave the puzzle, then leave the app
  const backRef = useRef<() => void>(() => {});
  backRef.current = () => {
    if (showSettings) setShowSettings(false);
    else if (photo) setPhoto(null);
    else NativeApp.exitApp();
  };
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = NativeApp.addListener('backButton', () => backRef.current());
    return () => {
      handle.then((h) => h.remove());
    };
  }, []);

  // Object URLs are made in effects (not useMemo) so StrictMode's re-run can't revoke ones still on screen
  useEffect(() => {
    const urls: Record<string, string> = {};
    photos.forEach((p) => (urls[p.id] = URL.createObjectURL(p.blob)));
    setThumbUrls(urls);
    return () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo.blob);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(
    () => save('snap_puzzle_pieces', String(GRID_SIZES[sizeIdx].cols * GRID_SIZES[sizeIdx].rows)),
    [sizeIdx]
  );

  useEffect(() => save('snap_puzzle_solved', String(solvedCount)), [solvedCount]);

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // The board fills the screen below the bars above it, which wrap onto more lines on a narrow phone
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (el) setAreaTop(el.getBoundingClientRect().top + window.scrollY);
  }, [photo, viewportH, areaWidth]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAreaWidth(el.clientWidth));
    ro.observe(el);
    setAreaWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [photo]);

  const grid = useMemo(() => gridFor(photo, sizeIdx), [photo, sizeIdx]);
  const pieceCount = grid.cols * grid.rows;

  const layout = useMemo(
    () => buildLayout(grid.cols, grid.rows, pieceCount, Math.max(1, areaWidth), Math.max(200, viewportH - areaTop - 12)),
    [grid.cols, grid.rows, pieceCount, areaWidth, viewportH, areaTop]
  );

  const startPuzzle = (nextPhoto: PuzzlePhoto, nextSizeIdx: number) => {
    const { cols, rows } = gridFor(nextPhoto, nextSizeIdx);
    const shapes = makePieceShapes(cols, rows);
    const slots = Array.from({ length: cols * rows }, (_, i) => i);
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    const jitter = () => (Math.random() - 0.5) * 0.12;
    dragsRef.current.clear();
    setDraggingIds([]);
    setIsSolved(false);
    setPieces(
      slots.map((slot, id) => {
        const col = id % cols;
        const row = Math.floor(id / cols);
        return { id, col, row, path: shapes[row][col], slot, jx: jitter(), jy: jitter(), free: null, placed: false };
      })
    );
    setPhoto(nextPhoto);
    setSizeIdx(nextSizeIdx);
    scrollPendingRef.current = true;
  };

  useEffect(() => {
    if (!scrollPendingRef.current || !svgRef.current) return;
    scrollPendingRef.current = false;
    svgRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' });
  });

  const shufflePuzzle = () => photo && startPuzzle(photo, sizeIdx);

  useEffect(() => {
    if (isSolved) winRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [isSolved]);

  const restPos = (p: Piece) => {
    if (p.placed) return { x: p.col, y: p.row };
    // A drop spot only counts for the layout it was made in; if the tray moved (tablet rotated)
    // the piece goes back to its tray slot so it can't end up off screen
    if (p.free && p.free.layoutKey === layout.key) return p.free;
    const s = layout.slots[p.slot];
    return { x: s.x + p.jx, y: s.y + p.jy };
  };

  // Screen point -> board cells
  const toBoard = (clientX: number, clientY: number) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x - layout.boardX, y: pt.y - layout.boardY };
  };

  const handlePiecePointerDown = (e: React.PointerEvent, piece: Piece) => {
    if (piece.placed || isSolved) return;
    if ([...dragsRef.current.values()].some((d) => d.id === piece.id)) return;
    const pt = toBoard(e.clientX, e.clientY);
    if (!pt || !svgRef.current) return;
    e.preventDefault();
    // Capture on the <svg>, which stays put while the piece's <g> is re-ordered to the top
    svgRef.current.setPointerCapture(e.pointerId);
    const pos = restPos(piece);
    dragsRef.current.set(e.pointerId, { id: piece.id, offX: pt.x - pos.x, offY: pt.y - pos.y, x: pos.x, y: pos.y });
    setDraggingIds((ids) => [...ids, piece.id]);
    setPieces((prev) => {
      const current = prev.find((p) => p.id === piece.id);
      return current ? [...prev.filter((p) => p.id !== piece.id), current] : prev;
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragsRef.current.get(e.pointerId);
    if (!drag) return;
    const pt = toBoard(e.clientX, e.clientY);
    if (!pt) return;
    drag.x = Math.min(Math.max(pt.x - drag.offX, -layout.boardX), layout.width - layout.boardX - 1);
    drag.y = Math.min(Math.max(pt.y - drag.offY, -layout.boardY), layout.height - layout.boardY - 1);
    // Moved directly on the DOM so dragging doesn't re-render every piece on each finger move
    groupRefs.current
      .get(drag.id)
      ?.setAttribute('transform', `translate(${layout.boardX + drag.x} ${layout.boardY + drag.y})`);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const drag = dragsRef.current.get(e.pointerId);
    if (!drag) return;
    dragsRef.current.delete(e.pointerId);
    setDraggingIds((ids) => ids.filter((id) => id !== drag.id));
    const piece = pieces.find((p) => p.id === drag.id);
    if (!piece) return;
    const fits = Math.hypot(drag.x - piece.col, drag.y - piece.row) < SNAP;
    setPieces((prev) =>
      prev.map((p) =>
        p.id !== drag.id
          ? p
          : fits
          ? { ...p, placed: true, free: null }
          : { ...p, free: { x: drag.x, y: drag.y, layoutKey: layout.key } }
      )
    );
    if (!fits) return;
    playPlop();
    // pointerup is a discrete event, so React has re-rendered before the next one and `pieces` is current
    const left = pieces.filter((p) => !p.placed && p.id !== drag.id).length;
    if (left > 0) {
      speak(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
      return;
    }
    setIsSolved(true);
    setSolvedCount((c) => c + 1);
    playFanfare();
    speak(`Hooray${name ? ` ${name}` : ''}! You put your picture back together!`);
    try {
      confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 } });
    } catch {}
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same picture be chosen again
    if (!file) return;
    setIsBusy(true);
    setError(null);
    try {
      const added = await addPhoto(file);
      setPhotos(await listPhotos());
      startPuzzle(added, sizeIdx);
      speak('What a great picture! Now put the puzzle back together!');
    } catch (err) {
      console.error(err);
      setError("Oops! That picture didn't work. Let's try another one.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeletePhoto = async (p: PuzzlePhoto) => {
    if (!window.confirm('Delete this picture? (Grown-ups only!)')) return;
    await deletePhoto(p.id);
    setPhotos(await listPhotos());
  };

  const placedCount = pieces.filter((p) => p.placed).length;
  // Placed pieces sit underneath loose ones; loose ones keep their pick-up order
  const renderOrder = [...pieces.filter((p) => p.placed), ...pieces.filter((p) => !p.placed)];
  const boardImage = (opacity: number) =>
    photoUrl && (
      <image
        href={photoUrl}
        x={layout.boardX}
        y={layout.boardY}
        width={grid.cols}
        height={grid.rows}
        preserveAspectRatio="xMidYMid slice"
        opacity={opacity}
        pointerEvents="none"
      />
    );

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-3 sm:px-5 pb-3 space-y-3">
      {/* App bar */}
      <header className="flex items-center justify-between gap-3 pt-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="w-10 h-10 rounded-xl shadow-md shadow-indigo-200 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-black text-slate-800 leading-tight">Snap Puzzle</h1>
            <p className="text-[11px] text-slate-500 font-bold truncate">
              {photo ? `${placedCount} of ${pieceCount} pieces` : 'Snap a picture, make a puzzle!'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-2xl text-sm font-black text-amber-900"
            title={`${solvedCount} ${solvedCount === 1 ? 'puzzle' : 'puzzles'} solved`}
          >
            🏆 {solvedCount}
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-200 transition-colors cursor-pointer"
            title="Grown-up settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Piece count (shared by both screens) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {photo ? (
          <button
            onClick={() => setPhoto(null)}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl text-xs font-black transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>My Pictures</span>
          </button>
        ) : (
          <span className="text-xs font-black text-slate-500">How many pieces?</span>
        )}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            {GRID_SIZES.map((g, idx) => (
              <button
                key={idx}
                onClick={() => (photo ? startPuzzle(photo, idx) : setSizeIdx(idx))}
                className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  sizeIdx === idx ? 'bg-indigo-600 text-white shadow-xs font-black' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                {g.emoji} {g.cols * g.rows}
              </button>
            ))}
          </div>
          {photo && (
            <>
              <button
                onClick={() => setShowPeek((v) => !v)}
                className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                  showPeek
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
                title={showPeek ? 'Hide the peek picture' : 'Peek at the picture'}
              >
                {showPeek ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <button
                onClick={shufflePuzzle}
                className="p-2 bg-white hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                title="Shuffle & Restart"
              >
                <Shuffle className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {!photo ? (
        /* 📸 PICTURE PICKER */
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label
              className={`relative flex flex-col items-center justify-center gap-2 p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-indigo-200 cursor-pointer active:scale-98 transition-transform ${
                isBusy ? 'opacity-60 pointer-events-none' : ''
              }`}
            >
              <Camera className="w-12 h-12" />
              <span className="text-lg sm:text-xl font-black">Take a Picture! 📸</span>
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleFile} />
            </label>
            <label
              className={`relative flex flex-col items-center justify-center gap-2 p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-md shadow-pink-200 cursor-pointer active:scale-98 transition-transform ${
                isBusy ? 'opacity-60 pointer-events-none' : ''
              }`}
            >
              <ImagePlus className="w-12 h-12" />
              <span className="text-lg sm:text-xl font-black">Pick a Photo 🖼️</span>
              <input type="file" accept="image/*" className="sr-only" onChange={handleFile} />
            </label>
          </div>

          {isBusy && (
            <div className="p-3 bg-indigo-50 text-indigo-800 rounded-2xl text-sm font-black text-center animate-pulse">
              Making your puzzle… ✨
            </div>
          )}
          {error && (
            <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-2xl text-sm font-bold text-center">
              {error}
            </div>
          )}

          {photos.length > 0 && (
            <div>
              <div className="text-xs font-black text-slate-500 mb-2">My Pictures · tap one to play again</div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {photos.map((p) => (
                  <div key={p.id} className="relative">
                    <button
                      onClick={() => startPuzzle(p, sizeIdx)}
                      className="block w-full aspect-square rounded-2xl overflow-hidden border-4 border-white shadow-md ring-1 ring-slate-200 hover:ring-indigo-400 active:scale-95 transition-all cursor-pointer bg-slate-100"
                    >
                      {thumbUrls[p.id] && (
                        <img src={thumbUrls[p.id]} alt="" className="w-full h-full object-cover" draggable={false} />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeletePhoto(p)}
                      className="absolute -top-1.5 -right-1.5 p-1 bg-white text-slate-400 hover:text-rose-600 rounded-full border border-slate-200 shadow-xs cursor-pointer"
                      title="Delete picture"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 🧩 PUZZLE BOARD */
        <div className="space-y-4">
          <div ref={areaRef} className="w-full flex justify-center">
            {areaWidth > 0 && photoUrl && (
              <svg
                ref={svgRef}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                width={layout.width * layout.scale}
                height={layout.height * layout.scale}
                className="rounded-3xl bg-slate-50 border border-slate-200 select-none"
                style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                <defs>
                  <filter id="pz-lift" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0.03" dy="0.06" stdDeviation="0.05" floodOpacity="0.35" />
                  </filter>
                  {pieces.map((p) => (
                    <clipPath key={p.id} id={`pz-clip-${p.id}`}>
                      <path d={p.path} />
                    </clipPath>
                  ))}
                </defs>

                {/* Tray */}
                <rect
                  x={layout.tray.x}
                  y={layout.tray.y}
                  width={layout.tray.w}
                  height={layout.tray.h}
                  rx={0.2}
                  fill="#f5f3ff"
                  stroke="#ddd6fe"
                  strokeWidth={0.02}
                />

                {/* Board with an optional faded peek picture and piece outlines */}
                <rect
                  x={layout.boardX}
                  y={layout.boardY}
                  width={grid.cols}
                  height={grid.rows}
                  rx={0.04}
                  fill="#ffffff"
                  stroke={isSolved ? '#f59e0b' : '#cbd5e1'}
                  strokeWidth={isSolved ? 0.08 : 0.03}
                />
                {showPeek && !isSolved && boardImage(0.25)}
                {showPeek &&
                  !isSolved &&
                  pieces
                    .filter((p) => !p.placed)
                    .map((p) => (
                      <path
                        key={p.id}
                        d={p.path}
                        transform={`translate(${layout.boardX + p.col} ${layout.boardY + p.row})`}
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth={0.015}
                        strokeDasharray="0.05 0.04"
                        pointerEvents="none"
                      />
                    ))}

                {/* Pieces */}
                {renderOrder.map((p) => {
                  const pos = restPos(p);
                  const isDragging = draggingIds.includes(p.id);
                  return (
                    <g
                      key={p.id}
                      ref={(el) => {
                        if (el) groupRefs.current.set(p.id, el);
                        else groupRefs.current.delete(p.id);
                      }}
                      transform={`translate(${layout.boardX + pos.x} ${layout.boardY + pos.y})`}
                      onPointerDown={(e) => handlePiecePointerDown(e, p)}
                      style={{ cursor: p.placed ? 'default' : 'grab' }}
                    >
                      <g
                        transform={isDragging ? 'translate(0.5 0.5) scale(1.06) translate(-0.5 -0.5)' : undefined}
                        filter={isDragging ? 'url(#pz-lift)' : undefined}
                      >
                        <image
                          href={photoUrl}
                          x={-p.col}
                          y={-p.row}
                          width={grid.cols}
                          height={grid.rows}
                          preserveAspectRatio="xMidYMid slice"
                          clipPath={`url(#pz-clip-${p.id})`}
                        />
                        <path
                          d={p.path}
                          fill="transparent"
                          stroke={p.placed ? 'rgba(255,255,255,0.35)' : '#ffffff'}
                          strokeWidth={p.placed ? 0.012 : 0.03}
                        />
                      </g>
                    </g>
                  );
                })}

                {/* Seamless picture once it's finished */}
                {isSolved && boardImage(1)}
              </svg>
            )}
          </div>

          {isSolved ? (
            <div
              ref={winRef}
              className="p-6 bg-gradient-to-r from-amber-50 via-indigo-50 to-pink-50 rounded-3xl border-3 border-indigo-200 text-center space-y-4 shadow-lg"
            >
              <div className="text-4xl sm:text-5xl">🎉🧩⭐</div>
              <div>
                <h4 className="text-xl sm:text-2xl font-black text-indigo-950">You did it{name ? `, ${name}` : ''}!</h4>
                <p className="text-xs sm:text-sm font-bold text-indigo-800 mt-1">
                  All {pieceCount} pieces are back in your picture!
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  onClick={shufflePuzzle}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 text-white rounded-2xl font-black text-sm shadow-md shadow-indigo-200 transition-all transform active:scale-95 cursor-pointer flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Play Again! 🌟</span>
                </button>
                {sizeIdx < GRID_SIZES.length - 1 && (
                  <button
                    onClick={() => startPuzzle(photo, sizeIdx + 1)}
                    className="px-5 py-3 bg-white hover:bg-slate-100 text-indigo-700 rounded-2xl font-black text-sm border-2 border-indigo-200 shadow-xs transition-all cursor-pointer"
                  >
                    Try {GRID_SIZES[sizeIdx + 1].cols * GRID_SIZES[sizeIdx + 1].rows} Pieces {GRID_SIZES[sizeIdx + 1].emoji}
                  </button>
                )}
                <button
                  onClick={() => setPhoto(null)}
                  className="px-5 py-3 bg-white hover:bg-slate-100 text-sky-700 rounded-2xl font-black text-sm border-2 border-sky-200 shadow-xs transition-all cursor-pointer flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  <span>New Picture</span>
                </button>
              </div>
            </div>
          ) : (
            <p className="text-center text-xs font-bold text-slate-500">
              Drag each piece onto the white board. When it's in the right spot it clicks in! 👆
            </p>
          )}
        </div>
      )}

      {showSettings && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-5 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-800">Grown-up Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-black text-slate-500">Child's name (optional)</span>
              <input
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                maxLength={20}
                placeholder="e.g. Sam"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-base font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <span className="block text-[11px] text-slate-400">
                Used in the cheers: "You did it{name ? `, ${name}` : ', Sam'}!"
              </span>
            </label>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm font-bold text-slate-700">Sound (voice and effects)</span>
              <input
                type="checkbox"
                checked={soundOn}
                onChange={(e) => setSoundOn(e.target.checked)}
                className="w-5 h-5 accent-indigo-600"
              />
            </label>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Pictures stay on this device. Snap Puzzle has no ads or accounts and works without the internet.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
