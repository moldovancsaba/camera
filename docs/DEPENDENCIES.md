# Dependencies

**Version**: 12.3.42  
**Last Updated**: 2026-10-11

The dependency audit of 2026-10-11 (owner request "check dependencies", after the try-on removal, the analytics and consent settings, GDS 6.8.0 and Next 16.3.8). It covers camera in full; messmass has the short form in its `docs/architecture.md` ("Dependency audit"). `package.json` and `package-lock.json` stay the source of truth for versions; this page records what was checked, what was decided and why, so the next audit starts here.

Checked on Node 24.19 / npm 10.9 after a clean `npm ci`. The full gate (`npm run inventory:check` and `npm run release:check`) was green after the changes.

## 1. Result in short

| Question | Answer |
|----------|--------|
| Advisories in what ships to production (`npm audit --omit=dev`) | **0** |
| Advisories anywhere (`npm audit`) | 1 advisory, shown as 5 high findings, **development tool only, no patched release exists** |
| Open Dependabot alerts | none (`gh api "repos/moldovancsaba/camera/dependabot/alerts?state=open"` returned nothing) |
| Packages nothing uses | 1 removed (`@mantine/dropzone`); the try-on removal itself left no orphan package. Second pass the same day (section 3a): no further unused package; 9 unused source files, 13 unused one-off scripts and 2 unused overrides removed |
| Updated | 7 packages (patch and minor, same lines) |
| Deprecated | `eslint` 9.x (whole line) and `glob` 10.5.0 (transitive, production tree, through `archiver`) |
| Majors and framework lines not done | 11, with effort and risk in section 5 |
| Version stamps | one wrong stamp (`NAMING_GUIDE.md`), one stale stack section and two stale test counts, all fixed |

## 2. Security advisories

| Advisory | Severity | Where (path) | Reachable in production? | Disposition |
|----------|----------|--------------|--------------------------|-------------|
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): `braces` <= 3.0.3, deeply nested brace patterns exhaust the stack (CWE-674, CVSS 7.5) | high | `braces` 3.0.3 < `micromatch` 4.0.8 < `fast-glob` 3.3.1 < `@next/eslint-plugin-next` 16.2.10 < `eslint-config-next` 16.2.10 (devDependency). npm counts the five packages on the path as five findings. | **No.** `npm audit --omit=dev` finds nothing and `npm ls braces --omit=dev` is empty. The code runs only inside `eslint .` on this repository's own files, with patterns that are written in the config, never with input from a user. | **No fix exists:** 3.0.3 is the newest `braces` and lies inside the affected range. npm's own suggestion (`npm audit fix --force`) installs `eslint-config-next@14.2.35`, a downgrade of two majors that does not fit Next 16, so it is not applied. Re-run `npm audit` when `braces` or `eslint-config-next` changes. |

Nothing else is reported. Dependabot had earlier flagged Next 16.3.2 (two critical advisories); `next` is now 16.3.8 and the old note in `TECH_STACK.md` was removed.

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

### 3a. Second pass: unused files, scripts and overrides (2026-10-11)

**Method.** `npx depcheck` and `npx knip` (neither added to the repo), then every finding checked by hand with `git grep` over code, config, workflow, docs and `.env.example`, and with `git log -S` for the last importer. Both tools found **no unused dependency**: depcheck lists `@tailwindcss/postcss`, `tailwindcss` and `baseline-browser-mapping` and knip lists `baseline-browser-mapping`, and all three are the known false positives of section 3 (`postcss.config.mjs`, the CSS import, the `postinstall` patch). Knip also lists every `*.test.ts` as an unused file (the repository runs them through `scripts/run-unit-tests.mjs`, not as entry points) and 377 unused exports and 131 unused types, which were left alone (an export is not a module, and each one is a decision about an API).

**Removed (9 source files, 13 scripts, 2 overrides); the unit tests, type-check, lint and the production build are the proof that nothing used them.**

