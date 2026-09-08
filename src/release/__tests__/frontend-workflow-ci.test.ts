import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

it('replays checked-in frontend evidence against an installed candidate in CI', async () => {
  const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
  const job = workflow.split(/^  frontend-workflow:\s*$/m)[1]?.split(/^  [\w-]+:\s*$/m)[0] ?? '';
  expect(job).not.toBe('');
  for (const command of ['npm run build', 'npm run stage:package', 'npm pack --ignore-scripts',
    'npm install --ignore-scripts', 'npm ci --ignore-scripts --prefix examples/frontend-workflow',
    'npx playwright install --with-deps chromium', 'npm run typecheck', 'npm run build', 'npm test']) {
    expect(job).toContain(command);
  }
  expect(job).toContain('working-directory: .dist/npm-package');
  expect(job).toContain('node_modules/@memi-design/cli/dist/index.js');
  expect(job).toContain('MEMI_INSTALLED_ENTRY');
  expect(job).toContain('examples/frontend-workflow/.dist/review');
  expect(job.indexOf('npm run stage:package')).toBeLessThan(job.indexOf('npm pack --ignore-scripts'));
  expect(job.indexOf('npm pack --ignore-scripts')).toBeLessThan(job.indexOf('npm install --ignore-scripts'));
  expect(job).not.toMatch(/secrets\.|continue-on-error|--allow|--profile connected/);
});
