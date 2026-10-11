#!/usr/bin/env bash
# WHAT: `npm run sync:main` -- bring the current branch up to date with origin/main by a
#   rebase, and settle the one conflict that every parallel branch gets: the generated
#   inventory files docs/_audit/*.json.
# WHY: many pull requests are prepared at the same time, each in its own git worktree.
#   Every branch that adds a route, a variable or a document regenerates docs/_audit/*.json,
#   and main moves every few minutes, so a rebase onto main stops on those files again and
#   again. They are generated, so the right resolution is never a hand merge: take main's
#   file, regenerate from the code, continue. Anything else that conflicts is a real
#   conflict and is left to a person, with the exact files and commands printed.
# HOW:
#   1. refuse to start with uncommitted changes to tracked files (a rebase would need to
#      stash them), on main, or on a detached HEAD;
#   2. git fetch origin, then git rebase origin/main (nothing is done when the branch is
#      already on top of it);
#   3. each time the rebase stops, look at the conflicted files:
#        - only docs/_audit/*.json (and docs/_meta/* if the repo has it): check out main's
#          side ("ours" in a rebase), run `python3 scripts/fleet-audit-inventory.py --write`
#          (the inventory of the tree as it is at that commit), git add, and
#          `git rebase --continue`; repeat for every commit that conflicts;
#        - any other file: stop, print which files, which commit, and the commands to go on
#          by hand. Running this script again continues the same rebase;
#   4. at the end run `python3 scripts/fleet-audit-inventory.py --check` and print the
#      result;
#   5. print the push command. This script NEVER pushes and never forces anything: after
#      a rebase the branch needs `git push --force-with-lease`, and that is for a person to
#      run. `gh pr update-branch <n>` is the alternative when there is no local rebase need.
# Works from any worktree (the repo root comes from git, not from the folder name or its
# place), and with the bash 3.2 that macOS ships.
# Exit codes: 0 up to date and the inventory check passes; 1 refused, or stopped on a
# conflict or an error; 2 rebased, but the inventory check fails.

set -uo pipefail

BASE_REMOTE=origin
BASE_BRANCH=main
BASE_REF="$BASE_REMOTE/$BASE_BRANCH"
INVENTORY_SCRIPT=scripts/fleet-audit-inventory.py
MAX_STEPS=200

say() { printf 'sync:main: %s\n' "$*"; }
warn() { printf 'sync:main: %s\n' "$*" >&2; }
die() { printf 'sync:main: %s\n' "$*" >&2; exit 1; }
indent() { sed 's/^/    /'; }