| File | Evidence |
|------|----------|
| `components/admin/HashtagInput.tsx` | No importer since the FunFitFan removal (`e96bec57`, 2026-05-23); `gds_fix_handover.md` S39 already said "Delete: no call sites"; `docs/ELEMENT_INVENTORY.md` listed it as an orphan |
| `components/admin/RemoveSubmissionButton.tsx` | No importer since `59c7d755` (2026-05-14, the gallery removal workflow); listed as an orphan in `docs/ELEMENT_INVENTORY.md` |
| `components/shared/LoadingSpinner.tsx`, `components/shared/index.ts` | The spinner was imported only by the index, and nothing imports the index (`@/components/shared` appears nowhere). The folder is gone |
| `lib/admin/upload-image-client.ts` | `RELEASE_NOTES.md` (library step 5, camera#368) already says it "has no caller left" |
| `lib/auth/oauth-return-message.ts` | Importer removed with FunFitFan (`e96bec57`); the admin login has its own messages (`app/admin/login/page.tsx`) |
| `lib/gds/notifications.ts` | One line re-exporting `notifications`; `components/capture/notify.ts` imports `@mantine/notifications` directly and nothing imports this file |
| `lib/logos/utils.ts` | `selectRandomLogo` is dead (the product shows the first active logo; `docs/ELEMENT_INVENTORY.md` gfx-023 says so) |
| `lib/slideshow/open-slideshow.ts` | Importer removed with FunFitFan (`e96bec57`) |
| `scripts/add-uuid-fields.mjs`, `fix-submission-eventids.mjs`, `fix-null-eventid-submissions.mjs`, `cleanup-orphaned-frames.mjs`, `migrate-frames-add-frameId.ts`, `backfill-dimensions.mjs`, `disable-create-own-share-button-events.ts`, `push-vercel-env.mjs` | One-off migrations and repairs from 2025-11 to 2026-06 that write to the database (or to Vercel). Not named by `package.json`, the workflow, any document, another script or `.env.example`. Several carry hard-coded ids and read `.env.local` themselves. They stay in git history |
| `scripts/audit-playcounts.mjs`, `check-aspect-ratios.mjs`, `check-all-event-submissions.mjs`, `check-pseudo-users.js`, `test-aggregation.js` | One-off read-only diagnostics of 2025-11 (a hard-coded slideshow id, the pseudo-users investigation); same: named nowhere |
| Overrides `postcss` 8.5.23 and `esbuild` 0.28.1 (June 2026, "fix dependency audit findings") | Their reason is gone: `next` 16.3.8 itself requires `postcss` 8.5.23 exactly, `@tailwindcss/postcss` asks `^8.5.16`, `tsx` asks `esbuild ~0.28.0`. Removed one by one and together with `npm install --package-lock-only`: `package-lock.json` came out **byte for byte the same** (apart from the four `libc` lines npm 10.9 drops), so the resolved tree is unchanged (`npm explain postcss`, `npm explain esbuild`) |

| Measure | Before (main, 6483bc06) | After |
|---------|-------------------------|-------|
| Direct dependencies / devDependencies / overrides | 23 / 15 / 7 | 23 / 15 / **5** |
| Packages installed by `npm ci` | 622 | 622 (no package leaves; every dependency is used) |
| `npm ci` deprecation warnings | 2 | 2 |
| `npm audit` / `npm audit --omit=dev` | 5 high / 0 | 5 high / 0 |
| Tracked source and script files | | -22 files, -2 override lines |

**Looked at and not removed.**

| What | Why it stays |
|------|--------------|
| Every direct dependency | Each has an importer, a binary in a script, a config entry or a peer requirement (section 3). The four peer packages `@mantine/hooks`, `@mantine/dates`, `@mantine/modals` and `dayjs` have no import in the repo, but `gds-core` and `gds-theme` list them as non-optional peers; without a declaration npm would pick the newest Mantine for them (`^7.9 \|\| ^8.3 \|\| ^9`) |
| `tailwindcss`, `@tailwindcss/postcss` | The CSS imports Tailwind and 8 files still use utility classes, including the live guest pages (`app/capture/[eventId]/page.tsx`, `components/camera/CameraCapture.tsx`); the reset it brings is global. Removing it is a styling change on the capture path: after 2026-10-14 and with the owner (section 5b) |
| `lib/submissions/public-image.ts` and its test | No production importer, but `original-exposure.test.ts` guards it by name and the submissions route cites it as the place where an original is kept private. It belongs to the original-photo cleanup the owner has not released |
| `scripts/backfill-preview-image-urls.ts`, `count-stored-photo-addresses.ts`, `scan-broken-pictures.ts`, `backfill-screen-pictures.ts`, `grant-admin*.mjs`, `grant-app-permission.mjs` | Named by `RUNBOOK.md`, `CLAUDE.md`, `.env.example`, `docs/PRIVACY_DATA.md` or other documents |
| `config/leather-suits.example.json`, `public/fff/*`, `pnpm-workspace.yaml`, `public/favicon.png` | The first two are held back by the try-on and FunFitFan clean-ups on the owner's go (issues 561 and 400); `pnpm-workspace.yaml` is the developer-convenience setting that `docs/GDS_RELEASE_GATE.md` mentions; `favicon.png` is an asset (6 kB) that an external page might link |
| `lib/library/fake-db.ts`, `lib/tryon/sync.fake-db.ts`, `lib/events/baseline/*.baseline.ts` | Test helpers used by test files (knip does not count tests as entry points) |
| Unused exports and types (knip: 377 and 131) | Not modules; each one is an API decision |

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
| `overrides` `postcss` 8.5.23 and `esbuild` 0.28.1 | **Done 2026-10-11**: removed, the resolved tree is unchanged (section 3a) | XS | none |

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
| `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`, `@tiptap/extension-bubble-menu`, `@tiptap/extension-floating-menu` = 3.31.3 | Without them `@tiptap/starter-kit` 3.31.4 gets its own nested `@tiptap/core` and `@tiptap/pm` 3.31.4 next to the 3.31.3 the rest of the tree uses (two copies of the editor core, which these packages are not built for). `gds-core` 6.8.0 brings tiptap in. | Keep |
| `postcss` 8.5.23, `esbuild` 0.28.1 | Added in June 2026 for audit findings on older versions. Today `next` 16.3.8 pins `postcss` 8.5.23 and `tsx` asks `esbuild ~0.28.0`; removing both leaves `package-lock.json` unchanged | **Removed 2026-10-11** (section 3a) |

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
