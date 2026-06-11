import assert from "node:assert/strict";
import test from "node:test";
import {
  existsSync,
  makeFixture,
  mkdirSync,
  path,
  POST_EDIT_HOOK,
  readFileSync,
  runHook,
  STOP_HOOK,
  writeExecutable,
  writeFileSync,
} from "./helpers.mjs";

test("stop skips ctest when the turn has no C++ changes", () => {
  const fixture = makeFixture();
  const ctestLog = path.join(fixture.dir, "ctest.log");
  writeExecutable(
    path.join(fixture.binDir, "ctest"),
    `#!/bin/sh\nprintf run > "${ctestLog}"\nexit 0\n`,
  );
  writeExecutable(path.join(fixture.binDir, "cmake"), "#!/bin/sh\nexit 0\n");

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
  writeExecutable(path.join(fixture.binDir, "cmake"), "#!/bin/sh\nexit 0\n");
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
