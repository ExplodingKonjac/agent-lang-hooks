import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(import.meta.dirname, "../..");
const POST_EDIT_HOOK = path.join(
  ROOT,
  "plugins/cpp-lang-hooks/scripts/post_edit_hook.mjs",
);
const STOP_HOOK = path.join(
  ROOT,
  "plugins/cpp-lang-hooks/scripts/stop_hook.mjs",
);

function makeFixture({ buildMarker = true } = {}) {
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

function writeExecutable(filePath, source) {
  writeFileSync(filePath, source);
  chmodSync(filePath, 0o755);
}

function runHook(script, input, { env = {}, cwd = ROOT } = {}) {
  return spawnSync(process.execPath, [script], {
    cwd,
    input: JSON.stringify(input),
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  });
}

function readCppChanged(pluginData, turnId) {
  const dbPath = path.join(pluginData, "cpp-lang-hooks.sqlite3");
  if (!existsSync(dbPath)) {
    return null;
  }

  const db = new DatabaseSync(dbPath);
  try {
    const row = db
      .prepare("SELECT cpp_changed FROM turn_file_changes WHERE turn_id = ?")
      .get(turnId);
    return row ? row.cpp_changed : null;
  } finally {
    db.close();
  }
}

function readLines(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }

  return readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean);
}

test("post-edit C++ file marks the turn as changed", () => {
  const fixture = makeFixture();
  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-cpp",
      tool_name: "Edit",
      tool_input: { file_path: "main.cpp" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH}`,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readCppChanged(fixture.pluginData, "turn-cpp"), 1);
});

test("post-edit non-C++ file does not mark the turn", () => {
  const fixture = makeFixture();
  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-docs",
      tool_name: "Edit",
      tool_input: { file_path: "README.md" },
    },
    { env: { PLUGIN_DATA: fixture.pluginData } },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readCppChanged(fixture.pluginData, "turn-docs"), null);
});

test("post-edit deleted C++ file marks the turn as changed", () => {
  const fixture = makeFixture();
  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-delete",
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Delete File: removed.cpp",
          "*** End Patch",
        ].join("\n"),
      },
    },
    { env: { PLUGIN_DATA: fixture.pluginData } },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readCppChanged(fixture.pluginData, "turn-delete"), 1);
});

test("post-edit renamed C++ source path marks the turn as changed", () => {
  const fixture = makeFixture();
  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-rename",
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Update File: old.cpp",
          "*** Move to: docs/old.txt",
          "*** End Patch",
        ].join("\n"),
      },
    },
    { env: { PLUGIN_DATA: fixture.pluginData } },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readCppChanged(fixture.pluginData, "turn-rename"), 1);
});

test("multiple C++ edits in one turn keep the turn marked changed", () => {
  const fixture = makeFixture();
  for (const filePath of ["main.cpp", "main.cpp"]) {
    const result = runHook(
      POST_EDIT_HOOK,
      {
        cwd: fixture.projectDir,
        turn_id: "turn-repeat",
        tool_name: "Edit",
        tool_input: { file_path: filePath },
      },
      { env: { PLUGIN_DATA: fixture.pluginData } },
    );
    assert.equal(result.status, 0, result.stderr);
  }

  assert.equal(readCppChanged(fixture.pluginData, "turn-repeat"), 1);
});

test("post-edit deduplicates normalized C++ paths before running tools", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "tools.log");
  writeExecutable(
    path.join(fixture.binDir, "clang-format"),
    `#!/bin/sh\nprintf 'format:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );
  writeExecutable(
    path.join(fixture.binDir, "clang-tidy"),
    `#!/bin/sh\nprintf 'tidy:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-dedupe",
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Update File: main.cpp",
          "*** Update File: ./main.cpp",
          "*** End Patch",
        ].join("\n"),
      },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [
    "format:-i " + path.join(fixture.projectDir, "main.cpp"),
    "tidy:" + path.join(fixture.projectDir, "main.cpp"),
  ]);
  assert.equal(readCppChanged(fixture.pluginData, "turn-dedupe"), 1);
});

test("post-edit clang-tidy uses first supported compile commands directory", () => {
  const fixture = makeFixture({ buildMarker: false });
  const tidyLog = path.join(fixture.dir, "clang-tidy.log");
  const debugBuildDir = path.join(fixture.projectDir, "cmake-build-debug");
  mkdirSync(debugBuildDir, { recursive: true });
  writeFileSync(path.join(debugBuildDir, "compile_commands.json"), "[]\n");
  writeExecutable(
    path.join(fixture.binDir, "clang-tidy"),
    `#!/bin/sh\nprintf '%s' "$*" > "${tidyLog}"\nexit 0\n`,
  );

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-tidy-debug",
      tool_name: "Edit",
      tool_input: { file_path: "main.cpp" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(tidyLog, "utf8"),
    path.join(fixture.projectDir, "main.cpp") + " -p " + debugBuildDir,
  );
});

