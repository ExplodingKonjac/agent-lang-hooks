import {
  accessSync,
  constants,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";

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
  return findNearestPythonProjectRoot(startDir);
}

export function currentPythonProjectRoot(input) {
  const cwd = typeof input?.cwd === "string" ? input.cwd : process.cwd();
  return findNearestPythonProjectRoot(cwd);
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

export function resolveLocalCommand(name, startDir) {
  const venvDir = findNearestVenv(startDir);
  if (!venvDir) {
    return null;
  }

  for (const binDir of venvBinDirs(venvDir)) {
    const command = findInDir(binDir, name);
    if (command) {
      return { command, env: venvEnv(venvDir) };
    }
  }

  return null;
}

function fileText(projectRoot, fileName) {
  try {
    return readFileSync(path.join(projectRoot, fileName), "utf8");
  } catch {
    return "";
  }
}

export function hasPytestAdoption(projectRoot) {
  if (existsSync(path.join(projectRoot, "pytest.ini"))) {
    return true;
  }

  if (/^\s*\[tool\.pytest(?:\.|\])/m.test(fileText(projectRoot, "pyproject.toml"))) {
    return true;
  }

  if (/^\s*\[tool:pytest\]/m.test(fileText(projectRoot, "setup.cfg"))) {
    return true;
  }

  const dependencyPattern = /(?:^|[\s"'=])pytest(?:[<>=!~\[\s]|$)/im;
  if (dependencyPattern.test(fileText(projectRoot, "pyproject.toml"))) {
    return true;
  }
  if (dependencyPattern.test(fileText(projectRoot, "setup.cfg"))) {
    return true;
  }
  if (dependencyPattern.test(fileText(projectRoot, "setup.py"))) {
    return true;
  }
  if (dependencyPattern.test(fileText(projectRoot, "Pipfile"))) {
    return true;
  }

  try {
    return readdirSync(projectRoot).some(
      (entry) =>
        /^requirements(?:[-.].*)?\.(?:txt|in)$/i.test(entry) &&
        dependencyPattern.test(fileText(projectRoot, entry)),
    );
  } catch {
    return false;
  }
}

const PYTHON_TEST_SKIP_DIRECTORIES = new Set([
  ".git",
  ".venv",
  "venv",
  ".env",
  "env",
  "build",
  "dist",
  "__pycache__",
]);

export function hasPythonTestFiles(projectRoot) {
  const root = path.resolve(projectRoot);
  const visit = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return false;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!PYTHON_TEST_SKIP_DIRECTORIES.has(entry.name) && visit(path.join(directory, entry.name))) {
          return true;
        }
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".py")) {
        continue;
      }
      if (entry.name.startsWith("test") || entry.name.endsWith("_test.py")) {
        return true;
      }
    }

    return false;
  };

  return visit(root);
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
