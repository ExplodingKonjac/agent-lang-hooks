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
  "plugins/python-lang-hooks/scripts/post_edit_hook.mjs",
);
export const STOP_HOOK = path.join(
  ROOT,
  "plugins/python-lang-hooks/scripts/stop_hook.mjs",
);

export function makeFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "python-lang-hooks-"));
  const projectDir = path.join(dir, "project");
  const nestedProjectDir = path.join(dir, "nested");
  const standaloneDir = path.join(dir, "standalone");
  const binDir = path.join(dir, "bin");
  const pluginData = path.join(dir, "plugin-data");
  mkdirSync(path.join(projectDir, "pkg"), { recursive: true });
  mkdirSync(path.join(nestedProjectDir, "pkg"), { recursive: true });
  mkdirSync(standaloneDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(pluginData, { recursive: true });
  writeFileSync(path.join(projectDir, "pyproject.toml"), "[project]\nname = \"project\"\n");
  writeFileSync(path.join(projectDir, "pkg/module.py"), "def value():\n    return 1\n");
  writeFileSync(path.join(projectDir, "pkg/module.pyi"), "def value() -> int: ...\n");
  writeFileSync(path.join(projectDir, "README.md"), "# test\n");
  writeFileSync(path.join(nestedProjectDir, "setup.cfg"), "[metadata]\nname = nested\n");
  writeFileSync(path.join(nestedProjectDir, "pkg/module.py"), "def nested():\n    return 2\n");
  writeFileSync(path.join(standaloneDir, "script.py"), "print('hi')\n");
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

export function writePythonLogger(binDir, logPath, { exitStatus = 0 } = {}) {
  writeExecutable(
    path.join(binDir, "python"),
    `#!/bin/sh\nprintf 'python:%s:%s\\n' "$PWD" "$*" >> "${logPath}"\nexit ${exitStatus}\n`,
  );
}

export function makeVenv(projectDir) {
  const venvBin = path.join(projectDir, ".venv", "bin");
  mkdirSync(venvBin, { recursive: true });
  return venvBin;
}

export function readPythonChanged(pluginData, turnId) {
  return readOptionalScalar(
    path.join(pluginData, "python-lang-hooks.sqlite3"),
    "SELECT python_changed FROM turn_file_changes WHERE turn_id = ?",
    "python_changed",
    turnId,
  );
}

export function readProjectRoots(pluginData, turnId) {
  return readOrderedColumn(
    path.join(pluginData, "python-lang-hooks.sqlite3"),
    "SELECT project_root FROM turn_python_projects WHERE turn_id = ? ORDER BY project_root",
    "project_root",
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
