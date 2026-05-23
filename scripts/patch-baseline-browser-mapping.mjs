import fs from 'node:fs';
import path from 'node:path';

const targets = [
  path.resolve('node_modules/baseline-browser-mapping/dist/index.cjs'),
  path.resolve('node_modules/baseline-browser-mapping/dist/index.js'),
  path.resolve('node_modules/next/dist/compiled/browserslist/index.js'),
];

const needle = 'console.warn("[baseline-browser-mapping] The data in this module is over two months old';
const replacement = '0&&console.warn("[baseline-browser-mapping] The data in this module is over two months old';

for (const target of targets) {
  if (!fs.existsSync(target)) {
    continue;
  }

  const source = fs.readFileSync(target, 'utf8');
  if (source.includes(replacement)) {
    continue;
  }
  if (!source.includes(needle)) {
    console.warn(`baseline-browser-mapping patch skipped: marker not found in ${target}`);
    continue;
  }

  fs.writeFileSync(target, source.replace(needle, replacement), 'utf8');
  console.log(`Patched baseline-browser-mapping warning in ${path.relative(process.cwd(), target)}`);
}