test("post-edit formats headers but skips clang-tidy on headers by default", () => {
  const fixture = makeFixture();
  const headerPath = path.join(fixture.projectDir, "main.hpp");
  const logPath = path.join(fixture.dir, "header-tools.log");
  writeFileSync(headerPath, "#pragma once\n");
  writeExecutable(
    path.join(fixture.binDir, "clang-format"),
    `#!/bin/sh\nprintf 'format:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );
  writeExecutable(
    path.join(fixture.binDir, "clang-tidy"),
    `#!/bin/sh\nprintf 'tidy:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-header-default",
      tool_name: "Edit",
      tool_input: { file_path: "main.hpp" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), ["format:-i " + headerPath]);
  assert.equal(readCppChanged(fixture.pluginData, "turn-header-default"), 1);
});

test("post-edit tidies headers when CPP_HOOKS_TIDY_HEADERS is enabled", () => {
  const fixture = makeFixture();
  const headerPath = path.join(fixture.projectDir, "main.hpp");
  const logPath = path.join(fixture.dir, "header-tidy-tools.log");
  writeFileSync(headerPath, "#pragma once\n");
  writeExecutable(
    path.join(fixture.binDir, "clang-format"),
    `#!/bin/sh\nprintf 'format:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );
  writeExecutable(
    path.join(fixture.binDir, "clang-tidy"),
    `#!/bin/sh\nprintf 'tidy:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-header-opt-in",
      tool_name: "Edit",
      tool_input: { file_path: "main.hpp" },
    },
    {
      env: {
        CPP_HOOKS_TIDY_HEADERS: "1",
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [
    "format:-i " + headerPath,
    "tidy:" + headerPath,
  ]);
});

test("post-edit skips clang-format when CPP_HOOKS_CLANG_FORMAT is disabled", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "format-disabled-tools.log");
  writeExecutable(
    path.join(fixture.binDir, "clang-format"),
    `#!/bin/sh\nprintf 'format:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );
  writeExecutable(
    path.join(fixture.binDir, "clang-tidy"),
    `#!/bin/sh\nprintf 'tidy:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-no-format",
      tool_name: "Edit",
      tool_input: { file_path: "main.cpp" },
    },
    {
      env: {
        CPP_HOOKS_CLANG_FORMAT: "0",
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [
    "tidy:" + path.join(fixture.projectDir, "main.cpp"),
  ]);
  assert.equal(readCppChanged(fixture.pluginData, "turn-no-format"), 1);
});

test("post-edit skips clang-tidy when CPP_HOOKS_CLANG_TIDY is disabled", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "tidy-disabled-tools.log");
  writeExecutable(
    path.join(fixture.binDir, "clang-format"),
    `#!/bin/sh\nprintf 'format:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );
  writeExecutable(
    path.join(fixture.binDir, "clang-tidy"),
    `#!/bin/sh\nprintf 'tidy:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-no-tidy",
      tool_name: "Edit",
      tool_input: { file_path: "main.cpp" },
    },
    {
      env: {
        CPP_HOOKS_CLANG_TIDY: "0",
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [
    "format:-i " + path.join(fixture.projectDir, "main.cpp"),
  ]);
  assert.equal(readCppChanged(fixture.pluginData, "turn-no-tidy"), 1);
});

