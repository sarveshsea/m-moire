import { test, expect } from '@playwright/test';

test.describe('Ark Cinematic Prototype', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    video: {
      mode: 'on',
      size: { width: 1440, height: 900 },
    },
  });

  test('prototype walkthrough', async ({ page }) => {

    // ── Scene 1: Component Gallery ──
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(500); // Let animations settle
    await page.screenshot({ path: 'prototype/scene-1-component-gallery.png', fullPage: false });
    await page.waitForTimeout(1000);
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'prototype/scene-1-component-gallery-after.png', fullPage: false });

    // ── Scene 2: DataViz: RevenueChart ──
    await page.goto('http://localhost:5173/dataviz/RevenueChart');
    await page.waitForTimeout(500); // Let animations settle
    await page.screenshot({ path: 'prototype/scene-2-dataviz-revenuechart.png', fullPage: false });
    await page.waitForTimeout(1000);
    await page.hover('.recharts-surface');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'prototype/scene-2-dataviz-revenuechart-after.png', fullPage: false });
  });
});