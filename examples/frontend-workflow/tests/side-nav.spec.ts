import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const screenshots = '.dist/review/screenshots';
async function story(page: Page, state: string, theme = 'dark') {
  await page.goto(`/iframe.html?id=molecules-sidenavtab--${state}&viewMode=story&globals=theme:${theme}`);
  await page.getByRole('button', { name: 'File', exact: true }).waitFor({ timeout: 5000 });
  await page.evaluate(() => document.fonts.ready);
}

test('preserves the default Figma geometry with a semantic button', async ({ page }) => {
  await story(page, 'default');
  const button = page.getByRole('button', { name: 'File', exact: true });
  expect(await button.evaluate((node) => node.tagName)).toBe('BUTTON');
  const style = await button.evaluate((node) => {
    const css = getComputedStyle(node);
    return { width: css.width, height: css.height, padding: css.padding, radius: css.borderRadius,
      font: css.fontFamily, fontSize: css.fontSize, fontWeight: css.fontWeight,
      lineHeight: css.lineHeight, color: css.color, background: css.backgroundColor };
  });
  expect(style).toMatchObject({ width: '182px', height: '25px', padding: '5px', radius: '5px',
    fontSize: '12px', fontWeight: '400', lineHeight: 'normal', color: 'rgb(247, 247, 247)', background: 'rgba(0, 0, 0, 0)' });
  expect(style.font).toContain('Inter');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
});

test('selected and disabled states retain native behavior', async ({ page }) => {
  await story(page, 'selected');
  await expect(page.getByRole('button', { name: 'File', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await story(page, 'disabled');
  await expect(page.getByRole('button', { name: 'File', exact: true })).toBeDisabled();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeFocused();
});

test('Enter and Space activate the reused component with a visible focus indicator', async ({ page }) => {
  await story(page, 'keyboard');
  await page.keyboard.press('Tab');
  const button = page.getByRole('button', { name: 'File', exact: true });
  await expect(button).toBeFocused();
  expect(await button.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Activations: 1');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(page.getByRole('status')).toHaveText('Activations: 2');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
});

for (const theme of ['dark', 'light']) {
  for (const width of [320, 1024]) {
    for (const state of ['default', 'selected', 'disabled']) {
      test(`${theme} ${width}px ${state} renders without overflow`, async ({ page }) => {
        await page.setViewportSize({ width, height: 240 });
        await story(page, state, theme);
        const button = page.getByRole('button', { name: 'File', exact: true });
        await expect(button).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await button.evaluate((node) => getComputedStyle(node).color)).toBe(theme === 'dark' ? 'rgb(247, 247, 247)' : 'rgb(32, 32, 32)');
        await mkdir(screenshots, { recursive: true });
        await page.screenshot({ path: join(screenshots, `${theme}-${width}-${state}.png`) });
      });
    }
  }
}
