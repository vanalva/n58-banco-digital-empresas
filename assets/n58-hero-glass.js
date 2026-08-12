/* ============================================================
   N58 · GLASS 3D — self-hosted (no Spline)
   ------------------------------------------------------------
   A tiny Three.js viewer ported from the Glass Lab visor
   (gl-visor-glass3d.js) — same reed displacement + physical glass.
   Two modes on `<div class="n58-glass3d" data-mode="…" data-image="…">`:

     · piece  → a chamfered "Vidrio Acanalado" SWATCH floats in front of
                the photo, gently drifting + reacting to the cursor. The
                photo behind stays clear; only the tile refracts it.
     · panel  → a full-frame reeded sheet covers the photo, so the whole
                image reads THROUGH fluted glass.

   The original <img> under the mount stays as the fallback (mobile /
   coarse pointer / no-WebGL) and is covered once the scene reveals.
   ============================================================ */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

document.querySelectorAll('.n58-glass3d').forEach((m) => start(m));

function coarse() {
  return window.matchMedia('(hover: none)').matches
    || window.matchMedia('(pointer: coarse)').matches
    || window.matchMedia('(max-width: 767px)').matches;
}
function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

function start(mount) {
  if (coarse() || !webglOK()) return;
  const mode = mount.dataset.mode === 'panel' ? 'panel' : 'piece';
  const imgSrc = mount.dataset.image;
  if (mode === 'panel' && !imgSrc) return;   // piece mode needs no photo

  let W = mount.clientWidth || 1, H = mount.clientHeight || 1;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const cv = renderer.domElement;
  cv.style.width = '100%'; cv.style.height = '100%'; cv.style.display = 'block';
  cv.style.opacity = '0'; cv.style.transition = 'opacity 0.6s ease';
  mount.appendChild(cv);

  const scene = new THREE.Scene();

  // Perspective camera framed so the photo plane fills the mount at z=0.
  const FOV = 30, DIST = 6;
  let aspect = W / H;
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 100);
  camera.position.set(0, 0, DIST);
  const visH = () => 2 * DIST * Math.tan(FOV * Math.PI / 360);
  const visW = () => visH() * aspect;

  const pmrem = new THREE.PMREMGenerator(renderer);
  // PIECE gets a bright brand-gradient environment (magenta → purple → lime) so
  // the transparent glass has vivid colour to refract/reflect against the dark
  // hero — that's what makes it pop like the reference bubbles. PANEL just needs
  // the neutral room for a clean glass sheen.
  scene.environment = mode === 'piece'
    ? gradientEnv(renderer, pmrem)
    : pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  scene.add(new THREE.AmbientLight(0xffffff, mode === 'piece' ? 0.1 : 0.35));
  const key = new THREE.DirectionalLight(0xffffff, mode === 'piece' ? 0.45 : 1.4); key.position.set(-3, 4, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9ec8ff, mode === 'piece' ? 0.4 : 0.9); rim.position.set(4, -2, 4); scene.add(rim);
  // PIECE: brand-coloured lights give the iridescent glass its colourful sheen
  // (the scene is transparent, so without these the clear tile is invisible).
  if (mode === 'piece') {
    const p1 = new THREE.PointLight(0xff53d8, 2.6, 24); p1.position.set(-3.5, 2.2, 4.5); scene.add(p1); // magenta
    const p2 = new THREE.PointLight(0xa6ff4d, 2.0, 24); p2.position.set(3.2, -2.4, 4.5); scene.add(p2); // lime
    const p3 = new THREE.PointLight(0x7d5cff, 2.0, 24); p3.position.set(0.5, 3.2, 3.5); scene.add(p3);  // purple
  }

  function reveal() { cv.style.opacity = '1'; mount.classList.add('is-loaded'); render(); }

  // ── PANEL mode only: the photo, cover-fit onto a full-frame plane behind the
  //    glass so the whole image reads through it. PIECE mode is a transparent
  //    floating object (no photo plane) — it refracts the environment + iridesces.
  let bgMesh = null, bgMat = null;
  if (mode === 'panel') {
    bgMat = new THREE.MeshBasicMaterial({ color: 0x161516 });
    bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(visW(), visH()), bgMat);
    scene.add(bgMesh);
    new THREE.TextureLoader().load(imgSrc, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      bgMat.map = tex; bgMat.color.set(0xffffff); bgMat.needsUpdate = true;
      coverFit(tex);
      reveal();
    });
  }
  // (piece mode reveals at the end of start(), once the render loop vars exist)
  function coverFit(tex) {
    if (!tex.image) return;
    const ia = tex.image.width / tex.image.height, pa = aspect;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    if (ia > pa) { tex.repeat.set(pa / ia, 1); tex.offset.set((1 - pa / ia) / 2, 0); }
    else { tex.repeat.set(1, ia / pa); tex.offset.set(0, (1 - ia / pa) / 2); }
    tex.needsUpdate = true;
  }

  // ── Glass material (shared). PIECE adds thin-film IRIDESCENCE for the
  //    colourful, bubble-like composition look. ──
  const glassMat = new THREE.MeshPhysicalMaterial({
    // PANEL is fully transmissive over an opaque photo. PIECE floats on a
    // TRANSPARENT canvas, so it must stay fairly opaque (low transmission) or it
    // writes ~0 alpha and disappears. Semi-opaque + iridescence reads as a
    // colourful glass gem.
    color: 0xffffff,
    metalness: 0,
    roughness: mode === 'piece' ? 0.05 : 0.05,
    transmission: mode === 'panel' ? 1.0 : 0.42,
    ior: 1.5,
    thickness: mode === 'panel' ? 2.9 : 1.3,
    attenuationColor: new THREE.Color(0xdfeaf6), attenuationDistance: mode === 'panel' ? 12 : 6,
    clearcoat: 1.0, clearcoatRoughness: 0.04,
    iridescence: mode === 'piece' ? 1.0 : 0.0,
    iridescenceIOR: 1.34,
    iridescenceThicknessRange: [200, 720],
    envMapIntensity: mode === 'piece' ? 3.0 : 1.0,
    specularIntensity: 1.0
  });

  const glass = new THREE.Group();
  scene.add(glass);
  let tile;

  function buildGlass() {
    if (tile) { glass.remove(tile); tile.geometry.dispose(); }
    if (mode === 'panel') {
      // full-frame reeded sheet (fills the photo, slightly oversized)
      tile = new THREE.Mesh(reedPlane(visW() * 1.04, visH() * 1.04, 0.26, 20, 0.15), glassMat);
      tile.position.z = 0.7;
    } else {
      // a floating chamfered reeded SWATCH, centered in its (oversized, offset)
      // canvas — CSS positions the canvas so the piece sits bottom-left, outside
      // the photo box.
      const h = visH() * 0.82, w = h * 1.34;
      tile = new THREE.Mesh(makeSwatchGeometry(w, h, 0.34, 'reed'), glassMat);
      tile.position.set(0, 0, 1.6);
    }
    glass.add(tile);
  }
  buildGlass();

  // ── Interaction. PIECE is click-through (pointer-events:none in CSS) so it
  //    never blocks the hero CTAs — track the cursor on window instead. ──
  const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  const pev = mode === 'piece' ? window : mount;
  pev.addEventListener('pointermove', (e) => {
    const r = mount.getBoundingClientRect();
    target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    render();
  });
  if (mode === 'panel') mount.addEventListener('pointerleave', () => { target.x = 0; target.y = 0; });

  let raf = 0, running = false, t0 = performance.now();
  function render() { if (!running) { running = true; raf = requestAnimationFrame(tick); } }
  function tick(now) {
    cur.x += (target.x - cur.x) * 0.06;
    cur.y += (target.y - cur.y) * 0.06;
    if (mode === 'panel') {
      glass.rotation.y = cur.x * 0.08;
      glass.rotation.x = -cur.y * 0.05;
      glass.position.x = cur.x * 0.04;
    } else {
      // idle drift + float; cursor adds tilt
      const t = (now - t0) / 1000;
      glass.rotation.y = Math.sin(t * 0.5) * 0.18 + cur.x * 0.35;
      glass.rotation.x = Math.sin(t * 0.37) * 0.06 - cur.y * 0.22;
      glass.position.y = Math.sin(t * 0.6) * (visH() * 0.02);
    }
    key.position.x = -3 + cur.x * 2;
    renderer.render(scene, camera);
    // piece mode animates forever (gentle float); panel rests when idle
    const moving = Math.abs(target.x - cur.x) > 0.001 || Math.abs(target.y - cur.y) > 0.001;
    if (mode === 'piece' || moving) raf = requestAnimationFrame(tick);
    else { running = false; renderer.render(scene, camera); }
  }

  // Only run while the section is on screen (piece keeps floating; panel idles).
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((ents) => {
      if (ents[0].isIntersecting) render();
      else { running = false; cancelAnimationFrame(raf); }
    }, { threshold: 0.02 }).observe(mount);
  }

  function resize() {
    W = mount.clientWidth || 1; H = mount.clientHeight || 1; aspect = W / H;
    camera.aspect = aspect; camera.updateProjectionMatrix();
    renderer.setSize(W, H);
    if (bgMesh) {
      bgMesh.geometry.dispose(); bgMesh.geometry = new THREE.PlaneGeometry(visW(), visH());
      if (bgMat.map) coverFit(bgMat.map);
    }
    buildGlass();
    render();
  }
  let rt = 0;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });

  // Piece mode has no async image load — reveal now that render()/running exist.
  if (mode === 'piece') reveal();
}

