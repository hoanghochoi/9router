#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function option(name, fallback = null) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] || fallback);
}

function has(name) {
  return args.includes(name);
}

function run(command, commandArgs, options = {}) {
  console.log(`\n$ ${command} ${commandArgs.join(" ")}`);
  return execFileSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
}

function capture(command, commandArgs) {
  return execFileSync(command, commandArgs, { cwd: root, encoding: "utf8" }).trim();
}

function fail(message) {
  throw new Error(message);
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function printHelp() {
  console.log(`Usage: npm run update:custom -- [options]

Safely update the 3h-9router build from upstream, then build the custom package.

Options:
  --upstream <ref>    Git ref to merge (default: origin/master)
  --install           Install the built tarball on this machine
  --remote <host>     Copy, backup, install, and restart on an SSH host
  --skip-tests        Skip the focused routing tests (not recommended)
  --help              Show this help
`);
}

if (has("--help")) {
  printHelp();
  process.exit(0);
}

const upstream = option("--upstream", "origin/master");
const remote = option("--remote");
const install = has("--install");
const skipTests = has("--skip-tests");
const branch = capture("git", ["branch", "--show-current"]);
const status = capture("git", ["status", "--porcelain"]);
const timestamp = new Date().toISOString().replace(/[-:.]/g, "").replace(/Z$/, "Z");
const checkpoint = `checkpoint/custom-update-${timestamp}`;
let mergeStarted = false;

if (!branch || (!branch.startsWith("3h-9router") && branch !== "3h-9router")) {
  fail(`Refusing to update branch '${branch || "(detached)"}'. Use the custom branch 3h-9router.`);
}
if (status) fail("Working tree is not clean. Commit or stash local changes before updating.");

try {
  run("git", ["fetch", "origin", "--prune"]);
  run("git", ["tag", checkpoint, "HEAD"]);
  let upstreamAlreadyIncluded = false;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", upstream, "HEAD"], {
      cwd: root,
      stdio: "ignore",
    });
    upstreamAlreadyIncluded = true;
  } catch { /* upstream contains commits not in the custom branch */ }
  if (upstreamAlreadyIncluded) {
    console.log(`Upstream ${upstream} is already included; no merge needed.`);
  } else {
    mergeStarted = true;
    run("git", ["merge", "--no-commit", "--no-ff", upstream]);
  }

  const upstreamPackage = JSON.parse(capture("git", ["show", `${upstream}:package.json`]));
  const upstreamVersion = String(upstreamPackage.version || "").trim();
  if (!/^\d+\.\d+\.\d+$/.test(upstreamVersion)) fail(`Upstream package has invalid version: ${upstreamVersion}`);
  const customVersion = `${upstreamVersion}-3h.1`;
  const rootPackagePath = join(root, "package.json");
  const cliPackagePath = join(root, "cli", "package.json");
  const rootPackage = readJson(rootPackagePath);
  const cliPackage = readJson(cliPackagePath);
  rootPackage.version = customVersion;
  rootPackage.customBuild = true;
  rootPackage.customUpdateCommand = "npm run update:custom";
  cliPackage.version = customVersion;
  cliPackage.customBuild = true;
  cliPackage.customUpdateCommand = "npm run update:custom";
  writeJson(rootPackagePath, rootPackage);
  writeJson(cliPackagePath, cliPackage);

  if (!skipTests) {
    if (!existsSync(join(root, "tests", "node_modules", ".bin", "vitest"))) {
      run(process.platform === "win32" ? "npm.cmd" : "npm", ["--prefix", "tests", "install", "--legacy-peer-deps", "--no-audit", "--no-fund"]);
    }
    run(join(root, "tests", "node_modules", ".bin", process.platform === "win32" ? "vitest.cmd" : "vitest"), [
      "run",
      "unit/model-account-blocks.test.js",
      "unit/antigravity-quota-routing.test.js",
      "unit/github-monthly-usage-lock.test.js",
    ], { cwd: join(root, "tests") });
  }

  run("git", ["diff", "--check", "HEAD"]);
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--no-audit", "--no-fund"]);
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["--prefix", "cli", "install", "--no-audit", "--no-fund"]);
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "cli:pack"]);

  const artifact = join(root, `9router-${customVersion}.tgz`);
  if (!existsSync(artifact)) fail(`Build did not produce ${basename(artifact)}`);
  const sha256 = createHash("sha256").update(readFileSync(artifact)).digest("hex");
  console.log(`\nBuilt ${artifact}`);
  console.log(`SHA-256 ${sha256}`);

  run("git", ["add", "package.json", "cli/package.json"]);
  let releaseCommitted = false;
  try {
    execFileSync("git", ["diff", "--cached", "--quiet"], { cwd: root, stdio: "ignore" });
  } catch {
    run("git", ["commit", "-m", `chore(release): update custom build to ${customVersion}`]);
    releaseCommitted = true;
  }
  if (!releaseCommitted) console.log("No release metadata changes were needed.");
  mergeStarted = false;

  if (install) {
    run(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--global", artifact, "--no-audit", "--no-fund"]);
  }

  if (remote) {
    const remoteArtifact = `/tmp/${basename(artifact)}`;
    run("scp", [artifact, `${remote}:${remoteArtifact}`]);
    const remoteScript = [
      "set -eu",
      `stamp=$(date -u +%Y%m%dT%H%M%SZ)`,
      `backup="$HOME/.9router/backups/$stamp-custom-update"`,
      `mkdir -p "$backup"`,
      `cp -a "$HOME/.9router/db" "$backup/db"`,
      `tar -C "$HOME/.npm-global/lib/node_modules" -czf "$backup/installed-9router.tgz" 9router`,
      `old=$(pgrep -f "$HOME/.npm-global/lib/node_modules/9router/cli.js" | head -n 1 || true)`,
      `if [ -n "$old" ]; then kill -TERM "$old"; fi`,
      `for i in $(seq 1 50); do [ -z "$old" ] || ! kill -0 "$old" 2>/dev/null && break; sleep 0.2; done`,
      `for i in $(seq 1 50); do ! curl --silent --fail http://127.0.0.1:20128/api/health >/dev/null 2>&1 && break; sleep 0.2; done`,
      `npm install --global "$remoteArtifact" --no-audit --no-fund`,
      `nohup "$HOME/.npm-global/bin/9router" --tray --skip-update -p 20128 -H 127.0.0.1 >/tmp/9router-custom-runtime.log 2>&1 &`,
      `for i in $(seq 1 60); do curl --silent --fail http://127.0.0.1:20128/api/health >/dev/null && break; sleep 0.5; done`,
      `curl --silent --fail http://127.0.0.1:20128/api/health >/dev/null`,
      `test "$("$HOME/.npm-global/bin/9router" --version)" = "${customVersion}"`,
      `echo "custom update installed; version=${customVersion}; backup=$backup"`,
    ].join("\n");
    run("ssh", [remote, "bash", "-s"], {
      input: `${remoteScript}\n`,
      stdio: ["pipe", "inherit", "inherit"],
    });
  }
} catch (error) {
  if (mergeStarted) {
    try { run("git", ["merge", "--abort"]); } catch { /* retain original failure */ }
  }
  console.error(`\nCustom update failed. Checkpoint tag: ${checkpoint}`);
  console.error(error?.message || error);
  process.exitCode = 1;
}
