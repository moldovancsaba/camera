# Branching model

**Version**: 12.2.21
**Last Updated**: 2026-09-03
_Verified @ a87d78f_

Camera uses a **single long-lived branch, `main`**, plus short-lived feature/fix
branches that exist only until their PR merges. There is no `dev` or `preview`
branch — an earlier draft of this policy proposed a three-branch model
(`main`/`preview`/`dev`) that was never adopted; only `main` was ever created,
and this document previously kept describing the unadopted plan as current
practice. `git branch -a` confirms the real shape: one local/remote `main`,
zero `dev`/`preview` refs, and 30+ per-task branches (`feature/*`, `fix/*`,
`chore/*`, `docs/*`, `dependabot/*`, `claude/*`) each merged into `main` and
then left in place or deleted.

| Branch | Role |
|--------|------|
| `main` | **Production.** Single source of truth. Ships to production manually via `npx vercel@latest --prod` — a git push to `main` does **not** auto-deploy (see [RUNBOOK.md](../RUNBOOK.md)). Keep it deployable at all times. |
| `feature/*`, `fix/*`, `chore/*`, `docs/*`, `claude/*`, … | **Ephemeral task branches.** Cut from `main` for one PR, named for the change (`feature/…`, `fix/…`, `chore/…`), merged back into `main` via GitHub PR (31 merge commits in history as of this writing), then safe to delete. No fixed prefix list is enforced — the names above are what's actually in use. |
| `dependabot/*` | Automated dependency-bump branches opened by Dependabot, merged the same way. |

## Flow

1. Branch from `main` for a task: `git checkout -b feature/my-change`.
2. Do the work, push, open a PR against `main`.
3. Run the release gate before merging: `npm run release:check`
   (gds manifest + compliance + boundary, type-check, lint, test:unit,
   production-guards, build — also enforced by `.github/workflows/ci.yml`;
   see [docs/GDS_RELEASE_GATE.md](GDS_RELEASE_GATE.md)).
4. Merge the PR into `main`; delete the task branch.
5. Deploy `main` to production manually (`npx vercel@latest --prod`) when ready — merging does not auto-deploy.

## Rules

- `main` is the only long-lived branch. Do not create `dev` or `preview` —
  they are not part of the real workflow and nothing consumes them.
- Prefer small, short-lived task branches over long-running ones; merge and
  delete promptly rather than accumulating parallel branches.
- Keep `main` deployable at all times.
- Run the release gate (`npm run release:check`) before merging to `main`.