/* ── Bright brand-gradient environment (piece mode). A magenta→purple→lime
   equirectangular gradient, PMREM-filtered, so transmissive/iridescent glass
   refracts + reflects vivid colour against the dark hero. ── */
function gradientEnv(renderer, pmrem) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 512, 256);
  grd.addColorStop(0.00, '#ff53d8');   // magenta
  grd.addColorStop(0.35, '#b743ed');   // brand magenta-purple
  grd.addColorStop(0.62, '#7d5cff');   // purple
  grd.addColorStop(1.00, '#a6ff4d');   // lime
  g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  // a couple of bright blobs so reflections aren't a flat wash
  const blob = (x, y, r, col) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, 512, 256); };
  blob(130, 90, 120, 'rgba(255,255,255,0.9)');
  blob(400, 180, 150, 'rgba(255,120,230,0.7)');
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const rt = pmrem.fromEquirectangular(tex);
  tex.dispose();
  return rt.texture;
}

/* ── Full-frame reeded PLANE (panel mode) — flat rect, front displaced into
   `flutes` vertical ribs, flat back, side walls. ── */
function reedPlane(w, h, t, flutes, depth) {
  const W = w / 2, H = h / 2, nx = Math.max(200, flutes * 12), ny = 40, rowLen = nx + 1;
  const pos = [], uv = [];
  const frontZ = (x) => t / 2 + depth * Math.sin(Math.PI * (((x + W) / w * flutes) % 1));
  const grid = (front) => {
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const x = -W + (i / nx) * w, y = -H + (j / ny) * h;
      pos.push(x, y, front ? frontZ(x) : -t / 2); uv.push((x + W) / w, (y + H) / h);
    }
  };
  grid(true); const back = (ny + 1) * rowLen; grid(false);
  const idx = [], F = (i, j) => j * rowLen + i, B = (i, j) => back + j * rowLen + i;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    idx.push(F(i, j), F(i, j + 1), F(i + 1, j), F(i + 1, j), F(i, j + 1), F(i + 1, j + 1));
    idx.push(B(i, j), B(i + 1, j), B(i, j + 1), B(i + 1, j), B(i + 1, j + 1), B(i, j + 1));
  }
  for (let i = 0; i < nx; i++) {
    idx.push(F(i, ny), F(i + 1, ny), B(i, ny), B(i, ny), F(i + 1, ny), B(i + 1, ny));
    idx.push(F(i + 1, 0), F(i, 0), B(i + 1, 0), B(i + 1, 0), F(i, 0), B(i, 0));
  }
  for (let j = 0; j < ny; j++) {
    idx.push(F(0, j + 1), F(0, j), B(0, j + 1), B(0, j + 1), F(0, j), B(0, j));
    idx.push(F(nx, j), F(nx, j + 1), B(nx, j), B(nx, j), F(nx, j + 1), B(nx, j + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* ── Chamfered reeded SWATCH (piece mode) — a straight port of the Glass Lab
   visor's makeSwatchGeometry: a thin tile with one chamfered corner, front
   face displaced into 18 vertical reed ribs; triangles inside the cut corner
   are dropped so the notch is clean. ── */
function makeSwatchGeometry(w, h, t, mode) {
  const W = w / 2, H = h / 2, c = Math.min(w, h) * 0.26;
  const flutes = 18;
  const nx = mode === 'reed' ? 180 : 130, ny = 90, depth = 0.085;
  const pos = [], uv = [], rem = [], rowLen = nx + 1;
  const frontZ = (x) => (mode === 'reed' ? t / 2 + depth * Math.sin(Math.PI * (((x + W) / w * flutes) % 1)) : t / 2);
  const grid = (useFront) => {
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const ox = -W + (i / nx) * w, oy = -H + (j / ny) * h;
      const [x, y] = chamferXY(ox, oy, W, H, c);
      let z = -t / 2;
      if (useFront) { z = frontZ(x); rem.push(inChamfer(ox, oy, W, H, c)); }
      pos.push(x, y, z); uv.push((ox + W) / w, (oy + H) / h);
    }
  };
  grid(true); const back = (ny + 1) * rowLen; grid(false);
  const rq = (i, j) => rem[j * rowLen + i];
  const tri = (arr, p, q, r) => { if (!(rq(...p) && rq(...q) && rq(...r))) arr.push(p[1] * rowLen + p[0], q[1] * rowLen + q[0], r[1] * rowLen + r[0]); };
  const idx = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    tri(idx, [i, j], [i, j + 1], [i + 1, j]);
    tri(idx, [i + 1, j], [i, j + 1], [i + 1, j + 1]);
    const bt = [];
    tri(bt, [i, j], [i + 1, j], [i, j + 1]);
    tri(bt, [i + 1, j], [i + 1, j + 1], [i, j + 1]);
    for (const v of bt) idx.push(v + back);
  }
  const F = (i, j) => j * rowLen + i, B = (i, j) => back + j * rowLen + i;
  const wall = (i0, j0, i1, j1) => { if (rq(i0, j0) && rq(i1, j1)) return; idx.push(F(i0, j0), F(i1, j1), B(i0, j0), B(i0, j0), F(i1, j1), B(i1, j1)); };
  for (let i = 0; i < nx; i++) { wall(i, ny, i + 1, ny); wall(i + 1, 0, i, 0); }
  for (let j = 0; j < ny; j++) { wall(0, j + 1, 0, j); wall(nx, j, nx, j + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
function chamferXY(x, y, W, H, c) {
  let dl = x + W, dt = H - y;
  if (dl >= 0 && dt >= 0 && dl + dt < c) { const f = c / Math.max(dl + dt, 1e-4); x = dl * f - W; y = H - dt * f; }
  let dr = W - x, db = y + H;
  if (dr >= 0 && db >= 0 && dr + db < c) { const f = c / Math.max(dr + db, 1e-4); x = W - dr * f; y = db * f - H; }
  return [x, y];
}
function inChamfer(ox, oy, W, H, c) {
  const dl = ox + W, dt = H - oy;
  if (dl >= 0 && dt >= 0 && dl + dt < c) return true;
  const dr = W - ox, db = oy + H;
  if (dr >= 0 && db >= 0 && dr + db < c) return true;
  return false;
}