test("post-edit fast mode skips clang-tidy but keeps clang-format", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "fast-mode-tools.log");
  writeExecutable(
    path.join(fixture.binDir, "clang-format"),
    `#!/bin/sh\nprintf 'format:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );
  writeExecutable(
    path.join(fixture.binDir, "clang-tidy"),
    `#!/bin/sh\nprintf 'tidy:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-fast",
      tool_name: "Edit",
      tool_input: { file_path: "main.cpp" },
    },
    {
      env: {
        CPP_HOOKS_FAST: "1",
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [
    "format:-i " + path.join(fixture.projectDir, "main.cpp"),
  ]);
  assert.equal(readCppChanged(fixture.pluginData, "turn-fast"), 1);
});

test("stop skips ctest when the turn has no C++ changes", () => {
  const fixture = makeFixture();
  const ctestLog = path.join(fixture.dir, "ctest.log");
  writeExecutable(
    path.join(fixture.binDir, "ctest"),
    `#!/bin/sh\nprintf run > "${ctestLog}"\nexit 0\n`,
  );
  writeExecutable(
    path.join(fixture.binDir, "cmake"),
    "#!/bin/sh\nexit 0\n",
  );

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-skip" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH}`,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '{"continue":true}');
  assert.equal(existsSync(ctestLog), false);
});

test("stop invokes ctest when the turn has C++ changes", () => {
  const fixture = makeFixture();
  const ctestLog = path.join(fixture.dir, "ctest.log");
  writeExecutable(
    path.join(fixture.binDir, "ctest"),
    `#!/bin/sh\nprintf '%s' "$*" > "${ctestLog}"\nexit 0\n`,
  );
  const markResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-run",
      tool_name: "Edit",
      tool_input: { file_path: "main.cpp" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH}`,
      },
    },
  );
  assert.equal(markResult.status, 0, markResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-run" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '{"continue":true}');
  assert.match(readFileSync(ctestLog, "utf8"), /--test-dir/);
});

test("stop builds before ctest when build directory exists", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "build-and-test.log");
  writeExecutable(
    path.join(fixture.binDir, "cmake"),
    `#!/bin/sh\nprintf 'cmake:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );
  writeExecutable(
    path.join(fixture.binDir, "ctest"),
    `#!/bin/sh\nprintf 'ctest:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );
  const markResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-build",
      tool_name: "Edit",
      tool_input: { file_path: "main.cpp" },
    },
    { env: { PLUGIN_DATA: fixture.pluginData } },
  );
  assert.equal(markResult.status, 0, markResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-build" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(logPath, "utf8").trim().split("\n"), [
    "cmake:--build build",
    "ctest:--test-dir " + path.join(fixture.projectDir, "build") + " --output-on-failure",
  ]);
});

test("stop skips cmake and ctest when CPP_HOOKS_CTEST is disabled", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "ctest-disabled.log");
  writeExecutable(
    path.join(fixture.binDir, "cmake"),
    `#!/bin/sh\nprintf 'cmake:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );
  writeExecutable(
    path.join(fixture.binDir, "ctest"),
    `#!/bin/sh\nprintf 'ctest:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );
  const markResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-ctest-disabled",
      tool_name: "Edit",
      tool_input: { file_path: "main.cpp" },
    },
    { env: { PLUGIN_DATA: fixture.pluginData } },
  );
  assert.equal(markResult.status, 0, markResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-ctest-disabled" },
    {
      env: {
        CPP_HOOKS_CTEST: "0",
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '{"continue":true}');
  assert.equal(existsSync(logPath), false);
});

test("stop fast mode skips cmake and ctest", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "stop-fast.log");
  writeExecutable(
    path.join(fixture.binDir, "cmake"),
    `#!/bin/sh\nprintf 'cmake:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );
  writeExecutable(
    path.join(fixture.binDir, "ctest"),
    `#!/bin/sh\nprintf 'ctest:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );
  const markResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-stop-fast",
      tool_name: "Edit",
      tool_input: { file_path: "main.cpp" },
    },
    { env: { PLUGIN_DATA: fixture.pluginData } },
  );
  assert.equal(markResult.status, 0, markResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-stop-fast" },
    {
      env: {
        CPP_HOOKS_FAST: "1",
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '{"continue":true}');
  assert.equal(existsSync(logPath), false);
});

test("stop uses first supported build directory", () => {
  const fixture = makeFixture({ buildMarker: false });
  const logPath = path.join(fixture.dir, "debug-build-and-test.log");
  const debugBuildDir = path.join(fixture.projectDir, "cmake-build-debug");
  mkdirSync(debugBuildDir, { recursive: true });
  writeFileSync(path.join(debugBuildDir, "CMakeCache.txt"), "# cache\n");
  writeExecutable(
    path.join(fixture.binDir, "cmake"),
    `#!/bin/sh\nprintf 'cmake:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );
  writeExecutable(
    path.join(fixture.binDir, "ctest"),
    `#!/bin/sh\nprintf 'ctest:%s\\n' "$*" >> "${logPath}"\nexit 0\n`,
  );
  const markResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-debug-build",
      tool_name: "Edit",
      tool_input: { file_path: "main.cpp" },
    },
    { env: { PLUGIN_DATA: fixture.pluginData } },
  );
  assert.equal(markResult.status, 0, markResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-debug-build" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(logPath, "utf8").trim().split("\n"), [
    "cmake:--build cmake-build-debug",
    "ctest:--test-dir " + debugBuildDir + " --output-on-failure",
  ]);
});

