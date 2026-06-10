import { appendFileSync, existsSync, readFileSync } from "node:fs";
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

export function toolInput(input) {
  return input && typeof input === "object" ? input.tool_input || {} : {};
}

export function collectHookFilePaths(input) {
  const data = toolInput(input);
  if (input?.tool_name !== "apply_patch") {
    if (typeof data.file_path === "string") {
      return [data.file_path];
    }

    return typeof data.path === "string" ? [data.path] : [];
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

  return files;
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
