import {
  accessSync,
  appendFileSync,
  constants,
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";

const PATCH_PATH_PATTERN =
  /^\*\*\* (Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/;

export function envFlag(name) {
  return process.env[name] === "1";
}

export function envEnabled(name, defaultValue = true) {
  if (process.env[name] === "0") {
    return false;
  }

  if (process.env[name] === "1") {
    return true;
  }

  return defaultValue;
}

export function envInt(name, defaultValue) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : defaultValue;
}

export function toolInput(input) {
  return input && typeof input === "object" ? input.tool_input || {} : {};
}

function dedupePaths(paths) {
  return [...new Set(paths)];
}

function normalizeHookPath(targetPath, cwd) {
  return path.isAbsolute(targetPath)
    ? path.normalize(targetPath)
    : path.resolve(cwd, targetPath);
}

export function collectHookFilePaths(input, cwd = process.cwd()) {
  const data = toolInput(input);
  if (input?.tool_name !== "apply_patch") {
    if (typeof data.file_path === "string") {
      return dedupePaths([normalizeHookPath(data.file_path, cwd)]);
    }

    return typeof data.path === "string"
      ? dedupePaths([normalizeHookPath(data.path, cwd)])
      : [];
  }

  if (typeof data.command !== "string") {
    return [];
  }

  const seen = new Set();
  const files = [];
  let updatedFileIndex = -1;

  for (const line of data.command.split(/\r?\n/)) {
    const match = line.match(PATCH_PATH_PATTERN);
    if (!match) {
      continue;
    }

    const [, action, filePath, movedPath] = match;

    if (movedPath) {
      if (updatedFileIndex >= 0 && !seen.has(movedPath)) {
        seen.add(movedPath);
        files.push(movedPath);
      }
      continue;
    }

    if (!filePath || seen.has(filePath)) {
      updatedFileIndex = action === "Update" ? files.length : -1;
      continue;
    }

    seen.add(filePath);
    files.push(filePath);
    updatedFileIndex = action === "Update" ? files.length - 1 : -1;
  }

  return dedupePaths(files.map((targetPath) => normalizeHookPath(targetPath, cwd)));
}

export function findUp(startDir, targetName) {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidate = path.join(currentDir, targetName);
    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

const PYTHON_PROJECT_MARKERS = [
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
];
const VENV_NAMES = [".venv", "venv", ".env", "env"];
const pythonProjectRootCache = new Map();
const venvCache = new Map();
const pathCommandCache = new Map();
const resolvedCommandCache = new Map();

function commandOutput(result) {
  const stderr = (result.stderr || "").trim();
  const stdout = (result.stdout || "").trim();

  if (stderr && stdout) {
    return `stderr:\n${stderr}\nstdout:\n${stdout}`;
  }

  return stderr || stdout;
}

export function commandFailureDetails(
  result,
  {
    outputLimitEnv = "PYTHON_HOOKS_OUTPUT_MAX_CHARS",
    defaultOutputLimit = 4000,
  } = {},
) {
  if (result.error?.message) {
    return result.error.message;
  }

  const output = commandOutput(result);
  if (!output) {
    return `exit ${result.status}`;
  }

  const limit = envInt(outputLimitEnv, defaultOutputLimit);
  if (output.length <= limit) {
    return output;
  }

  return `[output trimmed to last ${limit} chars]\n${output.slice(-limit)}`;
}

function executableExists(filePath) {
  try {
    const stat = statSync(filePath);
    accessSync(filePath, constants.X_OK);
    return stat.isFile();
  } catch {
    return false;
  }
}

function commandNames(name) {
  return process.platform === "win32"
    ? [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`]
    : [name];
}

function venvBinDirs(venvDir) {
  return process.platform === "win32"
    ? [path.join(venvDir, "Scripts"), path.join(venvDir, "bin")]
    : [path.join(venvDir, "bin"), path.join(venvDir, "Scripts")];
}

function findInDir(binDir, name) {
  for (const candidateName of commandNames(name)) {
    const candidate = path.join(binDir, candidateName);
    if (executableExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function findOnPath(name) {
  if (pathCommandCache.has(name)) {
    return pathCommandCache.get(name);
  }

  for (const binDir of (process.env.PATH || "").split(path.delimiter)) {
    if (!binDir) {
      continue;
    }

    const candidate = findInDir(binDir, name);
    if (candidate) {
      pathCommandCache.set(name, candidate);
      return candidate;
    }
  }

  pathCommandCache.set(name, null);
  return null;
}

export function findNearestPythonProjectRoot(startDir) {
  const resolvedStartDir = path.resolve(startDir);
  if (pythonProjectRootCache.has(resolvedStartDir)) {
    return pythonProjectRootCache.get(resolvedStartDir);
  }

  let currentDir = resolvedStartDir;

  while (true) {
    for (const marker of PYTHON_PROJECT_MARKERS) {
      if (existsSync(path.join(currentDir, marker))) {
        pythonProjectRootCache.set(resolvedStartDir, currentDir);
        return currentDir;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      pythonProjectRootCache.set(resolvedStartDir, null);
      return null;
    }
    currentDir = parentDir;
  }
}

export function pythonProjectRootForPath(targetPath) {
  const startDir = path.dirname(targetPath);
  return findNearestPythonProjectRoot(startDir) || startDir;
}

export function currentPythonProjectRoot(input) {
  const cwd = typeof input?.cwd === "string" ? input.cwd : process.cwd();
  return findNearestPythonProjectRoot(cwd) || path.resolve(cwd);
}

export function findNearestVenv(startDir) {
  const resolvedStartDir = path.resolve(startDir);
  if (venvCache.has(resolvedStartDir)) {
    return venvCache.get(resolvedStartDir);
  }

  let currentDir = resolvedStartDir;

  while (true) {
    for (const name of VENV_NAMES) {
      const candidate = path.join(currentDir, name);
      if (existsSync(candidate)) {
        venvCache.set(resolvedStartDir, candidate);
        return candidate;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      venvCache.set(resolvedStartDir, null);
      return null;
    }
    currentDir = parentDir;
  }
}

function venvEnv(venvDir) {
  const binDirs = venvBinDirs(venvDir);
  return {
    ...process.env,
    VIRTUAL_ENV: venvDir,
    PATH: [...binDirs, process.env.PATH || ""].filter(Boolean).join(path.delimiter),
  };
}

export function resolveCommand(name, startDir) {
  const resolvedStartDir = path.resolve(startDir);
  const cacheKey = `${name}\0${resolvedStartDir}`;
  if (resolvedCommandCache.has(cacheKey)) {
    return resolvedCommandCache.get(cacheKey);
  }

  const venvDir = findNearestVenv(startDir);
  if (venvDir) {
    for (const binDir of venvBinDirs(venvDir)) {
      const command = findInDir(binDir, name);
      if (command) {
        const resolved = { command, env: venvEnv(venvDir) };
        resolvedCommandCache.set(cacheKey, resolved);
        return resolved;
      }
    }
  }

  if (findOnPath(name)) {
    const resolved = { command: name, env: process.env };
    resolvedCommandCache.set(cacheKey, resolved);
    return resolved;
  }

  resolvedCommandCache.set(cacheKey, null);
  return null;
}

export function resolveAnyCommand(names, startDir) {
  for (const name of names) {
    const resolved = resolveCommand(name, startDir);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

export function quitHook(output) {
  const result = Object.fromEntries(
    Object.entries(output).filter(
      ([_, value]) => value !== null && value !== undefined,
    ),
  );
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}

export function runHook(handler) {
  let input;

  try {
    const raw = readFileSync(0, "utf8");
    input = raw.trim() ? JSON.parse(raw) : {};
    handler(input);
  } catch (error) {
    const pluginData = process.env.PLUGIN_DATA;
    if (!pluginData) {
      return;
    }
    appendFileSync(
      path.join(pluginData, "hook_errors.log"),
      JSON.stringify({
        ts: new Date().toISOString(),
        event: input?.hook_event_name,
        tool_name: input?.tool_name,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }) + "\n",
    );
    process.exit(1);
  }
}
