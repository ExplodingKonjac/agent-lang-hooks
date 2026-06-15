import assert from "node:assert/strict";
import test from "node:test";
import {
  hookOutput,
  makeFixture,
  path,
  POST_EDIT_HOOK,
  readLintFiles,
  readLines,
  runHook,
  STOP_HOOK,
  writePackageJson,
  writeToolLogger,
  writeFileSync,
} from "./helpers.mjs";

test("Stop runs package scripts before direct tool fallbacks for touched projects", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "scripts.log");
  writePackageJson(fixture.projectDir, {
    name: "project",
    version: "0.1.0",
    scripts: {
      typecheck: "tsc --noEmit",
      lint: "eslint .",
      test: "vitest run",
    },
  });
  writeToolLogger(fixture.binDir, "npm", logPath);
  writeToolLogger(fixture.binDir, "eslint", logPath);
  writeToolLogger(fixture.binDir, "vitest", logPath);
  writeToolLogger(fixture.binDir, "tsc", logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-scripts",
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
  assert.equal(postResult.status, 0, postResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-scripts" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [
    `npm:${fixture.projectDir}:run typecheck`,
    `npm:${fixture.projectDir}:run lint`,
    `npm:${fixture.projectDir}:run test`,
  ]);
});

test("Stop uses manager-specific package-script invocation for yarn and bun projects", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "manager-specific.log");
  writePackageJson(fixture.projectDir, {
    name: "project",
    version: "0.1.0",
    packageManager: "yarn@4.0.0",
    scripts: {
      lint: "eslint .",
    },
  });
  writePackageJson(fixture.nestedProjectDir, {
    name: "nested",
    version: "0.1.0",
    scripts: {
      test: "vitest run",
    },
  });
  writeFileSync(path.join(fixture.nestedProjectDir, "bun.lock"), "");
  writeToolLogger(fixture.binDir, "yarn", logPath);
  writeToolLogger(fixture.binDir, "bun", logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.dir,
      turn_id: "turn-manager-specific",
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Update File: project/src/index.js",
          "*** Update File: nested/src/nested.ts",
          "*** End Patch",
        ].join("\n"),
      },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_FORMAT: "0",
        JS_HOOKS_TYPECHECK: "0",
      },
    },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.dir, turn_id: "turn-manager-specific" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_TYPECHECK: "0",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [
    `bun:${fixture.nestedProjectDir}:run test`,
    `yarn:${fixture.projectDir}:lint`,
  ]);
});

test("Stop uses tsc only for TypeScript roots and direct lint/test fallbacks otherwise", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "fallback.log");
  writeFileSync(path.join(fixture.projectDir, "tsconfig.json"), "{ }\n");
  writeToolLogger(fixture.binDir, "tsc", logPath);
  writeToolLogger(fixture.binDir, "eslint", logPath);
  writeToolLogger(fixture.binDir, "vitest", logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.dir,
      turn_id: "turn-fallbacks",
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Update File: project/src/index.ts",
          "*** Update File: nested/src/nested.ts",
          "*** End Patch",
        ].join("\n"),
      },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_FORMAT: "0",
      },
    },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.dir, turn_id: "turn-fallbacks" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [
    `eslint:${fixture.nestedProjectDir}:${path.join(fixture.nestedProjectDir, "src/nested.ts")}`,
    `vitest:${fixture.nestedProjectDir}:run`,
    `tsc:${fixture.projectDir}:--noEmit`,
    `eslint:${fixture.projectDir}:${path.join(fixture.projectDir, "src/index.ts")}`,
    `vitest:${fixture.projectDir}:run`,
  ]);
  assert.deepEqual(readLintFiles(fixture.pluginData, "turn-fallbacks"), [
    path.join(fixture.nestedProjectDir, "src/nested.ts"),
    path.join(fixture.projectDir, "src/index.ts"),
  ]);
});

test("fast mode and per-category flags disable expected checks", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "flags.log");
  writeToolLogger(fixture.binDir, "prettier", logPath);
  writeToolLogger(fixture.binDir, "eslint", logPath);
  writeToolLogger(fixture.binDir, "vitest", logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-flags",
      tool_name: "Edit",
      tool_input: { file_path: "src/index.ts" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_FAST: "1",
      },
    },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const stopResult = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-flags" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_FAST: "1",
      },
    },
  );

  assert.equal(stopResult.status, 0, stopResult.stderr);
  assert.deepEqual(readLines(logPath), [
    `prettier:${fixture.projectDir}:--write ${path.join(fixture.projectDir, "src/index.ts")}`,
  ]);
});

