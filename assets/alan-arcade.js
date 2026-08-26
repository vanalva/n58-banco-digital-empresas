/* ═══════════════════════════════════════════════════════════════════════════
   AlaN Arcade — "El desafío de AlaN"  (v6)
   ───────────────────────────────────────────────────────────────────────────
   Original momentum platformer for the N58 home page. Every level is an N58
   brand shape (monogram, isologo, icon-pack icons) embedded as SVG path data
   and rasterised at load (Path2D → 2px bitmask). Two level modes:
     'ink'   — play INSIDE the filled ink (the letterform channels).
     'arena' — the ink becomes solid obstacle islands in an open framed arena.

   What v6 changes (see the section headers below):
     • REACHABILITY SOLVER — spawn, coins, exit, pickups and hazards are only
       placed on spots a breadth-first search over the REAL physics can reach
       from the spawn (ground nodes + wall-contact nodes, 20 scripted moves per
       node). A flood-fill only proved connectivity; this proves playability.
     • CAMERA — the world stays 1117×583, the canvas is whatever size the
       container gives it. Small screens get a zoomed, player-following camera
       (min on-screen player height), so phones play the same levels.
     • BRAND ENTITIES — coins are the N58 coin icon, the exit is the boxed
       isologo (locked = outline, open = lime), pickups + hazards use icon-pack
       glyphs, AlaN wears the AlaN face mark (two carets + smile).
     • DOM SCREENS — start / pause / level won / lost / won are real HTML panels
       using the site's flwr_button_primary + modal chrome (no canvas buttons).
     • INPUT — keyboard is captured at window capture-phase only while a session
       is live (nothing on the page can swallow it, page keys stay untouched
       otherwise), panels take focus, Escape pauses, progress is saved.
     • PICKUPS — doble salto, turbo, imán, tiempo extra, candado (shield) and a
       coin streak multiplier; phishing drones as avoidable hazards (later levels).

   Vanilla JS, zero dependencies, single IIFE, no per-frame heap allocation in
   the hot loop. 100% original code and art — mechanics inspired by classic
   wall-jump platformers, nothing copied.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ═══════════════════════ Brand geometry ═════════════════════════════════ */
  var VBW = 1116.97, VBH = 582.9;   // world units = the monogram's viewBox
  var MONOGRAM_D = 'M1034.86,294.73l-.47-26.55c46.68-7.91,68.43-35.47,68.43-86.72v-38.04c0-110.35-35.48-143.43-158.18-143.43H0v221.65l94.09,94.09h223.88c68.69,0,93.04,21.86,93.04,83.52s-22.82,85.28-84.19,85.28H.88v98.36h331.23c124.29,0,174.98-46.37,174.98-160.06v-54.79c0-49.38-13.04-82.56-41.05-104.41-29.86-23.29-78.29-34.62-148.09-34.62H111.06c-6.19-6.19-9.66-9.66-15.85-15.85v-125.42h849.42c47.24,0,66.5,16.56,66.5,57.15v18.49c0,42.76-19.62,61-65.62,61h-207.55c-45.99,0-65.62-18.24-65.62-61,0,0,.05-21.85.12-23.48h-91.79v41.54c0,51.25,21.74,78.8,68.43,86.72l-.47,26.55c-54.49,7.26-82.11,40.88-82.11,99.91v39.8c0,58.41,12.33,95.81,38.8,117.69,25.73,21.27,66.64,30.76,132.64,30.76h207.55c66,0,106.91-9.49,132.64-30.76,26.47-21.88,38.8-59.28,38.8-117.69v-39.8c0-59.03-27.63-92.65-82.11-99.91ZM1025.29,428.79c0,50.4-22.37,70.04-79.77,70.04h-207.55c-57.41,0-79.77-19.64-79.77-70.04v-20.35c0-54.28,20.42-74.46,75.35-74.46h215.52c55.57,0,76.23,20.18,76.23,74.46v20.35Z';

  /* "x y x y …" (SVG <polygon points>) → path data. */
  function poly(pts) {
    var n = pts.trim().split(/[\s,]+/), s = 'M' + n[0] + ',' + n[1];
    for (var i = 2; i < n.length; i += 2) s += 'L' + n[i] + ',' + n[i + 1];
    return s + 'Z';
  }

  /* Icon-pack + identity geometry (references/assets/Graphics/Icon Pack/Black/SVG
     and Identity/Solid/Export). Same glyphs the site ships as SVG icons. All are
     filled with the even-odd rule so nested contours read as holes. */
  var ICON = {
    coin:     { vb: [10.035, 9.544], d: 'M9.077,1.823l-2.509-1.823h-3.101L.958,1.823l-.958,2.949.958,2.949,2.509,1.823h3.101l2.509-1.823.958-2.949-.958-2.949ZM6.255,5.932l-.924-1.542h-.626s-.924,1.542-.924,1.542h-1.371s1.629-2.718,1.629-2.718h1.959s1.629,2.718,1.629,2.718h-1.371Z' },
    caret:    { vb: [545, 287], d: 'M545,286.59h-144.55l-97.436-162.6h-66.027l-97.436,162.6H0L171.742,0h206.521l171.738,286.59Z' },   // isologo caret, origin-normalised
    stars:    { vb: [7.215, 7.863], d: poly('2.346 7.863 1.473 6.404 1.472 6.398 1.466 6.395 1.462 6.39 1.457 6.39 0 5.517 0 4.938 1.468 4.058 2.348 2.59 2.927 2.59 3.8 4.048 3.801 4.061 3.809 4.061 3.811 4.063 3.816 4.063 5.273 4.936 5.273 5.515 3.805 6.394 2.925 7.863 2.346 7.863') + poly('4.26 3.164 3.735 2.289 3.735 2.285 3.732 2.283 3.729 2.28 3.726 2.28 2.852 1.756 2.852 1.409 3.733 .881 4.261 0 4.608 0 5.132 .875 5.132 .882 5.138 .882 5.139 .884 5.142 .884 6.016 1.408 6.016 1.755 5.135 2.283 4.607 3.164 4.26 3.164') + poly('6.272 4.732 5.991 4.262 5.99 4.26 5.988 4.259 5.987 4.258 5.986 4.258 5.516 3.976 5.516 3.79 5.989 3.506 6.273 3.033 6.459 3.033 6.741 3.503 6.741 3.507 6.743 3.507 6.744 3.508 6.746 3.508 7.215 3.789 7.215 3.976 6.742 4.259 6.459 4.732 6.272 4.732') },
    transfer: { vb: [7.365, 6.219], d: poly('3.241 4.277 3.241 1.942 0 0 0 1.635 1.839 2.736 1.839 3.483 0 4.585 0 6.219 3.241 4.277') + poly('7.365 4.277 7.365 1.942 4.124 0 4.124 1.635 5.963 2.736 5.963 3.483 4.124 4.585 4.124 6.219 7.365 4.277') },
    download: { vb: [10.539, 5.063], d: poly('4.272 2.768 6.267 2.769 7.926 0 6.529 0 5.588 1.571 4.95 1.571 4.009 0 2.613 0 4.272 2.768') + poly('1.659 5.063 8.88 5.063 10.539 2.295 9.142 2.295 8.201 3.866 2.337 3.865 1.396 2.295 0 2.295 1.659 5.063') },
    plus:     { vb: [16, 16], d: 'M8,0C3.589,0,0,3.589,0,8s3.589,8,8,8,8-3.589,8-8S12.411,0,8,0ZM8,15.652C3.781,15.652.348,12.219.348,8S3.781.348,8,.348s7.652,3.432,7.652,7.652-3.432,7.652-7.652,7.652ZM8.572,7.437c-.034-.03-.056-.073-.058-.121l-.288-2.62h-.452l-.293,2.632c-.009.08-.073.145-.154.154l-2.633.294v.451l2.626.288c.048,0,.08.019.111.054.033.033.053.077.053.123l.288,2.611h.452l.293-2.633c.009-.08.073-.145.154-.154l2.633-.293v-.452l-2.626-.288c-.045,0-.079-.017-.106-.048Z' },
    lock:     { vb: [6.911, 8.405], d: 'M5.652,3.386h-.098v-1.288c0-1.154-.944-2.098-2.098-2.098S1.358.944,1.358,2.098v1.288h-.098c-.49.49-.769.769-1.259,1.259v2.501c.49.49.769.769,1.259,1.259h4.393c.49-.49.769-.769,1.259-1.259v-2.501c-.49-.49-.769-.769-1.259-1.259ZM2.08,2.098c0-.759.617-1.376,1.376-1.376s1.376.617,1.376,1.376v1.288h-2.752v-1.288ZM3.918,6.105c0,.255-.208.463-.463.463s-.463-.208-.463-.463v-.596c0-.065.014-.127.038-.183.071-.164.235-.28.424-.28s.353.116.424.28c.024.056.038.118.038.183v.596Z' },
    block:    { vb: [9.152, 9.152], d: 'M4.576,0C2.049,0,0,2.049,0,4.576s2.049,4.576,4.576,4.576,4.576-2.049,4.576-4.576S7.103,0,4.576,0ZM4.576,1.398c.59,0,1.137.172,1.611.454L1.852,6.187c-.282-.474-.454-1.021-.454-1.611,0-1.752,1.425-3.178,3.178-3.178ZM4.576,7.754c-.59,0-1.136-.172-1.611-.454L7.3,2.965c.281.474.454,1.02.454,1.61,0,1.752-1.425,3.178-3.178,3.178Z' }
  };
  var ICON_PATH = {};   // Path2D per icon, built at boot

  /* ── LEVELS — N58 brand shapes, ordered easy → hard (20). ───────────────────
     Geometry sources: identity marks (Identity/Solid/Export, art layer only)
     and the icon pack (Graphics/Icon Pack/Black/SVG); polygons/rects/circles
     converted to path commands. vb = source viewBox. rule = fill rule used
     when rasterising (evenodd where separate SVG shapes were merged so inner
     shapes become holes). t = seconds on the clock at level start.          */
  var BOX16 = 'M16.14,16.14H.14V.14h12.895l3.105,3.105v12.895Z';
  var LEVELS = [
    { id: 'n58', name: 'El monograma', mode: 'ink', vb: [1116.97, 582.9], d: MONOGRAM_D, t: 70 },
    { id: 'potencia', name: 'La potencia', mode: 'ink', vb: [1000, 1000],
      d: 'M883.824,700h-201.752l-135.994-226.944h-92.156l-135.994,226.944H116.176l239.704-400h288.246l239.698,400Z' },
    { id: 'casita', name: 'La casita', mode: 'arena', vb: [7.017, 6.772],
      d: poly('5.847 0 1.171 0 0 2.248 2.291 2.248 4.727 2.248 7.017 2.248 5.847 0') + poly('7.017 3.425 0 3.425 0 6.772 1.993 6.772 1.993 5.099 5.024 5.099 5.024 6.772 7.017 6.772 7.017 3.425') },
    { id: 'isologo', name: 'El isologo', mode: 'ink', vb: [1000, 1000], rule: 'evenodd',
      d: 'M900,900H100V100h644.741c60.633,60.633,94.627,94.627,155.259,155.26v644.741Z' +
         'M775,643.295h-144.55l-97.436-162.6h-66.027l-97.436,162.6h-144.55l171.742-286.59h206.521l171.738,286.59Z' },
    { id: 'nube', name: 'La nube', mode: 'arena', vb: [10.701, 6.056],
      d: 'M9.953,3.209C10.045,1.622,9.068-.03,7.018.001c-1.458-.047-2.502,1.065-3.075,2.298C1.905.058-1.298,3.136.557,5.353c.615.735,2.084.703,2.084.703,0,0,6.209,0,6.528,0,.846,0,1.533-.686,1.533-1.533,0-.559-.3-1.047-.748-1.315ZM5.607,3.9l-.031,1.009h-.45s-.03-1.009-.03-1.009h-.733s.853-1.03.853-1.03h.272s.853,1.031.853,1.031h-.733Z' },
    { id: 'documento', name: 'El documento', mode: 'ink', vb: [6.785, 8.481], rule: 'evenodd', t: 70,
      d: 'M0,0v8.481h6.785V0H0ZM.997,1.458h4.79v.766H.997v-.766ZM.997,2.838h4.79v.766H.997v-.766ZM4.424,4.984H.997v-.765h3.426v.765ZM6.306,7.86h-1.24v-.765h1.24v.765Z' },
    { id: 'carita', name: 'La carita', mode: 'arena', vb: [11.671, 6.103],
      d: 'M9.724,4.634c-2.222,1.959-5.555,1.959-7.777,0,.267-.303.534-.606.801-.909,1.765,1.556,4.411,1.556,6.175,0,.267.303.534.606.801.909Z' + poly('9.924 0 7.824 0 6.077 2.915 7.547 2.915 8.538 1.261 9.21 1.261 10.201 2.915 11.671 2.915 9.924 0') + poly('3.847 0 1.747 0 0 2.915 1.47 2.915 2.461 1.261 3.133 1.261 4.124 2.915 5.594 2.915 3.847 0') },
    { id: 'moneda', name: 'La moneda', mode: 'ink', vb: [10.035, 9.544], d: ICON.coin.d },
    { id: 'campana', name: 'La campana', mode: 'arena', rest: 'floor', vb: [7.271, 7.57],
      d: poly('5.454 1.386 4.645 1.386 4.164 0 3.108 0 2.626 1.386 1.818 1.386 0 6.621 2.778 6.621 3.108 7.57 4.164 7.57 4.493 6.621 7.271 6.621 5.454 1.386') },
    { id: 'descarga', name: 'La descarga', mode: 'arena', vb: [10.539, 5.063], d: ICON.download.d },
    { id: 'formulario', name: 'El formulario', mode: 'ink', vb: [16.279, 16.279], rule: 'evenodd', t: 70,
      d: BOX16 + 'M5.526,6.216h5.226v.836h-5.226Z' + 'M5.526,7.722h5.226v.836h-5.226Z' + 'M5.526,9.228h3.738v.835h-3.738Z' },
    { id: 'transfer', name: 'La transferencia', mode: 'arena', vb: [7.365, 6.219], d: ICON.transfer.d },
    { id: 'correo', name: 'El correo', mode: 'arena', vb: [9.089, 5.186],
      d: 'M6.177,3.856h-3.265c-.081,0-.158-.037-.208-.1L0,.395v4.791h9.089V.395l-2.703,3.361c-.051.063-.127.1-.208.1Z' + poly('6.049 3.321 8.72 0 .369 0 3.04 3.321 6.049 3.321') },
    { id: 'ojo', name: 'El ojo', mode: 'ink', vb: [9.063, 5.806], rule: 'evenodd', t: 70,
      d: 'M6.264.036h-.012l-.004-.005h-.021v-.031s-3.401.024-3.401.024L0,2.193v1.426l2.799,2.151h.012l.01.013.015.007v.016s3.402-.024,3.402-.024l2.826-2.168v-1.426L6.264.036ZM6.707,2.903c0,1.2-.976,2.176-2.176,2.176s-2.176-.976-2.176-2.176S3.332.727,4.532.727s2.176.976,2.176,2.176Z' +
         'M5.669,2.903a1.137,1.137,0,1,0,-2.274,0a1.137,1.137,0,1,0,2.274,0Z' },
    { id: 'estrella', name: 'La estrella', mode: 'ink', vb: [1000, 1000],
      d: poly('470.74 765.937 382.576 618.818 382.536 618.16 381.937 617.875 381.521 617.361 381.032 617.361 234.028 529.297 234.028 470.91 382.143 382.143 470.873 234.063 529.26 234.063 617.404 381.148 617.427 382.401 618.303 382.401 618.479 382.606 618.968 382.606 765.972 470.705 765.972 529.092 617.857 617.823 529.123 765.937 470.74 765.937') },
    { id: 'candado', name: 'El candado', mode: 'arena', rest: 'floor', vb: [6.911, 8.405],
      d: 'M5.652,3.386h-3.572v-1.288c0-.759.617-1.376,1.376-1.376.74,0,1.341.588,1.37,1.321h.722c-.03-1.128-.957-2.044-2.092-2.044C2.302,0,1.358.944,1.358,2.098v1.288h-.098l-1.259,1.259v2.501c.49.49.769.769,1.259,1.259h4.393c.49-.49.769-.769,1.259-1.259v-2.501l-1.259-1.259ZM3.918,6.062v.043c0,.255-.208.463-.463.463s-.463-.208-.463-.463v-.596c0-.065.014-.127.038-.183.071-.164.235-.28.424-.28s.353.116.424.28c.024.056.038.118.038.183v.553Z' },
    { id: 'bloqueo', name: 'El bloqueo', mode: 'ink', vb: [9.152, 9.152], rule: 'evenodd', d: ICON.block.d },
    { id: 'papelera', name: 'La papelera', mode: 'arena', vb: [6.075, 7.418], rule: 'evenodd',
      d: 'M1.018,7.418h4.04l.586-5.211H.432l.586,5.211ZM3.763,2.772h.493v4.153h-.493V2.772ZM1.82,2.772h.493v4.153h-.493V2.772Z' + poly('5.392 .449 4.204 .449 3.982 0 2.092 0 1.871 .449 .683 .449 0 1.835 6.075 1.835 5.392 .449') },
    { id: 'copia', name: 'La copia', mode: 'arena', vb: [5.966, 7.801],
      d: poly('1.344 6.949 1.344 7.801 5.966 7.801 5.966 2.419 5.254 1.706 5.112 1.564 5.112 6.949 1.344 6.949') + poly('3.545 0 0 0 0 6.459 .854 6.459 1.019 6.459 1.183 6.459 4.622 6.459 4.622 1.181 4.622 1.077 4.562 1.017 4.397 .852 3.91 .365 3.545 0') },
    { id: 'ene', name: 'La ene', mode: 'ink', vb: [1000, 1000],
      d: poly('626.666 748.047 749.5 748.048 749.498 251.953 667.311 251.952 667.313 628.497 640.592 628.497 373.333 251.952 250.5 251.952 250.5 748.048 332.687 748.048 332.687 371.503 359.407 371.503 626.666 748.047') }
  ];

  /* ── Brand palette (resolved from src/css/variables.css — canvas can't var()).
     Minimal flat style: solid colours only, no glows / shadows / gradients.  */
  var COL = {
    wall:     '#242b2c',   // solid mass
    open:     '#121617',   // playable space
    ink:      '#1b2021',   // --oro-negro (AlaN lines, text on lime)
    lime:     '#a0dd52',   // --te-quiero-verde (core): HUD, powers, open gate
    magenta:  '#b743ed',   // --not-barbie (alternate): coin face A, antenna
    purple:   '#6035a5',   // --el-mostro-de-lavanda (alternate-2): coin face B
    coral:    '#ef5541',   // --alert: low timer, hazards
    cream:    '#ffefe9',   // --caldito-de-pollo: AlaN body, HUD text
    creamDim: '#c9bcb6',
    dim:      '#454d4f'    // locked gate outline
  };

  /* ═══════════════════════ Physics constants (fixed 60 Hz) ═══════════════ */
  var STEP = 1000 / 60;
  var GRAV_UP = 0.42, GRAV_DOWN = 0.72, APEX_VEL = 1.4, APEX_MULT = 0.55;
  var RUN_ACCEL = 0.7, AIR_ACCEL = 0.45, SKID_ACCEL = 1.15, RUN_MAX = 4.0;
  var GROUND_FRICTION = 0.7, AIR_FRICTION = 0.94;
  var JUMP_VY = -7.6, JUMP_CUT = 0.45, COYOTE = 6, JUMP_BUFFER = 6;
  var WALL_SLIDE_MAX = 1.3, WALL_JUMP_VX = 3.0, WALL_JUMP_VY = -8.2, WALL_STICK = 4;
  var MAX_FALL = 10, STEP_UP = 6, MAX_SLOPE = 0.9, SNAP_DOWN = 6;
  var PW = 14, PH = 20;                // player AABB (world units)
  var COIN_R = 8;
  var COIN_TIME = 6;                   // seconds per coin
  var START_TIME = 60;
  var POWER_T = { dj: 780, turbo: 480, magnet: 540 };   // frames
  var TURBO_MULT = 1.32, MAGNET_R = 72, MAGNET_PULL = 3.2;
  var HAZARD_COST = 5, HAZARD_IFRAMES = 60, STREAK_WINDOW = 90;

  /* ═══════════════════════ Collision bitmask + box query ══════════════════ */
  var CELL = 2;
  var COLS = Math.ceil(VBW / CELL), ROWS = Math.ceil(VBH / CELL);
  var mask = new Uint8Array(COLS * ROWS);          // 1 = solid
  var pre = new Int32Array((COLS + 1) * (ROWS + 1)); // 2D prefix sums of mask
  var PW_CELLS = 0, PH_CELLS = 0;                    // unused, kept for clarity

  function cellSolid(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
    return mask[r * COLS + c] === 1;
  }
  function solidPx(x, y) {
    if (x < 0 || y < 0 || x >= VBW || y >= VBH) return true;
    return mask[((y / CELL) | 0) * COLS + ((x / CELL) | 0)] === 1;
  }
  function buildPrefix() {
    var W = COLS + 1;
    for (var r = 1; r <= ROWS; r++) {
      var row = 0, base = r * W, mrow = (r - 1) * COLS;
      for (var c = 1; c <= COLS; c++) {
        row += mask[mrow + c - 1];
        pre[base + c] = pre[base - W + c] + row;
      }
    }
  }
  /* Does the player box at (x,y) overlap any solid cell? Exact equivalent of
     sampling the AABB at sub-cell spacing, in four array reads. Edges are walls. */
  function boxHitsSolid(x, y) {
    if (x < 0 || y < 0) return true;
    var c0 = (x / CELL) | 0, r0 = (y / CELL) | 0;
    var c1 = ((x + PW) / CELL) | 0, r1 = ((y + PH) / CELL) | 0;
    if (c1 >= COLS || r1 >= ROWS) return true;
    var W = COLS + 1;
    return (pre[(r1 + 1) * W + c1 + 1] - pre[r0 * W + c1 + 1] - pre[(r1 + 1) * W + c0] + pre[r0 * W + c0]) > 0;
  }

  /* ═══════════════════════ Level build pipeline ═══════════════════════════ */
  var levelPath = null, levelRule = 'nonzero';
  var levelTf = { s: 1, tx: 0, ty: 0 };
  var curMode = 'ink';
  var ARENA_FRAME = 8;
  var maskScratch = null;

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
    o.fill(levelPath, levelRule);
    var data = o.getImageData(0, 0, COLS, ROWS).data;
    var minC = COLS, minR = ROWS, maxC = -1, maxR = -1;
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      if (data[(r * COLS + c) * 4 + 3] > 40) {
        if (c < minC) minC = c; if (c > maxC) maxC = c;
        if (r < minR) minR = r; if (r > maxR) maxR = r;
      }
    }
    if (maxC < 0) { minC = 0; minR = 0; maxC = COLS - 1; maxR = ROWS - 1; }
    var bx = minC / sb, by = minR / sb, bw = (maxC - minC + 1) / sb, bh = (maxR - minR + 1) / sb;
    var frac = level.frac || (level.mode === 'ink' ? 0.96 : 0.62);
    var s = Math.min(VBW * frac / bw, VBH * frac / bh);
    levelTf.s = s;
    levelTf.tx = (VBW - bw * s) / 2 - bx * s;
    // arena islands float ~90px above the floor unless the level rests them on it
    var lift = level.rest === 'floor' ? 0 : 90;
    levelTf.ty = level.mode === 'ink' ? (VBH - bh * s) / 2 - by * s
                                      : (VBH - ARENA_FRAME - lift) - (by + bh) * s;
  }
  function buildLevelMask(level) {
    var o = rasterCtx();
    var gx = COLS / VBW, gy = ROWS / VBH;
    o.setTransform(gx * levelTf.s, 0, 0, gy * levelTf.s, gx * levelTf.tx, gy * levelTf.ty);
    o.fillStyle = '#fff';
    o.fill(levelPath, levelRule);
    var data = o.getImageData(0, 0, COLS, ROWS).data;
    var ink = level.mode === 'ink';
    for (var i = 0; i < COLS * ROWS; i++) {
      var isInk = data[i * 4 + 3] > 110;
      mask[i] = ink ? (isInk ? 0 : 1) : (isInk ? 1 : 0);
    }
    if (!ink) {
      var f = Math.ceil(ARENA_FRAME / CELL);
      for (var r2 = 0; r2 < ROWS; r2++) for (var c2 = 0; c2 < COLS; c2++) {
        if (c2 < f || c2 >= COLS - f || r2 < f || r2 >= ROWS - f) mask[r2 * COLS + c2] = 1;
      }
    }
    buildPrefix();
  }
  /* Largest open component (cheap connectivity prior, used for the spawn scan). */
  var reach = new Uint8Array(COLS * ROWS), reachCount = 0;
  function buildReach() {
    var total = COLS * ROWS, labels = new Int32Array(total), queue = new Int32Array(total);
    var label = 0, bestLabel = 0, bestSize = 0;
    for (var start = 0; start < total; start++) {
      if (mask[start] === 1 || labels[start] !== 0) continue;
      label++;
      var head = 0, tail = 0, size = 0;
      labels[start] = label; queue[tail++] = start;
      while (head < tail) {
        var idx = queue[head++]; size++;
        var c = idx % COLS, r = (idx - c) / COLS;
        if (c > 0 && mask[idx - 1] === 0 && labels[idx - 1] === 0) { labels[idx - 1] = label; queue[tail++] = idx - 1; }
        if (c < COLS - 1 && mask[idx + 1] === 0 && labels[idx + 1] === 0) { labels[idx + 1] = label; queue[tail++] = idx + 1; }
        if (r > 0 && mask[idx - COLS] === 0 && labels[idx - COLS] === 0) { labels[idx - COLS] = label; queue[tail++] = idx - COLS; }
        if (r < ROWS - 1 && mask[idx + COLS] === 0 && labels[idx + COLS] === 0) { labels[idx + COLS] = label; queue[tail++] = idx + COLS; }
      }
      if (size > bestSize) { bestSize = size; bestLabel = label; }
    }
    reachCount = bestSize;
    for (var i = 0; i < total; i++) reach[i] = labels[i] === bestLabel ? 1 : 0;
  }

  /* ═══════════════════════ Player physics (ghost-capable) ═════════════════
     stepPlayer(p, inp, fx) advances ONE player object by one fixed step against
     the current mask. The real AlaN and the solver's ghosts share it, so the
     reachability proof is the exact game physics. fx = spawn particles.     */
  function newPlayer() {
    return { x: 0, y: 0, vx: 0, vy: 0, onGround: false, wallL: false, wallR: false, sliding: false, skidding: false,
             facing: 1, coyote: 0, jumpBuf: 0, wallStick: 0, jumpHeld: false, runPhase: 0, squash: 0, blink: 0, blinkT: 60,
             djTimer: 0, airJumps: 0, turbo: 0, magnet: 0, shield: false, hurt: 0, kb: 0, landed: false, wallJumped: false, jumpedFrom: 0 };
  }
  function stepPlayer(P, input, fx) {
    var wasGround = P.onGround;
    P.landed = false; P.wallJumped = false;
    var turbo = P.turbo > 0 ? TURBO_MULT : 1;
    var runMax = RUN_MAX * turbo;

    var dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (P.kb > 0) { P.kb--; dir = 0; }             // knockback: brief no-steer
    var accel = (P.onGround ? RUN_ACCEL : AIR_ACCEL) * turbo;
    P.skidding = false;
    if (P.wallStick > 0) { P.wallStick--; }
    else if (dir !== 0) {
      if (dir * P.vx < -0.1) {
        P.vx += dir * SKID_ACCEL;
        if (P.onGround && Math.abs(P.vx) > 1.2) P.skidding = true;
      } else P.vx += dir * accel;
      if (P.vx > runMax) P.vx = runMax;
      if (P.vx < -runMax) P.vx = -runMax;
      P.facing = dir;
    } else {
      P.vx *= P.onGround ? GROUND_FRICTION : AIR_FRICTION;
      if (Math.abs(P.vx) < 0.02) P.vx = 0;
    }
    if (fx && P.skidding && !reducedMotion && (frameNo % 3) === 0) {
      spawnPart(P.x + PW / 2, P.y + PH, -P.vx * 0.25, -0.5 - Math.random(), 12, COL.creamDim, 1.3, 0.06);
    }

    P.wallL = boxHitsSolid(P.x - 1.2, P.y);
    P.wallR = boxHitsSolid(P.x + 1.2, P.y);
    var pressingWall = (P.wallL && dir < 0) || (P.wallR && dir > 0);

    var g = P.vy < 0 ? GRAV_UP : GRAV_DOWN;
    if (!P.onGround && Math.abs(P.vy) < APEX_VEL) g *= APEX_MULT;
    P.vy += g;
    P.sliding = false;
    if (!P.onGround && P.vy > 0 && pressingWall) {
      if (P.vy > WALL_SLIDE_MAX) P.vy = WALL_SLIDE_MAX;
      P.sliding = true;
    }
    if (P.vy > MAX_FALL) P.vy = MAX_FALL;

    if (P.onGround) { P.coyote = COYOTE; if (P.djTimer > 0) P.airJumps = 1; }
    else if (P.coyote > 0) P.coyote--;
    if (P.jumpBuf > 0) P.jumpBuf--;
    if (input.jumpEdge) { P.jumpBuf = JUMP_BUFFER; input.jumpEdge = false; }
    if (P.djTimer > 0) P.djTimer--;
    if (P.turbo > 0) P.turbo--;
    if (P.magnet > 0) P.magnet--;
    if (P.hurt > 0) P.hurt--;

    if (P.jumpBuf > 0) {
      if (P.onGround || P.coyote > 0) {
        P.vy = JUMP_VY * (turbo > 1 ? 1.06 : 1); P.jumpBuf = 0; P.coyote = 0; P.onGround = false; P.jumpHeld = true;
      } else if (P.wallL || P.wallR) {
        var away = P.wallL ? 1 : -1;
        P.vx = away * WALL_JUMP_VX; P.vy = WALL_JUMP_VY;
        P.facing = away; P.wallStick = WALL_STICK; P.jumpBuf = 0; P.jumpHeld = true; P.wallJumped = true;
      } else if (P.djTimer > 0 && P.airJumps > 0) {
        P.vy = JUMP_VY * 0.92; P.airJumps--; P.jumpBuf = 0; P.jumpHeld = true;
        if (fx) burst(P.x + PW / 2, P.y + PH * 0.6, 8, COL.lime, 1.6, 0.04);
      }
    }
    if (!input.jump && P.jumpHeld && P.vy < 0) { P.vy *= JUMP_CUT; P.jumpHeld = false; }
    if (P.vy >= 0) P.jumpHeld = false;

    // Move X (sub-stepped) with slope-limited step-up.
    var d = Math.abs(P.vx), sgn = P.vx > 0 ? 1 : -1, moved = 0, climbBudget = 0;
    while (moved < d) {
      var st = Math.min(1, d - moved);
      var nx = P.x + sgn * st;
      if (!boxHitsSolid(nx, P.y)) { P.x = nx; moved += st; climbBudget += st * MAX_SLOPE; continue; }
      var climbed = 0, cap = Math.min(STEP_UP, (climbBudget | 0) + CELL);
      if (wasGround || P.onGround) {
        for (var up = 1; up <= cap; up++) {
          if (!boxHitsSolid(nx, P.y - up) && !boxHitsSolid(P.x, P.y - up)) { climbed = up; break; }
        }
      }
      if (climbed) { P.x = nx; P.y -= climbed; moved += st; climbBudget += st * MAX_SLOPE - climbed; }
      else { P.vx = 0; break; }
    }
    // Move Y.
    d = Math.abs(P.vy); sgn = P.vy > 0 ? 1 : -1; moved = 0;
    var wasFalling = P.vy, landed = false;
    while (moved < d) {
      var sty = Math.min(1, d - moved);
      if (boxHitsSolid(P.x, P.y + sgn * sty)) { if (sgn > 0) landed = true; P.vy = 0; break; }
      P.y += sgn * sty; moved += sty;
    }
    P.onGround = boxHitsSolid(P.x, P.y + 1.2);
    if (!P.onGround && wasGround && P.vy >= 0 && !P.jumpHeld) {
      for (var dn = 1; dn <= SNAP_DOWN; dn++) {
        if (boxHitsSolid(P.x, P.y + dn + 1.2)) { P.y += dn; P.onGround = true; P.vy = 0; break; }
      }
    }
    if (landed && P.onGround && wasFalling > 4) P.squash = Math.min(1, wasFalling / MAX_FALL);
    if (P.squash > 0) P.squash *= 0.8;
    P.landed = P.onGround && !wasGround;

    if (P.onGround && Math.abs(P.vx) > 0.3) P.runPhase += Math.abs(P.vx) * 0.09;
    P.blinkT--; if (P.blinkT <= 0) { P.blink = 6; P.blinkT = 90 + (Math.random() * 120 | 0); }
    if (P.blink > 0) P.blink--;
  }

  /* ═══════════════════════ Reachability solver ════════════════════════════
     Breadth-first search over the real physics from the spawn. Nodes:
       G — AlaN standing at (x,y)          (quantised 4px × 2px)
       W — AlaN airborne touching a wall   (quantised 4px × 4px, per side)
     From every node a fixed set of scripted moves is simulated with stepPlayer
     (walk, run-off, tap/full jumps standing/walking/running, wall-jumps away /
     back / neutral). Every landing yields a G node, every wall contact a W
     node. Everything the search visits is, by construction, reachable in the
     shipped game — entities are only ever placed on visited nodes.
     Cost: ~1–3k nodes × ≤20 moves × ≤96 frames, box queries are O(1).       */
  var GQX = 4, GQY = 2, WQ = 4;
  var GW = Math.ceil(VBW / GQX) + 2, GH = Math.ceil(VBH / GQY) + 2, WH = Math.ceil(VBH / WQ) + 2;
  var gSeen = new Uint8Array(GW * GH), wSeen = new Uint8Array(GW * WH * 2);
  var gNodes = [], wNodes = [];          // {x,y,depth,hard}  /  {x,y,side,depth}
  var solveMs = 0;
  var ghost = newPlayer();
  var ghostIn = { left: false, right: false, jump: false, jumpEdge: false };
  var MOVES_G = [
    { dir: -1 }, { dir: 1 },                                   // walk (and walk-off drops)
    { dir: -1, vx0: -RUN_MAX }, { dir: 1, vx0: RUN_MAX },       // run-off
    { jump: 40 }, { jump: 4 },                                  // standing jumps (full / tap)
    { jump: 40, dir: -1 }, { jump: 40, dir: 1 }, { jump: 4, dir: -1 }, { jump: 4, dir: 1 },
    { jump: 40, dir: -1, vx0: -RUN_MAX }, { jump: 40, dir: 1, vx0: RUN_MAX },
    { jump: 4, dir: -1, vx0: -RUN_MAX }, { jump: 4, dir: 1, vx0: RUN_MAX },
    { jump: 40, dir: -1, vx0: RUN_MAX }, { jump: 40, dir: 1, vx0: -RUN_MAX }   // reversal jumps
  ];
  var MOVES_W = [                                              // side = wall side (-1 left, +1 right)
    { jump: 40, mode: 'away' }, { jump: 4, mode: 'away' },
    { jump: 40, mode: 'back' }, { jump: 4, mode: 'back' },
    { jump: 40, mode: 'none' }, { jump: 40, mode: 'back', from: 10 }
  ];
  function gKey(x, y) { return (Math.round(y / GQY) + 1) * GW + Math.round(x / GQX) + 1; }
  function wKey(x, y, side) { return ((Math.round(y / WQ) + 1) * GW + Math.round(x / GQX) + 1) * 2 + (side > 0 ? 1 : 0); }

  function simulate(node, mv, out, hard) {
    var p = ghost;
    p.x = node.x; p.y = node.y; p.vx = mv.vx0 || 0; p.vy = node.side ? 1.0 : 0;
    p.onGround = !node.side; p.coyote = node.side ? 0 : COYOTE; p.jumpBuf = 0; p.wallStick = 0; p.jumpHeld = false;
    p.djTimer = 0; p.airJumps = 0; p.turbo = 0; p.magnet = 0; p.kb = 0; p.squash = 0;
    var dir = mv.dir || 0, jumpFrames = mv.jump || 0, from = mv.from || 0;
    if (node.side) {                       // wall moves: direction relative to the wall
      if (mv.mode === 'away') dir = -node.side;
      else if (mv.mode === 'back') dir = node.side;
      else dir = 0;
    }
    var airborne = !!node.side, wallUsed = !!node.side;
    for (var f = 0; f < 96; f++) {
      var dNow = (node.side && mv.mode === 'back' && f < Math.max(from, WALL_STICK + 1)) ? -node.side : dir;
      ghostIn.left = dNow < 0; ghostIn.right = dNow > 0;
      ghostIn.jump = f < jumpFrames; ghostIn.jumpEdge = (f === 0 && jumpFrames > 0);
      stepPlayer(p, ghostIn, false);
      if (p.wallJumped) wallUsed = true;
      if (p.y > VBH || p.x < -PW || p.x > VBW) return;
      if (p.onGround) {
        if (airborne || !node.side) {
          var k = gKey(p.x, p.y);
          if (!gSeen[k]) { gSeen[k] = 1; out.push({ x: p.x, y: p.y, depth: node.depth + 1, hard: hard + (wallUsed ? 1 : 0), side: 0 }); }
        }
        if (airborne) return;             // landed → done
        if (jumpFrames === 0 && dir === 0) return;
      } else {
        airborne = true;
        if (f > 1 && (p.wallL || p.wallR)) {
          var side = p.wallL ? -1 : 1;
          var wk = wKey(p.x, p.y, side);
          if (!wSeen[wk]) { wSeen[wk] = 1; out.push({ x: p.x, y: p.y, depth: node.depth + 1, hard: hard + 1, side: side }); }
        }
      }
    }
  }
  function solveReach(sx, sy) {
    var t0 = performance.now();
    gSeen.fill(0); wSeen.fill(0);
    gNodes.length = 0; wNodes.length = 0;
    var start = { x: sx, y: sy, depth: 0, hard: 0, side: 0 };
    gSeen[gKey(sx, sy)] = 1;
    var queue = [start], head = 0, budget = 4000;
    while (head < queue.length && head < budget) {
      var n = queue[head++];
      if (n.side) wNodes.push(n); else gNodes.push(n);
      var moves = n.side ? MOVES_W : MOVES_G;
      for (var m = 0; m < moves.length; m++) simulate(n, moves[m], queue, n.hard);
    }
    solveMs = performance.now() - t0;
  }

  /* ═══════════════════════ Entities + placement ═══════════════════════════ */
  var coins = [];                       // {x,y,got,phase}
  var exit = { x: 0, y: 0, w: 26, h: 28, open: false, phase: 0 };
  var spawn = { x: 60, y: 60 };
  var coinsLeft = 0;
  var pickups = [];                     // {type,x,y,got,phase}  type: dj|turbo|magnet|time|shield
  var hazards = [];                     // {x,y,xa,xb,dir,spd,phase}
  var levelHard = 0;                    // max hardness in the level (for the intro copy)

  /* Deterministic per-level RNG so every visit to a level plays the same. */
  var rngState = 1;
  function seed(s) { rngState = (s * 2654435761 + 12345) >>> 0 || 1; }
  function rnd() { rngState = (rngState + 0x6D2B79F5) >>> 0; var t = rngState; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

  var HALF_W_CELLS = Math.ceil((PW / 2) / CELL), HEAD_CELLS = Math.ceil(PH / CELL);
  function ledgeCandidate(c, r) {
    if (reach[r * COLS + c] !== 1 || !cellSolid(c, r + 1)) return false;
    for (var dx = -HALF_W_CELLS; dx <= HALF_W_CELLS; dx++) {
      if (reach[r * COLS + c + dx] !== 1) return false;
      for (var k = 1; k <= HEAD_CELLS; k++) if (cellSolid(c + dx, r - k)) return false;
    }
    return true;
  }
  function findSpawn() {
    var sp = null, q;
    for (var r = 3; r < ROWS - 2; r++) for (var c = 2; c < COLS - 2; c += 2) {
      if (!ledgeCandidate(c, r)) continue;
      q = { x: c * CELL + CELL / 2, y: r * CELL };
      if (q.x > VBW * 0.42) continue;
      if (!sp || (q.y - sp.y) > 6 || (Math.abs(q.y - sp.y) <= 6 && q.x < sp.x)) sp = q;
    }
    if (!sp) for (var r2 = 3; r2 < ROWS - 2; r2++) for (var c2 = 2; c2 < COLS - 2; c2 += 2) {
      if (!ledgeCandidate(c2, r2)) continue;
      q = { x: c2 * CELL + CELL / 2, y: r2 * CELL };
      if (!sp || (q.y - sp.y) > 6 || (Math.abs(q.y - sp.y) <= 6 && q.x < sp.x)) sp = q;
    }
    if (!sp) sp = { x: VBW / 2, y: VBH / 2 };
    spawn.x = sp.x - PW / 2; spawn.y = sp.y - PH;
    // settle onto the ground with the real physics
    var g = ghost; g.x = spawn.x; g.y = spawn.y; g.vx = 0; g.vy = 0; g.onGround = false;
    ghostIn.left = ghostIn.right = ghostIn.jump = ghostIn.jumpEdge = false;
    for (var i = 0; i < 40 && !g.onGround; i++) stepPlayer(g, ghostIn, false);
    spawn.x = g.x; spawn.y = g.y;
  }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function nodeCenter(n) { return { x: n.x + PW / 2, y: n.y + PH / 2 }; }
  function headroom(n, h) { return !boxHitsSolid(n.x, n.y - h); }

  /* Farthest-point sampling: picks `count` nodes maximally spread from each
     other and from the `avoid` points, honouring a minimum spacing. */
  function spread(pool, count, minD, avoid, score) {
    var picked = [];
    while (picked.length < count && pool.length) {
      var best = null, bestD = -1;
      for (var i = 0; i < pool.length; i++) {
        var n = pool[i]; if (n.used) continue;
        var c = nodeCenter(n), dmin = 1e9, j;
        for (j = 0; j < avoid.length; j++) { var dd = dist(c.x, c.y, avoid[j].x, avoid[j].y); if (dd < dmin) dmin = dd; }
        for (j = 0; j < picked.length; j++) { var pc = nodeCenter(picked[j]); var d2 = dist(c.x, c.y, pc.x, pc.y); if (d2 < dmin) dmin = d2; }
        var s = dmin + (score ? score(n) : 0);
        if (dmin >= minD && s > bestD) { bestD = s; best = n; }
      }
      if (!best) break;
      best.used = true; picked.push(best);
    }
    return picked;
  }

  function buildEntities(levelIndex) {
    seed(levelIndex + 1);
    findSpawn();
    solveReach(spawn.x, spawn.y);
    var i, n, c;
    var maxDepth = 0, maxHard = 0;
    for (i = 0; i < gNodes.length; i++) { if (gNodes[i].depth > maxDepth) maxDepth = gNodes[i].depth; if (gNodes[i].hard > maxHard) maxHard = gNodes[i].hard; }
    levelHard = maxHard;
    for (i = 0; i < gNodes.length; i++) gNodes[i].used = false;
    for (i = 0; i < wNodes.length; i++) wNodes[i].used = false;
    var spawnC = { x: spawn.x + PW / 2, y: spawn.y + PH / 2 };

    // Exit gate: a far, HIGH, hard-to-reach standing spot with headroom for the
    // gate. Whenever the level has any elevated spot, floor spots are ignored.
    var ex = null, exScore = -1e9, cands = [], anyHigh = false;
    for (i = 0; i < gNodes.length; i++) {
      n = gNodes[i]; c = nodeCenter(n);
      if (dist(c.x, c.y, spawnC.x, spawnC.y) < 140 || !headroom(n, exit.h - PH + 6)) continue;
      cands.push(n); if (n.y < VBH - 60) anyHigh = true;
    }
    for (i = 0; i < cands.length; i++) {
      n = cands[i]; c = nodeCenter(n);
      if (anyHigh && n.y >= VBH - 60) continue;
      var s = n.hard * 20 + (VBH - n.y) * 0.5 + n.depth * 2 + dist(c.x, c.y, spawnC.x, spawnC.y) * 0.05 + rnd() * 4;
      if (s > exScore) { exScore = s; ex = n; }
    }
    if (!ex) { for (i = 0; i < gNodes.length; i++) { n = gNodes[i]; var dd0 = dist(n.x, n.y, spawn.x, spawn.y); if (!ex || dd0 > dist(ex.x, ex.y, spawn.x, spawn.y)) ex = n; } }
    if (!ex) ex = { x: spawn.x, y: spawn.y, depth: 0, hard: 0 };
    ex.used = true;
    exit.x = ex.x + PW / 2; exit.y = ex.y + PH;      // gate centre x, gate floor y
    exit.open = false;
    var exitC = { x: exit.x, y: exit.y - exit.h / 2 };
    var avoid = [spawnC, exitC];

    // Coins: spread over ground nodes; from level 3 on, a share of them sit on
    // wall faces (collected while climbing). Count scales with the open area.
    var target = Math.max(7, Math.min(14, Math.round(reachCount / 900)));
    var groundPool = gNodes.filter(function (g) { return !g.used && dist(g.x, g.y, spawn.x, spawn.y) > 44; });
    var wallShare = levelIndex >= 2 ? Math.min(0.35, 0.12 + levelIndex * 0.02) : 0;
    var wallCount = Math.round(target * wallShare);
    var groundPicks = spread(groundPool, target - wallCount, 30, avoid, function (g) { return g.depth * 0.6 + rnd() * 10; });
    var wallPool = wNodes.filter(function (w) { return w.y > 30 && w.y < VBH - 40; });
    var wallPicks = spread(wallPool, wallCount, 34, avoid.concat(groundPicks.map(nodeCenter)), function () { return rnd() * 20; });
    if (groundPicks.length + wallPicks.length < target) {
      var extra = spread(groundPool, target - groundPicks.length - wallPicks.length, 22, avoid.concat(groundPicks.map(nodeCenter), wallPicks.map(nodeCenter)));
      groundPicks = groundPicks.concat(extra);
    }
    coins.length = 0;
    var all = groundPicks.concat(wallPicks);
    for (i = 0; i < all.length; i++) { c = nodeCenter(all[i]); coins.push({ x: c.x, y: c.y - 2, got: false, phase: rnd() * 6.28, hx: c.x, hy: c.y - 2 }); }

    // Pickups (deterministic per level): doble salto on odd levels (hard spot),
    // turbo or imán from level 3, tiempo extra on a hard spot every 3rd level,
    // candado on hazard levels. Max 3 per level, all on solver-reached nodes.
    pickups.length = 0;
    var coinC = coins.map(function (k) { return { x: k.x, y: k.y }; });
    var pickAvoid = avoid.concat(coinC);
    function place(type, pool, minDepthFrac, maxDepthFrac) {
      var p = pool.filter(function (g) { return !g.used && g.depth >= maxDepth * minDepthFrac && g.depth <= maxDepth * maxDepthFrac + 1; });
      var pk = spread(p, 1, 40, pickAvoid, function (g) { return g.hard * 6 + rnd() * 12; });
      if (!pk.length) pk = spread(pool.filter(function (g) { return !g.used; }), 1, 30, pickAvoid);
      if (pk.length) { var cc = nodeCenter(pk[0]); pickups.push({ type: type, x: cc.x, y: cc.y - 3, got: false, phase: rnd() * 6.28 }); pickAvoid.push({ x: cc.x, y: cc.y }); }
    }
    var hazardLevel = levelIndex >= 5;
    if (levelIndex % 2 === 1) place('dj', gNodes, 0.55, 1);
    if (levelIndex >= 2) place(rnd() < 0.5 ? 'turbo' : 'magnet', gNodes, 0.15, 0.7);
    if (levelIndex >= 4 && levelIndex % 3 === 1) place('time', gNodes, 0.6, 1);
    if (hazardLevel) place('shield', gNodes, 0.1, 0.5);

    // Hazards: phishing drones patrol long flat ground runs with jump headroom,
    // away from spawn/exit. From level 6 on, 1–3 per level.
    hazards.length = 0;
    if (hazardLevel) {
      var want = Math.min(3, 1 + ((levelIndex - 5) / 5 | 0));
      var runs = findRuns();
      runs.sort(function (a, b) { return (b.xb - b.xa) - (a.xb - a.xa); });
      for (i = 0; i < runs.length && hazards.length < want; i++) {
        var ru = runs[i];
        if (ru.xb - ru.xa < 120) break;
        if (Math.abs(ru.y - spawn.y) < 30 && spawn.x + PW > ru.xa - 70 && spawn.x < ru.xb + 70) continue;
        if (Math.abs(ru.y - (exit.y - PH)) < 30 && exit.x > ru.xa - 60 && exit.x < ru.xb + 60) continue;
        var overlap = false;
        for (var h2 = 0; h2 < hazards.length; h2++) if (Math.abs(hazards[h2].y - (ru.y + PH - 6)) < 30 && hazards[h2].xa < ru.xb && hazards[h2].xb > ru.xa) overlap = true;
        if (overlap) continue;
        hazards.push({ xa: ru.xa + 10, xb: ru.xb - 10, y: ru.y + PH - 6, x: ru.xa + 10 + rnd() * (ru.xb - ru.xa - 20), dir: rnd() < 0.5 ? -1 : 1, spd: 0.9 + levelIndex * 0.03, phase: rnd() * 6.28 });
      }
    }
  }
  /* Contiguous flat ground runs (same y, ≤6px x gaps) built from ground nodes. */
  function findRuns() {
    var sorted = gNodes.slice().sort(function (a, b) { return (Math.round(a.y) - Math.round(b.y)) || (a.x - b.x); });
    var runs = [], cur = null;
    for (var i = 0; i < sorted.length; i++) {
      var n = sorted[i];
      if (cur && Math.abs(n.y - cur.y) <= 1.5 && n.x - cur.xb <= 6 && headroom(n, 44)) { cur.xb = n.x + PW; }
      else { if (cur && cur.xb - cur.xa >= 60) runs.push(cur); cur = headroom(n, 44) ? { xa: n.x, xb: n.x + PW, y: n.y } : null; }
    }
    if (cur && cur.xb - cur.xa >= 60) runs.push(cur);
    return runs;
  }

  /* ═══════════════════════ Level lifecycle ════════════════════════════════ */
  var curLevel = 0, totalElapsed = 0;
  var built = -1;                        // index of the level whose mask is current
  function loadLevel(i) {
    curLevel = Math.max(0, Math.min(LEVELS.length - 1, i | 0));
    loadDef(LEVELS[curLevel], curLevel);
    built = curLevel;
  }
  function loadDef(lv, index) {
    curMode = lv.mode;
    levelPath = new Path2D(lv.d);
    levelRule = lv.rule || 'nonzero';
    computeFit(lv);
    buildLevelMask(lv);
    buildReach();
    buildEntities(index);
    resetLevel();
  }
  var P = newPlayer();
  var timeLeft = START_TIME, elapsed = 0, deaths = 0, frameNo = 0;
  var streak = 0, streakT = 0, streakPop = 0, streakPopN = 0;
  var introT = 0, enterT = 0, hintT = 0, hintText = '';
  var camReveal = 0;
  function resetLevel() {
    var lv = LEVELS[curLevel];
    timeLeft = lv.t || START_TIME; elapsed = 0;
    coinsLeft = coins.length;
    for (var i = 0; i < coins.length; i++) { coins[i].got = false; coins[i].x = coins[i].hx; coins[i].y = coins[i].hy; }
    for (var k = 0; k < pickups.length; k++) pickups[k].got = false;
    exit.open = false;
    for (var q = 0; q < PN; q++) part[q].a = false;
    P.djTimer = 0; P.airJumps = 0; P.turbo = 0; P.magnet = 0; P.shield = false; P.hurt = 0; P.kb = 0;
    streak = 0; streakT = 0; streakPop = 0;
    introT = 84; enterT = 0; camReveal = 1;
    respawn();
    cam.x = P.x + PW / 2; cam.y = P.y + PH / 2;
  }
  function respawn() {
    P.x = spawn.x; P.y = spawn.y; P.vx = 0; P.vy = 0;
    P.onGround = true; P.sliding = false; P.skidding = false; P.facing = 1;
    P.coyote = 0; P.jumpBuf = 0; P.wallStick = 0; P.runPhase = 0; P.squash = 0; P.kb = 0;
  }
  function resetRun() { deaths = 0; totalElapsed = 0; loadLevel(0); }

  /* ═══════════════════════ Particles (fixed pool) ═════════════════════════ */
  var PN = 140, part = new Array(PN), partHead = 0;
  for (var pi = 0; pi < PN; pi++) part[pi] = { a: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, col: '#fff', sz: 2, grav: 0 };
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

  /* ═══════════════════════ Game state + tick ══════════════════════════════ */
  var STATE = 'idle';          // idle | playing | paused | levelWon | won | lost
  var reducedMotion = false;
  var input = { left: false, right: false, jump: false, jumpEdge: false };

  function tick() {
    frameNo++;
    if (introT > 0) { introT--; input.jumpEdge = false; exit.phase += 0.05; animateIdle(); return; }
    if (enterT > 0) { enterT--; if (enterT === 0) finishLevel(); return; }
    var prevY = P.y;
    stepPlayer(P, input, true);

    // Out-of-bounds safety → respawn (coins persist).
    if (P.y > VBH + 40 || P.x < -40 || P.x > VBW + 40) killAlan();

    var cxp = P.x + PW / 2, cyp = P.y + PH / 2, i;
    // Coins (+ magnet pull).
    for (i = 0; i < coins.length; i++) {
      var co = coins[i]; if (co.got) continue;
      co.phase += 0.08;
      if (P.magnet > 0) {
        var dxm = cxp - co.x, dym = cyp - co.y, dm = Math.hypot(dxm, dym);
        if (dm < MAGNET_R && dm > 1) { co.x += dxm / dm * MAGNET_PULL; co.y += dym / dm * MAGNET_PULL; }
      }
      if (Math.abs(co.x - cxp) < COIN_R + PW * 0.5 && Math.abs(co.y - cyp) < COIN_R + PH * 0.5) {
        co.got = true; coinsLeft--;
        var bonus = 0;
        if (streakT > 0) { streak++; bonus = Math.min(streak - 1, 3); } else streak = 1;
        streakT = STREAK_WINDOW;
        timeLeft += COIN_TIME + bonus;
        if (streak >= 3) { streakPop = 50; streakPopN = streak; }
        burst(co.x, co.y, 6, COL.magenta, 1.3, 0.03);
        if (coinsLeft <= 0) { exit.open = true; showHint('Puerta abierta — llega a la salida', 160); }
      }
    }
    if (streakT > 0) streakT--; else streak = 0;
    if (streakPop > 0) streakPop--;
    // Pickups.
    for (i = 0; i < pickups.length; i++) {
      var pk = pickups[i]; if (pk.got) continue;
      pk.phase += 0.1;
      if (Math.abs(pk.x - cxp) < 9 + PW * 0.5 && Math.abs(pk.y - cyp) < 9 + PH * 0.5) {
        pk.got = true; applyPickup(pk.type);
        burst(pk.x, pk.y, 12, pk.type === 'time' || pk.type === 'shield' ? COL.cream : COL.lime, 2.0, 0.02);
      }
    }
    // Hazards: patrol + contact.
    for (i = 0; i < hazards.length; i++) {
      var hz = hazards[i];
      hz.x += hz.dir * hz.spd; hz.phase += 0.12;
      if (hz.x < hz.xa) { hz.x = hz.xa; hz.dir = 1; } else if (hz.x > hz.xb) { hz.x = hz.xb; hz.dir = -1; }
      if (P.hurt === 0 && Math.abs(hz.x - cxp) < 7 + PW * 0.5 && Math.abs(hz.y - cyp) < 7 + PH * 0.5) hitHazard(hz);
    }
    exit.phase += 0.05;
    // Exit reached (only when unlocked): step into the gate.
    if (exit.open && Math.abs(exit.x - cxp) < 9 && cyp > exit.y - exit.h && cyp < exit.y + 4) {
      enterT = 26; P.vx = 0; P.vy = 0;
      burst(exit.x, exit.y - exit.h / 2, 10, COL.lime, 1.4, 0.02);
    }
    if (hintT > 0) hintT--;
    timeLeft -= STEP / 1000;
    if (timeLeft <= 0) { timeLeft = 0; lose(); }
    elapsed += STEP / 1000;
  }
  function animateIdle() { P.blinkT--; if (P.blinkT <= 0) { P.blink = 6; P.blinkT = 90 + (Math.random() * 120 | 0); } if (P.blink > 0) P.blink--; }
  function applyPickup(type) {
    if (type === 'dj') { P.djTimer = POWER_T.dj; P.airJumps = 1; showHint('Doble salto — pulsa saltar en el aire', 150); }
    else if (type === 'turbo') { P.turbo = POWER_T.turbo; showHint('Turbo — más velocidad y salto', 150); }
    else if (type === 'magnet') { P.magnet = POWER_T.magnet; showHint('Imán — las monedas vienen a ti', 150); }
    else if (type === 'time') { timeLeft += 12; showHint('+12 s', 90); }
    else if (type === 'shield') { P.shield = true; showHint('Candado — te protege de un ataque', 150); }
  }
  function hitHazard(hz) {
    if (P.shield) { P.shield = false; P.hurt = HAZARD_IFRAMES; burst(P.x + PW / 2, P.y, 10, COL.cream, 1.6, 0.03); showHint('El candado te protegió', 100); }
    else { timeLeft = Math.max(0.5, timeLeft - HAZARD_COST); P.hurt = HAZARD_IFRAMES; burst(P.x + PW / 2, P.y + PH / 2, 10, COL.coral, 1.6, 0.04); showHint('−' + HAZARD_COST + ' s · phishing', 90); }
    P.vx = (P.x + PW / 2 < hz.x ? -1 : 1) * 3.6; P.vy = -3.2; P.kb = 10; P.onGround = false;
  }
  function showHint(t, frames) { hintText = t; hintT = frames; }
  function killAlan() {
    burst(P.x + PW / 2, P.y + PH / 2, 10, COL.cream, 1.6, 0.05);
    deaths++; respawn();
  }
  function finishLevel() {
    if (STATE !== 'playing') return;
    totalElapsed += elapsed;
    saveProgress(curLevel + 1);
    if (curLevel >= LEVELS.length - 1) { STATE = 'won'; saveProgress(0); showScreen('won'); }
    else { STATE = 'levelWon'; showScreen('levelWon'); }
    logState('playing', 'level-done');
  }
  function lose() {
    if (STATE !== 'playing') return;
    STATE = 'lost'; deaths++;
    burst(P.x + PW / 2, P.y + PH / 2, 12, COL.coral, 1.8, 0.05);
    showScreen('lost'); logState('playing', 'timeout');
  }

  /* ═══════════════════════ Camera ═════════════════════════════════════════ */
  var canvas, ctx, wrap, overlay, panel, dpr = 1;
  var cssW = VBW, cssH = VBH;            // canvas CSS size
  var fitZoom = 1, playZoom = 1;         // whole-level zoom vs gameplay zoom
  var cam = { x: VBW / 2, y: VBH / 2 }; // camera centre (world)
  var MIN_PLAYER_PX = 30;                // min on-screen AlaN height → zoom floor
  function resize() {
    var r = wrap.getBoundingClientRect();
    cssW = Math.max(1, Math.round(r.width)); cssH = Math.max(1, Math.round(r.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    fitZoom = Math.min(cssW / VBW, cssH / VBH);
    // Desktop-sized canvases show the whole level (the brand shape IS the
    // level); only small canvases (phones, small tablets) zoom in and follow.
    var minZoom = MIN_PLAYER_PX / PH;
    playZoom = fitZoom >= 0.85 ? fitZoom : Math.max(fitZoom, Math.min(minZoom, cssW / 300, cssH / 170));
    draw();
  }
  function camFollows() { return playZoom > fitZoom + 0.001; }
  function updateCamera() {
    var zoom = curZoom();
    var vw = cssW / zoom, vh = cssH / zoom;
    var tx = P.x + PW / 2 + P.facing * 26 + P.vx * 5, ty = P.y + PH / 2 + P.vy * 3;
    if (camReveal > 0) {                 // level reveal: whole level → AlaN
      camReveal = Math.max(0, camReveal - 1 / 70);
      var e = camReveal * camReveal;
      tx = tx * (1 - e) + VBW / 2 * e; ty = ty * (1 - e) + VBH / 2 * e;
      cam.x = tx; cam.y = ty;
    } else {
      cam.x += (tx - cam.x) * 0.1; cam.y += (ty - cam.y) * 0.12;
    }
    var minX = vw / 2, maxX = VBW - vw / 2, minY = vh / 2, maxY = VBH - vh / 2;
    cam.x = vw >= VBW ? VBW / 2 : Math.max(minX, Math.min(maxX, cam.x));
    cam.y = vh >= VBH ? VBH / 2 : Math.max(minY, Math.min(maxY, cam.y));
  }
  function curZoom() {
    if (!camFollows() || STATE === 'idle') return fitZoom;   // idle preview = whole level
    if (camReveal > 0) { var e = camReveal * camReveal; return playZoom * (1 - e) + fitZoom * e; }
    return playZoom;
  }
  function worldTransform() {
    var z = curZoom();
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cssW / 2 - cam.x * z), dpr * (cssH / 2 - cam.y * z));
  }
  function screenTransform() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }

  /* ═══════════════════════ Rendering ══════════════════════════════════════ */
  var FONT_FAMILY = 'Arial, sans-serif';
  function f(weight, size) { return weight + ' ' + size + 'px ' + FONT_FAMILY; }
  function loadCanvasFont() {
    if (!document.fonts || !document.fonts.load) return;
    Promise.all([document.fonts.load('600 20px Nugros'), document.fonts.load('700 20px Nugros'), document.fonts.load('800 40px Nugros')])
      .then(function () { if (document.fonts.check('700 20px Nugros')) FONT_FAMILY = '"Nugros", Arial, sans-serif'; })
      .catch(function () {});
  }

  function draw() {
    screenTransform();
    ctx.fillStyle = curMode === 'ink' ? COL.wall : COL.open;
    ctx.fillRect(0, 0, cssW, cssH);
    worldTransform();
    drawTerrain();
    var i;
    for (i = 0; i < coins.length; i++) { var co = coins[i]; if (!co.got) drawCoin(co.x, co.y + Math.sin(co.phase) * 1.5, co.phase * 1.3); }
    for (i = 0; i < pickups.length; i++) { var pk = pickups[i]; if (!pk.got) drawPickup(pk); }
    drawGate();
    for (i = 0; i < hazards.length; i++) drawHazard(hazards[i]);
    drawParticles();
    if (STATE !== 'lost') drawAlan();
    if (streakPop > 0) {
      ctx.globalAlpha = Math.min(1, streakPop / 20);
      ctx.fillStyle = COL.lime; ctx.font = f(800, 12); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('×' + streakPopN, P.x + PW / 2, P.y - 10 - (50 - streakPop) * 0.3);
      ctx.globalAlpha = 1;
    }
    drawHUD();
  }
  function drawTerrain() {
    var ink = curMode === 'ink';
    ctx.fillStyle = ink ? COL.wall : COL.open;
    ctx.fillRect(0, 0, VBW, VBH);
    ctx.save();
    ctx.transform(levelTf.s, 0, 0, levelTf.s, levelTf.tx, levelTf.ty);
    ctx.fillStyle = ink ? COL.open : COL.wall;
    ctx.fill(levelPath, levelRule);
    ctx.restore();
    if (!ink) {
      ctx.fillStyle = COL.wall;
      ctx.fillRect(0, 0, VBW, ARENA_FRAME); ctx.fillRect(0, VBH - ARENA_FRAME, VBW, ARENA_FRAME);
      ctx.fillRect(0, 0, ARENA_FRAME, VBH); ctx.fillRect(VBW - ARENA_FRAME, 0, ARENA_FRAME, VBH);
    }
  }
  /* Draw a brand icon centred at (x,y) fitted into `size` px (longest side). */
  function icon(name, x, y, size, color, scaleX) {
    var ic = ICON[name], s = size / Math.max(ic.vb[0], ic.vb[1]);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * (scaleX === undefined ? 1 : scaleX), s);
    ctx.translate(-ic.vb[0] / 2, -ic.vb[1] / 2);
    ctx.fillStyle = color;
    ctx.fill(ICON_PATH[name], 'evenodd');
    ctx.restore();
  }
  /* Coin — the N58 coin icon spinning: brand pink on one face, purple on the other. */
  function drawCoin(x, y, phase) {
    var c = Math.cos(phase);
    icon('coin', x, y, COIN_R * 2, c >= 0 ? COL.magenta : COL.purple, Math.max(0.12, Math.abs(c)));
  }
  var PICK_ICON = { dj: 'stars', turbo: 'transfer', magnet: 'download', time: 'plus', shield: 'lock' };
  var PICK_COL = { dj: COL.lime, turbo: COL.lime, magnet: COL.lime, time: COL.cream, shield: COL.cream };
  function drawPickup(pk) {
    var bob = Math.sin(pk.phase) * 2;
    icon(PICK_ICON[pk.type], pk.x, pk.y + bob, 16, PICK_COL[pk.type]);
  }
  function drawHazard(hz) {
    var bob = Math.sin(hz.phase) * 1.5;
    icon('block', hz.x, hz.y + bob, 14, COL.coral);
  }
  /* Exit — the boxed isologo (notched square + caret). Locked: dim outline.
     Open: lime face with the ink caret (ink on lime, never light on green). */
  function drawGate() {
    var w = exit.w, h = exit.h, notch = 7;
    var bob = exit.open ? Math.sin(exit.phase * 1.6) * 1.5 : 0;
    ctx.save();
    ctx.translate(exit.x - w / 2, exit.y - h + bob);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(w - notch, 0); ctx.lineTo(w, notch); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    if (exit.open) { ctx.fillStyle = COL.lime; ctx.fill(); }
    else { ctx.lineWidth = 2; ctx.strokeStyle = COL.dim; ctx.stroke(); }
    ctx.translate(w / 2, h / 2 + 1);
    var s = (w - 10) / ICON.caret.vb[0];
    ctx.scale(s, s); ctx.translate(-ICON.caret.vb[0] / 2, -ICON.caret.vb[1] / 2);
    ctx.fillStyle = exit.open ? COL.ink : COL.dim;
    ctx.fill(ICON_PATH.caret);
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
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  /* AlaN — procedural robot (rounded head + antenna, boxy cream torso, thin
     limbs). Poses derive from velocity + contact state. This drawing is the
     approved original — do not restyle it. */
  function drawAlan() {
    var cx = P.x + PW / 2, cy = P.y + PH / 2;
    var lean = Math.max(-0.28, Math.min(0.28, P.vx * 0.05));
    var sq = P.squash;                      // squash & stretch
    var scaleY = 1 - sq * 0.35, scaleX = 1 + sq * 0.3;
    if (P.hurt > 0 && (P.hurt % 8) < 4) return;   // hit blink (state, not style)

    ctx.save();
    ctx.translate(cx, cy);
    if (enterT > 0) {                       // stepping into the gate: shrink toward it
      var et = enterT / 26, ek = 0.15 + 0.85 * et;
      ctx.translate((exit.x - cx) * (1 - et), (exit.y - exit.h / 2 - cy) * (1 - et));
      ctx.scale(ek, ek);
    }
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

  /* HUD — screen space (CSS px), flat bar + plain text. */
  function drawHUD() {
    screenTransform();
    var pad = Math.max(12, Math.min(18, cssW * 0.016)), barW = Math.min(240, cssW * 0.24), barH = 8, x = pad, y = pad;
    var lv = LEVELS[curLevel];
    var frac = Math.max(0, Math.min(1, timeLeft / (lv.t || START_TIME)));
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = timeLeft < 10 ? COL.coral : COL.lime;
    if (frac > 0) ctx.fillRect(x, y, barW * frac, barH);
    ctx.fillStyle = COL.cream; ctx.font = f(700, 13); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.ceil(timeLeft) + 's', x + barW + 10, y + barH / 2 + 0.5);

    // Coin counter (brand coin icon). In fullscreen the close X owns the corner.
    var got = coins.length - coinsLeft;
    var right = cssW - pad - (fsActive ? 56 : 0);
    icon('coin', right - 62, y + barH / 2, 12, COL.magenta);
    ctx.fillStyle = COL.cream; ctx.font = f(700, 14); ctx.textAlign = 'left';
    ctx.fillText(got + ' / ' + coins.length, right - 52, y + barH / 2 + 0.5);
    ctx.textAlign = 'right'; ctx.font = f(400, 12); ctx.fillStyle = COL.creamDim;
    ctx.fillText('Reintentos: ' + deaths, right, y + barH + 16);

    // Power chips (icon + seconds), stacked under the timer.
    var cy = y + barH + 18;
    if (P.djTimer > 0) { chip('stars', 'Doble salto ' + Math.ceil(P.djTimer / 60) + 's', x, cy); cy += 18; }
    if (P.turbo > 0) { chip('transfer', 'Turbo ' + Math.ceil(P.turbo / 60) + 's', x, cy); cy += 18; }
    if (P.magnet > 0) { chip('download', 'Imán ' + Math.ceil(P.magnet / 60) + 's', x, cy); cy += 18; }
    if (P.shield) { chip('lock', 'Candado', x, cy); cy += 18; }

    // Centre slot: level name, hint, or the intro card.
    ctx.textAlign = 'center';
    if (introT > 0 && STATE === 'playing') {
      var a = Math.min(1, introT / 14, (84 - introT) / 10);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(10,12,13,0.72)';
      var bw = Math.min(cssW - 32, 360), bh = 72;
      ctx.fillRect(cssW / 2 - bw / 2, cssH / 2 - bh / 2, bw, bh);
      ctx.fillStyle = COL.lime; ctx.font = f(800, 24);
      ctx.fillText('Nivel ' + (curLevel + 1), cssW / 2, cssH / 2 - 12);
      ctx.fillStyle = COL.cream; ctx.font = f(600, 15);
      ctx.fillText(lv.name, cssW / 2, cssH / 2 + 14);
      ctx.globalAlpha = 1;
    }
    if (hintT > 0 && STATE === 'playing') {
      // Narrow canvases: the top row is full, so hints sit on a second row.
      var hy = cssW > 620 ? y + barH / 2 + 0.5 : y + barH + 34;
      ctx.globalAlpha = Math.min(1, hintT / 12);
      ctx.fillStyle = exit.open ? COL.magenta : COL.lime; ctx.font = f(700, 13);
      ctx.fillText(hintText, cssW / 2, hy);
      ctx.globalAlpha = 1;
    } else if (cssW > 620) {
      ctx.fillStyle = COL.creamDim; ctx.font = f(600, 13);
      ctx.fillText('Nivel ' + (curLevel + 1) + '/' + LEVELS.length + ' — ' + lv.name, cssW / 2, y + barH / 2 + 0.5);
    }
  }
  function chip(ic, label, x, y) {
    icon(ic, x + 6, y, 11, COL.lime);
    ctx.fillStyle = COL.lime; ctx.font = f(700, 12); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 16, y + 0.5);
  }

  /* ═══════════════════════ Loop ═══════════════════════════════════════════ */
  var last = 0, acc = 0, raf = 0, loopRunning = false;
  function startLoop() { if (loopRunning) return; loopRunning = true; last = 0; raf = requestAnimationFrame(frame); }
  function stopLoop() { if (!loopRunning) return; loopRunning = false; cancelAnimationFrame(raf); }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (!last) last = t;
    var dt = t - last; last = t;
    if (dt > 200) dt = 200;
    if (STATE === 'playing') {
      acc += dt;
      var guard = 0;
      while (acc >= STEP && guard < 6) { tick(); acc -= STEP; guard++; }
      if (acc > STEP) acc = 0;
    }
    updateParticles();
    updateCamera();
    draw();
  }

  /* ═══════════════════════ DOM screens (real site components) ═════════════
     One panel, five states. Buttons are the page's flwr_button_primary /
     flwr_button_secondary; the panel chrome is the site's dark modal. Copy
     lives here so the HTML stays a plain shell.                             */
  var ui = {};                            // element refs
  var panelShownAt = 0;
  var SCREENS = {
    idle:     { kicker: 'Easter egg', title: 'El desafío de AlaN', text: 'Recoge todas las monedas de cada nivel antes de que se acabe la energía y sal por la puerta. AlaN corre, salta y trepa paredes.', primary: 'Jugar', secondary: null },
    paused:   { kicker: 'Pausa', title: 'Un respiro', text: '', primary: 'Continuar', secondary: 'Salir' },
    levelWon: { kicker: 'Nivel completado', title: '', text: '', primary: 'Siguiente nivel', secondary: null },
    lost:     { kicker: 'Sin energía', title: 'AlaN se quedó sin energía', text: '', primary: 'Reintentar', secondary: 'Salir' },
    won:      { kicker: 'Desafío completado', title: '¡Lo lograste!', text: '', primary: 'Jugar otra vez', secondary: null }
  };
  function fmtTime(s) { var m = Math.floor(s / 60), r = s - m * 60; return m > 0 ? m + ' min ' + Math.round(r) + ' s' : r.toFixed(1) + ' s'; }
  function showScreen(kind) {
    var sc = SCREENS[kind], lv = LEVELS[curLevel];
    var saved = loadProgress();
    ui.kicker.textContent = sc.kicker;
    var title = sc.title, text = sc.text, primary = sc.primary, secondary = sc.secondary;
    if (kind === 'idle') {
      if (saved > 0 && saved < LEVELS.length) { primary = 'Continuar · Nivel ' + (saved + 1); secondary = 'Empezar de nuevo'; }
      text = LEVELS.length + ' niveles · ' + text;
    } else if (kind === 'levelWon') {
      title = lv.name;
      text = 'Nivel ' + (curLevel + 1) + ' de ' + LEVELS.length + ' · ' + fmtTime(elapsed) + ' · ' + coins.length + ' monedas';
    } else if (kind === 'lost') {
      text = 'Nivel ' + (curLevel + 1) + ' · ' + lv.name + ' · ' + (coins.length - coinsLeft) + ' de ' + coins.length + ' monedas';
    } else if (kind === 'won') {
      text = LEVELS.length + ' niveles · ' + fmtTime(totalElapsed) + ' · ' + deaths + ' reintentos';
    } else if (kind === 'paused') {
      text = 'Nivel ' + (curLevel + 1) + ' · ' + lv.name;
    }
    ui.title.textContent = title;
    ui.text.textContent = text;
    ui.text.classList.toggle('is-hidden', !text);
    ui.primaryLabel.textContent = primary;
    ui.secondary.classList.toggle('is-hidden', !secondary);
    if (secondary) ui.secondaryLabel.textContent = secondary;
    ui.hint.classList.toggle('is-hidden', kind !== 'idle');
    // Compact panel when the canvas is small (inline preview on phones): the
    // section heading above already carries the title — keep just the actions.
    var compact = cssH < 320 && !fsActive;
    panel.classList.toggle('is-compact', compact);
    ui.kicker.classList.toggle('is-hidden', compact);
    ui.title.classList.toggle('is-hidden', compact);
    if (compact) ui.text.classList.add('is-hidden');
    overlay.classList.remove('is-hidden');
    overlay.setAttribute('data-alan-screen', kind);
    panelShownAt = performance.now();
    // Move focus INTO the panel (dialog behaviour) — onto the panel itself, not
    // the CTA, exactly like the site's modals: focusing the button after
    // keyboard play paints the rectangular focus ring over the notch button.
    // Enter/Space on the panel trigger the primary action (see onKeyDown);
    // Tab still reaches the buttons with a proper ring. Delayed so a key still
    // held from play can't auto-activate. Never at boot: the page owns focus.
    if (kind === 'idle' && STATE === 'idle' && !sessionStarted) return;
    setTimeout(function () {
      if (overlay.classList.contains('is-hidden')) return;
      try { panel.focus({ preventScroll: true }); } catch (e) { try { panel.focus(); } catch (e2) {} }
    }, 260);
  }
  function hideScreen() { overlay.classList.add('is-hidden'); overlay.removeAttribute('data-alan-screen'); }
  function primaryAction() {
    if (performance.now() - panelShownAt < 220) return;      // debounce held keys
    var kind = overlay.getAttribute('data-alan-screen');
    if (kind === 'idle') { var saved = loadProgress(); beginSession(saved > 0 && saved < LEVELS.length ? saved : 0, 'start'); }
    else if (kind === 'paused') resumeGame('panel');
    else if (kind === 'levelWon') { loadLevel(curLevel + 1); STATE = 'playing'; hideScreen(); focusCanvas(); logState('levelWon', 'next-level'); }
    else if (kind === 'lost') { resetLevel(); STATE = 'playing'; hideScreen(); focusCanvas(); logState('lost', 'retry'); }
    else if (kind === 'won') beginSession(0, 'replay');
  }
  function secondaryAction() {
    var kind = overlay.getAttribute('data-alan-screen');
    if (kind === 'idle') { saveProgress(0); beginSession(0, 'restart'); }
    else if (kind === 'paused' || kind === 'lost') quitToIdle('quit');
  }
  var sessionStarted = false;
  function beginSession(levelIndex, why) {
    sessionStarted = true;
    if (isMobile() && !fsActive) enterFullscreen();
    if (built !== levelIndex) loadLevel(levelIndex); else resetLevel();
    STATE = 'playing'; hideScreen(); focusCanvas(); clearInput();
    logState('idle', why);
  }
  function pauseGame(why) {
    if (STATE !== 'playing') return;
    STATE = 'paused'; clearInput(); showScreen('paused'); logState('playing', why || 'pause');
  }
  function resumeGame(why) {
    if (STATE !== 'paused') return;
    STATE = 'playing'; hideScreen(); focusCanvas(); logState('paused', why || 'resume');
  }
  function quitToIdle(why) {
    var prev = STATE;
    STATE = 'idle'; clearInput();
    if (fsActive) exitFullscreen();
    resetLevel(); showScreen('idle'); logState(prev, why);
  }
  function focusCanvas() {
    try { canvas.focus({ preventScroll: true }); } catch (e) { try { canvas.focus(); } catch (e2) {} }
  }

  /* ── Progress (localStorage, best effort) ── */
  var STORE_KEY = 'n58-alan-arcade';
  function loadProgress() { try { var v = parseInt(localStorage.getItem(STORE_KEY), 10); return isNaN(v) ? 0 : v; } catch (e) { return 0; } }
  function saveProgress(level) { try { localStorage.setItem(STORE_KEY, String(level)); } catch (e) {} }

  /* ═══════════════════════ Mobile fullscreen ══════════════════════════════
     On a coarse-pointer / narrow device the inline canvas is a preview; play
     happens in a fixed fullscreen layer (the camera zooms + follows). Body
     scroll is locked with the page's own body-fixed technique (iOS-proof),
     native fullscreen + landscape lock are requested where the platform
     allows (Android) and skipped where it doesn't (iOS). Close = the site's
     modal X. No CSS rotation hacks.                                          */
  var fsActive = false, savedScrollY = 0;
  function isMobile() {
    return !!(window.matchMedia && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 767px)').matches));
  }
  function lockBody() {
    savedScrollY = window.scrollY || 0;
    var b = document.body;
    b.style.position = 'fixed'; b.style.top = (-savedScrollY) + 'px'; b.style.left = '0'; b.style.right = '0'; b.style.width = '100%';
  }
  function unlockBody() {
    var b = document.body;
    b.style.position = ''; b.style.top = ''; b.style.left = ''; b.style.right = ''; b.style.width = '';
    window.scrollTo(0, savedScrollY);
  }
  function enterFullscreen() {
    if (fsActive) return;
    fsActive = true;
    wrap.classList.add('is-fullscreen');
    if (ui.close) ui.close.classList.add('is-visible');
    lockBody();
    try { if (wrap.requestFullscreen) wrap.requestFullscreen({ navigationUI: 'hide' }).then(function () {
      try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape')['catch'](function () {}); } catch (e) {}
    })['catch'](function () {}); } catch (e) {}
    resize();
    if (window.matchMedia && window.matchMedia('(orientation: portrait)').matches) showHint('Gira el teléfono para ver más', 200);
  }
  function exitFullscreen() {
    if (!fsActive) return;
    fsActive = false;
    wrap.classList.remove('is-fullscreen');
    if (ui.close) ui.close.classList.remove('is-visible');
    try { if (document.fullscreenElement === wrap && document.exitFullscreen) document.exitFullscreen()['catch'](function () {}); } catch (e) {}
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
    unlockBody();
    resize();
  }

  /* ═══════════════════════ Input ══════════════════════════════════════════
     Input is derived state: heldKeys (one flag per physical key) + touchHold
     (one flag per on-screen button) → syncInput(). Keyboard is read at window
     CAPTURE phase so no page script can swallow it; game keys are only
     preventDefault-ed while a session is live (playing/paused) or the game
     panel owns focus — otherwise the page keeps every key.                  */
  var stateLog = [];
  function logState(prev, why) { if (stateLog.length > 48) stateLog.shift(); stateLog.push([(performance.now() | 0), prev + '→' + STATE, why]); }
  var heldKeys = {}, touchHold = { left: false, right: false, jump: false };
  var LEFT_KEYS = { arrowleft: 1, a: 1 }, RIGHT_KEYS = { arrowright: 1, d: 1 };
  var JUMP_KEYS = { ' ': 1, spacebar: 1, arrowup: 1, w: 1, z: 1 };
  var PAGE_KEYS = { ' ': 1, spacebar: 1, arrowup: 1, arrowdown: 1, arrowleft: 1, arrowright: 1, pageup: 1, pagedown: 1 };
  function syncInput() {
    input.left = !!(heldKeys.arrowleft || heldKeys.a || touchHold.left);
    input.right = !!(heldKeys.arrowright || heldKeys.d || touchHold.right);
    var j = !!(heldKeys[' '] || heldKeys.spacebar || heldKeys.arrowup || heldKeys.w || heldKeys.z || touchHold.jump);
    if (j && !input.jump) input.jumpEdge = true;
    input.jump = j;
  }
  function clearInput() {
    heldKeys = {}; touchHold.left = touchHold.right = touchHold.jump = false;
    input.left = input.right = input.jump = false; input.jumpEdge = false;
  }
  function gameOwnsFocus() { return fsActive || wrap.contains(document.activeElement); }
  function onPanelOrCanvas() { var a = document.activeElement; return a === canvas || a === panel || a === overlay; }
  function onKeyDown(e) {
    var k = (e.key || '').toLowerCase();
    var live = STATE === 'playing' || STATE === 'paused';
    var screenOpen = !overlay.classList.contains('is-hidden');
    if (live && PAGE_KEYS[k]) e.preventDefault();                 // page never scrolls mid-session
    if (!live && !(screenOpen && gameOwnsFocus())) return;        // game not focused → page keys untouched
    if (STATE === 'playing') {
      if (LEFT_KEYS[k] || RIGHT_KEYS[k] || JUMP_KEYS[k]) { heldKeys[k] = true; syncInput(); }
      else if (k === 'r') { resetLevel(); logState('playing', 'R-restart'); }
      else if (k === 'escape' || k === 'p') pauseGame(k === 'p' ? 'P' : 'Escape');
    } else if (STATE === 'paused') {
      if (k === 'escape' || k === 'p') resumeGame('key');
      else if ((k === 'enter' || k === ' ' || k === 'spacebar') && onPanelOrCanvas()) { e.preventDefault(); primaryAction(); }
    } else if (screenOpen) {
      // Result / start screens: a focused button handles Enter/Space natively;
      // with focus on the panel or the canvas, Enter/Space = primary action.
      if ((k === 'enter' || k === ' ' || k === 'spacebar') && onPanelOrCanvas()) { e.preventDefault(); primaryAction(); }
      else if (k === 'escape' && fsActive && STATE === 'idle') exitFullscreen();
    }
  }
  function onKeyUp(e) {
    var k = (e.key || '').toLowerCase();
    if (heldKeys[k]) { heldKeys[k] = false; syncInput(); }
  }
  /* Hold buttons (touch): pointer capture so a finger sliding off still
     releases; multi-touch works because each pointer has its own id. */
  function bindHold(btn, which) {
    if (!btn) return;
    var owned = {};
    function press(e) {
      e.preventDefault();
      owned[e.pointerId] = true;
      try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      if (STATE === 'idle' || STATE === 'lost' || STATE === 'levelWon' || STATE === 'won') return;
      if (STATE === 'paused') { resumeGame('touch'); }
      touchHold[which] = true; syncInput();
    }
    function release(e) {
      if (!owned[e.pointerId]) return;
      delete owned[e.pointerId];
      touchHold[which] = false; syncInput();
    }
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    btn.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
  }

  /* ═══════════════════════ Boot ═══════════════════════════════════════════ */
  function boot() {
    wrap = document.querySelector('[data-alan-arcade]');
    if (!wrap) return;
    canvas = wrap.querySelector('.alan-arcade_canvas');
    overlay = wrap.querySelector('[data-alan-overlay]');
    if (!canvas || !overlay || !window.Path2D) return;
    ctx = canvas.getContext('2d');
    panel = overlay.querySelector('.alan-arcade_panel') || overlay;
    panel.setAttribute('tabindex', '-1');      // programmatic focus target (no ring: .antifraud-dialog:focus)
    ui.kicker = overlay.querySelector('[data-alan-kicker]');
    ui.title = overlay.querySelector('[data-alan-title]');
    ui.text = overlay.querySelector('[data-alan-text]');
    ui.hint = overlay.querySelector('[data-alan-hint]');
    ui.primary = overlay.querySelector('[data-alan-action="primary"]');
    ui.secondary = overlay.querySelector('[data-alan-action="secondary"]');
    ui.primaryLabel = ui.primary.querySelector('[data-flwr-target="label"]') || ui.primary;
    ui.secondaryLabel = ui.secondary.querySelector('[data-flwr-target="label"]') || ui.secondary;
    ui.close = wrap.querySelector('[data-alan-close]');
    ui.touch = wrap.querySelector('.alan-arcade_touch');
    reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (var k in ICON) if (ICON.hasOwnProperty(k)) ICON_PATH[k] = new Path2D(ICON[k].d);
    loadCanvasFont();

    var saved = loadProgress();
    loadLevel(saved > 0 && saved < LEVELS.length ? saved : 0);
    resize();
    showScreen('idle');
    if (isMobile() && ui.hint) ui.hint.textContent = 'Se juega a pantalla completa · mejor en horizontal';
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && ui.touch) ui.touch.classList.add('is-touch');

    ui.primary.addEventListener('click', function (e) { e.preventDefault(); primaryAction(); });
    ui.secondary.addEventListener('click', function (e) { e.preventDefault(); secondaryAction(); });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) primaryAction();               // backdrop = primary action
    });
    if (ui.close) ui.close.addEventListener('click', function (e) { e.preventDefault(); quitToIdle('close'); });
    bindHold(wrap.querySelector('[data-alan-touch="left"]'), 'left');
    bindHold(wrap.querySelector('[data-alan-touch="right"]'), 'right');
    bindHold(wrap.querySelector('[data-alan-touch="jump"]'), 'jump');
    canvas.setAttribute('tabindex', '0');
    canvas.addEventListener('click', function () { if (STATE === 'paused') resumeGame('canvas-click'); });
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('mousedown', function (e) { if (STATE === 'playing' && !wrap.contains(e.target)) pauseGame('outside-click'); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) pauseGame('tab-hidden'); });
    window.addEventListener('blur', function () { pauseGame('window-blur'); });
    document.addEventListener('fullscreenchange', function () { if (fsActive && !document.fullscreenElement && !isMobile()) exitFullscreen(); });
    if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(wrap);
    else window.addEventListener('resize', resize);
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting || fsActive) startLoop();
          else { pauseGame('off-viewport'); stopLoop(); }
        }
      }, { threshold: 0.2 });
      io.observe(wrap);
    }

    // Debug hook (verification / tuning).
    window.__alanArcade = {
      P: P, exit: exit, spawn: spawn, COLS: COLS, ROWS: ROWS, CELL: CELL,
      get coins() { return coins; }, get pickups() { return pickups; }, get hazards() { return hazards; },
      get state() { return STATE; }, get input() { return { left: input.left, right: input.right, jump: input.jump }; },
      get stateLog() { return stateLog.slice(); }, get level() { return curLevel; },
      get reachCount() { return reachCount; }, get solver() { return { ms: solveMs, ground: gNodes.length, wall: wNodes.length, hard: levelHard }; },
      get font() { return FONT_FAMILY; }, get cam() { return { x: cam.x, y: cam.y, zoom: curZoom(), fit: fitZoom, play: playZoom, cssW: cssW, cssH: cssH }; },
      get fullscreen() { return fsActive; }, get timeLeft() { return timeLeft; },
      levels: LEVELS.map(function (l) { return { id: l.id, name: l.name, mode: l.mode }; }),
      loadLevel: function (i) { loadLevel(i); }, solidPx: solidPx, boxHitsSolid: boxHitsSolid,
      probe: function (def, index) {          // dev: load an arbitrary level def, report solver reach
        loadDef(def, index || 0); built = -1;
        var top = VBH, hi = 0;
        for (var i = 0; i < gNodes.length; i++) { if (gNodes[i].y < top) top = gNodes[i].y; if (gNodes[i].y < VBH - 60) hi++; }
        return { ms: Math.round(solveMs), ground: gNodes.length, wall: wNodes.length, hard: levelHard, highest: Math.round(top), highNodes: hi, exit: [Math.round(exit.x), Math.round(exit.y)], coins: coins.length, reach: reachCount };
      },
      LEVELS: LEVELS, ICON: ICON,
      warp: function (x, y) { P.x = x; P.y = y; P.vx = 0; P.vy = 0; },
      start: function (lvl) { beginSession(lvl == null ? curLevel : lvl, 'debug'); },
      pause: pauseGame, resume: resumeGame, isMobile: isMobile,
      enterFullscreen: enterFullscreen, exitFullscreen: exitFullscreen,
      skipIntro: function () { introT = 0; camReveal = 0; },
      collectAll: function () { for (var i = 0; i < coins.length; i++) coins[i].got = true; coinsLeft = 0; exit.open = true; },
      setInput: function (o) { if (o) { if ('left' in o) touchHold.left = o.left; if ('right' in o) touchHold.right = o.right; if ('jump' in o) touchHold.jump = o.jump; syncInput(); } },
      nodes: function () { return { g: gNodes.slice(), w: wNodes.slice() }; }
    };
    startLoop();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
