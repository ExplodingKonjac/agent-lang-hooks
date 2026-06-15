import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const PROJECT_MARKERS = [
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
];
const PACKAGE_MANAGER_LOCKFILES = [
  ["pnpm", "pnpm-lock.yaml"],
  ["yarn", "yarn.lock"],
  ["bun", "bun.lock"],
  ["bun", "bun.lockb"],
  ["npm", "package-lock.json"],
  ["npm", "npm-shrinkwrap.json"],
];
const projectRootCache = new Map();
const packageJsonCache = new Map();
const packageManagerCache = new Map();
const scriptCache = new Map();
const tsConfigCache = new Map();
const tsConfigErrorCache = new Map();
const localBinCache = new Map();
const pathCommandCache = new Map();
const resolvedCommandCache = new Map();

function parseJsonc(text) {
  let result = "";
  let inString = false;
  let stringQuote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
        result += char;
      }
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === stringQuote) {
        inString = false;
        stringQuote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      inString = true;
      stringQuote = char;
      result += char;
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }

    result += char;
  }

  return result.replace(/,\s*([}\]])/g, "$1");
}

function fileExists(filePath) {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function executableExists(filePath) {
  return fileExists(filePath);
}

function commandNames(name) {
  return process.platform === "win32"
    ? [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`]
    : [name];
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

function hasProjectMarker(dir) {
  for (const marker of PROJECT_MARKERS) {
    if (existsSync(path.join(dir, marker))) {
      return true;
    }
  }

  try {
    return readdirSync(dir).some(
      (entry) =>
        entry === "tsconfig.json" ||
        entry === "jsconfig.json" ||
        entry.startsWith("tsconfig.") ||
        entry.startsWith(".babelrc") ||
        entry.startsWith(".eslintrc") ||
        entry.startsWith(".prettierrc"),
    );
  } catch {
    return false;
  }
}

function packageJsonPath(projectRoot) {
  return path.join(projectRoot, "package.json");
}

function packageJsonData(projectRoot) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  if (packageJsonCache.has(resolvedProjectRoot)) {
    return packageJsonCache.get(resolvedProjectRoot);
  }

  const targetPath = packageJsonPath(resolvedProjectRoot);
  if (!fileExists(targetPath)) {
    const state = { data: null, error: null };
    packageJsonCache.set(resolvedProjectRoot, state);
    return state;
  }

  try {
    const state = {
      data: JSON.parse(readFileSync(targetPath, "utf8")),
      error: null,
    };
    packageJsonCache.set(resolvedProjectRoot, state);
    return state;
  } catch (error) {
    const state = {
      data: null,
      error:
        error instanceof Error
          ? `invalid package.json: ${error.message}`
          : "invalid package.json",
    };
    packageJsonCache.set(resolvedProjectRoot, state);
    return state;
  }
}

export function packageJsonError(projectRoot) {
  return packageJsonData(projectRoot).error;
}

function tsConfigCandidates(projectRoot) {
  try {
    return readdirSync(projectRoot)
      .filter((entry) => entry === "jsconfig.json" || entry.startsWith("tsconfig."))
      .sort((left, right) => {
        if (left === "tsconfig.json") {
          return -1;
        }
        if (right === "tsconfig.json") {
          return 1;
        }
        if (left === "jsconfig.json") {
          return 1;
        }
        if (right === "jsconfig.json") {
          return -1;
        }
        return left.localeCompare(right);
      });
  } catch {
    return [];
  }
}

export function tsConfigError(projectRoot) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  if (tsConfigErrorCache.has(resolvedProjectRoot)) {
    return tsConfigErrorCache.get(resolvedProjectRoot);
  }

  for (const candidate of tsConfigCandidates(resolvedProjectRoot)) {
    const candidatePath = path.join(resolvedProjectRoot, candidate);
    if (!fileExists(candidatePath)) {
      continue;
    }

    try {
      JSON.parse(parseJsonc(readFileSync(candidatePath, "utf8")));
    } catch (error) {
      const message =
        error instanceof Error
          ? `invalid ${candidate}: ${error.message}`
          : `invalid ${candidate}`;
      tsConfigErrorCache.set(resolvedProjectRoot, message);
      return message;
    }
  }

  tsConfigErrorCache.set(resolvedProjectRoot, null);
  return null;
}

function normalizePackageManager(packageManager) {
  if (typeof packageManager !== "string" || packageManager.length === 0) {
    return null;
  }

  const [name] = packageManager.split("@");
  return name || null;
}

export function findNearestNodeProjectRoot(startDir) {
  const resolvedStartDir = path.resolve(startDir);
  if (projectRootCache.has(resolvedStartDir)) {
    return projectRootCache.get(resolvedStartDir);
  }

  let currentDir = resolvedStartDir;

  while (true) {
    if (hasProjectMarker(currentDir)) {
      projectRootCache.set(resolvedStartDir, currentDir);
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      projectRootCache.set(resolvedStartDir, null);
      return null;
    }
    currentDir = parentDir;
  }
}

export function nodeProjectRootForPath(targetPath) {
  return findNearestNodeProjectRoot(path.dirname(targetPath));
}

export function currentNodeProjectRoot(input) {
  const cwd = typeof input?.cwd === "string" ? input.cwd : process.cwd();
  return findNearestNodeProjectRoot(cwd);
}

export function formatRootForPath(targetPath) {
  return nodeProjectRootForPath(targetPath) || path.dirname(targetPath);
}

function findNearestLocalBin(startDir) {
  const resolvedStartDir = path.resolve(startDir);
  if (localBinCache.has(resolvedStartDir)) {
    return localBinCache.get(resolvedStartDir);
  }

  let currentDir = resolvedStartDir;

  while (true) {
    const candidate = path.join(currentDir, "node_modules", ".bin");
    if (existsSync(candidate)) {
      localBinCache.set(resolvedStartDir, candidate);
      return candidate;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      localBinCache.set(resolvedStartDir, null);
      return null;
    }
    currentDir = parentDir;
  }
}

export function resolveCommand(name, startDir) {
  const resolvedStartDir = path.resolve(startDir);
  const cacheKey = `${name}\0${resolvedStartDir}`;
  if (resolvedCommandCache.has(cacheKey)) {
    return resolvedCommandCache.get(cacheKey);
  }

  const localBin = findNearestLocalBin(startDir);
  if (localBin) {
    const command = findInDir(localBin, name);
    if (command) {
      const resolved = { command, env: process.env };
      resolvedCommandCache.set(cacheKey, resolved);
      return resolved;
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

export function packageManagerForProject(projectRoot) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  if (packageManagerCache.has(resolvedProjectRoot)) {
    return packageManagerCache.get(resolvedProjectRoot);
  }

  const packageJson = packageJsonData(resolvedProjectRoot);
  const declared = normalizePackageManager(packageJson.data?.packageManager);
  if (declared) {
    packageManagerCache.set(resolvedProjectRoot, declared);
    return declared;
  }

  for (const [manager, lockfile] of PACKAGE_MANAGER_LOCKFILES) {
    if (fileExists(path.join(resolvedProjectRoot, lockfile))) {
      packageManagerCache.set(resolvedProjectRoot, manager);
      return manager;
    }
  }

  packageManagerCache.set(resolvedProjectRoot, "npm");
  return "npm";
}

export function hasPackageScript(projectRoot, scriptName) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const cacheKey = `${resolvedProjectRoot}\0${scriptName}`;
  if (scriptCache.has(cacheKey)) {
    return scriptCache.get(cacheKey);
  }

  const packageJson = packageJsonData(resolvedProjectRoot);
  const hasScript = typeof packageJson.data?.scripts?.[scriptName] === "string";
  scriptCache.set(cacheKey, hasScript);
  return hasScript;
}

export function resolvePackageScript(scriptName, projectRoot) {
  if (!hasPackageScript(projectRoot, scriptName)) {
    return null;
  }

  const manager = packageManagerForProject(projectRoot);
  const resolved = resolveCommand(manager, projectRoot);
  if (!resolved) {
    return null;
  }

  const commandSpec =
    manager === "yarn"
      ? {
          name: `yarn ${scriptName}`,
          args: [scriptName],
        }
      : {
          name: `${manager} run ${scriptName}`,
          args: ["run", scriptName],
        };

  return {
    ...resolved,
    name: commandSpec.name,
    args: commandSpec.args,
  };
}

export function hasTypeScriptConfig(projectRoot) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  if (tsConfigCache.has(resolvedProjectRoot)) {
    return tsConfigCache.get(resolvedProjectRoot);
  }

  try {
    const hasConfig = tsConfigCandidates(resolvedProjectRoot).some(
      (entry) => entry === "tsconfig.json" || entry.startsWith("tsconfig."),
    );
    tsConfigCache.set(resolvedProjectRoot, hasConfig);
    return hasConfig;
  } catch {
    tsConfigCache.set(resolvedProjectRoot, false);
    return false;
  }
}
