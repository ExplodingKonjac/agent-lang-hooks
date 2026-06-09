import { runHook, quitHook, findUp } from "./common/hook.mjs";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

function runCTest(input, block_on_failed) {
  const cwd = typeof input?.cwd === "string" ? input.cwd : process.cwd();
  const cmakeFile = findUp(cwd, "CMakeLists.txt");
  if (!cmakeFile) {
    quitHook({ continue: true });
  }

  const projectDir = path.dirname(cmakeFile);
  const buildDir = path.join(projectDir, "build");
  if (!existsSync(buildDir)) {
    quitHook({ continue: true });
  }

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
  runCTest(input, input.stop_hook_active ? false : true);
  quitHook({ continue: true });
}

runHook(main);
