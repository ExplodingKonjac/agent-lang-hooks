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

function makeFixture() {
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

test("stop skips ctest when the turn has no C++ changes", () => {
  const fixture = makeFixture();
  const ctestLog = path.join(fixture.dir, "ctest.log");
  writeExecutable(
    path.join(fixture.binDir, "ctest"),
    `#!/bin/sh\nprintf run > "${ctestLog}"\nexit 0\n`,
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
        PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH}`,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '{"continue":true}');
  assert.match(readFileSync(ctestLog, "utf8"), /--test-dir/);
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
        PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH}`,
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
  const env = {
    PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH}`,
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
