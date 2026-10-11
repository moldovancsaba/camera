// WHAT: Tests of scripts/sync-main.sh (`npm run sync:main`) in throwaway git repositories:
//   a bare repository as the fake origin, a clone with a git worktree under .claude/worktrees
//   (the layout an agent works in), and the real scripts/fleet-audit-inventory.py.
// WHY: the helper decides what happens to a branch during a rebase onto main, so its
//   promises are pinned: it settles conflicts that are only in the generated
//   docs/_audit/*.json, it stops on any other conflict and says which files, it continues
//   a rebase that was stopped, it refuses to start with uncommitted changes, and it never
//   pushes. Nothing here touches the repository the tests run in, the network or a database.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t.test',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t.test',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  PYTHONDONTWRITEBYTECODE: '1',
};

function run(cwd: string, command: string, args: string[]): { status: number; out: string } {
  const r = spawnSync(command, args, { cwd, env: GIT_ENV, encoding: 'utf8' });
  assert.equal(r.error, undefined, `${command} could not be started: ${String(r.error)}`);
  return { status: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

function git(cwd: string, ...args: string[]): string {
  const r = run(cwd, 'git', args);
  assert.equal(r.status, 0, `git ${args.join(' ')} failed in ${cwd}\n${r.out}`);
  return r.out.trim();
}

function commitAll(cwd: string, message: string): void {
  git(cwd, 'add', '-A');
  git(cwd, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message);
}

function write(root: string, rel: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}

function addRoute(root: string, name: string): void {
  write(root, `app/api/${name}/route.ts`, 'export async function GET() { return 1; }\n');
}

function regenerate(root: string): void {
  const r = run(root, 'python3', ['scripts/fleet-audit-inventory.py', '--write']);
  assert.equal(r.status, 0, r.out);
}

function routesIn(root: string): string[] {
  const data = JSON.parse(readFileSync(path.join(root, 'docs/_audit/endpoints.json'), 'utf8')) as { items: { path: string }[] };
  return data.items.map((i) => i.path);
}

interface Sandbox {
  dir: string;
  origin: string;
  /** the clone that stands for the owner's primary checkout */
  primary: string;
  /** a second clone that stands for "somebody else pushes to main" */
  pusher: string;
  /** a worktree of `primary` under .claude/worktrees, on a new branch cut from the first commit */
  worktree: (name: string) => string;
  baseSha: string;
  cleanup: () => void;
}

// A main with three routes, a text file, and a generated-looking x.json next to the real
// inventory files (the glob docs/_audit/*.json covers it).
function sandbox(): Sandbox {
  const dir = mkdtempSync(path.join(tmpdir(), 'sync-main-'));
  const origin = path.join(dir, 'origin.git');
  mkdirSync(origin);
  git(origin, 'init', '-q', '--bare');
  git(origin, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  const seed = path.join(dir, 'seed');
  git(dir, 'clone', '-q', origin, seed);
  git(seed, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  mkdirSync(path.join(seed, 'scripts'));
  copyFileSync(path.join(SCRIPTS, 'fleet-audit-inventory.py'), path.join(seed, 'scripts/fleet-audit-inventory.py'));
  copyFileSync(path.join(SCRIPTS, 'sync-main.sh'), path.join(seed, 'scripts/sync-main.sh'));
  for (const name of ['aaa', 'mmm', 'zzz']) addRoute(seed, name);
  write(seed, 'src/code.txt', 'one\ntwo\nthree\n');
  write(seed, 'README.md', '# Fixture\n');
  write(seed, 'docs/_audit/x.json', '{\n "items": [\n  "a",\n  "b",\n  "c"\n ]\n}\n');
  regenerate(seed);
  commitAll(seed, 'base');
  git(seed, 'push', '-q', 'origin', 'main');
  const baseSha = git(seed, 'rev-parse', 'HEAD');

  const primary = path.join(dir, 'proj');
  const pusher = path.join(dir, 'pusher');
  git(dir, 'clone', '-q', origin, primary);
  git(dir, 'clone', '-q', origin, pusher);
  const worktree = (name: string): string => {
    const wt = path.join(primary, '.claude', 'worktrees', name);
    git(primary, 'worktree', 'add', '-q', '-b', name, wt, baseSha);
    return wt;
  };
  return { dir, origin, primary, pusher, worktree, baseSha, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function syncMain(cwd: string): { status: number; out: string } {
  return run(cwd, 'bash', ['scripts/sync-main.sh']);
}

function pushToMain(pusher: string, message: string, edit: () => void): string {
  git(pusher, 'pull', '-q', '--ff-only', 'origin', 'main');
  edit();
  regenerate(pusher);
  commitAll(pusher, message);
  git(pusher, 'push', '-q', 'origin', 'main');
  return git(pusher, 'rev-parse', 'HEAD');
}

function rebaseInProgress(cwd: string): boolean {
  return ['rebase-merge', 'rebase-apply'].some((d) => existsSync(path.resolve(cwd, git(cwd, 'rev-parse', '--git-path', d))));
}

test('settles conflicts that are only in generated inventory files, in every commit, from a worktree under .claude', () => {
  const sb = sandbox();
  try {
    const mainTip = pushToMain(sb.pusher, 'main: ccc and x.json', () => {
      addRoute(sb.pusher, 'ccc');
      write(sb.pusher, 'docs/_audit/x.json', '{\n "items": [\n  "a",\n  "b-main",\n  "c"\n ]\n}\n');
    });
    const wt = sb.worktree('feat-a');
    // Both new routes sort between aaa and mmm: the same place in the list, a real textual conflict.
    addRoute(wt, 'bbb');
    write(wt, 'docs/_audit/x.json', '{\n "items": [\n  "a",\n  "b-branch",\n  "c"\n ]\n}\n');
    regenerate(wt);
    commitAll(wt, 'feat-a: bbb');
    addRoute(wt, 'ddd');
    regenerate(wt);
    commitAll(wt, 'feat-a: ddd');
    git(wt, 'push', '-q', 'origin', 'feat-a');
    const remoteBranchBefore = git(sb.origin, 'rev-parse', 'refs/heads/feat-a');

    const r = syncMain(wt);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /conflicts only in generated files/);
    assert.match(r.out, /docs\/_audit\/endpoints\.json/);
    assert.match(r.out, /inventory check: OK/);
    assert.match(r.out, /git push --force-with-lease origin feat-a/);
    assert.match(r.out, /gh pr update-branch <n>/);

    assert.equal(rebaseInProgress(wt), false);
    assert.equal(git(wt, 'status', '--porcelain'), '');
    assert.equal(git(wt, 'merge-base', 'HEAD', 'origin/main'), mainTip, 'the branch sits on top of main');
    assert.deepEqual(git(wt, 'log', '--format=%s', 'origin/main..HEAD').split('\n'), ['feat-a: ddd', 'feat-a: bbb']);
    assert.deepEqual(routesIn(wt), ['/api/aaa', '/api/bbb', '/api/ccc', '/api/ddd', '/api/mmm', '/api/zzz']);
    assert.match(readFileSync(path.join(wt, 'docs/_audit/x.json'), 'utf8'), /b-main/, "main's version of the generated file is taken");
    assert.equal(run(wt, 'python3', ['scripts/fleet-audit-inventory.py', '--check']).status, 0);
    // It never pushes.
    assert.equal(git(sb.origin, 'rev-parse', 'refs/heads/feat-a'), remoteBranchBefore);
    assert.equal(git(sb.origin, 'rev-parse', 'refs/heads/main'), mainTip);
  } finally {
    sb.cleanup();
  }
});

test('stops on a conflict in any other file, names it, and continues the same rebase when run again', () => {
  const sb = sandbox();
  try {
    pushToMain(sb.pusher, 'main: ccc and code.txt', () => {
      addRoute(sb.pusher, 'ccc');
      write(sb.pusher, 'src/code.txt', 'one\ntwo-main\nthree\n');
    });
    const wt = sb.worktree('feat-b');
    addRoute(wt, 'bbb');
    write(wt, 'src/code.txt', 'one\ntwo-branch\nthree\n');
    regenerate(wt);
    commitAll(wt, 'feat-b: bbb and code.txt');

    const stopped = syncMain(wt);
    assert.equal(stopped.status, 1, stopped.out);
    assert.match(stopped.out, /STOPPED/);
    assert.match(stopped.out, /files to resolve by hand:\s+src\/code\.txt/);
    assert.match(stopped.out, /also conflicted, but generated[\s\S]*docs\/_audit\/endpoints\.json/);
    assert.match(stopped.out, /git add </);
    assert.match(stopped.out, /git rebase --continue/);
    assert.match(stopped.out, /git rebase --abort/);
    assert.equal(rebaseInProgress(wt), true, 'the rebase is left in progress for a person to finish');

    write(wt, 'src/code.txt', 'one\ntwo-both\nthree\n');
    git(wt, 'add', 'src/code.txt');
    const resumed = syncMain(wt);
    assert.equal(resumed.status, 0, resumed.out);
    assert.match(resumed.out, /continuing it/);
    assert.equal(rebaseInProgress(wt), false);
    assert.equal(readFileSync(path.join(wt, 'src/code.txt'), 'utf8'), 'one\ntwo-both\nthree\n');
    assert.deepEqual(routesIn(wt), ['/api/aaa', '/api/bbb', '/api/ccc', '/api/mmm', '/api/zzz']);
    assert.equal(run(wt, 'python3', ['scripts/fleet-audit-inventory.py', '--check']).status, 0);
  } finally {
    sb.cleanup();
  }
});

test('refuses to start with uncommitted changes to tracked files, on main, and on a detached HEAD', () => {
  const sb = sandbox();
  try {
    const wt = sb.worktree('feat-c');
    write(wt, 'README.md', '# Fixture changed\n');
    const dirty = syncMain(wt);
    assert.equal(dirty.status, 1, dirty.out);
    assert.match(dirty.out, /uncommitted changes/);
    assert.match(dirty.out, /README\.md/);
    git(wt, 'checkout', '-q', 'README.md');

    const onMain = syncMain(sb.primary);
    assert.equal(onMain.status, 1, onMain.out);
    assert.match(onMain.out, /you are on main/);

    git(wt, 'checkout', '-q', '--detach');
    const detached = syncMain(wt);
    assert.equal(detached.status, 1, detached.out);
    assert.match(detached.out, /detached/);
  } finally {
    sb.cleanup();
  }
});

test('does nothing to a branch that is already on top of origin/main, and says nothing needs a force push', () => {
  const sb = sandbox();
  try {
    const wt = sb.worktree('feat-d');
    addRoute(wt, 'bbb');
    regenerate(wt);
    commitAll(wt, 'feat-d: bbb');
    const before = git(wt, 'rev-parse', 'HEAD');
    const r = syncMain(wt);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /nothing to rebase/);
    assert.doesNotMatch(r.out, /force-with-lease/);
    assert.equal(git(wt, 'rev-parse', 'HEAD'), before);
  } finally {
    sb.cleanup();
  }
});

test('rebases cleanly and reports exit 2 with the fix when the inventory no longer matches the code', () => {
  const sb = sandbox();
  try {
    pushToMain(sb.pusher, 'main: ccc', () => addRoute(sb.pusher, 'ccc'));
    const wt = sb.worktree('feat-e');
    addRoute(wt, 'ddd'); // a route added without regenerating the inventory
    commitAll(wt, 'feat-e: ddd, inventory forgotten');
    const r = syncMain(wt);
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /inventory check: FAILED/);
    assert.match(r.out, /\/api\/ddd/);
    assert.match(r.out, /fleet-audit-inventory\.py --write && git add docs\/_audit/);
    assert.equal(rebaseInProgress(wt), false);
  } finally {
    sb.cleanup();
  }
});

test('accepts main deleting a generated file that the branch changed', () => {
  const sb = sandbox();
  try {
    pushToMain(sb.pusher, 'main: ccc, x.json removed', () => {
      addRoute(sb.pusher, 'ccc');
      rmSync(path.join(sb.pusher, 'docs/_audit/x.json'));
    });
    const wt = sb.worktree('feat-f');
    addRoute(wt, 'bbb');
    write(wt, 'docs/_audit/x.json', '{\n "items": [\n  "a",\n  "b-branch",\n  "c"\n ]\n}\n');
    regenerate(wt);
    commitAll(wt, 'feat-f: bbb and x.json');
    const r = syncMain(wt);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /conflicts only in generated files[\s\S]*docs\/_audit\/x\.json/);
    assert.equal(existsSync(path.join(wt, 'docs/_audit/x.json')), false);
    assert.deepEqual(routesIn(wt), ['/api/aaa', '/api/bbb', '/api/ccc', '/api/mmm', '/api/zzz']);
    assert.equal(rebaseInProgress(wt), false);
  } finally {
    sb.cleanup();
  }
});
