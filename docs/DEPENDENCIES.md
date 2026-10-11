# Dependencies

**Version**: 12.3.42  
**Last Updated**: 2026-10-11

The dependency audit of 2026-10-11 (owner request "check dependencies", after the try-on removal, the analytics and consent settings, GDS 6.8.0 and Next 16.3.8). It covers camera in full; messmass has the short form in its `docs/architecture.md` ("Dependency audit"). `package.json` and `package-lock.json` stay the source of truth for versions; this page records what was checked, what was decided and why, so the next audit starts here.

Checked on Node 24.19 / npm 10.9 after a clean `npm ci`. The full gate (`npm run inventory:check` and `npm run release:check`) was green after the changes.

## 1. Result in short

| Question | Answer |
|----------|--------|
| Advisories in what ships to production (`npm audit --omit=dev`) | **0** |
| Advisories anywhere (`npm audit`) | **0** since the override of section 2a (before: 1 advisory, shown as 5 high findings, development tool only, no patched release exists) |
| Open Dependabot alerts | none (`gh api "repos/moldovancsaba/camera/dependabot/alerts?state=open"` returned nothing) |
| Packages nothing uses | 1 removed (`@mantine/dropzone`); the try-on removal itself left no orphan package |
| Updated | 7 packages (patch and minor, same lines) |
| Deprecated | `eslint` 9.x (whole line) and `glob` 10.5.0 (transitive, production tree, through `archiver`) |
| Majors and framework lines not done | 11, with effort and risk in section 5 |
| Version stamps | one wrong stamp (`NAMING_GUIDE.md`), one stale stack section and two stale test counts, all fixed |

## 2. Security advisories

| Advisory | Severity | Where (path) | Reachable in production? | Disposition |
|----------|----------|--------------|--------------------------|-------------|
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): `braces` <= 3.0.3, deeply nested brace patterns exhaust the stack (CWE-674, CVSS 7.5) | high | `braces` 3.0.3 < `micromatch` 4.0.8 < `fast-glob` 3.3.1 < `@next/eslint-plugin-next` 16.2.10 < `eslint-config-next` 16.2.10 (devDependency). npm counts the five packages on the path as five findings. | **No.** `npm audit --omit=dev` finds nothing and `npm ls braces --omit=dev` is empty. The code runs only inside `eslint .` on this repository's own files, with patterns that are written in the config, never with input from a user. | **No patched `braces` exists** (3.0.3 is the newest and lies inside the affected range) and npm's own suggestion (`npm audit fix --force`) installs `eslint-config-next@14.2.35`, a downgrade of two majors that does not fit Next 16, so it is not applied. **Cleared instead by taking `braces` out of the tree** (section 2a). |

Nothing else is reported. Dependabot had earlier flagged Next 16.3.2 (two critical advisories); `next` is now 16.3.8 and the old note in `TECH_STACK.md` was removed.

### 2a. The braces advisory: taken out of the tree (2026-10-11)

`braces` has no patched release, and `eslint-config-next` 16.2.10, 16.4.0 and even the 16.5.0 canary all depend on `@next/eslint-plugin-next` of the same version, which pins `fast-glob` 3.3.1 (`fast-glob` > `micromatch` > `braces`). So the only way to clear the five findings is to remove `braces` from the tree. `package.json` now says:

```json
"overrides": { "@next/eslint-plugin-next": { "fast-glob": "npm:tinyglobby@0.2.17" } }
```

Only that plugin's `fast-glob` is replaced, by `tinyglobby` (already in the tree through `typescript-eslint` and the import resolver; it uses `picomatch`, which expands braces itself). `@next/eslint-plugin-next` calls `fast-glob` in one place: `dist/utils/get-root-dirs.js` runs `globSync(rootDir, { onlyDirectories: true })` for the folders named by `settings.next.rootDir`, which this repo never sets, so in this repository the call is never made.

| Measure | Before (main, 6483bc06) | After |
|---------|-------------------------|-------|
| Direct dependencies / devDependencies / overrides | 23 / 15 / 7 | 23 / 15 / **8** |
| Packages installed by `npm ci` | 622 | **609** (-13: 16 removed, 3 added) |
| `npm audit` | 5 high (1 advisory) | **0** |
| `npm audit --omit=dev` | 0 | 0 |
| `npm ci` deprecation warnings | 2 | 2 (unchanged: `eslint@9`, and `glob@10` until the `archiver` pull request is merged) |