usage() {
  cat <<EOF
Usage: npm run sync:main    (or: bash scripts/sync-main.sh)

Rebases the current branch onto $BASE_REF. If the only conflicts are in the generated
docs/_audit/*.json files, takes main's version, regenerates them with
$INVENTORY_SCRIPT --write and continues; any other conflict stops with the
files and the commands to continue by hand. Ends with the inventory check and the push
command. Never pushes.
EOF
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  "") ;;
  *) usage >&2; exit 1 ;;
esac

command -v git >/dev/null 2>&1 || die "git is not installed"
command -v python3 >/dev/null 2>&1 || die "python3 is not installed (the inventory scanner needs it)"
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || die "not inside a git work tree"
cd "$ROOT" || die "cannot enter $ROOT"
[ -f "$INVENTORY_SCRIPT" ] || die "$INVENTORY_SCRIPT is missing in $ROOT (not a fleet repo?)"

rebase_in_progress() {
  [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]
}

# Runs a command with its output captured in $step_output; returns its exit status.
step_output=""
step() {
  step_output=$("$@" 2>&1)
  return $?
}

conflicted_files() { git -c core.quotepath=false diff --name-only --diff-filter=U; }

# Generated files that are safe to settle by taking main's version and regenerating.
is_generated() {
  case "$1" in
    docs/_audit/*.json|docs/_meta/*) return 0 ;;
    *) return 1 ;;
  esac
}

stopped_commit() { git log -1 --format='%h %s' REBASE_HEAD 2>/dev/null || echo "(unknown)"; }

stop_with_conflicts() { # $1 = files to resolve by hand, $2 = generated files that conflict as well
  warn "STOPPED: the rebase onto $BASE_REF has conflicts that need a person."
  warn "  commit being applied: $(stopped_commit)"
  warn "  files to resolve by hand:"
  printf '%s' "$1" | sed '/^$/d; s/^/      /' >&2
  if [ -n "$2" ]; then
    warn "  also conflicted, but generated (this script settles them once the files above are done):"
    printf '%s' "$2" | sed '/^$/d; s/^/      /' >&2
  fi
  warn ""
  warn "  to continue by hand:"
  warn "      1. open each file above and resolve the <<<<<<< ======= >>>>>>> markers"
  warn "      2. git add <each file you resolved>"
  warn "      3. npm run sync:main        (continues this rebase and settles the generated files; or: git rebase --continue)"
  warn "  to give up and return to your branch as it was:"
  warn "      git rebase --abort"
  exit 1
}

stop_with_error() { # $1 = what failed, output in $step_output
  warn "STOPPED: $1"
  printf '%s\n' "$step_output" | sed 's/^/      /' >&2
  warn ""
  warn "  look at the state with: git status"
  warn "  then either fix it and run: npm run sync:main"
  warn "  or give up with:            git rebase --abort"
  exit 1
}

# ---------------------------------------------------------------------------
# 1. Start (or resume) the rebase
# ---------------------------------------------------------------------------

rewritten=0
if rebase_in_progress; then
  say "a rebase is already in progress in $ROOT: continuing it"
  rewritten=1
else
  branch=$(git symbolic-ref --short -q HEAD) || die "HEAD is detached; check out your branch first"
  [ "$branch" != "$BASE_BRANCH" ] || die "you are on $BASE_BRANCH; run this from your feature branch"

  dirty=$(git status --porcelain --untracked-files=no)
  if [ -n "$dirty" ]; then
    warn "refusing to run: there are uncommitted changes to tracked files:"
    printf '%s\n' "$dirty" | sed 's/^/      /' >&2
    die "commit them (or git stash) and run it again"
  fi
  untracked=$(git ls-files --others --exclude-standard)
  if [ -n "$untracked" ]; then
    warn "note: untracked files exist; the inventory scan reads them too (move or delete scratch files):"
    printf '%s\n' "$untracked" | head -5 | sed 's/^/      /' >&2
  fi

  say "fetching $BASE_REMOTE"
  if ! step git fetch --quiet "$BASE_REMOTE"; then
    warn "git fetch $BASE_REMOTE failed:"
    printf '%s\n' "$step_output" | sed 's/^/      /' >&2
    exit 1
  fi
  git rev-parse --verify -q "$BASE_REF^{commit}" >/dev/null || die "$BASE_REF does not exist after the fetch"

  counts=$(git rev-list --left-right --count "$BASE_REF...HEAD")
  behind=${counts%%[[:space:]]*}
  ahead=${counts##*[[:space:]]}
  if [ "$behind" = 0 ]; then
    say "$branch is already on top of $BASE_REF ($ahead commit(s) ahead): nothing to rebase"
  else
    say "rebasing $branch ($ahead commit(s)) onto $BASE_REF ($behind new commit(s) on $BASE_BRANCH)"
    rewritten=1
    step git rebase "$BASE_REF"
    rebase_rc=$?
    if [ "$rebase_rc" != 0 ] && ! rebase_in_progress; then
      stop_with_error "git rebase $BASE_REF failed before it started"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 2. While the rebase is stopped: settle generated files, stop on anything else
# ---------------------------------------------------------------------------

steps=0
while rebase_in_progress; do
  steps=$((steps + 1))
  [ "$steps" -le "$MAX_STEPS" ] || stop_with_error "gave up after $MAX_STEPS rebase steps (something loops)"

  unmerged=$(conflicted_files)

  if [ -z "$unmerged" ]; then
    # Stopped without a conflict: either someone resolved and staged by hand, or the commit
    # became empty because main already has its changes.
    if git diff --cached --quiet; then
      say "commit $(stopped_commit) is already in $BASE_REF (nothing left to commit): dropping it"
      step git rebase --skip || stop_with_error "git rebase --skip failed"
    else
      step env GIT_EDITOR=true git rebase --continue || stop_with_error "git rebase --continue failed"
    fi
    continue
  fi

  hand=""
  generated=""
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    if is_generated "$file"; then generated="$generated$file"$'\n'; else hand="$hand$file"$'\n'; fi
  done <<EOF
$unmerged
EOF

  [ -z "$hand" ] || stop_with_conflicts "$hand" "$generated"

  say "commit $(stopped_commit)"
  say "  conflicts only in generated files; taking $BASE_REF's version, then regenerating:"
  printf '%s' "$generated" | sed '/^$/d; s/^/      /'
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    # "ours" is the branch being rebased onto (main plus the commits already replayed). When
    # main deleted the file there is no such side: accept the deletion.
    git checkout --ours -- "$file" 2>/dev/null || git rm -q -f -- "$file" 2>/dev/null \
      || stop_with_error "could not take $BASE_REF's version of $file"
  done <<EOF
$generated
EOF
  step python3 "$INVENTORY_SCRIPT" --write || stop_with_error "$INVENTORY_SCRIPT --write failed"
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    [ ! -e "$file" ] || git add -- "$file"
  done <<EOF
$generated
EOF
  # The regenerated inventory files (git add -u would stop with an error when no tracked file matches).
  if [ -n "$(git ls-files -- 'docs/_audit/*.json')" ]; then git add -u -- 'docs/_audit/*.json'; fi
  step env GIT_EDITOR=true git rebase --continue
  # A non-zero status here is normal when the next commit conflicts too: the loop looks again.
done

if [ "$rewritten" = 1 ]; then
  head_branch=$(git symbolic-ref --short -q HEAD) || die "the rebase finished but HEAD is detached; check git status"
  say "rebase finished: $head_branch is on top of $BASE_REF ($(git rev-parse --short "$BASE_REF")), $(git rev-list --count "$BASE_REF..HEAD") commit(s) ahead"
fi

# ---------------------------------------------------------------------------
# 3. The inventory check, and what to do next
# ---------------------------------------------------------------------------

branch=$(git symbolic-ref --short -q HEAD) || die "HEAD is detached; check git status"
say "running the inventory check"
step python3 "$INVENTORY_SCRIPT" --check
check_rc=$?
printf '%s\n' "$step_output" | indent
if [ "$check_rc" = 0 ]; then
  say "inventory check: OK"
else
  warn "inventory check: FAILED (exit $check_rc). The code and docs/_audit/*.json disagree; regenerate and commit:"
  warn "      python3 $INVENTORY_SCRIPT --write && git add docs/_audit && git commit -m \"Regenerate the inventory\""
fi

if [ "$rewritten" = 1 ]; then
  if git rev-parse --verify -q "refs/remotes/$BASE_REMOTE/$branch" >/dev/null; then
    say "the branch was rewritten, so the push needs a lease (this script never pushes); run it yourself:"
    say "    git push --force-with-lease $BASE_REMOTE $branch"
    pr="<n>"
    if command -v gh >/dev/null 2>&1 && git remote get-url "$BASE_REMOTE" 2>/dev/null | grep -q 'github\.com'; then
      found=$(gh pr view "$branch" --json number --jq .number 2>/dev/null || true)
      [ -z "$found" ] || pr="$found"
    fi
    say "instead of a local rebase (when you have no local commit to rebase, or only need main merged in), GitHub can update the PR branch itself:"
    say "    gh pr update-branch $pr"
  else
    say "$branch is not on $BASE_REMOTE yet; publish it with a plain push (this script never pushes):"
    say "    git push -u $BASE_REMOTE $branch"
  fi
else
  say "nothing was rewritten: push as usual if you have new commits (git push $BASE_REMOTE $branch)"
fi

[ "$check_rc" = 0 ] || exit 2
exit 0
