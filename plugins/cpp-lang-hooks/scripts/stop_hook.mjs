import {
  runHook,
  quitHook,
  envFlag,
  envEnabled,
} from "./common/hook.mjs";
import { findCMakeBuildDirWithMarker } from "./common/cmake.mjs";
import { getCppTurnState } from "./common/turn_state.mjs";
import { spawnSync } from "node:child_process";
import path from "node:path";

function shouldRunCTest() {
  return !envFlag("CPP_HOOKS_FAST") && envEnabled("CPP_HOOKS_CTEST");
}

function runCMakeBuild(projectDir, buildDir, block_on_failed) {
  const buildArg = path.relative(projectDir, buildDir) || buildDir;
  const result = spawnSync("cmake", ["--build", buildArg], {
    cwd: projectDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error?.code === "ENOENT") {
    return;
  }

  if (result.error || result.status !== 0) {
    const details =
      result.error?.message ||
      (result.stderr || result.stdout).trim() ||
      `exit ${result.status}`;
    if (block_on_failed) {
      quitHook({
        decision: "block",
        reason: `cmake --build failed: ${details}`,
      });
    } else {
      quitHook({
        continue: true,
        systemMessage: `cmake --build still failed: ${details}`,
      });
    }
  }
}

function runCTest(projectDir, buildDir, block_on_failed) {
  const result = spawnSync(
    "ctest",
    ["--test-dir", buildDir, "--output-on-failure"],
    {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.error?.code === "ENOENT") {
    return;
  }

  if (result.error || result.status !== 0) {
    const details =
      result.error?.message ||
      (result.stderr || result.stdout).trim() ||
      `exit ${result.status}`;
    if (block_on_failed) {
      quitHook({
        decision: "block",
        reason: `ctest failed: ${details}`,
      });
    } else {
      quitHook({
        continue: true,
        systemMessage: `ctest still failed: ${details}`,
      });
    }
  }
}

function main(input) {
  if (!shouldRunCTest()) {
    quitHook({ continue: true });
  }

  const state = getCppTurnState(input?.turn_id);
  if (!state || !state.cppChanged || state.projectRoots.length === 0) {
    quitHook({ continue: true });
  }

  const blockOnFailed = input.stop_hook_active ? false : true;
  for (const projectDir of state.projectRoots) {
    const buildDir = findCMakeBuildDirWithMarker(projectDir, "CMakeCache.txt");
    if (buildDir) {
      runCMakeBuild(projectDir, buildDir, blockOnFailed);
    }

    const testDir = findCMakeBuildDirWithMarker(
      projectDir,
      "CTestTestfile.cmake",
    );
    if (testDir) {
      runCTest(projectDir, testDir, blockOnFailed);
    }
  }
  quitHook({ continue: true });
}

runHook(main);
