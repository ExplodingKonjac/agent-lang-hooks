import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ROOT,
  readLines,
  runHook,
  writeExecutable,
} from "../shared/runtime.mjs";
import { readOptionalScalar } from "../shared/sqlite.mjs";

export const POST_EDIT_HOOK = path.join(
  ROOT,
  "plugins/cpp-lang-hooks/scripts/post_edit_hook.mjs",
);
export const STOP_HOOK = path.join(
  ROOT,
  "plugins/cpp-lang-hooks/scripts/stop_hook.mjs",
);

export function makeFixture({ buildMarker = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "cpp-lang-hooks-"));
  const projectDir = path.join(dir, "project");
  const buildDir = path.join(projectDir, "build");
  const binDir = path.join(dir, "bin");
  const pluginData = path.join(dir, "plugin-data");
  mkdirSync(buildDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(pluginData, { recursive: true });
  writeFileSync(
    path.join(projectDir, "CMakeLists.txt"),
    "cmake_minimum_required(VERSION 3.16)\n",
  );
  writeFileSync(path.join(projectDir, "main.cpp"), "int main(){return 0;}\n");
  writeFileSync(path.join(projectDir, "README.md"), "# test\n");
  if (buildMarker) {
    writeFileSync(path.join(buildDir, "CTestTestfile.cmake"), "# tests\n");
  }
  return { dir, projectDir, binDir, pluginData };
}

export function readCppChanged(pluginData, turnId) {
  return readOptionalScalar(
    path.join(pluginData, "cpp-lang-hooks.sqlite3"),
    "SELECT cpp_changed FROM turn_file_changes WHERE turn_id = ?",
    "cpp_changed",
    turnId,
  );
}

export {
  existsSync,
  mkdirSync,
  path,
  readLines,
  readFileSync,
  ROOT,
  runHook,
  writeExecutable,
  writeFileSync,
};