test("missing cmake does not prevent ctest", () => {
  const fixture = makeFixture();
  const ctestLog = path.join(fixture.dir, "ctest.log");
  writeExecutable(
    path.join(fixture.binDir, "ctest"),
    `#!/bin/sh\nprintf run > "${ctestLog}"\nexit 0\n`,
  );
  const markResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-no-cmake",
      tool_name: "Edit",
      tool_input: { file_path: "main.cpp" },
    },
    { env: { PLUGIN_DATA: fixture.pluginData } },
  );
  assert.equal(markResult.status, 0, markResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-no-cmake" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '{"continue":true}');
  assert.equal(readFileSync(ctestLog, "utf8"), "run");
});

test("stop without turn_id preserves current ctest behavior", () => {
  const fixture = makeFixture();
  const ctestLog = path.join(fixture.dir, "ctest.log");
  writeExecutable(
    path.join(fixture.binDir, "ctest"),
    `#!/bin/sh\nprintf run > "${ctestLog}"\nexit 0\n`,
  );

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '{"continue":true}');
  assert.equal(readFileSync(ctestLog, "utf8"), "run");
});

test("missing PLUGIN_DATA does not crash hooks", () => {
  const fixture = makeFixture();
  const ctestLog = path.join(fixture.dir, "ctest.log");
  writeExecutable(
    path.join(fixture.binDir, "ctest"),
    `#!/bin/sh\nprintf run > "${ctestLog}"\nexit 0\n`,
  );
  writeExecutable(
    path.join(fixture.binDir, "cmake"),
    "#!/bin/sh\nexit 0\n",
  );
  const env = {
    PATH: fixture.binDir,
    PLUGIN_DATA: "",
  };

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-no-data",
      tool_name: "Edit",
      tool_input: { file_path: "main.cpp" },
    },
    { env },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const stopResult = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-no-data" },
    { env },
  );
  assert.equal(stopResult.status, 0, stopResult.stderr);
  assert.equal(readFileSync(ctestLog, "utf8"), "run");
});
