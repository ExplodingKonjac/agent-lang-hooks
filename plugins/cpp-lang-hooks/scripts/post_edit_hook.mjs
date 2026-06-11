import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  collectHookFilePaths,
  runHook,
  quitHook,
  findUp,
  envFlag,
  envEnabled,
} from "./common/hook.mjs";
import { findCMakeBuildDir } from "./common/cmake.mjs";
import { markCppChanged } from "./common/turn_state.mjs";
import path from "node:path";

const CPP_SOURCE_EXTENSIONS = [
  ".c",
  ".cc",
  ".cpp",
  ".cxx",
];
const CPP_HEADER_EXTENSIONS = [
  ".h",
  ".hh",
  ".hpp",
];
const CPP_EXTENSIONS = [
  ...CPP_SOURCE_EXTENSIONS,
  ...CPP_HEADER_EXTENSIONS,
];
const projectDirCache = new Map();
const buildDirCache = new Map();
const compileCommandsCache = new Map();

function getProjectDir(targetPath) {
  const sourceDir = path.dirname(targetPath);
  if (projectDirCache.has(sourceDir)) {
    return projectDirCache.get(sourceDir);
  }

  const cmakeFile = findUp(sourceDir, "CMakeLists.txt");
  const projectDir = cmakeFile ? path.dirname(cmakeFile) : sourceDir;
  projectDirCache.set(sourceDir, projectDir);
  return projectDir;
}

function getBuildDir(projectDir) {
  if (buildDirCache.has(projectDir)) {
    return buildDirCache.get(projectDir);
  }

  const buildDir = findCMakeBuildDir(projectDir);
  buildDirCache.set(projectDir, buildDir);
  return buildDir;
}

function hasCompileCommands(buildDir) {
  if (!buildDir) {
    return false;
  }

  if (compileCommandsCache.has(buildDir)) {
    return compileCommandsCache.get(buildDir);
  }

  const found = existsSync(path.join(buildDir, "compile_commands.json"));
  compileCommandsCache.set(buildDir, found);
  return found;
}

function shouldRunClangFormat() {
  return envEnabled("CPP_HOOKS_CLANG_FORMAT");
}

function shouldRunClangTidy() {
  return !envFlag("CPP_HOOKS_FAST") && envEnabled("CPP_HOOKS_CLANG_TIDY");
}

function shouldTidyPath(targetPath) {
  const extension = path.extname(targetPath).toLowerCase();
  return (
    CPP_SOURCE_EXTENSIONS.includes(extension) ||
    (CPP_HEADER_EXTENSIONS.includes(extension) &&
      envFlag("CPP_HOOKS_TIDY_HEADERS"))
  );
}

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
  const projectDir = getProjectDir(targetPath);
  const buildDir = getBuildDir(projectDir);
  const tidyArgs = hasCompileCommands(buildDir)
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
  const cppPaths = collectHookFilePaths(input, cwd).filter((targetPath) =>
    CPP_EXTENSIONS.includes(path.extname(targetPath).toLowerCase()),
  );

  if (cppPaths.length > 0) {
    markCppChanged(input?.turn_id);
  }

  cppPaths.forEach((targetPath) => {
    if (existsSync(targetPath)) {
      if (shouldRunClangFormat()) {
        runClangFormat(targetPath);
      }

      if (shouldRunClangTidy() && shouldTidyPath(targetPath)) {
        runClangTidy(targetPath);
      }
    }
  });
  quitHook({ continue: true });
}

runHook(main);
