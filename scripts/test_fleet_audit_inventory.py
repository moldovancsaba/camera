#!/usr/bin/env python3
"""Unit tests for scripts/fleet-audit-inventory.py (run by `npm run test:unit` through
scripts/fleet-audit-inventory.test.ts, or directly: python3 scripts/test_fleet_audit_inventory.py).

WHAT: the parts of the inventory scanner that decide whether the committed
docs/_audit/*.json are the same wherever a checkout lives and whichever branch wrote them.
WHY: many pull requests are prepared in parallel, each in its own git worktree (often under
.claude/worktrees/<name>). The scanner used to skip every path with a `.claude` part (so a
worktree scanned nothing), wrote the worktree's folder name as the repo name, and wrote a
timestamp, a commit and counts into the files (so any two branches that regenerated
conflicted). Every test below builds its own throwaway repositories under a temp directory;
nothing touches the repo being tested.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "fleet-audit-inventory.py"
_spec = importlib.util.spec_from_file_location("fleet_audit_inventory", SCRIPT)
inv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(inv)  # type: ignore[union-attr]

GIT_ENV = {
    **os.environ,
    "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t.test",
    "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t.test",
    "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1",
}

# The fixture text is assembled from pieces on purpose: the scanner also reads every .py file of
# the repo it runs in, and a literal environment-variable read, collection call or URL in this
# file would be listed in docs/_audit/*.json as if the app used it.
ENV_READ = "process." + "env."
COLLECTION_CALL = "db." + "collection"
HTTPS = "https:" + "//"
ORIGIN = HTTPS + "github.com/acme/camera.git"

FILES = {
    "app/api/aaa/route.ts": f"export async function GET() {{ requireAuth(); return {ENV_READ}AAA_KEY; }}\n",
    "app/api/mmm/route.ts": f"export async function POST() {{ return {COLLECTION_CALL}('things'); }}\n",
    "app/api/zzz/route.ts": f"export async function GET() {{ return fetch('{HTTPS}hooks.service.io/x'); }}\n",
    "README.md": "# Root\n",
    "docs/guide.md": "# Guide\n\nSee [root](../README.md).\n",
    # These must never be listed: skipped directories below the repo root.
    "node_modules/pkg/index.ts": f"{ENV_READ}SKIPPED_NODE_MODULES\n",
    ".claude/inner/x.ts": f"{ENV_READ}SKIPPED_CLAUDE_AT_ROOT\n",
    ".next/server/x.ts": f"{ENV_READ}SKIPPED_NEXT\n",
}


def git(cwd: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=cwd, env=GIT_ENV, capture_output=True, text=True)


def write_files(root: Path, files: dict[str, str]) -> None:
    for rel, text in files.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)


def make_repo(root: Path, origin: str | None = ORIGIN) -> Path:
    root.mkdir(parents=True)
    git(root, "init", "-q")
    git(root, "symbolic-ref", "HEAD", "refs/heads/main")
    if origin:
        git(root, "remote", "add", "origin", origin)
    write_files(root, FILES)
    return root


def quiet(fn, *args, **kwargs):
    with contextlib.redirect_stdout(io.StringIO()) as out:
        result = fn(*args, **kwargs)
    return result, out.getvalue()


def audit_texts(root: Path) -> dict[str, str]:
    return {name: (root / "docs" / "_audit" / name).read_text() for name in inv.INVENTORY_FILES}


class SkipRulesTest(unittest.TestCase):
    def test_only_the_part_below_the_root_counts(self):
        root = Path("/work/.claude/worktrees/camera-b")
        self.assertFalse(inv.is_skipped(root / "app" / "api" / "x" / "route.ts", root))
        self.assertFalse(inv.is_skipped(root / "README.md", root))

    def test_skipped_directories_below_the_root_are_skipped(self):
        root = Path("/work/.claude/worktrees/camera-b")
        for rel in ("node_modules/a/b.ts", ".next/c.ts", ".git/x", ".claude/worktrees/other/app/y.ts", "app/node_modules/z.ts", "coverage/lcov.md"):
            self.assertTrue(inv.is_skipped(root / rel, root), rel)

    def test_a_primary_checkout_and_a_worktree_judge_the_same_relative_path_alike(self):
        for rel in ("app/page.tsx", "node_modules/p/i.ts", ".claude/s.ts"):
            self.assertEqual(
                inv.is_skipped(Path("/Users/me/camera") / rel, Path("/Users/me/camera")),
                inv.is_skipped(Path("/Users/me/camera/.claude/worktrees/camera-b") / rel, Path("/Users/me/camera/.claude/worktrees/camera-b")),
                rel,
            )


class RepoSlugTest(unittest.TestCase):
    def test_name_comes_from_the_remote_not_from_the_folder(self):
        cases = {
            f"{HTTPS}github.com/acme/camera.git": "camera",
            f"{HTTPS}github.com/acme/camera": "camera",
            f"{HTTPS}github.com/acme/camera/": "camera",
            "git@github.com:acme/camera.git": "camera",
            "git@github.com:camera.git": "camera",
            "/srv/git/camera.git": "camera",
        }
        with tempfile.TemporaryDirectory() as tmp:
            for i, (url, expected) in enumerate(cases.items()):
                repo = make_repo(Path(tmp) / f"camera-b{i}", origin=url)
                self.assertEqual(inv.repo_slug(repo), expected, url)

    def test_folder_name_is_the_fallback_without_a_remote(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(Path(tmp) / "some-folder", origin=None)
            self.assertEqual(inv.repo_slug(repo), "some-folder")


class RenderTest(unittest.TestCase):
    ITEMS = [{"path": "/api/a", "methods": ["GET"], "file": "app/api/a/route.ts", "auth_markers": [], "no_auth_marker": True}, {"path": "/api/b", "methods": ["POST"], "file": "app/api/b/route.ts", "auth_markers": ["requireAuth"], "no_auth_marker": False}]

    def test_nothing_describes_the_run(self):
        text = inv.render_inventory("camera", self.ITEMS)
        data = json.loads(text)
        self.assertEqual(sorted(data), ["_meta", "items"])
        self.assertEqual(sorted(data["_meta"]), ["regenerate", "repo"])
        for volatile in ("generated", "head", "counts"):
            self.assertNotIn(volatile, text)
        self.assertEqual(text, inv.render_inventory("camera", self.ITEMS), "the same input must give the same bytes")

    def test_every_item_is_one_line(self):
        text = inv.render_inventory("camera", self.ITEMS)
        self.assertEqual(json.loads(text)["items"], self.ITEMS)
        item_lines = [line for line in text.splitlines() if line.startswith('  {"path"')]
        self.assertEqual(len(item_lines), len(self.ITEMS))
        strings = inv.render_inventory("camera", ["events", "frames"])
        self.assertIn('\n  "events",\n  "frames"\n ]', strings)

    def test_an_empty_list_is_valid_json(self):
        text = inv.render_inventory("camera", [])
        self.assertEqual(json.loads(text)["items"], [])
        self.assertTrue(text.endswith("\n"))


class LayoutIndependenceTest(unittest.TestCase):
    """The same tree must give the same inventories in every kind of location."""

    def test_scan_finds_the_files_in_a_worktree_under_dot_claude(self):
        with tempfile.TemporaryDirectory() as tmp:
            wt = make_repo(Path(tmp) / "x" / ".claude" / "worktrees" / "camera-b")
            fresh = inv.scan_repo(wt)
            self.assertEqual([r["path"] for r in fresh["endpoints.json"]], ["/api/aaa", "/api/mmm", "/api/zzz"])
            self.assertEqual(fresh["collections.json"], ["things"])
            self.assertEqual(fresh["env.json"], ["AAA_KEY"])
            self.assertEqual(fresh["outbound-hosts.json"], ["hooks.service.io"])
            self.assertEqual([d["file"] for d in fresh["docs.json"]], ["README.md", "docs/guide.md"])

    def test_same_inventories_and_same_bytes_in_a_clone_and_in_a_worktree_under_dot_claude(self):
        with tempfile.TemporaryDirectory() as tmp:
            primary = make_repo(Path(tmp) / "primary" / "camera")
            deep = make_repo(Path(tmp) / "other" / ".claude" / "worktrees" / "camera-b")
            self.assertEqual(inv.scan_repo(primary), inv.scan_repo(deep))
            quiet(inv.write_inventory, primary, None, inv.scan_repo(primary))
            quiet(inv.write_inventory, deep, None, inv.scan_repo(deep))
            self.assertEqual(audit_texts(primary), audit_texts(deep))
            self.assertEqual(json.loads(audit_texts(deep)["docs.json"])["_meta"]["repo"], "camera")

    def test_a_real_git_worktree_with_another_folder_name_writes_the_remote_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            primary = make_repo(Path(tmp) / "camera")
            git(primary, "add", "-A")
            git(primary, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "base")
            wt = Path(tmp) / ".claude" / "worktrees" / "camera-b"
            added = git(primary, "worktree", "add", "-q", "-b", "feature", str(wt))
            self.assertEqual(added.returncode, 0, added.stderr)
            quiet(inv.write_inventory, primary, None, inv.scan_repo(primary))
            quiet(inv.write_inventory, wt, None, inv.scan_repo(wt))
            self.assertEqual(audit_texts(primary), audit_texts(wt))
            self.assertEqual(json.loads(audit_texts(wt)["endpoints.json"])["_meta"]["repo"], "camera")

    def test_check_passes_in_a_dot_claude_worktree_and_fails_on_a_real_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            wt = make_repo(Path(tmp) / ".claude" / "worktrees" / "camera-b")
            quiet(inv.write_inventory, wt, None, inv.scan_repo(wt))
            code, out = quiet(inv.check, wt)
            self.assertEqual(code, 0, out)
            write_files(wt, {"app/api/new/route.ts": "export async function GET() { return 1; }\n"})
            code, out = quiet(inv.check, wt)
            self.assertEqual(code, 1, out)
            self.assertIn("/api/new", out)

    def test_write_twice_gives_the_same_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(Path(tmp) / "camera")
            quiet(inv.write_inventory, repo, None, inv.scan_repo(repo))
            first = audit_texts(repo)
            quiet(inv.write_inventory, repo, None, inv.scan_repo(repo))
            self.assertEqual(first, audit_texts(repo))


class CompatibilityTest(unittest.TestCase):
    def test_files_in_the_older_format_still_load_and_still_compare_by_items_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(Path(tmp) / "camera")
            fresh = inv.scan_repo(repo)
            out_dir = repo / "docs" / "_audit"
            out_dir.mkdir(parents=True)
            for name, items in fresh.items():
                old = {"_meta": {"generated": "2026-01-01T00:00:00+00:00", "repo": "camera-b", "head": "abc1234", "counts": {"x": 1}}, "items": items}
                (out_dir / name).write_text(json.dumps(old, indent=1) + "\n")
            self.assertEqual(inv.diff_inventory(inv.load_committed(repo), fresh), [])

    def test_a_changed_item_is_still_drift(self):
        fresh = {name: [] for name in inv.INVENTORY_FILES}
        committed = {name: [] for name in inv.INVENTORY_FILES}
        fresh["env.json"] = ["NEW_VAR"]
        self.assertEqual(inv.diff_inventory(committed, fresh), ["env.json: + NEW_VAR"])


class ParallelBranchesTest(unittest.TestCase):
    """The reason for the stable format: two branches that each add a different route and
    each regenerate must merge without a conflict."""

    def _commit_all(self, repo: Path, message: str) -> None:
        git(repo, "add", "-A")
        result = git(repo, "-c", "commit.gpgsign=false", "commit", "-q", "-m", message)
        self.assertEqual(result.returncode, 0, result.stderr)

    def _regenerate(self, repo: Path) -> None:
        quiet(inv.write_inventory, repo, None, inv.scan_repo(repo))

    def test_two_branches_adding_different_routes_merge_cleanly_and_the_gate_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            primary = make_repo(Path(tmp) / "camera")
            self._regenerate(primary)
            self._commit_all(primary, "base")
            wt_a = Path(tmp) / ".claude" / "worktrees" / "camera-a"
            wt_b = Path(tmp) / ".claude" / "worktrees" / "camera-b"
            self.assertEqual(git(primary, "worktree", "add", "-q", "-b", "branch-a", str(wt_a)).returncode, 0)
            self.assertEqual(git(primary, "worktree", "add", "-q", "-b", "branch-b", str(wt_b)).returncode, 0)
            write_files(wt_a, {"app/api/bbb/route.ts": "export async function GET() { return 1; }\n"})  # between aaa and mmm
            self._regenerate(wt_a)
            self._commit_all(wt_a, "add bbb")
            write_files(wt_b, {"app/api/yyy/route.ts": "export async function GET() { return 2; }\n"})  # between mmm and zzz
            self._regenerate(wt_b)
            self._commit_all(wt_b, "add yyy")
            merged = git(wt_b, "-c", "commit.gpgsign=false", "merge", "--no-edit", "branch-a")
            self.assertEqual(merged.returncode, 0, merged.stdout + merged.stderr)
            code, out = quiet(inv.check, wt_b)
            self.assertEqual(code, 0, out)
            paths = [r["path"] for r in json.loads((wt_b / "docs/_audit/endpoints.json").read_text())["items"]]
            self.assertEqual(paths, ["/api/aaa", "/api/bbb", "/api/mmm", "/api/yyy", "/api/zzz"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
