# Tasklist

**Version Context**: 2.9.0  
**Last Updated**: 2026-05-20

This file should contain only active near-term execution items. Historical delivery belongs in `RELEASE_NOTES.md`.

## Active tasks

### Documentation refresh

- status: complete on 2026-05-20
- outcome:
  - canonical docs rewritten around the current Camera Core + Apps model
  - Mongo identifier guidance corrected
  - authorization docs aligned to the partner-scoped access model
  - roadmap/tasklist metadata normalized

### Partner-scoped authorization follow-through

- status: active
- focus:
  - audit remaining admin and API paths for partner-aware enforcement consistency
  - add or improve regression coverage where the role model is now more complex

### Admin UX follow-through

- status: active
- focus:
  - continue partner-first workflows
  - reduce remaining confusing global-first operational paths

## Notes

- `package.json` is the canonical version source
- `README.md`, `ARCHITECTURE.md`, and `docs/*` are the canonical documentation set
- planning beyond active execution belongs in `ROADMAP.md`
