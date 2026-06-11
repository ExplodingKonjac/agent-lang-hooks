import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  collectHookFilePaths,
  commandFailureDetails,
  envEnabled,
  pythonProjectRootForPath,
  quitHook,
  resolveCommand,
  runHook,
} from "./common/hook.mjs";
import { markPythonChanged } from "./common/turn_state.mjs";

const PYTHON_CODE_EXTENSIONS = [".py", ".pyi"];
const PYTHON_CONFIG_FILENAMES = new Set([
  "pyproject.toml",
  "setup.cfg",
  "setup.py",
  "tox.ini",
  "pytest.ini",
  "unittest.cfg",
  "mypy.ini",
  "pyrightconfig.json",
  ".pylintrc",
  "ruff.toml",
  ".ruff.toml",
]);

function shouldRunFormat() {
  return envEnabled("PYTHON_HOOKS_FORMAT");
}

function pushUnique(items, item) {
  if (!items.includes(item)) {
    items.push(item);
  }
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
  const ruff = resolveCommand("ruff", projectRoot);
  if (ruff) {
    runTool(ruff, ["format", ...files], projectRoot, "ruff format");
    return;
  }

  const black = resolveCommand("black", projectRoot);
  if (black) {
    const isort = resolveCommand("isort", projectRoot);
    if (isort) {
      runTool(isort, files, projectRoot, "isort");
    }
    runTool(black, files, projectRoot, "black");
    return;
  }

  const yapf = resolveCommand("yapf", projectRoot);
  if (yapf) {
    runTool(yapf, ["-i", ...files], projectRoot, "yapf");
  }
}

function main(input) {
  const cwd = typeof input?.cwd === "string" ? input.cwd : process.cwd();
  const pythonPaths = collectHookFilePaths(input, cwd).filter((targetPath) => {
    const basename = path.basename(targetPath);
    return (
      PYTHON_CODE_EXTENSIONS.includes(path.extname(targetPath).toLowerCase()) ||
      PYTHON_CONFIG_FILENAMES.has(basename)
    );
  });

  if (pythonPaths.length === 0) {
    quitHook({ continue: true });
  }

  const projectRoots = [];
  const existingFilesByProjectRoot = new Map();

  for (const pythonPath of pythonPaths) {
    const projectRoot = pythonProjectRootForPath(pythonPath);
    pushUnique(projectRoots, projectRoot);

    const isFormatterEligible =
      PYTHON_CODE_EXTENSIONS.includes(path.extname(pythonPath).toLowerCase()) &&
      !PYTHON_CONFIG_FILENAMES.has(path.basename(pythonPath));

    if (isFormatterEligible && existsSync(pythonPath)) {
      const files = existingFilesByProjectRoot.get(projectRoot) || [];
      pushUnique(files, pythonPath);
      existingFilesByProjectRoot.set(projectRoot, files);
    }
  }

  markPythonChanged(input?.turn_id, projectRoots.sort());

  if (shouldRunFormat()) {
    for (const [projectRoot, files] of [...existingFilesByProjectRoot.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      formatProject(projectRoot, files.sort());
    }
  }

  quitHook({ continue: true });
}

runHook(main);
