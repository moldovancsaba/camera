# Tasklist

**Version Context**: 12.3.41  
**Last Updated**: 2026-10-06

Active work is tracked on the GitHub project board, not in this file:
**[project #24](https://github.com/users/moldovancsaba/projects/24)**. Board
statuses, in order: IDEABANK (SOMEDAY), Roadmap (LATER), Backlog (SOONER), Todo
(NEXT), In Progress (NOW), Review (ALMOST), Done, Declined (NEVER). This file
only says where to look; keeping a second list here is how the previous version
drifted (it still described 2.22.0 as current).

## Where to look

| Need | Where |
|---|---|
| Open work and its status | project board #24 |
| What changed and when (including the v2.15-v2.22 history that used to be listed here) | `RELEASE_NOTES.md` |
| Current state and owner decisions | `HANDOVER.md` |
| Direction beyond the active work | `ROADMAP.md` |
| GDS audit and the ordered adoption plan | `gds_fix_handover.md`; board issues camera#183-#188 |
| image.direct as a second renderer | `docs/IMAGE_DIRECT_INTEGRATION.md`; tracker camera#189 |
| Repo rules, quality gate, branching | `CLAUDE.md`, `docs/BRANCHING.md` |

## Items that used to be listed here

- `CameraCapture` `autoStart` unreliable under `next dev` (FRONT-008): camera#191.
- GDS `AdminResourceCard` / `MediaPreviewCard` limitations: described, with the
  2026-10-06 re-check, in `docs/GDS_CAMERA_ADOPTION.md` ("Known package
  limitations") and tracked upstream as
  `sovereignsquad/general-design-system#755` (board issue camera#187).
- E2E export suite (#84) needs one verified green run against a
  MongoDB-backed environment: camera#198.

## Notes

- `package.json` is the canonical version source.
- `README.md`, `ARCHITECTURE.md`, and `docs/*` are the canonical documentation set.
- Planning beyond active execution belongs in `ROADMAP.md`.
- Every change goes through a pull request with a passing `Verify` check
  (`CLAUDE.md` section 2); open an issue on the board first for anything larger
  than a small fix.
