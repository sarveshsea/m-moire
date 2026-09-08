import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const action = readFileSync('action.yml', 'utf8');
const run = action.split('    - name: Run memi design CI')[1].split('    - name: Inspect generated artifacts')[0];
const script = run.split('      run: |\n')[1].split('\n').map(line => line.replace(/^        /, '')).join('\n');
const invoke = (version: string, target = '') => execFileSync('/bin/bash', ['-c', `memi() { printf '%s\\n' "$@"; }\n${script}`], {
  env: { ...process.env, INPUT_VERSION: version, INPUT_FAIL_ON: 'high', INPUT_BASE: 'origin/main', INPUT_TARGET: target, INPUT_REPORT: 'true' },
  encoding: 'utf8',
}).trim().split('\n');

describe('CI Action capability compatibility', () => {
  it('preserves 2.7 CLI arguments', () => {
    expect(invoke('2.7.9')).toEqual(['ci', '--fail-on', 'high', '--base', 'origin/main', '--report']);
  });
  it.each(['2.8.0-beta.1', '2.8.0', '2.10.0', '3.0.0'])('grants only required CI effects for %s', version => {
    const args = invoke(version);
    expect(args.slice(0, 9)).toEqual(['--profile', 'connected', '--allow', 'project-write', '--allow', 'source-content-persistence', '--allow', 'shell', 'ci']);
    expect(args).not.toContain('network');
    expect(args).not.toContain('home-write');
  });
  it('passes target metacharacters as a single literal argument', () => {
    expect(invoke('2.8.0', 'folder $(false); `false`').slice(-2)).toEqual(['--', 'folder $(false); `false`']);
  });
});
