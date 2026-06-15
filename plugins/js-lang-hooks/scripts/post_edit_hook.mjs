import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  collectHookFilePaths,
  envEnabled,
  quitHook,
  runHook,
} from "./common/hook.mjs";
import { commandFailureDetails } from "./common/command_failure.mjs";
import {
  formatRootForPath,
  nodeProjectRootForPath,
  resolveCommand,
} from "./common/node_runtime.mjs";
import { markJsChanged } from "./common/turn_state.mjs";

const JS_CODE_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
]);
const JS_CONFIG_FILENAMES = new Set([
  "package.json",
  "tsconfig.json",
  "jsconfig.json",
  "biome.json",
  "biome.jsonc",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cjs",
  "vite.config.ts",
  "rollup.config.js",
  "rollup.config.mjs",
  "rollup.config.cjs",
  "rollup.config.ts",
  "webpack.config.js",
  "webpack.config.mjs",
  "webpack.config.cjs",
  "webpack.config.ts",
  "tsup.config.js",
  "tsup.config.mjs",
  "tsup.config.cjs",
  "tsup.config.ts",
  "babel.config.js",
  "babel.config.mjs",
  "babel.config.cjs",
  "babel.config.ts",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  "prettier.config.js",
  "prettier.config.mjs",
  "prettier.config.cjs",
  "prettier.config.ts",
  "vitest.config.js",
  "vitest.config.mjs",
  "vitest.config.cjs",
  "vitest.config.ts",
  "jest.config.js",
  "jest.config.mjs",
  "jest.config.cjs",
  "jest.config.ts",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
]);

function shouldRunFormat() {
  return envEnabled("JS_HOOKS_FORMAT");
}

function pushUnique(items, item) {
  if (!items.includes(item)) {
    items.push(item);
  }
}

function isJsCodePath(targetPath) {
  return JS_CODE_EXTENSIONS.has(path.extname(targetPath).toLowerCase());
}

function isJsConfigPath(targetPath) {
  const basename = path.basename(targetPath);
  return (
    JS_CONFIG_FILENAMES.has(basename) ||
    basename.startsWith("tsconfig.") ||
    basename.startsWith(".babelrc") ||
    basename.startsWith(".eslintrc") ||
    basename.startsWith(".prettierrc")
  );
}

function isJsTrackedPath(targetPath) {
  return isJsCodePath(targetPath) || isJsConfigPath(targetPath);
}

function runTool(resolved, args, projectRoot, label) {
  const result = spawnSync(resolved.command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: resolved.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error?.code === "ENOENT") {
    return;
  }

  if (result.error || result.status !== 0) {
    quitHook({
      decision: "block",
      reason: `${label} in ${projectRoot} failed: ${commandFailureDetails(result)}`,
    });
  }
}

function formatProject(projectRoot, files) {
  const prettier = resolveCommand("prettier", projectRoot);
  if (prettier) {
    runTool(prettier, ["--write", ...files], projectRoot, "prettier --write");
    return;
  }

  const biome = resolveCommand("biome", projectRoot);
  if (biome) {
    runTool(
      biome,
      ["format", "--write", ...files],
      projectRoot,
      "biome format --write",
    );
  }
}

function main(input) {
  const cwd = typeof input?.cwd === "string" ? input.cwd : process.cwd();
  const jsPaths = collectHookFilePaths(input, cwd).filter(isJsTrackedPath);

  if (jsPaths.length === 0) {
    quitHook({ continue: true });
  }

  const projectRoots = [];
  const lintFiles = [];
  const existingFilesByFormatRoot = new Map();

  for (const jsPath of jsPaths) {
    const projectRoot = nodeProjectRootForPath(jsPath);
    if (projectRoot) {
      pushUnique(projectRoots, projectRoot);
    }

    if (isJsCodePath(jsPath) && existsSync(jsPath)) {
      pushUnique(lintFiles, jsPath);
      const formatRoot = formatRootForPath(jsPath);
      const files = existingFilesByFormatRoot.get(formatRoot) || [];
      pushUnique(files, jsPath);
      existingFilesByFormatRoot.set(formatRoot, files);
    }
  }

  markJsChanged(input?.turn_id, projectRoots.sort(), lintFiles.sort());

  if (shouldRunFormat()) {
    for (const [formatRoot, files] of [...existingFilesByFormatRoot.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      formatProject(formatRoot, files.sort());
    }
  }

  quitHook({ continue: true });
}

runHook(main);
