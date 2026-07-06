# Branching model

Camera uses **exactly three long-lived branches**. No feature branches, no fix
branches, no per-task or per-agent branches — with two developers, extra
branches are churn we do not need.

| Branch | Role | Meaning |
|--------|------|---------|
| `main` | **Production** | Production source of truth. Ships to production manually via `npx vercel@latest --prod`. A git push to `main` does **not** auto-deploy (see [RUNBOOK.md](../RUNBOOK.md)). Keep it deployable at all times. |
| `preview` | **Release candidate** | Pre-production / staging validation. Changes promoted from `dev` land here for release-candidate verification before they reach `main`. |
| `dev` | **Development** | Active development and integration. All day-to-day work happens here. |

## Flow

Promote **upward only**:

```
dev  →  preview  →  main
```

1. Do all work on `dev`.
2. When a set of changes is ready for release-candidate validation, merge `dev` → `preview`.
3. After the RC passes verification, merge `preview` → `main`, then deploy `main` to production.

## Rules

- Only `main`, `preview`, and `dev` exist. **Do not create additional branches.**
- Do not commit directly to `main` except release promotions from `preview`.
- Keep `main` deployable at all times.
- Run the release gate before promoting to `main`: `npm run release:check`
  (gds manifest + compliance + boundary, type-check, lint, production-guards, build — see
  [docs/GDS_RELEASE_GATE.md](GDS_RELEASE_GATE.md)).

## Current state

The repository has been consolidated to this model. For now **only `main` exists**;
`preview` and `dev` are created off `main` when the workflow first needs them:

```bash
git checkout main
git checkout -b dev     && git push -u origin dev
git checkout main
git checkout -b preview && git push -u origin preview
```
