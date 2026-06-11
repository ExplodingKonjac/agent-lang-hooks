import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  collectHookFilePaths,
  envEnabled,
  findUp,
  quitHook,
  runHook,
} from "./common/hook.mjs";
import { commandFailureDetails } from "./common/command_failure.mjs";
import { markRustChanged } from "./common/turn_state.mjs";
import path from "node:path";

const RUST_EXTENSIONS = [".rs"];

function shouldRunCargoFmt() {
  return envEnabled("RUST_HOOKS_CARGO_FMT");
}

function shouldRunRustfmt() {
  return envEnabled("RUST_HOOKS_RUSTFMT");
}

function cargoProjectDir(targetPath) {
  const cargoToml = findUp(path.dirname(targetPath), "Cargo.toml");
  return cargoToml ? path.dirname(cargoToml) : null;
}

function pushUnique(items, item) {
  if (!items.includes(item)) {
    items.push(item);
  }
}

function runCargoFmt(projectDir) {
  const result = spawnSync("cargo", ["fmt"], {
    cwd: projectDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error?.code === "ENOENT") {
    return;
  }

  if (result.error || result.status !== 0) {
    quitHook({
      decision: "block",
      reason: `cargo fmt in ${projectDir} failed: ${commandFailureDetails(result)}`,
    });
  }
}

function runRustfmt(targetPath) {
  const result = spawnSync("rustfmt", [targetPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error?.code === "ENOENT") {
    return;
  }

  if (result.error || result.status !== 0) {
    quitHook({
      decision: "block",
      reason: `rustfmt on ${targetPath} failed: ${commandFailureDetails(result)}`,
    });
  }
}

function main(input) {
  const cwd = typeof input?.cwd === "string" ? input.cwd : process.cwd();
  const rustPaths = collectHookFilePaths(input, cwd).filter((targetPath) =>
    RUST_EXTENSIONS.includes(path.extname(targetPath).toLowerCase()),
  );

  if (rustPaths.length === 0) {
    quitHook({ continue: true });
  }

  const cargoProjectDirs = [];
  const existingCargoProjectDirs = [];
  const existingStandaloneFiles = [];

  for (const rustPath of rustPaths) {
    const projectDir = cargoProjectDir(rustPath);
    if (projectDir) {
      pushUnique(cargoProjectDirs, projectDir);
      if (existsSync(rustPath)) {
        pushUnique(existingCargoProjectDirs, projectDir);
      }
    } else if (existsSync(rustPath)) {
      existingStandaloneFiles.push(rustPath);
    }
  }

  markRustChanged(input?.turn_id, cargoProjectDirs.sort());

  if (shouldRunCargoFmt()) {
    for (const projectDir of existingCargoProjectDirs.sort()) {
      runCargoFmt(projectDir);
    }
  }

  if (shouldRunRustfmt()) {
    for (const rustPath of existingStandaloneFiles.sort()) {
      runRustfmt(rustPath);
    }
  }

  quitHook({ continue: true });
}

runHook(main);
