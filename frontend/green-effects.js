// ============================================================
// GREEN IMMERSIVE LAYER — cursor aura + hero depth (Green only)
// ============================================================
(function () {
  const root = document.documentElement;
  if (root.dataset.theme !== 'green') return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('green-motion-ready');
  if (reduced) return;

  const aura = document.createElement('div');
  aura.className = 'green-cursor-aura';
  aura.setAttribute('aria-hidden', 'true');
  document.body.appendChild(aura);

  let pointerFrame = null;
  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight * 0.3;

  const paintPointer = () => {
    pointerFrame = null;
    root.style.setProperty('--green-pointer-x', `${pointerX}px`);
    root.style.setProperty('--green-pointer-y', `${pointerY}px`);
  };

  window.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    document.body.classList.add('green-pointer-active');
    if (!pointerFrame) pointerFrame = requestAnimationFrame(paintPointer);
  }, { passive: true });

  document.documentElement.addEventListener('pointerleave', () => {
    document.body.classList.remove('green-pointer-active');
  });

  // Blend pointer tilt into the existing idle float instead of replacing it.
  const composition = document.querySelector('.hero-demo-composition');
  if (composition) {
    composition.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const rect = composition.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      root.style.setProperty('--green-demo-rx', `${((0.5 - y) * 4.5).toFixed(2)}deg`);
      root.style.setProperty('--green-demo-ry', `${((x - 0.5) * 6.5).toFixed(2)}deg`);
    }, { passive: true });
    composition.addEventListener('pointerleave', () => {
      root.style.setProperty('--green-demo-rx', '0deg');
      root.style.setProperty('--green-demo-ry', '0deg');
    });
  }
})();