test("missing PLUGIN_DATA fails open to the current Node project root", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "fail-open.log");
  writeFileSync(path.join(fixture.projectDir, "tsconfig.json"), "{ }\n");
  writeToolLogger(fixture.binDir, "tsc", logPath);
  writeToolLogger(fixture.binDir, "eslint", logPath);
  writeToolLogger(fixture.binDir, "vitest", logPath);

  const result = runHook(
    STOP_HOOK,
    { cwd: path.join(fixture.projectDir, "src"), turn_id: "turn-no-data" },
    {
      env: {
        PLUGIN_DATA: "",
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [
    `tsc:${fixture.projectDir}:--noEmit`,
    `vitest:${fixture.projectDir}:run`,
  ]);
});

test("config-only turns skip direct-tool lint fallback when no package lint script exists", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "config-only.log");
  writeToolLogger(fixture.binDir, "eslint", logPath);
  writeToolLogger(fixture.binDir, "vitest", logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-config-only",
      tool_name: "Edit",
      tool_input: { file_path: "package.json" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_FORMAT: "0",
        JS_HOOKS_TYPECHECK: "0",
      },
    },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-config-only" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_TYPECHECK: "0",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [`vitest:${fixture.projectDir}:run`]);
  assert.deepEqual(readLintFiles(fixture.pluginData, "turn-config-only"), []);
});

test("standalone-only turns skip Stop checks", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "standalone.log");
  writeToolLogger(fixture.binDir, "prettier", logPath);
  writeToolLogger(fixture.binDir, "eslint", logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.standaloneDir,
      turn_id: "turn-standalone",
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
  assert.equal(postResult.status, 0, postResult.stderr);

  const stopResult = runHook(
    STOP_HOOK,
    { cwd: fixture.standaloneDir, turn_id: "turn-standalone" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(stopResult.status, 0, stopResult.stderr);
  assert.deepEqual(hookOutput(stopResult), { continue: true });
  assert.deepEqual(readLines(logPath), [
    `prettier:${path.join(fixture.standaloneDir, "files")}:--write ${path.join(fixture.standaloneDir, "files/standalone.js")}`,
  ]);
});

test("invalid package.json blocks Stop instead of silently skipping package scripts", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "invalid-package.log");
  writeFileSync(path.join(fixture.projectDir, "package.json"), "{\n");
  writeToolLogger(fixture.binDir, "eslint", logPath);
  writeToolLogger(fixture.binDir, "vitest", logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-invalid-package",
      tool_name: "Edit",
      tool_input: { file_path: "src/index.js" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_FORMAT: "0",
        JS_HOOKS_TYPECHECK: "0",
      },
    },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-invalid-package" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_TYPECHECK: "0",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    hookOutput(result).reason,
    /package\.json .*failed: invalid package\.json:/,
  );
  assert.deepEqual(readLines(logPath), []);
});

test("invalid tsconfig.json blocks Stop before commands run", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "invalid-tsconfig.log");
  writeFileSync(path.join(fixture.projectDir, "tsconfig.json"), "{\n");
  writeToolLogger(fixture.binDir, "tsc", logPath);
  writeToolLogger(fixture.binDir, "eslint", logPath);
  writeToolLogger(fixture.binDir, "vitest", logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-invalid-tsconfig",
      tool_name: "Edit",
      tool_input: { file_path: "src/index.ts" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_FORMAT: "0",
      },
    },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-invalid-tsconfig" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(hookOutput(result).reason, /tsconfig .*failed: invalid tsconfig\.json:/);
  assert.deepEqual(readLines(logPath), []);
});

test("invalid tsconfig variant blocks Stop before commands run", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "invalid-tsconfig-variant.log");
  writeFileSync(path.join(fixture.projectDir, "tsconfig.build.json"), "{\n");
  writeToolLogger(fixture.binDir, "eslint", logPath);
  writeToolLogger(fixture.binDir, "vitest", logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-invalid-tsconfig-variant",
      tool_name: "Edit",
      tool_input: { file_path: "src/index.js" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_FORMAT: "0",
        JS_HOOKS_TYPECHECK: "0",
      },
    },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-invalid-tsconfig-variant" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_TYPECHECK: "0",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    hookOutput(result).reason,
    /tsconfig .*failed: invalid tsconfig\.build\.json:/,
  );
  assert.deepEqual(readLines(logPath), []);
});

test("invalid jsconfig.json blocks Stop before commands run", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "invalid-jsconfig.log");
  writeFileSync(path.join(fixture.projectDir, "jsconfig.json"), "{\n");
  writeToolLogger(fixture.binDir, "eslint", logPath);
  writeToolLogger(fixture.binDir, "vitest", logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-invalid-jsconfig",
      tool_name: "Edit",
      tool_input: { file_path: "src/index.js" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_FORMAT: "0",
        JS_HOOKS_TYPECHECK: "0",
      },
    },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-invalid-jsconfig" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_TYPECHECK: "0",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(hookOutput(result).reason, /tsconfig .*failed: invalid jsconfig\.json:/);
  assert.deepEqual(readLines(logPath), []);
});
