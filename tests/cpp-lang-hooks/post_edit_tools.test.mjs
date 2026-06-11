import assert from "node:assert/strict";
import test from "node:test";
import {
  makeFixture,
  mkdirSync,
  path,
  POST_EDIT_HOOK,
  readCppChanged,
  readFileSync,
  readLines,
  runHook,
  writeExecutable,
  writeFileSync,
} from "./helpers.mjs";

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
