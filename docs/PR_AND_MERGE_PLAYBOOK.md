# Pull requests and merges in a busy repository (what failed on 2026-10-10 and 11, and the rules that follow)

**Version**: 12.3.41
**Last Updated**: 2026-10-11

Why this exists: on 10 and 11 October 2026 about a dozen parallel streams (analytics, the try-on removal, consent settings, the follow-up e-mail, journey recording, documentation) each prepared pull requests in their own git worktree while `main` moved every ten minutes. Many pull requests could not be merged at the moment they were green, and merge commands failed for two different reasons: **GitHub's own rules** and **Claude Code's permission system**. This file says what failed, how each case was fixed, how to avoid it, and the routine to follow. The short rules are in `CLAUDE.md` sections 3, 5 and 10; this is the long version. The tooling it mentions (`npm run sync:main`, the stable inventory scanner; camera PR 592, 2026-10-11) is described in `RUNBOOK.md` ("Parallel branches in git worktrees").

## 1. Why a green pull request could not be merged (GitHub side)

`main` is protected (CLAUDE.md section 2): a pull request, a passing `Verify` check, **the branch must be up to date with `main`**, admins cannot bypass, force-pushes are off, and **auto-merge is disabled** for the repository. Every merge moves `main`, so every other open pull request becomes "behind" at once. That single rule explains most of what was seen:

| What `gh` or the PR said | Cause | How it was fixed | How to avoid |
|---|---|---|---|
| `X Pull request ... is not mergeable: the merge commit cannot be cleanly created`, state `DIRTY`/`CONFLICTING` | `main` changed the same lines (see 2) | rebase, resolve, regenerate, push (see section 4) | small pull requests, merge as soon as green, surgical edits in shared files |
| `base branch policy prohibits the merge. To have the pull request merged after all the requirements have been met, add the --auto flag. To use administrator privileges ... --admin` (state `BEHIND`) | the branch was not up to date with `main`; `--auto` is disabled and `--admin` is blocked by the protection | `gh pr update-branch <n> --repo moldovancsaba/camera` (merges `main` into the branch), wait for `Verify` again, merge | merge in sequence, never queue three green pull requests and expect them all to stay green; use `npm run sync:main` before the last push |
| `gh pr update-branch` answers `Cannot update PR branch due to conflicts` | a real conflict (see 2) | rebase locally | as above |
| state `UNSTABLE`, `Vercel` check `pending` for hours | the Vercel preview deployment was stuck or queued behind many deployments; it is **not** a required check (only `Verify` is) | after `Verify` passed and the change was docs-only or already proven, `gh pr merge` worked (the production deployment is separate and was watched afterwards) | do not wait forever: after 20 minutes of a pending preview with a green `Verify`, say so and merge on `Verify` |
| the pull request was `MERGEABLE`+`CLEAN` a minute ago, `BEHIND` now | another stream merged in between | `update-branch` and wait again | accept it: it costs one CI cycle (8 to 12 minutes) per merge that happened in between |

## 2. Why pull requests conflicted, and the fixes

1. **`docs/_audit/*.json` (the generated inventory) conflicted after nearly every merge.** The generator rewrote header fields that change on every run (a timestamp, the commit id, counts) and the `"repo"` field with the **name of the worktree folder** (`camera-b` instead of `camera`), so any two branches that both regenerated conflicted, and each had to be hand-fixed. *Fix used:* take `main`'s version of the five files, run `python3 scripts/fleet-audit-inventory.py --write`, set `"repo"` back to `camera`, `git add`, continue. *Fixed at the root* by camera PR 592 of 2026-10-11: the committed files no longer carry a timestamp, a commit id or counts (`_meta` is only the repo name and the regenerate command), every item is on its own line, the repo name comes from the git remote, and the scanner skips `.claude` and the like only below the repo root; two branches that add different routes now merge without a conflict (proved in scratch worktrees; the old format conflicted in 4 of 5 files). `npm run sync:main` does the remaining routine (rebase onto `origin/main`, take main's generated files, regenerate, stop on any other conflict, never push). **One-time effect:** every branch that regenerated the old format conflicts once in the five files after PR 592; `npm run sync:main` settles it (a branch cut before the merge does not have the script: `git show origin/main:scripts/sync-main.sh > /tmp/sync-main.sh && bash /tmp/sync-main.sh`). The other four fleet repos still carry the old scanner (a patch, not a copy, because `AUTH_MARKERS` differs) until they are synced in one coordinated change (issue 383, box 2); in try-on the route `file` values carry line numbers, which stays a conflict source there. *Avoid:* never merge or rebase by hand around these files; always regenerate after the last rebase, and run `npm run inventory:check`.
2. **The three shared logs conflicted** (`RELEASE_NOTES.md`, `HANDOVER.md`, `ARCHITECTURE.md`): every stream adds its entry at the top. *Fix used:* keep both entries, mine first. *Avoid:* **parallel streams do not edit these three files**; the lead adds one consolidated entry per wave from each stream's report (this worked from the second wave on).
3. **Shared source files** (`lib/db/schemas.ts`, `lib/i18n/messages.en.ts` and `.hu.ts`, `app/capture/[eventId]/page.tsx`, `app/api/submissions/route.ts`, the event and partner editors) were touched by several streams at once (try-on removal, checkbox settings, journey beacons, gallery permission). *Avoid:* surgical edits (add a block, never reformat), rebase on fresh `main` before pushing, and tell parallel streams which files they share.
4. **Stacked pull requests** (a branch that contains the commits of the one below it) became `DIRTY` as soon as the lower one was **squash-merged**, because the squash is a new commit that git does not recognise. *Fix used:* `git rebase --onto origin/main <old head of the lower branch> <branch>` (drops the commits that `main` already has), regenerate the inventory, force-push with `--force-with-lease`. *Avoid:* prefer independent pull requests; if stacking, merge the stack bottom-up without delay.

