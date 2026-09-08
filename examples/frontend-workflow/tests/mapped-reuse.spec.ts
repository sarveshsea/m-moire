import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const review = resolve('.dist/review');
async function sourceHashes() {
  return Object.fromEntries(await Promise.all(['src/Button.tsx', 'src/SideNavTab.tsx'].map(async (path) =>
    [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
}

test('installed Memi selects the existing mapped export without claiming render verification', async () => {
  const entry = process.env.MEMI_INSTALLED_ENTRY;
  expect(entry, 'Pass the installed tarball CLI entry in MEMI_INSTALLED_ENTRY').toBeTruthy();
  expect(entry).toContain('node_modules');
  await mkdir(review, { recursive: true });
  const receipts = [];
  for (const source of ['figma', 'paper']) {
    const args = [entry!, 'agent', 'brief', '--frontend', '--intent', 'Reuse SideNavTab for the workspace sidebar',
      '--design-evidence', `evidence/${source}.json`, '--json'];
    const result = JSON.parse(execFileSync(process.execPath, args, {
      cwd: process.cwd(), encoding: 'utf8',
      env: { ...process.env, MEMOIRE_STUDIO_PROJECT_ROOT: process.cwd() },
    }));
    expect(result.design.source).toBe(source);
    expect(result.components[0]).toMatchObject({ path: 'src/SideNavTab.tsx', exportName: 'SideNavTab' });
    expect(result.components.filter((component: { exportName: string }) => component.exportName === 'SideNavTab')).toHaveLength(1);
    expect(result.mappings).toContainEqual(expect.objectContaining({ path: 'src/SideNavTab.tsx', exportName: 'SideNavTab', mustReuse: true, status: 'observed' }));
    expect(result.mappings[0].storyRefs.length).toBeGreaterThanOrEqual(3);
    expect(result.verification.status).toBe('unassessed');
    receipts.push({ source, result });
  }
  const baseline = JSON.parse(await readFile('evidence/catalog-baseline.json', 'utf8'));
  expect(await sourceHashes()).toEqual(baseline.sourceHashes);
  expect((await readFile('src/WorkspaceSidebar.tsx', 'utf8'))).toContain("import { SideNavTab } from './SideNavTab'");
  const definitions = await Promise.all((await readdir('src')).filter((name) => name.endsWith('.tsx')).map(async (name) =>
    (await readFile(join('src', name), 'utf8')).match(/export function SideNavTab\b/g)?.length ?? 0));
  expect(definitions.reduce((sum, count) => sum + count, 0)).toBe(1);
  await writeFile(join(review, 'installed-mapping-receipt.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), installedEntry: entry, sourceHashes: await sourceHashes(), receipts,
  }, null, 2));
});

test('the workspace screen reuses SideNavTab and supports keyboard selection', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-workspacesidebar--mapped-reuse&viewMode=story&globals=theme:dark');
  const navigation = page.getByRole('navigation', { name: 'Workspace' });
  await expect(navigation).toBeVisible();
  const file = navigation.getByRole('button', { name: 'File', exact: true });
  await expect(file).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Tab');
  await expect(file).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(file).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status')).toHaveText('Selected: File');
  await expect(navigation.getByRole('button', { name: 'Archive' })).toBeDisabled();
  await mkdir(join(review, 'screenshots'), { recursive: true });
  await page.screenshot({ path: join(review, 'screenshots/mapped-workspace.png') });
});
