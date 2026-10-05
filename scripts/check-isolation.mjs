// Proves the core app does not depend on the CFA Helper: copies the project to a temp folder,
// deletes src/helpers/cfa there, then typechecks and builds it. With --e2e it also runs every
// end-to-end test that is not about a Helper (tests tagged @helpers are skipped).
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const withE2e = process.argv.includes('--e2e');
const tmp = mkdtempSync(join(tmpdir(), 'notebook-isolation-'));
const skip = new Set([
  'node_modules',
  'dist',
  'dev-dist',
  'test-results',
  'playwright-report',
  '.git',
  'prompts',
]);

const run = (cmd, label) => {
  console.log(`\n▶ ${label}: ${cmd}`);
  execSync(cmd, { cwd: tmp, stdio: 'inherit', env: { ...process.env, CI: '1' } });
};

try {
  cpSync(root, tmp, {
    recursive: true,
    filter: (src) => !skip.has(src.slice(root.length + 1).split('/')[0]),
  });
  symlinkSync(join(root, 'node_modules'), join(tmp, 'node_modules'), 'dir');
  rmSync(join(tmp, 'src/helpers/cfa'), { recursive: true, force: true });
  if (existsSync(join(tmp, 'src/helpers/cfa'))) throw new Error('could not remove src/helpers/cfa');
  console.log(`Copied the project to ${tmp} without src/helpers/cfa`);

  run('node scripts/gen-licenses.mjs', 'licences');
  run('npx tsc -b --noEmit', 'typecheck');
  run('npx eslint .', 'lint');
  run('npx vite build', 'build');
  if (withE2e)
    run(
      'npx playwright test --project=ipad-chromium --grep-invert @helpers --reporter=line',
      'core e2e tests',
    );
  console.log(
    '\n✔ Isolation holds: the core app compiles, lints and builds without src/helpers/cfa' +
      (withE2e ? ', and the core e2e tests pass.' : '.'),
  );
} catch (e) {
  console.error('\n✖ Isolation check FAILED:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
