import { test, expect } from '@playwright/test';

test.describe('Mémoire Cinematic Prototype', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
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

    // ── Scene 2: Dashboard ──
    await page.goto('http://localhost:5173/pages/Dashboard');
    await page.waitForTimeout(500); // Let animations settle
    await page.screenshot({ path: 'prototype/scene-2-dashboard.png', fullPage: false });
    await page.waitForTimeout(500);
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'prototype/scene-2-dashboard-after.png', fullPage: false });

    // ── Scene 3: DataViz: ActivityChart ──
    await page.goto('http://localhost:5173/dataviz/ActivityChart');
    await page.waitForTimeout(500); // Let animations settle
    await page.screenshot({ path: 'prototype/scene-3-dataviz-activitychart.png', fullPage: false });
    await page.waitForTimeout(1000);
    await page.hover('.recharts-surface');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'prototype/scene-3-dataviz-activitychart-after.png', fullPage: false });

    // ── Scene 4: DataViz: RevenueChart ──
    await page.goto('http://localhost:5173/dataviz/RevenueChart');
    await page.waitForTimeout(500); // Let animations settle
    await page.screenshot({ path: 'prototype/scene-4-dataviz-revenuechart.png', fullPage: false });
    await page.waitForTimeout(1000);
    await page.hover('.recharts-surface');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'prototype/scene-4-dataviz-revenuechart-after.png', fullPage: false });
  });
});