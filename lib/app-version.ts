/**
 * Released app semver: single source of truth is `package.json` → `version`.
 * Import `APP_VERSION` for UI; do not duplicate semver in per-file headers.
 */
import packageJson from '../package.json';

export const APP_VERSION = packageJson.version;
