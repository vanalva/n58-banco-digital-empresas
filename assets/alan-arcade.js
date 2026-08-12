/* ═══════════════════════════════════════════════════════════════════════════
   AlaN Arcade — "El desafío de AlaN"
   ───────────────────────────────────────────────────────────────────────────
   Original momentum platformer for the N58 home page — MULTI-LEVEL. Every
   level is an N58 brand shape (monogram, isologo caret, icon-pack icons)
   embedded as SVG path data and rasterised at load (Path2D → offscreen →
   4px bitmask). Two level modes:
     'ink'   — play INSIDE the filled ink (the letterform channels).
     'arena' — the ink becomes solid obstacle islands in an open framed
               arena; play in the negative space around them.
   Each shape is auto-fit to the arena (ink-bbox letterboxing), then spawn,
   coins and exit are derived from a flood fill of the largest open component
   so the whole level is mutually reachable. Masks build lazily per level.
   AlaN is drawn procedurally with canvas primitives.
   Run momentum, variable jump, coyote time, jump buffering, wall-slide and
   chainable wall-jumps. A draining timer refilled by coins; an exit that
   unlocks once every coin is collected. Keyboard + touch. Spanish copy.

   Vanilla JS, zero dependencies, single IIFE. No per-frame heap allocation in
   the hot loop (fixed pools, scalar state, pre-computed sample offsets).
   100% original code and art — mechanics inspired by classic wall-jump
   platformers, nothing copied.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Level geometry: the N58 monogram (fill = OPEN channels, rest = wall) ── */
  var VBW = 1116.97, VBH = 582.9;
  var MONOGRAM_D = 'M1034.86,294.73l-.47-26.55c46.68-7.91,68.43-35.47,68.43-86.72v-38.04c0-110.35-35.48-143.43-158.18-143.43H0v221.65l94.09,94.09h223.88c68.69,0,93.04,21.86,93.04,83.52s-22.82,85.28-84.19,85.28H.88v98.36h331.23c124.29,0,174.98-46.37,174.98-160.06v-54.79c0-49.38-13.04-82.56-41.05-104.41-29.86-23.29-78.29-34.62-148.09-34.62H111.06c-6.19-6.19-9.66-9.66-15.85-15.85v-125.42h849.42c47.24,0,66.5,16.56,66.5,57.15v18.49c0,42.76-19.62,61-65.62,61h-207.55c-45.99,0-65.62-18.24-65.62-61,0,0,.05-21.85.12-23.48h-91.79v41.54c0,51.25,21.74,78.8,68.43,86.72l-.47,26.55c-54.49,7.26-82.11,40.88-82.11,99.91v39.8c0,58.41,12.33,95.81,38.8,117.69,25.73,21.27,66.64,30.76,132.64,30.76h207.55c66,0,106.91-9.49,132.64-30.76,26.47-21.88,38.8-59.28,38.8-117.69v-39.8c0-59.03-27.63-92.65-82.11-99.91ZM1025.29,428.79c0,50.4-22.37,70.04-79.77,70.04h-207.55c-57.41,0-79.77-19.64-79.77-70.04v-20.35c0-54.28,20.42-74.46,75.35-74.46h215.52c55.57,0,76.23,20.18,76.23,74.46v20.35Z';

  /* ── LEVELS — N58 brand shapes, ordered easy → hard ────────────────────────
     Geometry sources (all © N58 brand assets, converted to bare path data):
       identity marks: references/assets/Identity/Solid/Export (art layer only,
       background rects stripped); icons: Graphics/Icon Pack/Black/SVG
       (polygons/rects converted to path commands).
     vb = source viewBox [w,h]. Modes: 'ink' | 'arena' (see header).        */
  var LEVELS = [
    { id: 'n58', name: 'El monograma', mode: 'ink', vb: [1116.97, 582.9], d: MONOGRAM_D },
    { id: 'potencia', name: 'La potencia', mode: 'ink', vb: [1000, 1000],
      d: 'M883.824,700h-201.752l-135.994-226.944h-92.156l-135.994,226.944H116.176l239.704-400h288.246l239.698,400Z' },
    { id: 'nube', name: 'La nube', mode: 'arena', vb: [10.701, 6.056],
      d: 'M9.953,3.209C10.045,1.622,9.068-.03,7.018.001c-1.458-.047-2.502,1.065-3.075,2.298C1.905.058-1.298,3.136.557,5.353c.615.735,2.084.703,2.084.703,0,0,6.209,0,6.528,0,.846,0,1.533-.686,1.533-1.533,0-.559-.3-1.047-.748-1.315ZM5.607,3.9l-.031,1.009h-.45s-.03-1.009-.03-1.009h-.733s.853-1.03.853-1.03h.272s.853,1.031.853,1.031h-.733Z' },
    { id: 'casita', name: 'La casita', mode: 'arena', vb: [7.017, 6.772],
      d: 'M5.847 0L1.171 0L0 2.248L2.291 2.248L4.727 2.248L7.017 2.248L5.847 0Z M7.017 3.425L0 3.425L0 6.772L1.993 6.772L1.993 5.099L5.024 5.099L5.024 6.772L7.017 6.772L7.017 3.425Z' },
    { id: 'carita', name: 'La carita', mode: 'arena', vb: [11.671, 6.103],
      d: 'M9.724,4.634c-2.222,1.959-5.555,1.959-7.777,0,.267-.303.534-.606.801-.909,1.765,1.556,4.411,1.556,6.175,0,.267.303.534.606.801.909Z M9.924 0L7.824 0L6.077 2.915L7.547 2.915L8.538 1.261L9.21 1.261L10.201 2.915L11.671 2.915L9.924 0Z M3.847 0L1.747 0L0 2.915L1.47 2.915L2.461 1.261L3.133 1.261L4.124 2.915L5.594 2.915L3.847 0Z' },
    { id: 'moneda', name: 'La moneda', mode: 'ink', vb: [10.035, 9.544],
      d: 'M9.077,1.823l-2.509-1.823h-3.101L.958,1.823l-.958,2.949.958,2.949,2.509,1.823h3.101l2.509-1.823.958-2.949-.958-2.949ZM6.255,5.932l-.924-1.542h-.626s-.924,1.542-.924,1.542h-1.371s1.629-2.718,1.629-2.718h1.959s1.629,2.718,1.629,2.718h-1.371Z' },
    { id: 'campana', name: 'La campana', mode: 'arena', vb: [7.271, 7.57],
      d: 'M5.454 1.386L4.645 1.386L4.164 0L3.108 0L2.626 1.386L1.818 1.386L0 6.621L2.778 6.621L3.108 7.57L4.164 7.57L4.493 6.621L7.271 6.621L5.454 1.386Z' },
    { id: 'estrella', name: 'La estrella', mode: 'arena', vb: [1000, 1000],
      d: 'M470.74 765.937L382.576 618.818L382.536 618.16L381.937 617.875L381.521 617.361L381.032 617.361L234.028 529.297L234.028 470.91L382.143 382.143L470.873 234.063L529.26 234.063L617.404 381.148L617.427 382.401L618.303 382.401L618.479 382.606L618.968 382.606L765.972 470.705L765.972 529.092L617.857 617.823L529.123 765.937L470.74 765.937Z' },
    { id: 'transfer', name: 'La transferencia', mode: 'arena', vb: [7.365, 6.219],
      d: 'M3.241 4.277L3.241 1.942L0 0L0 1.635L1.839 2.736L1.839 3.483L0 4.585L0 6.219L3.241 4.277Z M7.365 4.277L7.365 1.942L4.124 0L4.124 1.635L5.963 2.736L5.963 3.483L4.124 4.585L4.124 6.219L7.365 4.277Z' },
    { id: 'candado', name: 'El candado', mode: 'arena', vb: [6.911, 8.405],
      d: 'M5.652,3.386h-3.572v-1.288c0-.759.617-1.376,1.376-1.376.74,0,1.341.588,1.37,1.321h.722c-.03-1.128-.957-2.044-2.092-2.044C2.302,0,1.358.944,1.358,2.098v1.288h-.098l-1.259,1.259v2.501c.49.49.769.769,1.259,1.259h4.393c.49-.49.769-.769,1.259-1.259v-2.501l-1.259-1.259ZM3.918,6.062v.043c0,.255-.208.463-.463.463s-.463-.208-.463-.463v-.596c0-.065.014-.127.038-.183.071-.164.235-.28.424-.28s.353.116.424.28c.024.056.038.118.038.183v.553Z' },
    { id: 'estrellitas', name: 'Las estrellitas', mode: 'arena', vb: [7.215, 7.863],
      d: 'M2.346 7.863L1.473 6.404L1.472 6.398L1.466 6.395L1.462 6.39L1.457 6.39L0 5.517L0 4.938L1.468 4.058L2.348 2.59L2.927 2.59L3.8 4.048L3.801 4.061L3.809 4.061L3.811 4.063L3.816 4.063L5.273 4.936L5.273 5.515L3.805 6.394L2.925 7.863L2.346 7.863Z M4.26 3.164L3.735 2.289L3.735 2.285L3.732 2.283L3.729 2.28L3.726 2.28L2.852 1.756L2.852 1.409L3.733 0.881L4.261 0L4.608 0L5.132 0.875L5.132 0.882L5.138 0.882L5.139 0.884L5.142 0.884L6.016 1.408L6.016 1.755L5.135 2.283L4.607 3.164L4.26 3.164Z M6.272 4.732L5.991 4.262L5.99 4.26L5.988 4.259L5.987 4.258L5.986 4.258L5.516 3.976L5.516 3.79L5.989 3.506L6.273 3.033L6.459 3.033L6.741 3.503L6.741 3.507L6.743 3.507L6.744 3.508L6.746 3.508L7.215 3.789L7.215 3.976L6.742 4.259L6.459 4.732L6.272 4.732Z' },
    { id: 'ene', name: 'La ene', mode: 'ink', vb: [1000, 1000],
      d: 'M626.666 748.047L749.5 748.048L749.498 251.953L667.311 251.952L667.313 628.497L640.592 628.497L373.333 251.952L250.5 251.952L250.5 748.048L332.687 748.048L332.687 371.503L359.407 371.503L626.666 748.047Z' }
  ];

  /* ── Brand palette (resolved from src/css/variables.css — canvas can't var())
     Minimal flat style: solid colors only, no glows / shadows / gradients.  */
  var COL = {
    wall:     '#242b2c',   // solid mass outside the letterforms
    open:     '#121617',   // the playable channels inside the monogram
    ink:      '#1b2021',   // --oro-negro (AlaN outlines, HUD-on-lime text)
    lime:     '#a0dd52',   // --te-quiero-verde (core) — HUD, eyes
    limeSoft: '#c8f08a',
    magenta:  '#b743ed',   // --not-barbie (alternate, "rosa") — exit, coin face A
    purple:   '#6035a5',   // --el-mostro-de-lavanda (alternate-2, "morado") — coin face B
    coral:    '#ef5541',   // --alert — low timer
    cream:    '#ffefe9',   // --caldito-de-pollo — AlaN body
    creamDim: '#e7d8d1'
  };

  /* ── Physics constants (viewBox units, fixed 60 Hz step) ─────────────────────
     Game-feel tuned in v5:
       • Fast-fall — gravity is ~1.7× heavier while falling than while rising,
         with a brief apex-hang (lighter gravity near vy≈0) so jumps snap up,
         float a beat at the top, then drop with weight.
       • Run — snappier accel, higher top speed, and a skid (strong decel
         through zero) when reversing at speed instead of an instant flip.     */
  var STEP = 1000 / 60;        // ms per physics tick
  var GRAV_UP = 0.42;          // gravity while rising  (was single GRAV 0.22)
  var GRAV_DOWN = 0.72;        // gravity while falling (1.71× heavier → weighty)
  var APEX_VEL = 1.4;          // |vy| under this = apex zone
  var APEX_MULT = 0.55;        // gravity ×this in the apex zone (hang time)
  var RUN_ACCEL = 0.7;         // ground accel   (was 0.55)
  var AIR_ACCEL = 0.45;        // air control    (was 0.34)
  var SKID_ACCEL = 1.15;       // decel when reversing at speed (skid/turnaround)
  var RUN_MAX = 4.0;           // top run speed  (was 3.4)
  var GROUND_FRICTION = 0.7;   // idle ground decel (was 0.72)
  var AIR_FRICTION = 0.94;     // idle air decel    (was 0.92)
  var JUMP_VY = -7.6;          // full jump ≈ 69px ≈ 3.4× player height (was -6.6)
  var JUMP_CUT = 0.45;         // variable jump: multiply vy on early release
  var COYOTE = 6;              // frames of grace after leaving ground
  var JUMP_BUFFER = 6;         // frames a jump press is remembered
  var WALL_SLIDE_MAX = 1.3;    // capped fall speed while wall-sliding
  var WALL_JUMP_VX = 3.0;      // gentle push off — stay near the wall to chain-climb
  var WALL_JUMP_VY = -8.2;     // strong lift (> ground jump) so each wall-jump climbs
  var WALL_STICK = 4;          // brief no-steer window, then you can hug back to the wall
  var MAX_FALL = 10;           // terminal velocity (was 8.5)
  var STEP_UP = 6;             // px: hard ceiling on a single auto-climb
  var MAX_SLOPE = 0.9;         // max walkable steepness (rise/run ≈ 42°); steeper
                               // faces (e.g. the caret sides) act as walls → jump
  var SNAP_DOWN = 6;           // px: hug downhill surfaces within this range
  var DJ_DURATION = 780;       // frames (13s) a double-jump power lasts
  var DJ_JUMP_MULT = 0.92;     // air-jump strength vs a ground jump
  var PW = 14, PH = 20;        // player AABB (world units)
  var COIN_R = 8;
  var COIN_TIME = 6;           // seconds added per coin
  var START_TIME = 60;
  var MAX_JUMP_H = JUMP_VY * JUMP_VY / (2 * GRAV_UP);  // ≈69px, used for reachability

  /* ── Collision bitmask (2px cells → smooth diagonal/curved surfaces) ──────── */
  var CELL = 2;
  var COLS = Math.ceil(VBW / CELL);
  var ROWS = Math.ceil(VBH / CELL);
  var mask = null;             // Uint8Array, 1 = solid

  /* Pre-computed AABB sample offsets (step < CELL so nothing tunnels). */
  var SX = [0, 1.75, 3.5, 5.25, 7, 8.75, 10.5, 12.25, 14];
  var SY = [0, 1.8, 3.6, 5.4, 7.2, 9, 10.8, 12.6, 14.4, 16.2, 18, 20];

  function cellSolid(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true; // edges are walls
    return mask[r * COLS + c] === 1;
  }
  function solidPx(x, y) {
    if (x < 0 || y < 0 || x >= VBW || y >= VBH) return true;
    return mask[((y / CELL) | 0) * COLS + ((x / CELL) | 0)] === 1;
  }
  function boxHitsSolid(x, y) {
    for (var i = 0; i < SX.length; i++) {
      var px = x + SX[i];
      for (var j = 0; j < SY.length; j++) {
        if (solidPx(px, y + SY[j])) return true;
      }
    }
    return false;
  }
  function isOpenCell(c, r) { return !cellSolid(c, r); }

  /* ── Per-level build pipeline (runs lazily when a level loads) ─────────────
     1. computeFit: raster once at plain vb scale, scan the ink bounding box,
        then letterbox-fit it into the arena (ink: 96% fill, centered; arena:
        ≤62% fill, centered, resting ~90px above the floor so the lowest
        islands stay within jump reach).
     2. buildLevelMask: raster with the fitted transform → solidity bitmask.
        ink mode:   ink → open, rest → solid.
        arena mode: ink → solid islands, rest → open, plus a solid frame so
        the physical bounds are visible.                                     */
  var levelPath = null;
  var levelTf = { s: 1, tx: 0, ty: 0 };
  var curMode = 'ink';
  var ARENA_FRAME = 8;         // px, drawn + solid in arena mode
  var maskScratch = null;      // reused offscreen for rasters

  function rasterCtx() {
    if (!maskScratch) {
      maskScratch = document.createElement('canvas');
      maskScratch.width = COLS; maskScratch.height = ROWS;
    }
    var o = maskScratch.getContext('2d', { willReadFrequently: true });
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, COLS, ROWS);
    return o;
  }

  function computeFit(level) {
    var o = rasterCtx();
    var sb = Math.min(COLS / level.vb[0], ROWS / level.vb[1]);
    o.setTransform(sb, 0, 0, sb, 0, 0);
    o.fillStyle = '#fff';
    o.fill(levelPath);
    var data = o.getImageData(0, 0, COLS, ROWS).data;
    var minC = COLS, minR = ROWS, maxC = -1, maxR = -1;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (data[(r * COLS + c) * 4 + 3] > 40) {
          if (c < minC) minC = c; if (c > maxC) maxC = c;
          if (r < minR) minR = r; if (r > maxR) maxR = r;
        }
      }
    }
    if (maxC < 0) { minC = 0; minR = 0; maxC = COLS - 1; maxR = ROWS - 1; }
    var bx = minC / sb, by = minR / sb;
    var bw = (maxC - minC + 1) / sb, bh = (maxR - minR + 1) / sb;
    var frac = level.mode === 'ink' ? 0.96 : 0.62;
    var s = Math.min(VBW * frac / bw, VBH * frac / bh);
    levelTf.s = s;
    levelTf.tx = (VBW - bw * s) / 2 - bx * s;
    levelTf.ty = level.mode === 'ink'
      ? (VBH - bh * s) / 2 - by * s
      : (VBH - ARENA_FRAME - 90) - (by + bh) * s;   // islands rest above the floor
  }

  function buildLevelMask(level) {
    var o = rasterCtx();
    var gx = COLS / VBW, gy = ROWS / VBH;
    o.setTransform(gx * levelTf.s, 0, 0, gy * levelTf.s, gx * levelTf.tx, gy * levelTf.ty);
    o.fillStyle = '#fff';
    o.fill(levelPath);
    var data = o.getImageData(0, 0, COLS, ROWS).data;
    if (!mask) mask = new Uint8Array(COLS * ROWS);
    var ink = level.mode === 'ink';
    for (var i = 0; i < COLS * ROWS; i++) {
      var isInk = data[i * 4 + 3] > 110;
      mask[i] = ink ? (isInk ? 0 : 1) : (isInk ? 1 : 0);
    }
    if (!ink) {
      // Solid frame (visible physical bounds).
      var fc = Math.ceil(ARENA_FRAME / CELL), fr = Math.ceil(ARENA_FRAME / CELL);
      for (var r2 = 0; r2 < ROWS; r2++) {
        for (var c2 = 0; c2 < COLS; c2++) {
          if (c2 < fc || c2 >= COLS - fc || r2 < fr || r2 >= ROWS - fr) mask[r2 * COLS + c2] = 1;
        }
      }
    }
  }

  /* Reachability: flood-fill the open cells (4-connected), keep the LARGEST
     component. Spawn, every coin and the exit are all placed inside it, so
     the whole level is guaranteed mutually reachable. Runs per level load. */
  var reach = null;            // Uint8Array, 1 = open cell in the main component
  var reachCount = 0;          // cells in the main component (sizes coin count)
  function buildReach() {
    var total = COLS * ROWS;
    var labels = new Int32Array(total);
    var queue = new Int32Array(total);
    var label = 0, bestLabel = 0, bestSize = 0;
    for (var start = 0; start < total; start++) {
      if (mask[start] === 1 || labels[start] !== 0) continue;
      label++;
      var head = 0, tail = 0, size = 0;
      labels[start] = label; queue[tail++] = start;
      while (head < tail) {
        var idx = queue[head++]; size++;
        var c = idx % COLS, r = (idx - c) / COLS;
        if (c > 0        && mask[idx - 1] === 0    && labels[idx - 1] === 0)    { labels[idx - 1] = label;    queue[tail++] = idx - 1; }
        if (c < COLS - 1 && mask[idx + 1] === 0    && labels[idx + 1] === 0)    { labels[idx + 1] = label;    queue[tail++] = idx + 1; }
        if (r > 0        && mask[idx - COLS] === 0 && labels[idx - COLS] === 0) { labels[idx - COLS] = label; queue[tail++] = idx - COLS; }
        if (r < ROWS - 1 && mask[idx + COLS] === 0 && labels[idx + COLS] === 0) { labels[idx + COLS] = label; queue[tail++] = idx + COLS; }
      }
      if (size > bestSize) { bestSize = size; bestLabel = label; }
    }
    reachCount = bestSize;
    if (!reach) reach = new Uint8Array(total);
    for (var i = 0; i < total; i++) reach[i] = labels[i] === bestLabel ? 1 : 0;
  }
  function reachPx(x, y) {
    if (x < 0 || y < 0 || x >= VBW || y >= VBH) return false;
    return reach[((y / CELL) | 0) * COLS + ((x / CELL) | 0)] === 1;
  }

  /* ── Terrain layer (pre-rendered per level, blitted each frame) ────────────
     Flat minimal style, no glows / strokes / gradients.
     ink:   wall mass everywhere, the shape's ink filled as open channels.
     arena: open space everywhere, the shape's ink filled as solid islands,
            plus the solid frame painted so physics and visuals agree.       */
  var terrainCanvas = null;
  function buildTerrain(level) {
    if (!terrainCanvas) {
      terrainCanvas = document.createElement('canvas');
      terrainCanvas.width = Math.round(VBW * dpr);
      terrainCanvas.height = Math.round(VBH * dpr);
    }
    var t = terrainCanvas.getContext('2d');
    var ink = level.mode === 'ink';
    t.setTransform(dpr, 0, 0, dpr, 0, 0);
    t.fillStyle = ink ? COL.wall : COL.open;
    t.fillRect(0, 0, VBW, VBH);
    t.setTransform(dpr * levelTf.s, 0, 0, dpr * levelTf.s, dpr * levelTf.tx, dpr * levelTf.ty);
    t.fillStyle = ink ? COL.open : COL.wall;
    t.fill(levelPath);
    if (!ink) {
      t.setTransform(dpr, 0, 0, dpr, 0, 0);
      t.fillStyle = COL.wall;
      t.fillRect(0, 0, VBW, ARENA_FRAME);
      t.fillRect(0, VBH - ARENA_FRAME, VBW, ARENA_FRAME);
      t.fillRect(0, 0, ARENA_FRAME, VBH);
      t.fillRect(VBW - ARENA_FRAME, 0, ARENA_FRAME, VBH);
    }
  }

  /* ── Level lifecycle ───────────────────────────────────────────────────────
     loadLevel builds everything for one level (lazy — nothing is prebuilt at
     boot beyond level 0). resetLevel restarts the current level; resetRun
     restarts the whole run (level 1, totals cleared).                       */
  var curLevel = 0;
  var totalElapsed = 0;        // sum of completed-level times (final screen)
  function loadLevel(i) {
    curLevel = Math.max(0, Math.min(LEVELS.length - 1, i | 0));
    var lv = LEVELS[curLevel];
    curMode = lv.mode;
    levelPath = new Path2D(lv.d);
    computeFit(lv);
    buildLevelMask(lv);
    buildReach();
    buildTerrain(lv);
    buildEntities();
    resetLevel();
  }
  function resetLevel() {
    timeLeft = START_TIME; elapsed = 0;
    coinsLeft = coins.length;
    for (var i = 0; i < coins.length; i++) coins[i].got = false;
    exit.open = false;
    power.got = false;
    for (var k = 0; k < PN; k++) part[k].a = false;
    P.djTimer = 0; P.airJumps = 0;
    respawn();
  }
  function resetRun() {
    deaths = 0; totalElapsed = 0;
    loadLevel(0);
  }

  /* ── Entity placement (computed from the bitmask) ────────────────────────── */
  var coins = [];              // {x,y,got,phase}
  var exit = { x: 0, y: 0, r: 11, open: false, phase: 0 };
  var spawn = { x: 60, y: 60 };
  var coinsLeft = 0;
  // Double-jump power coin (only on a subset of levels; hard but provably reachable).
  var power = { active: false, x: 0, y: 0, got: false, phase: 0, reason: '', support: null };

  var HALF_W_CELLS = Math.ceil((PW / 2) / CELL);   // player half-width in cells
  var HEAD_CELLS = Math.ceil(PH / CELL);           // player height in cells
  function ledgeCandidate(c, r) {
    // open reachable cell resting on solid, with a full-player-width open span
    // (box centred here fits) and full-player-height headroom above that span
    if (reach[r * COLS + c] !== 1 || !cellSolid(c, r + 1)) return false;
    for (var dx = -HALF_W_CELLS; dx <= HALF_W_CELLS; dx++) {
      if (reach[r * COLS + c + dx] !== 1) return false;
      for (var k = 1; k <= HEAD_CELLS; k++) {
        if (!isOpenCell(c + dx, r - k)) return false;
      }
    }
    return true;
  }

  function buildEntities() {
    var cand = [];
    for (var r = 3; r < ROWS - 2; r++) {
      for (var c = 2; c < COLS - 2; c++) {
        if (ledgeCandidate(c, r)) {
          // interest score: bonus for a nearby vertical wall (wall-jump spots)
          var wall = cellSolid(c - 3, r) || cellSolid(c + 3, r) ||
                     cellSolid(c - 4, r - 3) || cellSolid(c + 4, r - 3);
          cand.push({ x: c * CELL + CELL / 2, y: r * CELL - 4, wall: wall ? 1 : 0 });
        }
      }
    }
    // Zone grid (6 wide × 3 tall) → spread coins across the whole level.
    var ZX = 6, ZY = 3;
    coins.length = 0;
    for (var zy = 0; zy < ZY; zy++) {
      for (var zx = 0; zx < ZX; zx++) {
        var cx = (zx + 0.5) / ZX * VBW;
        var cy = (zy + 0.5) / ZY * VBH;
        var best = null, bestScore = 1e9;
        for (var i = 0; i < cand.length; i++) {
          var cc = cand[i];
          if (cc.used) continue;
          if (cc.x < zx / ZX * VBW || cc.x >= (zx + 1) / ZX * VBW) continue;
          if (cc.y < zy / ZY * VBH || cc.y >= (zy + 1) / ZY * VBH) continue;
          var d = Math.abs(cc.x - cx) + Math.abs(cc.y - cy) - cc.wall * 40;
          if (d < bestScore) { bestScore = d; best = cc; }
        }
        if (best) { best.used = true; coins.push({ x: best.x, y: best.y, got: false, phase: Math.random() * 6.28 }); }
      }
    }
    // Coin budget scales with the level's open area (min 6, max 14).
    var target = Math.max(6, Math.min(14, Math.round(reachCount / 900)));
    if (coins.length > target) {
      var kept = [];
      for (var t = 0; t < target; t++) kept.push(coins[Math.floor(t * coins.length / target)]);
      coins.length = 0;
      for (var kk = 0; kk < kept.length; kk++) coins.push(kept[kk]);
    }
    // Top-up: zone pass can under-fill sparse shapes — greedily add the
    // candidate farthest from every placed coin until the target is met.
    while (coins.length < target) {
      var far = null, farD = -1;
      for (var f = 0; f < cand.length; f++) {
        var fc2 = cand[f];
        if (fc2.used) continue;
        var dmin = 1e9;
        for (var g3 = 0; g3 < coins.length; g3++) {
          var dd = Math.abs(fc2.x - coins[g3].x) + Math.abs(fc2.y - coins[g3].y);
          if (dd < dmin) dmin = dd;
        }
        if (coins.length === 0) dmin = fc2.x + fc2.y;
        if (dmin > farD) { farD = dmin; far = fc2; }
      }
      if (!far || (coins.length > 0 && farD < 28)) break;   // no spread-out spot left
      far.used = true;
      coins.push({ x: far.x, y: far.y, got: false, phase: Math.random() * 6.28 });
    }
    // Spawn: lowest, left-most ledge (bottom-left region).
    var sp = null;
    for (var s = 0; s < cand.length; s++) {
      var q = cand[s];
      if (q.x > VBW * 0.42) continue;
      if (!sp || (q.y - sp.y) > 6 || (Math.abs(q.y - sp.y) <= 6 && q.x < sp.x)) sp = q;
    }
    if (!sp) {
      // No ledge in the left region: take the lowest ledge anywhere.
      for (var s2 = 0; s2 < cand.length; s2++) {
        var q2 = cand[s2];
        if (!sp || (q2.y - sp.y) > 6 || (Math.abs(q2.y - sp.y) <= 6 && q2.x < sp.x)) sp = q2;
      }
    }
    if (sp) { spawn.x = sp.x - PW / 2; spawn.y = sp.y - PH; }
    // Exit: a high ledge on the far right (rewards the climb).
    var ex = null;
    for (var e = 0; e < cand.length; e++) {
      var g = cand[e];
      if (g.x < VBW * 0.55) continue;
      if (!ex || g.y < ex.y - 4 || (Math.abs(g.y - ex.y) <= 4 && g.x > ex.x)) ex = g;
    }
    if (!ex || ex.y > VBH - 40) {
      // Right side only offers floor level (or nothing): take the highest
      // ledge anywhere away from spawn if it beats the current pick.
      for (var e2 = 0; e2 < cand.length; e2++) {
        var g2 = cand[e2];
        if (sp && Math.abs(g2.x - sp.x) < 60 && Math.abs(g2.y - sp.y) < 60) continue;
        if (!ex || g2.y < ex.y) ex = g2;
      }
    }
    if (ex) { exit.x = ex.x; exit.y = ex.y - exit.r; }
    else { exit.x = spawn.x + PW / 2; exit.y = spawn.y; }   // degenerate fallback

    // De-dup: drop coins overlapping spawn or exit.
    for (var m = coins.length - 1; m >= 0; m--) {
      var co = coins[m];
      if (Math.hypot(co.x - (spawn.x + PW / 2), co.y - (spawn.y + PH / 2)) < 34 ||
          Math.hypot(co.x - exit.x, co.y - exit.y) < 34) coins.splice(m, 1);
    }

    // Double-jump POWER coin — placed on odd levels (2,4,6,…), on the highest
    // qualifying ledge that is PROVABLY catchable, but hard:
    //   • 'wall'  — a solid wall sits within ~6px of the ledge, so a wall-jump
    //     chain climbs to it (chains gain height without bound), OR
    //   • 'jump'  — another standable ledge exists within MAX_JUMP_H (~69px)
    //     below and ~90px to the side, so a single running jump reaches it.
    // Levels remain completable without it (it's off the coin/exit path).
    power.active = false; power.got = false; power.reason = ''; power.support = null;
    if (curLevel % 2 === 1) {
      var wc = Math.round(8 / CELL);           // wall-probe distance in cells
      // standable(c,r): open reachable cell resting on solid — a spot AlaN can
      // land on / launch from. Used for the jump-reachability proof.
      var standable = function (c, r) {
        return c > 0 && c < COLS && r > 1 && r < ROWS - 1 &&
               reach[r * COLS + c] === 1 && cellSolid(c, r + 1);
      };
      var best = null, bestScore = -1;
      for (var pi2 = 0; pi2 < cand.length; pi2++) {
        var pc = cand[pi2];
        if (pc.y > VBH * 0.62) continue;         // must be a HIGH (hard) ledge
        if (Math.hypot(pc.x - (spawn.x + PW / 2), pc.y - (spawn.y + PH / 2)) < 90) continue;
        if (Math.hypot(pc.x - exit.x, pc.y - exit.y) < 55) continue;
        var pcc = (pc.x / CELL) | 0, pcr = (pc.y / CELL) | 0;
        // proof A: a solid wall within wc cells at ledge height → wall-jump chain.
        var wall = false;
        for (var w2 = 1; w2 <= wc + 1; w2++) { if (cellSolid(pcc - w2, pcr) || cellSolid(pcc + w2, pcr)) { wall = true; break; } }
        // proof B: a standable launch spot within one jump below (vertical drop
        // ≤ MAX_JUMP_H, horizontal ≤ 90px) → a running/precise jump reaches it.
        var support = null;
        var maxDrop = Math.round((MAX_JUMP_H - 8) / CELL), maxSide = Math.round(90 / CELL);
        for (var dr = 2; dr <= maxDrop && !support; dr++) {
          for (var dcx = -maxSide; dcx <= maxSide; dcx += 2) {
            if (standable(pcc + dcx, pcr + dr)) { support = { x: (pcc + dcx) * CELL, y: (pcr + dr) * CELL }; break; }
          }
        }
        if (!wall && !support) continue;
        var score = (VBH - pc.y) + (wall ? 40 : 0);   // prefer high + wall-jump
        if (score > bestScore) {
          bestScore = score; best = pc;
          power.reason = wall ? 'wall' : 'jump';
          power.support = support ? { x: Math.round(support.x), y: Math.round(support.y) } : null;
        }
      }
      if (best) {
        power.active = true; power.x = best.x; power.y = best.y - 4;
        // Clear normal coins overlapping the power coin.
        for (var pm = coins.length - 1; pm >= 0; pm--) {
          if (Math.hypot(coins[pm].x - power.x, coins[pm].y - power.y) < 34) coins.splice(pm, 1);
        }
      }
    }
  }

  /* ── Player state ────────────────────────────────────────────────────────── */
  var P = {
    x: 0, y: 0, vx: 0, vy: 0,
    onGround: false, wallL: false, wallR: false, sliding: false, skidding: false,
    facing: 1, coyote: 0, jumpBuf: 0, wallStick: 0, wallDir: 0,
    jumpHeld: false, runPhase: 0, squash: 0, blink: 0, blinkT: 60,
    djTimer: 0, airJumps: 0        // double-jump power: frames left, mid-air jumps left
  };

  function respawn() {
    P.x = spawn.x; P.y = spawn.y; P.vx = 0; P.vy = 0;
    P.onGround = false; P.sliding = false; P.skidding = false; P.facing = 1;
    P.coyote = 0; P.jumpBuf = 0; P.wallStick = 0; P.runPhase = 0; P.squash = 0;
    // power-up persists across respawns within a level (djTimer keeps ticking)
  }

  /* ── Particle pool (no per-frame alloc) ──────────────────────────────────── */
  var PN = 140;
  var part = new Array(PN);
  for (var pi = 0; pi < PN; pi++) part[pi] = { a: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, col: '#fff', sz: 2, grav: 0 };
  var partHead = 0;
  function spawnPart(x, y, vx, vy, life, col, sz, grav) {
    var p = part[partHead]; partHead = (partHead + 1) % PN;
    p.a = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.col = col; p.sz = sz; p.grav = grav;
  }
  function burst(x, y, n, col, spd, grav) {
    if (reducedMotion) n = Math.min(n, 6);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, s = spd * (0.4 + Math.random() * 0.8);
      spawnPart(x, y, Math.cos(a) * s, Math.sin(a) * s - spd * 0.3, 24 + (Math.random() * 20 | 0), col, 1.5 + Math.random() * 2.5, grav);
    }
  }
  function updateParticles() {
    for (var i = 0; i < PN; i++) {
      var p = part[i]; if (!p.a) continue;
      p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.vx *= 0.96; p.life--;
      if (p.life <= 0) p.a = false;
    }
  }

  /* ── Game state ──────────────────────────────────────────────────────────── */
  var STATE = 'idle';          // idle | playing | paused | levelWon | won | lost
  var timeLeft = START_TIME;
  var deaths = 0;              // total retries across the whole run
  var elapsed = 0;             // seconds of play in the current level
  var reducedMotion = false;

  var input = { left: false, right: false, jump: false, jumpEdge: false };

  /* ── Fixed-step physics tick ─────────────────────────────────────────────── */
  function tick() {
    var wasGround = P.onGround;

    // Horizontal intent + momentum (with skid on reversal).
    var dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    var accel = P.onGround ? RUN_ACCEL : AIR_ACCEL;
    P.skidding = false;
    if (P.wallStick > 0) { P.wallStick--; }       // preserve wall-jump launch
    else if (dir !== 0) {
      if (dir * P.vx < -0.1) {                     // reversing while moving → skid
        P.vx += dir * SKID_ACCEL;
        if (P.onGround && Math.abs(P.vx) > 1.2) P.skidding = true;
      } else {
        P.vx += dir * accel;
      }
      if (P.vx > RUN_MAX) P.vx = RUN_MAX;
      if (P.vx < -RUN_MAX) P.vx = -RUN_MAX;
      P.facing = dir;
    } else {
      P.vx *= P.onGround ? GROUND_FRICTION : AIR_FRICTION;
      if (Math.abs(P.vx) < 0.02) P.vx = 0;
    }
    if (P.skidding && !reducedMotion && (elapsed * 60 | 0) % 3 === 0) {
      spawnPart(P.x + PW / 2, P.y + PH, -P.vx * 0.25, -0.5 - Math.random(), 12, COL.creamDim, 1.3, 0.06);
    }

    // Wall detection (probe just outside each side).
    P.wallL = boxHitsSolid(P.x - 1.2, P.y);
    P.wallR = boxHitsSolid(P.x + 1.2, P.y);
    var pressingWall = (P.wallL && dir < 0) || (P.wallR && dir > 0);

    // Gravity — fast-fall + apex hang.
    var g = P.vy < 0 ? GRAV_UP : GRAV_DOWN;
    if (!P.onGround && Math.abs(P.vy) < APEX_VEL) g *= APEX_MULT;   // hang at the top
    P.vy += g;
    P.sliding = false;
    if (!P.onGround && P.vy > 0 && pressingWall) {
      if (P.vy > WALL_SLIDE_MAX) P.vy = WALL_SLIDE_MAX;
      P.sliding = true;
    }
    if (P.vy > MAX_FALL) P.vy = MAX_FALL;

    // Timers.
    if (P.onGround) { P.coyote = COYOTE; if (P.djTimer > 0) P.airJumps = 1; }
    else if (P.coyote > 0) P.coyote--;
    if (P.jumpBuf > 0) P.jumpBuf--;
    if (input.jumpEdge) { P.jumpBuf = JUMP_BUFFER; input.jumpEdge = false; }
    if (P.djTimer > 0) P.djTimer--;

    // Jump resolution: ground/coyote → wall → double-jump.
    if (P.jumpBuf > 0) {
      if (P.onGround || P.coyote > 0) {
        P.vy = JUMP_VY; P.jumpBuf = 0; P.coyote = 0; P.onGround = false;
        P.jumpHeld = true;
      } else if (P.wallL || P.wallR) {
        var away = P.wallL ? 1 : -1;
        P.vx = away * WALL_JUMP_VX; P.vy = WALL_JUMP_VY;
        P.facing = away; P.wallStick = WALL_STICK; P.jumpBuf = 0;
        P.jumpHeld = true;
      } else if (P.djTimer > 0 && P.airJumps > 0) {
        P.vy = JUMP_VY * DJ_JUMP_MULT; P.airJumps--; P.jumpBuf = 0; P.jumpHeld = true;
        burst(P.x + PW / 2, P.y + PH * 0.6, 8, COL.lime, 1.6, 0.04);   // green flourish
      }
    }
    // Variable jump: cut the rise if the button is released early.
    if (!input.jump && P.jumpHeld && P.vy < 0) { P.vy *= JUMP_CUT; P.jumpHeld = false; }
    if (P.vy >= 0) P.jumpHeld = false;

    // Move X (sub-stepped) with slope-limited STEP-UP: gentle slopes are
    // walkable, but anything steeper than MAX_SLOPE (rise/run) blocks like a
    // wall so the caret sides & near-vertical faces must be jumped/wall-jumped.
    // A climb budget accrues MAX_SLOPE per px of forward travel and is spent by
    // each climb; sustained steep climbing drains it and then blocks. The +CELL
    // slack only lets a single quantization stair be cleared, never a wall.
    var d = Math.abs(P.vx), sgn = P.vx > 0 ? 1 : -1, moved = 0, climbBudget = 0;
    while (moved < d) {
      var st = Math.min(1, d - moved);
      var nx = P.x + sgn * st;
      if (!boxHitsSolid(nx, P.y)) { P.x = nx; moved += st; climbBudget += st * MAX_SLOPE; continue; }
      // Blocked: climb only within the accrued slope budget (+ one-cell slack).
      var climbed = 0, cap = Math.min(STEP_UP, (climbBudget | 0) + CELL);
      if (wasGround || P.onGround) {
        for (var up = 1; up <= cap; up++) {
          if (!boxHitsSolid(nx, P.y - up) && !boxHitsSolid(P.x, P.y - up)) { climbed = up; break; }
        }
      }
      if (climbed) { P.x = nx; P.y -= climbed; moved += st; climbBudget += st * MAX_SLOPE - climbed; }
      else { P.vx = 0; break; }                    // too steep / real wall → block
    }
    // Move Y.
    d = Math.abs(P.vy); sgn = P.vy > 0 ? 1 : -1; moved = 0;
    var wasFalling = P.vy;
    var landed = false;
    while (moved < d) {
      var sty = Math.min(1, d - moved);
      if (boxHitsSolid(P.x, P.y + sgn * sty)) {
        if (sgn > 0) landed = true;
        P.vy = 0; break;
      }
      P.y += sgn * sty; moved += sty;
    }
    P.onGround = boxHitsSolid(P.x, P.y + 1.2);
    // STEP-DOWN / ground-snap: hug downhill surfaces instead of launching off
    // every micro-step (only while grounded, moving, and not rising).
    if (!P.onGround && wasGround && P.vy >= 0 && !P.jumpHeld) {
      for (var dn = 1; dn <= SNAP_DOWN; dn++) {
        if (boxHitsSolid(P.x, P.y + dn + 1.2)) { P.y += dn; P.onGround = true; P.vy = 0; break; }
      }
    }
    if (landed && P.onGround && wasFalling > 4) {
      P.squash = Math.min(1, wasFalling / MAX_FALL);
    }
    if (P.squash > 0) P.squash *= 0.8;

    // Run cycle + blink bookkeeping.
    if (P.onGround && Math.abs(P.vx) > 0.3) P.runPhase += Math.abs(P.vx) * 0.09;
    P.blinkT--; if (P.blinkT <= 0) { P.blink = 6; P.blinkT = 90 + (Math.random() * 120 | 0); }
    if (P.blink > 0) P.blink--;

    // Out-of-bounds safety → death/respawn (coins persist).
    if (P.y > VBH + 40 || P.x < -40 || P.x > VBW + 40) killAlan(false);

    // Coin pickup.
    var cxp = P.x + PW / 2, cyp = P.y + PH / 2;
    for (var i = 0; i < coins.length; i++) {
      var co = coins[i];
      if (co.got) continue;
      co.phase += 0.08;
      if (Math.abs(co.x - cxp) < COIN_R + PW * 0.5 && Math.abs(co.y - cyp) < COIN_R + PH * 0.5) {
        co.got = true; coinsLeft--; timeLeft += COIN_TIME;
        burst(co.x, co.y, 6, COL.magenta, 1.3, 0.03);   // tiny pickup puff
        if (coinsLeft <= 0) { exit.open = true; }
      }
    }
    // Power coin pickup → grant a temporary double jump.
    if (power.active && !power.got) {
      power.phase += 0.11;
      if (Math.abs(power.x - cxp) < COIN_R + PW * 0.5 && Math.abs(power.y - cyp) < COIN_R + PH * 0.5) {
        power.got = true; P.djTimer = DJ_DURATION; P.airJumps = 1;
        burst(power.x, power.y, 12, COL.lime, 2.0, 0.02);
      }
    }
    exit.phase += 0.05;
    // Exit reached (only when unlocked).
    if (exit.open && Math.abs(exit.x - cxp) < exit.r + PW * 0.5 && Math.abs(exit.y - cyp) < exit.r + PH * 0.5) {
      win();
    }

    // Timer drain.
    timeLeft -= STEP / 1000;
    if (timeLeft <= 0) { timeLeft = 0; lose(); }
    elapsed += STEP / 1000;
  }

  function killAlan(fatal) {
    burst(P.x + PW / 2, P.y + PH / 2, 10, COL.cream, 1.6, 0.05);   // small power-down puff
    if (!fatal) { deaths++; respawn(); }
  }
  function win() {
    if (STATE !== 'playing') return;
    totalElapsed += elapsed;
    STATE = (curLevel >= LEVELS.length - 1) ? 'won' : 'levelWon';
  }
  function lose() {
    if (STATE !== 'playing') return;
    STATE = 'lost';
    deaths++;
    killAlan(true);
  }
  function advanceLevel() {
    loadLevel(curLevel + 1);
    STATE = 'playing';
    logState('levelWon', 'next-level');
  }

  /* ═══════════════════════ Rendering ═══════════════════════════════════════ */
  var canvas, ctx, wrap, overlay, startBtn, dpr = 1;

  /* Canvas typography — match the site font (Nugros). Canvas can't read the
     CSS @font-face directly, so we ask the FontFace API to load it, then swap
     ctx.font from the Arial fallback to Nugros once ready (the loop re-renders
     every frame, so the swap is seamless). */
  var FONT_FAMILY = 'Arial, sans-serif';
  function f(weight, size) { return weight + ' ' + size + 'px ' + FONT_FAMILY; }
  function loadCanvasFont() {
    if (!document.fonts || !document.fonts.load) return;
    Promise.all([
      document.fonts.load('400 20px Nugros'),
      document.fonts.load('700 20px Nugros'),
      document.fonts.load('800 40px Nugros')
    ]).then(function () {
      if (document.fonts.check('700 20px Nugros')) FONT_FAMILY = '"Nugros", Arial, sans-serif';
    }).catch(function () {});
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Terrain (flat walls + open channels; covers the whole canvas).
    ctx.drawImage(terrainCanvas, 0, 0, VBW, VBH);

    // Coins.
    for (var i = 0; i < coins.length; i++) {
      var co = coins[i]; if (co.got) continue;
      drawCoin(co.x, co.y + Math.sin(co.phase) * 1.5, co.phase * 1.3);
    }
    // Power coin (green pulsing ring).
    if (power.active && !power.got) drawPower(power.x, power.y + Math.sin(power.phase) * 2);
    // Exit dock.
    drawExit();
    // Particles.
    drawParticles();
    // AlaN.
    if (STATE !== 'lost') drawAlan();

    // HUD.
    drawHUD();

    // In-canvas overlays.
    if (STATE === 'paused') centerText('Pausa', 'Pulsa para continuar');
    else if (STATE === 'levelWon') levelWonScreen();
    else if (STATE === 'won') winScreen();
    else if (STATE === 'lost') loseScreen();
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* Coin — flat two-tone spin: classic |cos| scaleX squash showing the brand
     pink (--not-barbie) on one face and the brand purple (--el-mostro-de-
     lavanda) on the other. Flat fills only — no stroke, shadow or glow. */
  function drawCoin(x, y, phase) {
    var c = Math.cos(phase);
    var rx = (COIN_R - 1.5) * Math.max(0.14, Math.abs(c));
    ctx.fillStyle = c >= 0 ? COL.magenta : COL.purple;
    ctx.beginPath(); ctx.ellipse(x, y, rx, COIN_R - 1.5, 0, 0, 6.2832); ctx.fill();
  }

  /* Power coin — flat green (core seed) target: a filled dot inside a pulsing
     ring so it reads as special vs the pink/purple normal coins. Flat only. */
  function drawPower(x, y) {
    var pulse = 0.5 + 0.5 * Math.sin(power.phase * 1.6);
    ctx.strokeStyle = COL.lime; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, COIN_R + 1 + pulse * 3, 0, 6.2832); ctx.stroke();
    ctx.fillStyle = COL.lime;
    ctx.beginPath(); ctx.arc(x, y, COIN_R - 3, 0, 6.2832); ctx.fill();
    ctx.fillStyle = COL.ink;
    ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 6.2832); ctx.fill();   // hollow center dot
  }

  /* Exit — flat square marker: gray outline while locked, solid magenta frame
     with a flat up-arrow once every coin is collected. No pulse, no glow. */
  function drawExit() {
    ctx.save();
    ctx.translate(exit.x, exit.y);
    var col = exit.open ? COL.magenta : '#454d4f';
    ctx.lineWidth = 2; ctx.strokeStyle = col;
    ctx.strokeRect(-exit.r, -exit.r, exit.r * 2, exit.r * 2);
    if (exit.open) {
      ctx.fillStyle = 'rgba(183,67,237,0.25)';
      ctx.fillRect(-exit.r + 2, -exit.r + 2, exit.r * 2 - 4, exit.r * 2 - 4);
    }
    ctx.strokeStyle = exit.open ? COL.limeSoft : '#5a5f60';
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    if (exit.open) {
      ctx.beginPath(); ctx.moveTo(-3.5, 2.5); ctx.lineTo(0, -3.5); ctx.lineTo(3.5, 2.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -3.5); ctx.lineTo(0, 5); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0, -1, 3.2, Math.PI, 0); ctx.stroke();
      ctx.strokeRect(-3.2, -1, 6.4, 5.4);
    }
    ctx.restore();
  }

  function drawParticles() {
    for (var i = 0; i < PN; i++) {
      var p = part[i]; if (!p.a) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
    }
    ctx.globalAlpha = 1;
  }

  /* AlaN — procedural robot (rounded head + antenna, boxy cream torso, thin
     limbs). Poses derive from velocity + contact state. */
  function drawAlan() {
    var cx = P.x + PW / 2, cy = P.y + PH / 2;
    var lean = Math.max(-0.28, Math.min(0.28, P.vx * 0.05));
    var sq = P.squash;                      // squash & stretch
    var scaleY = 1 - sq * 0.35, scaleX = 1 + sq * 0.3;

    ctx.save();
    ctx.translate(cx, cy);
    if (P.sliding) { ctx.rotate(P.wallR ? 0.12 : -0.12); }
    else ctx.rotate(lean);
    ctx.scale(P.facing, 1);
    ctx.scale(scaleX, scaleY);

    var run = Math.sin(P.runPhase), run2 = Math.sin(P.runPhase + Math.PI);
    var airborne = !P.onGround && !P.sliding;

    ctx.lineCap = 'round';
    ctx.strokeStyle = COL.ink;
    ctx.lineWidth = 2.4;

    // Legs.
    var legY = 4;
    if (STATE === 'won') {
      leg(-3, legY, -4, 9); leg(3, legY, 4, 9);
    } else if (airborne) {
      leg(-3, legY, -2, 6); leg(3, legY, 2, 6);      // tucked
    } else if (P.sliding) {
      leg(-3, legY, -4, 8); leg(3, legY, 1, 9);      // pressed flat
    } else if (Math.abs(P.vx) > 0.3) {
      leg(-3, legY, -3 + run * 5, 9); leg(3, legY, 3 + run2 * 5, 9);
    } else {
      leg(-3, legY, -3, 10); leg(3, legY, 3, 10);
    }

    // Arms.
    if (STATE === 'won') { arm(-5, -3, -8, -11); arm(5, -3, 8, -11); }
    else if (P.sliding) { arm(-5, -3, -7, 2); arm(5, -3, 6, -1); }
    else if (airborne) { arm(-5, -3, -8, -4); arm(5, -3, 8, -4); }
    else if (Math.abs(P.vx) > 0.3) { arm(-5, -3, -7 + run2 * 3, 3); arm(5, -3, 7 + run * 3, 3); }
    else { arm(-5, -3, -7, 3); arm(5, -3, 7, 3); }

    // Torso.
    ctx.fillStyle = COL.cream;
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.6;
    rr(-5.5, -4, 11, 10, 3); ctx.fill(); ctx.stroke();
    // Chest N58 dot.
    ctx.fillStyle = COL.lime;
    ctx.beginPath(); ctx.arc(0, 1, 1.6, 0, 6.2832); ctx.fill();

    // Head.
    ctx.fillStyle = COL.cream; ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.6;
    rr(-5, -13, 10, 9, 3.5); ctx.fill(); ctx.stroke();
    // Antenna.
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(0, -17); ctx.stroke();
    ctx.fillStyle = COL.magenta;
    ctx.beginPath(); ctx.arc(0, -18, 1.8, 0, 6.2832); ctx.fill();
    // Visor.
    ctx.fillStyle = '#0f1314';
    rr(-3.6, -11, 7.2, 4.2, 2); ctx.fill();
    // Eyes (blink).
    if (P.blink <= 0 && STATE !== 'lost') {
      ctx.fillStyle = COL.lime; ctx.shadowColor = COL.lime; ctx.shadowBlur = 5;
      ctx.beginPath(); ctx.arc(-1.6, -9, 1.05, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.arc(1.6, -9, 1.05, 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = COL.lime; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-2.6, -9); ctx.lineTo(-0.6, -9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0.6, -9); ctx.lineTo(2.6, -9); ctx.stroke();
    }
    ctx.restore();

    function leg(hx, hy, fx, fy) {
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.fillStyle = COL.ink;
      ctx.beginPath(); ctx.arc(fx, fy, 1.5, 0, 6.2832); ctx.fill();
    }
    function arm(sxp, syp, hx, hy) {
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(sxp, syp); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.fillStyle = COL.cream; ctx.strokeStyle = COL.ink; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(hx, hy, 1.7, 0, 6.2832); ctx.fill(); ctx.stroke();
    }
  }

  /* ── HUD — thin flat bar + plain text, no flash effects ──────────────────── */
  function drawHUD() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var pad = 18, barW = 240, barH = 8, x = pad, y = pad;
    // Timer bar (flat; coral when under 10s).
    var frac = Math.max(0, Math.min(1, timeLeft / START_TIME));
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = timeLeft < 10 ? COL.coral : COL.lime;
    if (frac > 0) ctx.fillRect(x, y, barW * frac, barH);
    ctx.fillStyle = COL.cream;
    ctx.font = f(700, 13); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.ceil(timeLeft) + 's', x + barW + 10, y + barH / 2 + 0.5);

    // Coin counter.
    var got = coins.length - coinsLeft;
    ctx.fillStyle = COL.magenta;
    ctx.beginPath(); ctx.arc(VBW - pad - 58, y + barH / 2, 5, 0, 6.2832); ctx.fill();
    ctx.fillStyle = COL.cream; ctx.font = f(700, 14); ctx.textAlign = 'left';
    ctx.fillText(got + ' / ' + coins.length, VBW - pad - 48, y + barH / 2 + 0.5);

    // Deaths.
    ctx.textAlign = 'right'; ctx.font = f(400, 12); ctx.fillStyle = COL.creamDim;
    ctx.fillText('Reintentos: ' + deaths, VBW - pad, y + barH + 16);

    // Double-jump indicator (only while the power is active).
    if (P.djTimer > 0) {
      var dx = pad, dy = y + barH + 18;
      ctx.fillStyle = COL.lime;
      ctx.beginPath(); ctx.arc(dx + 5, dy, 5, 0, 6.2832); ctx.fill();
      ctx.fillStyle = COL.ink; ctx.font = f(800, 8); ctx.textAlign = 'center';
      ctx.fillText('2', dx + 5, dy + 0.5);
      ctx.fillStyle = COL.lime; ctx.font = f(700, 13); ctx.textAlign = 'left';
      ctx.fillText('Doble salto ' + Math.ceil(P.djTimer / 60) + 's', dx + 14, dy + 0.5);
    }

    // Level indicator (the open-door callout takes over the slot when active).
    ctx.textAlign = 'center';
    if (coinsLeft <= 0 && STATE === 'playing') {
      ctx.fillStyle = COL.magenta; ctx.font = f(700, 14);
      ctx.fillText('Puerta abierta — llega a la salida', VBW / 2, y + barH / 2 + 0.5);
    } else {
      ctx.fillStyle = COL.creamDim; ctx.font = f(600, 13);
      ctx.fillText('Nivel ' + (curLevel + 1) + '/' + LEVELS.length + ' — ' + LEVELS[curLevel].name, VBW / 2, y + barH / 2 + 0.5);
    }
  }

  function scrim() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(10,12,13,0.72)';
    ctx.fillRect(0, 0, VBW, VBH);
  }
  function centerText(title, sub) {
    scrim();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = COL.cream; ctx.font = f(800, 40);
    ctx.fillText(title, VBW / 2, VBH / 2 - 14);
    ctx.fillStyle = COL.creamDim; ctx.font = f(400, 18);
    ctx.fillText(sub, VBW / 2, VBH / 2 + 24);
  }
  function levelWonScreen() {
    scrim();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = COL.lime; ctx.font = f(800, 40);
    ctx.fillText('¡Nivel completado!', VBW / 2, VBH / 2 - 58);
    ctx.fillStyle = COL.cream; ctx.font = f(600, 20);
    ctx.fillText(LEVELS[curLevel].name + '   ·   ' + elapsed.toFixed(1) + 's', VBW / 2, VBH / 2 - 14);
    button('Siguiente nivel', VBW / 2, VBH / 2 + 40, 'primary');
    ctx.fillStyle = COL.creamDim; ctx.font = f(400, 13); ctx.textAlign = 'center';
    ctx.fillText('Enter para continuar', VBW / 2, VBH / 2 + 78);
  }
  function winScreen() {
    scrim();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = COL.lime; ctx.font = f(800, 44);
    ctx.fillText('¡Desafío completado!', VBW / 2, VBH / 2 - 58);
    ctx.fillStyle = COL.cream; ctx.font = f(600, 20);
    ctx.fillText(LEVELS.length + ' niveles   ·   Tiempo total: ' + totalElapsed.toFixed(1) + 's   ·   Reintentos: ' + deaths, VBW / 2, VBH / 2 - 14);
    button('Jugar otra vez', VBW / 2, VBH / 2 + 40, 'primary');
  }
  function loseScreen() {
    scrim();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = COL.coral; ctx.font = f(800, 40);
    ctx.fillText('AlaN se quedó sin energía', VBW / 2, VBH / 2 - 58);
    var got = coins.length - coinsLeft;
    ctx.fillStyle = COL.cream; ctx.font = f(600, 20);
    ctx.fillText('Nivel ' + (curLevel + 1) + ' — ' + LEVELS[curLevel].name + '   ·   Monedas: ' + got + ' / ' + coins.length, VBW / 2, VBH / 2 - 14);
    button('Reintentar nivel', VBW / 2, VBH / 2 + 40, 'primary');
  }
  /* In-canvas button matching the site's flwr buttons — flat, no shadow/glow.
     primary   = green (core) fill + dark ink Nugros label (flwr_button_primary)
     secondary = magenta (alternate) outline + magenta label (flwr_button_secondary) */
  function button(label, x, y, style) {
    ctx.font = f(600, 18);                    // semibold, like flwr buttons
    var w = ctx.measureText(label).width + 52, h = 42, r = 12;   // card radius (0.75rem), not a pill
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (style === 'secondary') {
      ctx.lineWidth = 2; ctx.strokeStyle = COL.magenta;
      rr(x - w / 2, y - h / 2, w, h, r); ctx.stroke();
      ctx.fillStyle = COL.magenta;
    } else {
      ctx.fillStyle = COL.lime;
      rr(x - w / 2, y - h / 2, w, h, r); ctx.fill();
      ctx.fillStyle = COL.ink;
    }
    ctx.fillText(label, x, y + 1);
  }

  /* ── (No page scroll-lock) ─────────────────────────────────────────────────
     Pinning <body> during play was disorienting. The page only appeared to
     drift because auto-animations ABOVE the game keep reflowing the layout;
     that is fixed by pausing off-viewport animations (see pauseOffscreenFx).
     These stay as no-ops so the debug getter keeps working. */
  var scrollLock = { active: false };
  function lockScroll() {}
  function unlockScroll() {}

  /* ═══════════════════════ Loop ════════════════════════════════════════════ */
  var last = 0, acc = 0, raf = 0, loopRunning = false;
  function startLoop() {
    if (loopRunning) return;
    loopRunning = true;
    last = 0;                               // fresh dt after a stopped stretch
    raf = requestAnimationFrame(frame);
  }
  function stopLoop() {
    if (!loopRunning) return;
    loopRunning = false;
    cancelAnimationFrame(raf);
  }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (!last) last = t;
    var dt = t - last; last = t;
    if (dt > 200) dt = 200;                 // clamp after a stall/tab-away
    if (STATE === 'playing') {
      acc += dt;
      var guard = 0;
      while (acc >= STEP && guard < 6) { tick(); acc -= STEP; guard++; }
      if (acc > STEP) acc = 0;
      updateParticles();
    } else {
      updateParticles();
    }
    draw();
  }

  /* ═══════════════════════ Input & lifecycle ═══════════════════════════════
     Level-triggered input rebuilt from PHYSICAL sources on every change:
     - heldKeys: one flag per physical key (normalized e.key). Releasing 'A'
       can never clear an ArrowLeft that is still held, and OS autorepeat
       keydowns are idempotent (no toggling, no lost holds).
     - touchHold: one flag per on-screen button. Its window-level mouseup
       fallback only clears a hold that button actually owns — a stray mouse
       click during keyboard play no longer wipes keyboard-held input (this
       was the v2 "horizontal movement struggles" bug).
     input.{left,right,jump} are always derived via syncInput(); jumpEdge
     fires only on a false→true transition of the combined jump level.     */
  var stateLog = [];           // [ms, from→to, why] ring buffer (debug hook)
  function logState(prev, why) {
    if (stateLog.length > 48) stateLog.shift();
    stateLog.push([(performance.now() | 0), prev + '→' + STATE, why]);
  }
  function startGame(why) {
    if (STATE === 'playing') return;
    var prev = STATE;
    if (STATE === 'idle') resetLevel();
    else if (STATE === 'won') resetRun();          // full run restart after the final win
    else if (STATE === 'lost') resetLevel();       // retry the current level
    else if (STATE === 'levelWon') { advanceLevel(); return; }
    STATE = 'playing';
    logState(prev, why || 'start');
    hideOverlay();
    // Blur the start button so Space can never re-activate it mid-play.
    try { if (startBtn) startBtn.blur(); } catch (e) {}
    try { overlay.blur(); } catch (e) {}
    try { canvas.focus({ preventScroll: true }); } catch (e) { try { canvas.focus(); } catch (e2) {} }
  }
  function pauseGame(why) {
    if (STATE === 'playing') { STATE = 'paused'; logState('playing', why || 'pause'); }
  }
  function hideOverlay() { overlay.classList.add('is-hidden'); }
  function showOverlay() { overlay.classList.remove('is-hidden'); }

  /* ── Mobile: preview inline, tap-to-play opens a landscape fullscreen ────────
     The landscape canvas is cramped in a portrait viewport, so on a touch/small
     device the inline section is just a preview; tapping play turns the arcade
     into a fixed fullscreen overlay, rotated 90° when the phone is portrait so
     it always plays landscape. A close button returns to the page. Pure CSS +
     class toggles (no Fullscreen API / orientation permission needed). */
  var closeBtn = null, fsActive = false;
  function isMobile() {
    return !!(window.matchMedia && (window.matchMedia('(pointer: coarse)').matches ||
                                    window.matchMedia('(max-width: 767px)').matches));
  }
  function updateRotation() {
    if (!fsActive) return;
    var portrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
    wrap.classList.toggle('is-rotated', !!portrait);
  }
  function enterFullscreen() {
    if (fsActive) return;
    fsActive = true;
    wrap.classList.add('is-fullscreen');
    var t = wrap.querySelector('.alan-arcade_touch'); if (t) t.classList.add('is-touch');
    if (closeBtn) closeBtn.classList.add('is-visible');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    updateRotation();
    window.addEventListener('resize', updateRotation);
    window.addEventListener('orientationchange', updateRotation);
    // Best-effort native landscape lock (Android); harmless where unsupported (iOS).
    try { if (window.screen && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape')['catch'](function () {}); } catch (e) {}
    startGame('fullscreen');
  }
  function exitFullscreen() {
    if (!fsActive) return;
    fsActive = false;
    pauseGame('fullscreen-close'); clearInput();
    wrap.classList.remove('is-fullscreen', 'is-rotated');
    if (closeBtn) closeBtn.classList.remove('is-visible');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    window.removeEventListener('resize', updateRotation);
    window.removeEventListener('orientationchange', updateRotation);
    try { if (window.screen && screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
    // Back to an idle preview of the current level with the play overlay.
    resetLevel(); STATE = 'idle'; showOverlay();
  }

  var heldKeys = {};                                   // normalized key → held
  var touchHold = { left: false, right: false, jump: false };
  var LEFT_KEYS  = { 'arrowleft': 1, 'a': 1 };
  var RIGHT_KEYS = { 'arrowright': 1, 'd': 1 };
  var JUMP_KEYS  = { ' ': 1, 'spacebar': 1, 'arrowup': 1, 'w': 1, 'z': 1 };
  var PREVENT_KEYS = { ' ': 1, 'spacebar': 1, 'arrowup': 1, 'arrowdown': 1, 'arrowleft': 1, 'arrowright': 1 };

  function syncInput() {
    input.left  = !!(heldKeys['arrowleft'] || heldKeys['a'] || touchHold.left);
    input.right = !!(heldKeys['arrowright'] || heldKeys['d'] || touchHold.right);
    var j = !!(heldKeys[' '] || heldKeys['spacebar'] || heldKeys['arrowup'] ||
               heldKeys['w'] || heldKeys['z'] || touchHold.jump);
    if (j && !input.jump) input.jumpEdge = true;
    input.jump = j;
  }
  function clearInput() {
    heldKeys = {};
    touchHold.left = touchHold.right = touchHold.jump = false;
    input.left = input.right = input.jump = false; input.jumpEdge = false;
  }

  function onKeyDown(e) {
    var k = e.key.toLowerCase();
    // Only capture page keys during an active session (playing or paused);
    // the start overlay gates everything else — page scroll stays untouched.
    if ((STATE === 'playing' || STATE === 'paused') && PREVENT_KEYS[k]) e.preventDefault();
    if (LEFT_KEYS[k] || RIGHT_KEYS[k] || JUMP_KEYS[k]) {
      if (STATE === 'paused') { STATE = 'playing'; logState('paused', 'key-resume'); }
      if (STATE !== 'playing') return;                 // idle/won/lost: overlay & clicks handle it
      heldKeys[k] = true;
      syncInput();
    } else if (k === 'r') {
      if (STATE === 'playing' || STATE === 'won' || STATE === 'lost') {
        var prev = STATE;
        if (STATE === 'won') resetRun(); else resetLevel();   // R = retry current level
        STATE = 'playing'; logState(prev, 'R-restart'); hideOverlay();
      }
    } else if (k === 'enter') {
      if (STATE === 'levelWon') advanceLevel();
      else if (STATE === 'won') { resetRun(); STATE = 'playing'; logState('won', 'enter-replay'); }
      else if (STATE === 'lost') { resetLevel(); STATE = 'playing'; logState('lost', 'enter-retry'); }
    } else if (k === 'escape') {
      pauseGame('Escape');
    }
  }
  function onKeyUp(e) {
    var k = e.key.toLowerCase();
    if (heldKeys[k]) { heldKeys[k] = false; syncInput(); }
  }

  function canvasPoint(e) {
    var rect = canvas.getBoundingClientRect();
    var cxp = (e.clientX - rect.left) / rect.width * VBW;
    var cyp = (e.clientY - rect.top) / rect.height * VBH;
    return { x: cxp, y: cyp };
  }
  function onCanvasClick(e) {
    if (STATE === 'levelWon') { advanceLevel(); return; }
    if (STATE === 'won') { resetRun(); STATE = 'playing'; logState('won', 'replay-click'); return; }
    if (STATE === 'lost') { resetLevel(); STATE = 'playing'; logState('lost', 'retry-click'); return; }
    if (STATE === 'paused') { STATE = 'playing'; logState('paused', 'click-resume'); return; }
    if (STATE === 'idle') startGame('overlay/canvas click');
  }
  function onOutside(e) {
    if (STATE !== 'playing') return;
    if (wrap.contains(e.target)) return;
    pauseGame('outside-click');
    clearInput();
  }

  /* Touch buttons — own their touchHold flag; the window-level mouseup
     fallback only releases a hold this button actually started, so it can
     never wipe keyboard-held input. */
  function bindTouch(btn, which) {
    if (!btn) return;
    var press = function (e) {
      e.preventDefault();
      if (STATE === 'idle' || STATE === 'paused' || STATE === 'won' || STATE === 'lost') { startGame('touch'); if (which !== 'jump') return; }
      touchHold[which] = true;
      syncInput();
    };
    var release = function () {
      if (!touchHold[which]) return;
      touchHold[which] = false;
      syncInput();
    };
    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend', function (e) { e.preventDefault(); release(); }, { passive: false });
    btn.addEventListener('touchcancel', release);
    btn.addEventListener('mousedown', press);
    window.addEventListener('mouseup', release);
  }

  /* ═══════════════════════ Boot ════════════════════════════════════════════ */
  function boot() {
    wrap = document.querySelector('[data-alan-arcade]');
    if (!wrap) return;
    canvas = wrap.querySelector('.alan-arcade_canvas');
    overlay = wrap.querySelector('[data-alan-start]');
    startBtn = wrap.querySelector('[data-alan-start-btn]');
    if (!canvas || !overlay || !window.Path2D) return;
    ctx = canvas.getContext('2d');
    reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    loadCanvasFont();          // swap canvas text to Nugros once the webfont loads

    // Resolution: viewBox × devicePixelRatio, CSS width driven by stylesheet.
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(VBW * dpr);
    canvas.height = Math.round(VBH * dpr);

    loadLevel(0);              // lazy: only level 1 is built at boot

    // Coarse-pointer → show touch buttons.
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      var touch = wrap.querySelector('.alan-arcade_touch');
      if (touch) touch.classList.add('is-touch');
    }
    // Mobile: the inline section is a preview; the overlay hint reflects that.
    if (isMobile()) {
      var hint = wrap.querySelector('.alan-arcade_hint');
      if (hint) hint.textContent = 'Se abre en pantalla completa horizontal';
    }
    bindTouch(wrap.querySelector('[data-alan-touch="left"]'), 'left');
    bindTouch(wrap.querySelector('[data-alan-touch="right"]'), 'right');
    bindTouch(wrap.querySelector('[data-alan-touch="jump"]'), 'jump');

    overlay.addEventListener('click', function (e) {
      e.preventDefault();
      if (STATE === 'playing') return;                       // never re-fires mid-play
      if (isMobile()) enterFullscreen();                     // mobile → landscape fullscreen
      else startGame('overlay-click');                       // desktop → play inline
    });
    closeBtn = wrap.querySelector('[data-alan-close]');
    if (closeBtn) closeBtn.addEventListener('click', function (e) { e.preventDefault(); exitFullscreen(); });
    canvas.addEventListener('click', onCanvasClick);
    canvas.setAttribute('tabindex', '0');
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onOutside);
    // Tab hide / window blur: pause AND drop held input — keyups fired while
    // we're not focused would otherwise leave stale "held" keys on return.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { pauseGame('tab-hidden'); clearInput(); }
    });
    window.addEventListener('blur', function () { pauseGame('window-blur'); clearInput(); });

    // Auto-pause physics AND stop rendering when the section scrolls out of view,
    // so the page never burns CPU on an off-screen canvas.
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) startLoop();
          else { pauseGame('off-viewport'); clearInput(); stopLoop(); }
        }
      }, { threshold: 0.25 });
      io.observe(wrap);
    }

    // Debug hook (verification / tuning).
    window.__alanArcade = {
      P: P, exit: exit, spawn: spawn, power: power,
      COLS: COLS, ROWS: ROWS, CELL: CELL, MAX_JUMP_H: MAX_JUMP_H,
      get coins() { return coins; },
      get state() { return STATE; },
      get input() { return { left: input.left, right: input.right, jump: input.jump }; },
      get stateLog() { return stateLog.slice(); },
      get level() { return curLevel; },
      get reachCount() { return reachCount; },
      get scrollLocked() { return scrollLock.active; },
      get font() { return FONT_FAMILY; },
      get dj() { return { timer: P.djTimer, airJumps: P.airJumps }; },
      levels: LEVELS.map(function (l) { return { id: l.id, name: l.name, mode: l.mode }; }),
      loadLevel: function (i) { loadLevel(i); },
      solidPx: solidPx,
      reachPx: reachPx,
      warp: function (x, y) { P.x = x; P.y = y; P.vx = 0; P.vy = 0; },
      start: startGame,
      enterFullscreen: enterFullscreen,
      exitFullscreen: exitFullscreen,
      isMobile: isMobile,
      get fullscreen() { return fsActive; },
      setInput: function (o) { if (o) { if ('left' in o) touchHold.left = o.left; if ('right' in o) touchHold.right = o.right; if ('jump' in o) touchHold.jump = o.jump; syncInput(); } }
    };

    startLoop();                            // IO stops it immediately if off-screen
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