Removed: `fast-glob`, `micromatch`, `braces`, `fill-range`, `to-regex-range`, `is-number`, `picomatch` 2.x, `merge2`, `glob-parent` (nested), `fastq`, `reusify`, `run-parallel`, `queue-microtask`, `@nodelib/fs.stat`, `@nodelib/fs.scandir`, `@nodelib/fs.walk`. Added: nested `tinyglobby` (installed as `fast-glob`), `fdir` and `picomatch` 4.x under the plugin.

**The one difference, and the guard.** `tinyglobby` writes folders with a trailing slash, and for a plain folder name it lists the folders inside it as well (the harness input `["app/api/*", "components", "nonexistent/*"]` gave 25 folders with `fast-glob` and 45 with `tinyglobby`), so a config that sets `settings.next.rootDir` would get another answer than the plugin was written for. `eslint.config.mjs` therefore throws at load time if any entry sets `settings.next.rootDir` (checked by adding one: ESLint stops with the message). Undo: delete the override and the guard, run `npm install`; the five findings come back, as they were before.

**What proves it.** `npm run lint` is clean with and without the override; a file with a `<img>`, a missing `key`, an `<a target="_blank">` and a `next/script` gives the same three findings from the `@next/next`, `jsx-a11y` and `react` rules before and after, line for line; `npm audit` reports 0; `npm run inventory:check` and `npm run release:check` pass. **Not covered:** `settings.next.rootDir` (unused here, hence the guard).

## 3. Unused dependencies

