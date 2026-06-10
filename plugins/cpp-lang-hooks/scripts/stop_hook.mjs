import {
  runHook,
  quitHook,
  findUp,
  findCMakeBuildDir,
  envFlag,
  envEnabled,
} from "./common/hook.mjs";
import { didCppChange } from "./common/turn_state.mjs";
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

function runCTest(input, block_on_failed) {
  const cwd = typeof input?.cwd === "string" ? input.cwd : process.cwd();
  const cmakeFile = findUp(cwd, "CMakeLists.txt");
  if (!cmakeFile) {
    quitHook({ continue: true });
  }

  const projectDir = path.dirname(cmakeFile);
  const buildDir = findCMakeBuildDir(projectDir);
  if (!buildDir) {
    quitHook({ continue: true });
  }

  runCMakeBuild(projectDir, buildDir, block_on_failed);

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

  if (didCppChange(input?.turn_id) === false) {
    quitHook({ continue: true });
  }

  runCTest(input, input.stop_hook_active ? false : true);
  quitHook({ continue: true });
}

runHook(main);
