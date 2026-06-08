#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { cwd, exit } from 'node:process';

const root = cwd();
const scannedRoots = ['app/admin', 'components/gds'];
const bannedImports = new Set(['@mantine/core']);
const allowlist = new Set([
  'components/gds/styles.ts',
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

if (findings.length > 0) {
  console.error('GDS boundary check failed:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  exit(1);
}

console.log('GDS boundary check passed.');
