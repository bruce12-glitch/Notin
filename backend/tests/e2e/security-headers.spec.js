import { test, expect } from '@playwright/test';

test('static files and API are bounded and never grant credentialed CORS to an attacker', async ({ request }) => {
  for (const path of ['/health', '/site/', '/login.html']) {
    const response = await request.get(path, { headers: { Origin: 'https://attacker.example' } });
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['access-control-allow-origin']).not.toBe('https://attacker.example');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['ratelimit-policy']).toContain('2000');
  }
});
