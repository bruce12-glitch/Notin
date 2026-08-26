import { test, expect } from '@playwright/test';

test('hero WebGL scene renders (three.js)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/site/', { waitUntil: 'networkidle' });

  const canvas = page.locator('#heroWebGL');
  await expect(canvas).toHaveCount(1);
  // three.js sets width/height attrs from renderer.setSize
  const size = await canvas.evaluate((el) => ({ w: el.width, h: el.height }));
  expect(size.w).toBeGreaterThan(0);
  expect(size.h).toBeGreaterThan(0);

  // providers-driven UI: google button hidden when unconfigured
  const prov = await page.request.get('/api/auth/providers').then((r) => r.json());
  if (!prov.google) {
    // marketing site has no oauth buttons; auth pages do — just confirm endpoint contract
    expect(prov).toHaveProperty('otp');
  }

  await page.screenshot({ path: 'tests/e2e/artifacts/hero-webgl.png', fullPage: false });
  expect(errors, 'no page/console errors: ' + errors.join(' | ')).toEqual([]);
});
