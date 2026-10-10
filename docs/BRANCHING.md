# Branching model

**Version**: 12.3.41
**Last Updated**: 2026-09-28
_Verified @ a87d78f_

Camera uses a **single long-lived branch, `main`**, plus short-lived feature/fix
branches. There is no `dev` or `preview` branch — an earlier draft of this
policy proposed a three-branch model (`main`/`preview`/`dev`) that was never
adopted; only `main` was ever created, and this document previously kept
describing the unadopted plan as current practice. `git branch -a` confirms the
real shape: one local/remote `main`, zero `dev`/`preview` refs, and per-task
branches (`feature/*`, `feat/*`, `fix/*`, `chore/*`, `docs/*`, `dependabot/*`)
merged into `main` and then left in place or deleted.

| Branch | Role |
|--------|------|
| `main` | **Production.** Single source of truth. Every push to `main` auto-deploys to production via the Vercel Git integration; the deploy does not wait for GitHub Actions CI (see [RUNBOOK.md](../RUNBOOK.md)). Keep it deployable at all times. |
| `feature/*`, `feat/*`, `fix/*`, `chore/*`, `docs/*`, … | **Ephemeral task branches.** Cut from `main` for one change, named for the change (`feature/…`, `fix/…`, `chore/…`), merged back into `main`, then safe to delete. No fixed prefix list is enforced — the names above are what's in use. Branch names never carry an assistant/tool name (see `CLAUDE.md`). |
| `dependabot/*` | Automated dependency-bump branches opened by Dependabot. |

## Current practice (2026-09-30)

- `main` has a GitHub branch protection rule: a pull request is required (0
  approvals) and the `Verify` status check (`.github/workflows/ci.yml`) must
  pass. Since 2026-09-30 it is enforced for admins (`enforce_admins: true`), it
  requires the branch to be up to date, and force-pushes and deletions are off.
  No bypass lists exist.
- Before that date most changes were pushed directly to `main`: of 76
  first-parent commits since 2026-08-20, two arrived via PRs (#132, #133), and
  CI was red on `main` from `386d3fe` to `06f3029` while each of those commits
  deployed. That can no longer happen.
- Vercel deploys every commit that lands on `main` without waiting for CI, so the
  protection rule is what stands between a red check and production.
- Task branches are deleted after their PR merges. The 30 leftover merged
  branches (five of them `claude/*`) were deleted on 2026-09-30.

## Recommended flow

1. Branch from `main` for a task: `git checkout -b feature/my-change`.
2. Do the work, push, open a PR against `main`.
3. Run the release gate before merging: `npm run inventory:check && npm run release:check`
   (inventory drift + links; gds manifest + compliance + boundary, type-check,
   lint, test:unit, production-guards, build — the same checks
   `.github/workflows/ci.yml` runs; see [docs/GDS_RELEASE_GATE.md](GDS_RELEASE_GATE.md)).
4. Merge the PR into `main` once `Verify` is green; delete the task branch.
5. The merge to `main` deploys to production automatically.

## Rules

- `main` is the only long-lived branch. Do not create `dev` or `preview` —
  they are not part of the real workflow and nothing consumes them.
- Prefer small, short-lived task branches over long-running ones; merge and
  delete promptly rather than accumulating parallel branches.
- Keep `main` deployable at all times — every push to it ships.
- Run the release gate (`npm run inventory:check && npm run release:check`)
  before anything lands on `main`.