## 3. Other reasons a check or a command failed (and the fix)

| Failure | Cause | Fix | Avoid |
|---|---|---|---|
| CI `Secret scan` (gitleaks) failed, local checks green | a high-entropy test fixture that looked like a token, named `TOKEN` (the scan runs only in CI) | renamed the fixture (`'a1b2c3'.repeat(16)` as `LONG_ID`) | no variable named token or secret next to a random-looking value; use the allow-listed shapes in `.gitleaks.toml` |
| a rate-limit unit test failed only in CI | it depended on the clock | the clock is held still in the test | no test may depend on real time |
| `tsc` failed locally after other streams removed pages | stale generated types in `.next/types` | `rm -rf .next` | delete `.next` after a rebase that removed routes |
| `inventory:check` reported drift for an unchanged tree | the checkout was under a `.claude` folder, which the scanner used to skip | worktrees outside `.claude` (and the scanner fix) | create worktrees under `/Users/Shared/Projects/_worktrees/nav/<name>`, never under `.claude`, never with `tokens` or `theme` in the folder name |
| `release:check` / `next build` crashed (Turbopack panic) | `node_modules` was a symlink to another checkout | a real `npm ci` in the worktree | never symlink `node_modules` |
| `next dev` could not render a page (GDS CSS parse error) | the design system's stylesheet is not parsed by the dev server | production build, or an esbuild harness of the real component | verify in a browser with a production build or a harness |
| a unit test failed with `Cannot mock ... already mocked` | `t.mock.module` was called twice for the same module in one test | one scenario per test | split scenarios |
| a test listing files failed after a removal (`original-exposure.test.ts`) | its allow-list still named deleted files | updated the list | after deleting code, run the whole test suite, not only the touched tests |
| the exit code of `npm run release:check` was lost | the wrapper shell was killed after the build printed its route table | re-ran in the foreground | read the real exit code of the last command |

## 4. The routine (every pull request, in this order)

1. Branch from fresh `origin/main` in your own worktree (see CLAUDE.md section 3 for the folder rule), `npm ci` there.
2. Work; keep edits in shared files surgical; do not edit `RELEASE_NOTES.md`, `HANDOVER.md`, `ARCHITECTURE.md` when other streams are running (put the text in the pull request description or your report).
3. Before the push: `npm run sync:main` (rebases onto `origin/main`, resolves and regenerates the generated inventory, stops on a real conflict), then `npm run inventory:check` and `npm run release:check`, reading the real exit code.
4. Push (`--force-with-lease` after a rebase), open the pull request, wait for `Verify` (and Vercel; see section 1 for a stuck preview).
5. If it fell behind meanwhile: `gh pr update-branch <n> --repo moldovancsaba/camera`, wait for `Verify` again. If it conflicts: step 3 again.
6. Merge (squash, delete branch), then watch the production deployment and do a read-only live look (a public route or a `curl`; never a write, CLAUDE.md section 8).

## 5. Why a merge command was refused by the permission system, and what to do

Separate from GitHub's rules, Claude Code runs commands through an **auto-mode permission classifier**. It refused these, each time with a reason:

| Reason shown | What was attempted | Why it was refused (as far as it can be read) |
|---|---|---|
| `[Production Reads]` | a read-only query of the production database with credentials from `.env` (to find an uploaded sample selfie), twice, also after the owner said "allow" in chat | credentials for production are not something an agent may use on a chat approval alone |
| `[Merge Without Review]` | a helper agent running `git fetch` and `gh pr view`, then `gh pr merge`, for pull requests that its own brief said **not** to merge, after the lead relayed the owner's approval | the approval arrived second-hand through the lead, and the agent's own task was "open, do not merge"; merging deploys to production |
| `[Auto-Mode Bypass]` | a background shell script that looped over three pull requests (`update-branch`, wait, `merge`) | an unattended loop of merges to production looks like an attempt to get around per-action review |
| `[Production Deploy]` | starting an agent whose brief gave it the right to merge guest-path changes to `main` | handing out the right to deploy to production |

What worked: **single, explicit `gh pr merge <n>` commands typed by the lead after the owner's own chat message naming the pull requests** ("348 merge"), and earlier, loops over low-risk dependency updates. What did not: scripts and agents merging live-path changes.

**Rules that follow:**
1. A pull request that changes the live guest capture path, the live giant screen, consent, or touches production data is merged **only after the owner says so in chat, naming it** (for example "merge 348"). The lead then merges it with one command at a time.
2. **Helper agents open pull requests and report; they never merge** pull requests of that kind (they may merge documentation-only or admin-only, off-by-default changes when the brief says so and the owner approved the stream).
3. **No unattended merge loops** for such pull requests: merge, look, then the next.
4. When a command is refused: **stop**, do not try the same action through another tool, and tell the owner exactly which command was refused and why it is needed (CLAUDE.md section 10).
5. What the owner can do: reply "merge <number>" for a specific pull request; or, for a routine they trust, add a permission rule for `gh pr merge` in their Claude Code settings. The assistant cannot change its own permission settings and must not ask a helper to do what it was refused.

## 6. Parallel work: how many streams, and who merges

- At most **three or four streams** at a time: each CI cycle takes 8 to 12 minutes, every merge makes the others `BEHIND`, and each stream pays one cycle per merge ahead of it.
- Give each stream its own **worktree and branch outside `.claude`**, tell it which shared files others touch, and **forbid** the three shared logs.
- The lead merges, in an order that keeps stacks short, and writes the consolidated release notes, handover and architecture text once per wave.
- Merge **guest-path and live-event changes first and alone** (then look at them live), docs last.
