// Collects the licences of every package that ships in the app (runtime dependencies and what they
// pull in) into src/generated/licenses.json for Settings → About. Runs automatically before `npm run build`.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = process.cwd();
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const seen = new Map();

function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type).join(' OR ');
  return 'UNKNOWN';
}

function licenseText(dir) {
  const file = readdirSync(dir).find((f) => /^(licen[sc]e|copying)(\.|$)/i.test(f));
  if (!file) return '';
  const text = readFileSync(join(dir, file), 'utf8');
  return text.length > 12000
    ? `${text.slice(0, 12000)}\n… (truncated; see the package for the full text)`
    : text;
}

function visit(name, fromDir) {
  let pkgPath;
  try {
    pkgPath = createRequire(join(fromDir, 'x.js')).resolve(`${name}/package.json`);
  } catch {
    // Packages that restrict their exports: look the folder up directly.
    let d = fromDir;
    for (;;) {
      const p = join(d, 'node_modules', name, 'package.json');
      if (existsSync(p)) {
        pkgPath = p;
        break;
      }
      if (dirname(d) === d) return;
      d = dirname(d);
    }
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) return;
  const dir = dirname(pkgPath);
  seen.set(key, {
    name: pkg.name,
    version: pkg.version,
    license: licenseOf(pkg),
    homepage: pkg.homepage ?? null,
    text: licenseText(dir),
  });
  for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, dir);
}

for (const dep of Object.keys(rootPkg.dependencies ?? {})) visit(dep, root);
// Bundled into the app by build tooling (service worker registration), so it ships too.
visit('workbox-window', root);

const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
mkdirSync(join(root, 'src/generated'), { recursive: true });
writeFileSync(join(root, 'src/generated/licenses.json'), `${JSON.stringify(list, null, 1)}\n`);
console.log(`licenses: ${list.length} packages`);