**Method.** A script over every tracked file (without `vendor/` and the lockfile) collected each module named in an `import ... from`, `import 'x'`, `import('x')`, `require('x')`, `require.resolve`, `jest.mock`, `/// <reference types>` and a CSS `@import`/`@plugin`, in app, components, lib, scripts, tests, the config files (`next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `playwright.config.ts`, `tsconfig.json`, `gds-adoption.json`) and the workflow. It also matched the binaries that `package.json` scripts and the workflow call, the peer requirements of the installed direct dependencies, and `@types/*` against the package they describe. Every package without evidence was then checked by hand. Nothing was installed for this (no `depcheck`). A plain version of the same idea that anyone can repeat is in section 8.

**Removed (proved unused).**

| Package | Why it is safe to remove |
|---------|--------------------------|
| `@mantine/dropzone` (and its own dependencies `react-dropzone`, `attr-accept`, `file-selector`) | No file imports it, no CSS imports its stylesheet, no config names it, and none of the five installed GDS packages lists it as a dependency or peer (`grep` over `node_modules/@sovereignsquad/`). Every upload zone uses `UploadDropzone` from `@sovereignsquad/gds-core/client`. It came in with the first Mantine foundation commit (`2e84ba0b`) and was never used. |

The try-on removal (issue 557) left no unused package: the integration talked to its separate worker over plain HTTP and added no library of its own. `axios`, `archiver`, `qrcode`, `resend`, `sharp`, `@napi-rs/canvas` and the two Upstash packages are each imported by live code.

**Checked and kept** (the script shows no import for them, each has a reason):

| Package | Reason |
|---------|--------|
| `@mantine/hooks`, `@mantine/dates`, `@mantine/modals`, `dayjs` | Required peers of the GDS packages (`gds-core` needs `@mantine/core`, `@mantine/dates`, `@mantine/hooks`, `dayjs`; `gds-theme` needs `@mantine/modals`, `@mantine/notifications`). |
| `@tailwindcss/postcss`, `tailwindcss` | Named in `postcss.config.mjs`; `tailwindcss` is imported by the global CSS. |
| `baseline-browser-mapping` | `scripts/patch-baseline-browser-mapping.mjs` (the `postinstall` step) patches the installed copy by a text marker; the env flags in the npm scripts belong to it. After a bump, `npm run postinstall` must still say "Patched" for the two `dist` files. |
| `@sovereignsquad/gds-compliance` | Binary `gds-compliance` in the `gds:*` scripts. |
| `@types/node` | Used implicitly by `tsc` for `process`, `Buffer` and the `node:` modules. It was the 20 line while the runtime is Node 24; it is `^24.19.2` since the obsolete-information sweep (2026-10-11), which needed it for the non-deprecated `mock.module` options. |
| `@types/archiver`, `@types/qrcode`, `@types/react`, `@types/react-dom` | Types of used packages. |
| `typescript`, `eslint`, `eslint-config-next`, `tsx`, `@playwright/test` | Binaries in npm scripts or imported by a config. |

No module is imported without being declared (the only names the script could not match are the `@/lib` and `@/components` path aliases and text inside strings).

## 4. Updated

Patch and minor updates inside the current lines. All pass the full gate; the lockfile keeps the `libc` entries that npm 11 (CI, Dependabot) writes, because the npm 10.9 on this machine would drop them.

| Package | From | To | Kind |
|---------|------|----|------|
| `@napi-rs/canvas` | 1.0.10 | 1.0.11 | patch |
| `@vercel/blob` | 2.8.0 | 2.8.1 | patch |
| `dayjs` | 1.11.21 | 1.11.23 | patch |
| `@tabler/icons-react` | 3.44.0 | 3.49.0 | minor (icons only; the build would fail on a removed icon) |
| `baseline-browser-mapping` | 2.11.26 | 2.11.28 | patch (the postinstall patch still applies) |
| `eslint` | 9.39.4 | 9.39.5 | patch |
| `tsx` | 4.22.5 | 4.23.15 | minor (runs scripts and `verify:production-guards`, both in the gate) |

Transitive packages moved with them (for example `@eslint/eslintrc` 3.3.7, `@eslint/js` 9.39.5).

## 5. Outdated and not applied

Anything that is a framework line, a major, or a library the gate cannot exercise (live mail, live Redis, the e2e database) was left for the owner's decision. Effort: XS under an hour, S a few hours, M a day or two, L several days.

| Package | Installed > latest | Why not now | Effort | Risk |
|---------|--------------------|-------------|--------|------|
| `next` and `eslint-config-next` | 16.3.8 > 16.4.0 (in range of `^16.3.8`); 16.2.10 > 16.4.0 | Next line, owner's instruction | S | medium: framework on live events; look at a preview |
| `react`, `react-dom`, `@types/react`, `@types/react-dom` | 19.2.0 > 19.3.0 (exact pin); types 19.2.x > 19.3.0 | React line | S | medium |
| `@mantine/*` (core, dates, hooks, modals, notifications) | 8.3.18 > 9.7.1 | Design-system line; GDS 6.8.0 accepts `^7.9 \|\| ^8.3 \|\| ^9` but the visual and API changes of Mantine 9 reach the whole admin | L | high |
| GDS (`@sovereignsquad/gds-*`) | 6.8.0 vendored | Design-system line; managed by the vendor bump procedure in `docs/GDS_CAMERA_ADOPTION.md` | - | - |
| `mongodb` | 6.21.0 > 7.7.0 | Major driver, imported by 290 files; needs a run against a disposable database | M-L | high |
| `eslint` | 9.39.5 > 10.12.0 | Major; ESLint 9.x is deprecated (section 6). `eslint-config-next` 16.4 (`eslint >=9`) and `gds-eslint-config` 6.8.0 (`^9 \|\| ^10`) both allow 10; the plugins inside the Next config still have to be checked | S-M | low (dev only) |
| `archiver`, `@types/archiver` | 7.0.1 > 8.0.0; 6.0.4 > 8.0.0 | Major; one route (`app/api/admin/events/[id]/export/images/route.ts`). **8.0.0 no longer depends on `archiver-utils` and `glob` 10** (its registry manifest and those of `zip-stream` 7, `compress-commons` 7 and `readdir-glob` 3 show no `glob`), so it should also remove the deprecated `glob` from the production tree | S-M | medium: stream behaviour on a real export (capped at 500 files); test one on a preview |
| `typescript` | 5.9.3 > 7.0.2 | Two majors ahead (a new compiler line); support of Next, typescript-eslint and the GDS types is not verified | M-L | high |
| `@types/node` | 20.19.43 > 26.6.5 | **Done as `^24.19.2`** (obsolete-information sweep, 2026-10-11; type-check, lint, unit tests and build unchanged); 26 is not the target, the runtime is Node 24 | S | low |
| `@upstash/ratelimit`, `@upstash/redis` | 2.0.8 > 2.2.0; 1.38.0 > 1.39.0 | Minor, but they talk to a live Redis the gate cannot reach | S | low: afterwards hit one rate-limited route on a preview with Upstash configured |
| `resend` | 6.16.0 > 6.32.1 | Sixteen minors of a live mail API the gate cannot reach | S | low-medium: send one test mail (`npm run email:test`) from a preview |
| `@playwright/test` | 1.61.1 > 1.64.0 | Minor; the e2e suite is not part of the gate and needs the disposable `camera_test` database | S | low |
| `overrides` `postcss` 8.5.23 and `esbuild` 0.28.1 | latest 8.5.29 and 0.28.2 | Exact pins freeze the patch level of two transitive packages. Next 16.3.8 itself pins `postcss` 8.5.23, and `tsx` asks for `esbuild ~0.28.0`; relax them to ranges (`^8.5.23`, `^0.28.1`) at the next bump | XS | low |

### 5a. ESLint 10: what blocks it (checked 2026-10-11)

ESLint 9.x is deprecated ("no longer supported", section 6) and 10.12.0 is current, but the lint chain does not run on it. Tried in a scratch copy: `eslint@^10.12.0` resolves (npm prints `ERESOLVE overriding peer dependency` three times) and installs 616 packages, and then `npm run lint` stops on the first file:

```
TypeError: Error while loading rule 'react/display-name': contextOrFilename.getFilename is not a function
    at resolveBasedir (node_modules/eslint-config-next/node_modules/eslint-plugin-react/lib/util/version.js)
```

| Package (installed = latest) | Last release | `eslint` peer range | State |
|------------------------------|--------------|---------------------|-------|
| `eslint-plugin-react` 7.37.5 | 2025-04-03 | `^3 \|\| ... \|\| ^8 \|\| ^9.7` | **crashes on ESLint 10** (uses `context.getFilename()`, removed in 10) |
| `eslint-plugin-import` 2.32.0 | 2025-06-20 | `... \|\| ^8 \|\| ^9` | no ESLint 10 declared |
| `eslint-plugin-jsx-a11y` 6.10.2 | 2024-10-26 | `... \|\| ^8 \|\| ^9` | no ESLint 10 declared |

`eslint-config-next` 16.4.0 and the 16.5.0 canary list the same three plugins (`eslint >=9`, which says nothing about them); `typescript-eslint` 8.62 (`^8.57 \|\| ^9 \|\| ^10`), `eslint-plugin-react-hooks` 7.1.1 (up to `^10`) and `@sovereignsquad/gds-eslint-config` 6.8.0 (`^9 \|\| ^10`) are ready. So the blocker is exactly `eslint-plugin-react`, `eslint-plugin-import` and `eslint-plugin-jsx-a11y`, which only their maintainers can release (nothing newer exists; the only prerelease tags are years old). Ways round it were considered and not taken: leaving those three plugins out drops the `react/*`, `jsx-a11y/*` and `import/*` rules (lint coverage, which CLAUDE.md section 2 does not allow us to give up to get green), and a compatibility wrapper (`@eslint/compat`) would be a new dependency to make three unmaintained plugins run on a version they never declared. **Re-check when `eslint-config-next` moves to plugin releases that list ESLint 10** (`npm view eslint-plugin-react version peerDependencies.eslint`, same for the other two); the change is then `eslint` to `^10`, S effort, low risk (dev only).

## 6. Deprecated packages

Checked with `npm view <name>@<installed> deprecated` for the direct registry dependencies (34 before the removal) and, through the registry manifest of each locked version, for all 714 locked package versions (before the changes).

| Package | Message | Where | Replacement |
|---------|---------|-------|-------------|
| `eslint` 9.39.4 and 9.39.5 | "This version is no longer supported" (the 9.x line) | devDependency | ESLint 10 (section 5) |
| `glob` 10.5.0 | "Old versions of glob are not supported ... security vulnerabilities, which have been fixed in the current version" | production tree: `archiver` 7 > `archiver-utils` 5 > `glob`. 10.5.0 already contains the fix of the published vulnerability; the line is marked deprecated. | `archiver` 8 (its dependency tree has no `archiver-utils` and no `glob`, per the registry manifests) |

`string-width-cjs`, `strip-ansi-cjs` and `wrap-ansi-cjs` answer 404 in the registry because they are npm aliases (`npm:string-width@^4`), not packages; they are not deprecations.

## 7. Overrides

Tested on 2026-10-11 by removing one override at a time in a scratch copy and running `npm install --package-lock-only`:

| Override | Result | Decision |
|----------|--------|----------|
| `@next/eslint-plugin-next` > `fast-glob` = `npm:tinyglobby@0.2.17` | Added 2026-10-11 to take `braces` (no patched release) out of the tree: section 2a. Without it `npm audit` reports five high findings in the lint chain. | Keep, with the guard in `eslint.config.mjs` |
| `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`, `@tiptap/extension-bubble-menu`, `@tiptap/extension-floating-menu` = 3.31.3 | Without them `@tiptap/starter-kit` 3.31.4 gets its own nested `@tiptap/core` and `@tiptap/pm` 3.31.4 next to the 3.31.3 the rest of the tree uses (two copies of the editor core, which these packages are not built for). `gds-core` 6.8.0 brings tiptap in. | Keep |
| `postcss` 8.5.23, `esbuild` 0.28.1 | Removing either leaves the resolved tree unchanged; the pins only stop later patches | Keep for now, relax at the next bump (section 5) |

## 8. Versions

| Check | Result |
|-------|--------|
| `package.json` and `package-lock.json` (root and `packages[""]`) | 12.3.41 and 12.3.41 (and messmass 12.3.41, `npm run version:verify` green there) |
| `**Version**:` stamps in camera docs | all 12.3.41 except `NAMING_GUIDE.md`, which said 2.9.0: **fixed** |
| `TECH_STACK.md` | Next 16, React 19, TypeScript 5.9, Tailwind 4, Mantine 8.3, GDS 6.8.0, ESLint 9, Node 24 all match what is installed. **Fixed:** the Hosting line (Next `^16.2.11` / lockfile 16.3.2 with two open Dependabot advisories; now `^16.3.8` / 16.3.8 and none), the Playwright count (said 24 tests in 8 files; `npx playwright test --list` says 18 in 4, also in `README.md`), the Vercel Node note (now points to camera#182), and an "Installed versions" table was added |
| Node | `engines.node` `>=24.0.0 <25.0.0`, `.nvmrc` `24`, CI reads `.nvmrc`; local 24.19.0. The Vercel dashboard value (recorded as Node 22.x on 2026-10-05, camera#182, open) can only be read in the dashboard, so it is not verified here. `HANDOVER.md` repeats the same open item |
| GDS | 6.8.0 in `package.json`, the five tarballs in `vendor/gds/`, `gds-adoption.json` (`gdsVersion`) and `TECH_STACK.md`. messmass still has 6.3.0 (its own `vendor/gds/`), a gap of five minors in the GDS line |
| `@types/node` | 20 line against a Node 24 runtime: **fixed**, now `^24.19.2` (section 5) |

## 9. Repeat the audit

```bash
npm ci
npm audit --omit=dev                 # production tree: must stay at 0
npm audit                            # everything; read each path, do not just run `fix --force`
npm outdated
gh api "repos/moldovancsaba/camera/dependabot/alerts?state=open" --jq 'length'
# deprecated, direct dependencies (installed version, then latest)
for p in $(node -p "Object.keys({...require('./package.json').dependencies,...require('./package.json').devDependencies}).join(' ')"); do
  v=$(node -p "require('./node_modules/$p/package.json').version" 2>/dev/null) && npm view "$p@$v" deprecated
done
# unused candidates: how many tracked files mention each package in quotes (0 = look at it by hand)
for p in $(node -p "Object.keys({...require('./package.json').dependencies,...require('./package.json').devDependencies}).join(' ')"); do
  n=$(git grep -l -E "['\"]${p}(/[^'\"]*)?['\"]" -- . ':!package.json' ':!package-lock.json' ':!vendor' ':!docs' ':!*.md' | wc -l | tr -d ' '); echo "$n $p"
done | sort -n | head
npm ls --depth=0                     # installed versions for TECH_STACK.md
npm run inventory:check && npm run release:check
```

On 2026-10-11 the "unused candidates" loop prints exactly the packages in the "kept" table of section 3 (peers, types, binaries) and nothing else. When a package is removed with `npm uninstall`, read `git diff package-lock.json`: only the package and its own dependencies may disappear. With npm 10.9, put the four `libc` entries of the `@next/swc-linux-*` packages back before committing (or run the install with npm 11).
