import assert from "node:assert/strict";
import test from "node:test";
import {
  makeFixture,
  makeNodeModulesBin,
  path,
  POST_EDIT_HOOK,
  readLines,
  runHook,
  writeNamedToolLogger,
  writeToolLogger,
  writeFileSync,
} from "./helpers.mjs";

test("formatter priority uses prettier before biome", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "prettier.log");
  writeToolLogger(fixture.binDir, "prettier", logPath);
  writeToolLogger(fixture.binDir, "biome", logPath);

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-prettier",
      tool_name: "Edit",
      tool_input: { file_path: "src/index.ts" },
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
    `prettier:${fixture.projectDir}:--write ${path.join(fixture.projectDir, "src/index.ts")}`,
  ]);
});

test("nearest node_modules bin is preferred over global PATH for formatter resolution", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "local-bin.log");
  const localBin = makeNodeModulesBin(fixture.projectDir);
  writeToolLogger(fixture.binDir, "prettier", logPath);
  writeNamedToolLogger(localBin, "prettier", "local-prettier", logPath);

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-local-bin",
      tool_name: "Edit",
      tool_input: { file_path: "src/index.ts" },
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
    `local-prettier:${fixture.projectDir}:--write ${path.join(fixture.projectDir, "src/index.ts")}`,
  ]);
});

test("multiple files in one project root are formatted once with deduped normalized paths", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "dedupe.log");
  writeToolLogger(fixture.binDir, "prettier", logPath);
  writeFileSync(
    path.join(fixture.projectDir, "src/other.js"),
    "export const other = 2;\n",
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
          "*** Update File: src/index.ts",
          "*** Update File: ./src/index.ts",
          "*** Update File: src/other.js",
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
    `prettier:${fixture.projectDir}:--write ${path.join(fixture.projectDir, "src/index.ts")} ${path.join(fixture.projectDir, "src/other.js")}`,
  ]);
});

test("standalone files format from their containing directory and do not require a project root", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "standalone.log");
  writeToolLogger(fixture.binDir, "prettier", logPath);

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.standaloneDir,
      turn_id: "turn-standalone-format",
      tool_name: "Edit",
      tool_input: { file_path: "files/standalone.js" },
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
    `prettier:${path.join(fixture.standaloneDir, "files")}:--write ${path.join(fixture.standaloneDir, "files/standalone.js")}`,
  ]);
});
