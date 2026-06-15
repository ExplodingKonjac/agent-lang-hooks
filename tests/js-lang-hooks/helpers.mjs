import { existsSync, mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  hookOutput,
  readLines,
  ROOT,
  runHook,
  writeExecutable,
  writeFailingTool,
} from "../shared/runtime.mjs";
import {
  readOptionalScalar,
  readOrderedColumn,
} from "../shared/sqlite.mjs";

export const POST_EDIT_HOOK = path.join(
  ROOT,
  "plugins/js-lang-hooks/scripts/post_edit_hook.mjs",
);
export const STOP_HOOK = path.join(
  ROOT,
  "plugins/js-lang-hooks/scripts/stop_hook.mjs",
);

export function makeFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "js-lang-hooks-"));
  const projectDir = path.join(dir, "project");
  const nestedProjectDir = path.join(dir, "nested");
  const standaloneDir = path.join(dir, "standalone");
  const binDir = path.join(dir, "bin");
  const pluginData = path.join(dir, "plugin-data");
  mkdirSync(path.join(projectDir, "src"), { recursive: true });
  mkdirSync(path.join(nestedProjectDir, "src"), { recursive: true });
  mkdirSync(path.join(standaloneDir, "files"), { recursive: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(pluginData, { recursive: true });
  writeFileSync(
    path.join(projectDir, "package.json"),
    JSON.stringify({ name: "project", version: "0.1.0" }, null, 2) + "\n",
  );
  writeFileSync(path.join(projectDir, "src/index.ts"), "export const value = 1;\n");
  writeFileSync(path.join(projectDir, "src/index.js"), "export const value = 1;\n");
  writeFileSync(path.join(projectDir, "README.md"), "# test\n");
  writeFileSync(
    path.join(nestedProjectDir, "package.json"),
    JSON.stringify({ name: "nested", version: "0.1.0" }, null, 2) + "\n",
  );
  writeFileSync(path.join(nestedProjectDir, "src/nested.ts"), "export const nested = 2;\n");
  writeFileSync(path.join(standaloneDir, "files/standalone.js"), "console.log('hi');\n");
  return {
    dir,
    projectDir,
    nestedProjectDir,
    standaloneDir,
    binDir,
    pluginData,
  };
}

export function writeToolLogger(binDir, toolName, logPath, { exitStatus = 0 } = {}) {
  writeExecutable(
    path.join(binDir, toolName),
    `#!/bin/sh\nprintf '${toolName}:%s:%s\\n' "$PWD" "$*" >> "${logPath}"\nexit ${exitStatus}\n`,
  );
}

export function writeNamedToolLogger(
  binDir,
  toolName,
  logName,
  logPath,
  { exitStatus = 0 } = {},
) {
  writeExecutable(
    path.join(binDir, toolName),
    `#!/bin/sh\nprintf '${logName}:%s:%s\\n' "$PWD" "$*" >> "${logPath}"\nexit ${exitStatus}\n`,
  );
}

export function makeNodeModulesBin(projectDir) {
  const binDir = path.join(projectDir, "node_modules", ".bin");
  mkdirSync(binDir, { recursive: true });
  return binDir;
}

export function writePackageJson(projectDir, body) {
  writeFileSync(path.join(projectDir, "package.json"), JSON.stringify(body, null, 2) + "\n");
}

export function readJsChanged(pluginData, turnId) {
  return readOptionalScalar(
    path.join(pluginData, "js-lang-hooks.sqlite3"),
    "SELECT js_changed FROM turn_file_changes WHERE turn_id = ?",
    "js_changed",
    turnId,
  );
}

export function readProjectRoots(pluginData, turnId) {
  return readOrderedColumn(
    path.join(pluginData, "js-lang-hooks.sqlite3"),
    "SELECT project_root FROM turn_js_projects WHERE turn_id = ? ORDER BY project_root",
    "project_root",
    turnId,
  );
}

export function readLintFiles(pluginData, turnId) {
  return readOrderedColumn(
    path.join(pluginData, "js-lang-hooks.sqlite3"),
    "SELECT file_path FROM turn_js_files WHERE turn_id = ? ORDER BY file_path",
    "file_path",
    turnId,
  );
}

export {
  existsSync,
  hookOutput,
  path,
  readLines,
  ROOT,
  runHook,
  unlinkSync,
  writeFailingTool,
  writeFileSync,
};
