// ============================================================================
// NOTIN — WEBGL HERO LAYER (three.js)
// ----------------------------------------------------------------------------
// A GPU-rendered 3D scene floating behind the hero product video:
//   • Extruded rounded note cards with paper "text lines", drifting in space
//   • Additive particle field for depth
//   • Mouse parallax (camera eases toward the cursor)
//   • Scroll-linked motion (camera dolly + scene tilt as the hero scrolls by)
//
// Safety rails:
//   • prefers-reduced-motion → renders one static composition, no loop
//   • No WebGL / module load failure → silently skipped (CSS layer remains)
//   • Pauses rendering when tab hidden or hero scrolled out of view
//   • Pixel ratio capped at 2; animates transform-equivalent state only
// ============================================================================

import * as THREE from './assets/vendor/three.module.min.js';

(function main() {
  const hero = document.querySelector('.hero-section') || document.getElementById('top');
  if (!hero) return;

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Theme palette (Green vs Neon edition) -------------------------------
  const isNeon = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .some((l) => (l.getAttribute('href') || '').includes('styles-neon'));
  const PALETTE = isNeon
    ? {
        cardA: 0x1b1d16, cardB: 0x23261c, line: 0xb8f34a, accent: 0xa3e635,
        light1: 0xa3e635, light2: 0x7c5cff, ambient: 0x909890, particle: 0xc9f66f,
      }
    : {
        cardA: 0xffffff, cardB: 0xf4f6ef, line: 0x00a82d, accent: 0x00a82d,
        light1: 0x00a82d, light2: 0xffb35c, ambient: 0xdfe4da, particle: 0x59c96a,
      };

  // ---- Renderer -------------------------------------------------------------
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return; // no WebGL — CSS 3D layer still provides depth
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(hero.clientWidth || 800, hero.clientHeight || 600);
  renderer.domElement.id = 'heroWebGL';
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const stage = document.createElement('div');
  stage.className = 'hero-webgl-stage';
  stage.setAttribute('aria-hidden', 'true');
  stage.appendChild(renderer.domElement);
  hero.appendChild(stage);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, (hero.clientWidth || 1) / (hero.clientHeight || 1), 0.1, 100);
  camera.position.set(0, 0, 13);

  // ---- Lights ----------------------------------------------------------------
  scene.add(new THREE.AmbientLight(PALETTE.ambient, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(4, 6, 8);
  scene.add(key);
  const p1 = new THREE.PointLight(PALETTE.light1, 30, 40);
  p1.position.set(-7, -4, 6);
  scene.add(p1);
  const p2 = new THREE.PointLight(PALETTE.light2, 22, 40);
  p2.position.set(7, 5, 4);
  scene.add(p2);

  // ---- Rounded note card factory ----------------------------------------------
  function roundedRectShape(w, h, r) {
    const s = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  function makeCard(width, height, bodyColor) {
    const group = new THREE.Group();
    const shape = roundedRectShape(width, height, Math.min(0.16, width * 0.12));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 6 });
    geo.center();
    const mat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.55, metalness: 0.08 });
    group.add(new THREE.Mesh(geo, mat));

    // paper lines
    const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.line, transparent: true, opacity: 0.75 });
    const rows = 4;
    for (let i = 0; i < rows; i++) {
      const lw = width * (i === rows - 1 ? 0.45 : 0.68) - i * 0.04;
      const lh = 0.055;
      const lg = new THREE.BoxGeometry(lw, lh, 0.02);
      const lm = new THREE.Mesh(lg, lineMat);
      lm.position.set(-(width * 0.68 - lw) / 2 + 0.06, height / 2 - 0.38 - i * 0.26, 0.06);
      group.add(lm);
    }
    // accent header bar
    const bar = new THREE.Mesh(new THREE.BoxGeometry(width * 0.32, 0.09, 0.024), new THREE.MeshBasicMaterial({ color: PALETTE.accent }));
    bar.position.set(-width / 2 + width * 0.2, height / 2 - 0.18, 0.06);
    group.add(bar);
    return group;
  }

  // ---- Scene contents ----------------------------------------------------------
  const world = new THREE.Group();
  scene.add(world);

  const cards = [];
  const CARD_LAYOUTS = [
    { pos: [-5.8, 1.9, -2.2], rot: [0.12, 0.42, -0.10], scale: 1.00 },
    { pos: [ 4.7, 2.1, -2.2], rot: [-0.14, -0.36, 0.08], scale: 0.92 },
    { pos: [-5.0,-2.8, -0.4], rot: [-0.10, 0.28, 0.12], scale: 0.80 },
    { pos: [ 4.2,-2.5, -0.6], rot: [0.16, -0.30, -0.14], scale: 0.86 },
    { pos: [-6.6,-0.3, -3.6], rot: [0.06, 0.52, 0.05], scale: 0.70 },
    { pos: [ 5.7, 0.3, -3.0], rot: [-0.05, -0.50, -0.04], scale: 0.72 },
  ];
  CARD_LAYOUTS.forEach((L, i) => {
    const c = makeCard(1.7, 2.1, i % 2 ? PALETTE.cardB : PALETTE.cardA);
    c.position.set(...L.pos);
    c.rotation.set(...L.rot);
    c.scale.setScalar(L.scale);
    c.userData.baseY = L.pos[1];
    c.userData.baseZ = L.rot[2];
    c.userData.phase = i * 1.37;
    c.userData.bobAmp = 0.14 + (i % 3) * 0.05;
    c.userData.spinPhase = i * 0.9;
    cards.push(c);
    world.add(c);
  });

  // particle field
  const P_COUNT = 260;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(P_COUNT * 3);
  for (let i = 0; i < P_COUNT; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 26;
    pPos[i * 3 + 1] = (Math.random() - 0.5) * 14;
    pPos[i * 3 + 2] = -Math.random() * 12 - 1;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
    color: PALETTE.particle, size: 0.055, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  world.add(particles);

  // ---- Interaction state ---------------------------------------------------------
  const pointer = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };
  let scrollT = 0; // 0..1 across the hero

  function onPointerMove(e) {
    const r = hero.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    pointer.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
  }
  if (!REDUCED && window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
  }

  function onScroll() {
    const total = Math.max(hero.offsetHeight, 1);
    scrollT = Math.min(Math.max(window.scrollY / total, 0), 1);
  }
  if (!REDUCED) window.addEventListener('scroll', onScroll, { passive: true });

  // ---- Resize ------------------------------------------------------------------------
  function resize() {
    const w = hero.clientWidth || 1;
    const h = hero.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    // setSize clears the drawing buffer — repaint so reduced-motion visitors
    // (single static frame, no loop) never see a blank canvas after a resize.
    renderer.render(scene, camera);
  }
  window.addEventListener('resize', resize);

  // ---- Render loop --------------------------------------------------------------------
  let running = false;
  let rafId = null;
  const clock = new THREE.Clock();

  function frame() {
    rafId = null;
    if (!running) return;
    const t = clock.getElapsedTime();

    // eased parallax
    eased.x += (pointer.x - eased.x) * 0.055;
    eased.y += (pointer.y - eased.y) * 0.055;

    camera.position.x = eased.x * 1.15;
    camera.position.y = -eased.y * 0.75 + scrollT * 1.6;
    camera.position.z = 13 - scrollT * 2.2;
    camera.lookAt(0, scrollT * 0.8, 0);

    world.rotation.y = Math.sin(t * 0.11) * 0.045 + eased.x * 0.06 + scrollT * 0.22;
    world.rotation.x = eased.y * 0.035 + scrollT * 0.16;

    for (const c of cards) {
      c.position.y = c.userData.baseY + Math.sin(t * 0.85 + c.userData.phase) * c.userData.bobAmp;
      c.rotation.z = c.userData.baseZ + Math.sin(t * 0.5 + c.userData.spinPhase) * 0.05;
    }

    particles.rotation.y = t * 0.014;
    p1.intensity = 26 + Math.sin(t * 1.6) * 6; // breathing glow

    stage.style.opacity = String(1 - scrollT * 0.9);

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }

  function start() { if (!running) { running = true; clock.start(); if (!rafId) rafId = requestAnimationFrame(frame); } }
  function stop() { running = false; if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

  // pause when off-screen or tab hidden
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? start() : stop()));
    }, { threshold: 0.05 }).observe(hero);
  } else {
    start();
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  // initial paint (also covers reduced-motion: static single frame)
  onScroll();
  resize();
  renderer.render(scene, camera);
  if (!REDUCED) start();
})();
