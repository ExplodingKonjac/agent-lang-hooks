import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  collectHookFilePaths,
  runHook,
  quitHook,
  findUp,
} from "./common/hook.mjs";
import { markCppChanged } from "./common/turn_state.mjs";
import path from "node:path";

const CPP_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cxx",
  ".h",
  ".hh",
  ".hpp",
]);

function runClangFormat(targetPath) {
  const result = spawnSync("clang-format", ["-i", targetPath], {
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
    quitHook({
      decision: "block",
      reason: `clang-format on ${targetPath} failed: ${details}`,
    });
  }
}

function runClangTidy(targetPath) {
  const cmakeFile = findUp(path.dirname(targetPath), "CMakeLists.txt");
  const projectDir = cmakeFile
    ? path.dirname(cmakeFile)
    : path.dirname(targetPath);
  const buildDir = path.join(projectDir, "build");
  const tidyArgs = existsSync(path.join(buildDir, "compile_commands.json"))
    ? [targetPath, "-p", buildDir]
    : [targetPath];

  const result = spawnSync("clang-tidy", tidyArgs, {
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
    quitHook({
      decision: "block",
      reason: `clang-tidy on ${targetPath} failed: ${details}`,
    });
  }
}

function main(input) {
  const cwd = typeof input?.cwd === "string" ? input.cwd : process.cwd();
  const cppPaths = collectHookFilePaths(input)
    .map((targetPath) => {
      return path.isAbsolute(targetPath)
        ? path.normalize(targetPath)
        : path.resolve(cwd, targetPath);
    })
    .filter(
      (targetPath) =>
        CPP_EXTENSIONS.has(path.extname(targetPath).toLowerCase()) &&
        existsSync(targetPath),
    );

  if (cppPaths.length > 0) {
    markCppChanged(input?.turn_id);
  }

  cppPaths.forEach((targetPath) => {
    runClangFormat(targetPath);
    runClangTidy(targetPath);
  });
  quitHook({ continue: true });
}

runHook(main);
