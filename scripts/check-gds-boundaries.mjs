#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { cwd, exit } from 'node:process';

const root = cwd();
const scannedRoots = ['app/admin', 'components/gds'];
const bannedImports = new Set(['@mantine/core']);
const allowlist = new Set([
  'components/gds/PublicPrimitives.tsx',
]);
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts']);
const importPattern = /(?:import|export)\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g;

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function extensionOf(filePath) {
  const dotIndex = filePath.lastIndexOf('.');
  return dotIndex >= 0 ? filePath.slice(dotIndex) : '';
}

function listSourceFiles(dirPath) {
  const files = [];

  for (const entry of readdirSync(dirPath)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const fullPath = join(dirPath, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }

    if (stats.isFile() && sourceExtensions.has(extensionOf(fullPath))) {
      files.push(fullPath);
    }
  }

  return files;
}

const findings = [];

for (const scannedRoot of scannedRoots) {
  const fullRoot = join(root, scannedRoot);
  let files = [];

  try {
    files = listSourceFiles(fullRoot);
  } catch {
    continue;
  }

  for (const filePath of files) {
    const relativePath = normalizePath(relative(root, filePath));
    if (allowlist.has(relativePath)) continue;

    const content = readFileSync(filePath, 'utf8');
    for (const match of content.matchAll(importPattern)) {
      const importSource = match[1];
      if (bannedImports.has(importSource)) {
        findings.push(`${relativePath}: forbidden ${importSource} import in GDS-governed surface`);
      }
    }
  }
}

// A `var(--gds-...)` that is undefined makes the whole declaration invalid: a border is not drawn, "muted" text is not dimmed (camera#415: 213 such
// references, `--gds-color-border` and `--gds-color-muted`, names no GDS package defines). And the role tokens GDS does define with `light-dark()`
// (--gds-border-card, --gds-text-meta, --gds-bg-surface...) do not work either in camera's production build: Next's CSS pass turns `light-dark(a, b)`
// into `var(--lightningcss-light, a) var(--lightningcss-dark, b)`, the two switches are defined nowhere, so the value becomes the pair "a b" and
// every declaration that uses it is invalid (measured in the built page, 2026-10-09). Colours in app/, components/ and lib/ therefore come from
// `--mantine-*` tokens (`--mantine-color-default-border`, `--mantine-color-dimmed`, `--mantine-color-body`...), which resolve in both schemes.
function gdsNames() {
  const defined = new Set();
  const lightDark = new Set();
  const base = join(root, 'node_modules', '@sovereignsquad');
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        if (entry !== 'node_modules') walk(full);
      } else if (/\.(css|js|mjs|cjs)$/.test(entry)) {
        const text = readFileSync(full, 'utf8');
        for (const match of text.matchAll(/--gds-[a-z0-9]+(?:-[a-z0-9]+)*/g)) defined.add(match[0]);
        if (entry.endsWith('.css')) for (const match of text.matchAll(/(--gds-[a-z0-9]+(?:-[a-z0-9]+)*)\s*:\s*light-dark\(/g)) lightDark.add(match[1]);
      }
    }
  };
  walk(base);
  return { defined, lightDark };
}

const { defined: known, lightDark } = gdsNames();
if (known.size < 50) {
  findings.push(`the installed @sovereignsquad packages define only ${known.size} --gds-* names: is node_modules installed?`);
} else {
  for (const scannedRoot of ['app', 'components', 'lib']) {
    for (const filePath of listSourceFiles(join(root, scannedRoot))) {
      if (/\.test\.[tj]sx?$/.test(filePath)) continue;
      const lines = readFileSync(filePath, 'utf8').split('\n');
      lines.forEach((line, index) => {
        for (const match of line.matchAll(/var\((--gds-[a-z0-9]+(?:-[a-z0-9]+)*)/g)) {
          const where = `${normalizePath(relative(root, filePath))}:${index + 1}: ${match[1]}`;
          if (!known.has(match[1])) findings.push(`${where} is not defined by any installed GDS package`);
          else if (lightDark.has(match[1])) findings.push(`${where} is defined with light-dark(), which the production build turns into an invalid value: use a --mantine-* token`);
        }
      });
    }
  }
}

if (findings.length > 0) {
  console.error('GDS boundary check failed:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  exit(1);
}

console.log('GDS boundary check passed.');
