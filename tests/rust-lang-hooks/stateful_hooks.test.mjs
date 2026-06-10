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
  "plugins/rust-lang-hooks/scripts/post_edit_hook.mjs",
);
const STOP_HOOK = path.join(
  ROOT,
  "plugins/rust-lang-hooks/scripts/stop_hook.mjs",
);

function makeFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "rust-lang-hooks-"));
  const projectDir = path.join(dir, "project");
  const nestedProjectDir = path.join(dir, "nested");
  const standaloneDir = path.join(dir, "standalone");
  const binDir = path.join(dir, "bin");
  const pluginData = path.join(dir, "plugin-data");
  mkdirSync(path.join(projectDir, "src"), { recursive: true });
  mkdirSync(path.join(nestedProjectDir, "src"), { recursive: true });
  mkdirSync(standaloneDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(pluginData, { recursive: true });
  writeFileSync(
    path.join(projectDir, "Cargo.toml"),
    '[package]\nname = "project"\nversion = "0.1.0"\nedition = "2021"\n',
  );
  writeFileSync(path.join(projectDir, "src/lib.rs"), "pub fn value()->u8{1}\n");
  writeFileSync(path.join(projectDir, "README.md"), "# test\n");
  writeFileSync(
    path.join(nestedProjectDir, "Cargo.toml"),
    '[package]\nname = "nested"\nversion = "0.1.0"\nedition = "2021"\n',
  );
  writeFileSync(
    path.join(nestedProjectDir, "src/lib.rs"),
    "pub fn nested()->u8{2}\n",
  );
  writeFileSync(
    path.join(standaloneDir, "main.rs"),
    'fn main(){println!("hi");}\n',
  );
  return {
    dir,
    projectDir,
    nestedProjectDir,
    standaloneDir,
    binDir,
    pluginData,
  };
}

function writeExecutable(filePath, source) {
  writeFileSync(filePath, source);
  chmodSync(filePath, 0o755);
}

function writeCargoLogger(binDir, logPath, { exitStatus = 0 } = {}) {
  writeExecutable(
    path.join(binDir, "cargo"),
    `#!/bin/sh\nprintf 'cargo:%s:%s\\n' "$PWD" "$*" >> "${logPath}"\nexit ${exitStatus}\n`,
  );
}

function writeRustfmtLogger(binDir, logPath, { exitStatus = 0 } = {}) {
  writeExecutable(
    path.join(binDir, "rustfmt"),
    `#!/bin/sh\nprintf 'rustfmt:%s\\n' "$*" >> "${logPath}"\nexit ${exitStatus}\n`,
  );
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

function readRustChanged(pluginData, turnId) {
  const dbPath = path.join(pluginData, "rust-lang-hooks.sqlite3");
  if (!existsSync(dbPath)) {
    return null;
  }

  const db = new DatabaseSync(dbPath);
  try {
    const row = db
      .prepare("SELECT rust_changed FROM turn_file_changes WHERE turn_id = ?")
      .get(turnId);
    return row ? row.rust_changed : null;
  } finally {
    db.close();
  }
}

function readCargoProjects(pluginData, turnId) {
  const dbPath = path.join(pluginData, "rust-lang-hooks.sqlite3");
  if (!existsSync(dbPath)) {
    return [];
  }

  const db = new DatabaseSync(dbPath);
  try {
    return db
      .prepare(
        "SELECT project_dir FROM turn_cargo_projects WHERE turn_id = ? ORDER BY project_dir",
      )
      .all(turnId)
      .map((row) => row.project_dir);
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

test("post-edit Rust file in Cargo project marks the turn and runs cargo fmt from the manifest directory", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "tools.log");
  writeCargoLogger(fixture.binDir, logPath);

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-cargo-rust",
      tool_name: "Edit",
      tool_input: { file_path: "src/lib.rs" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [`cargo:${fixture.projectDir}:fmt`]);
  assert.equal(readRustChanged(fixture.pluginData, "turn-cargo-rust"), 1);
  assert.deepEqual(readCargoProjects(fixture.pluginData, "turn-cargo-rust"), [
    fixture.projectDir,
  ]);
});

test("post-edit standalone Rust file marks the turn and runs rustfmt without recording Cargo checks", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "standalone.log");
  const standaloneFile = path.join(fixture.standaloneDir, "main.rs");
  writeCargoLogger(fixture.binDir, logPath);
  writeRustfmtLogger(fixture.binDir, logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.standaloneDir,
      turn_id: "turn-standalone",
      tool_name: "Edit",
      tool_input: { file_path: "main.rs" },
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
  assert.equal(stopResult.stdout, '{"continue":true}');
  assert.deepEqual(readLines(logPath), [`rustfmt:${standaloneFile}`]);
  assert.equal(readRustChanged(fixture.pluginData, "turn-standalone"), 1);
  assert.deepEqual(
    readCargoProjects(fixture.pluginData, "turn-standalone"),
    [],
  );
});

test("post-edit non-Rust file does not mark the turn", () => {
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
  assert.equal(readRustChanged(fixture.pluginData, "turn-docs"), null);
});

test("post-edit deleted Rust file marks the turn without formatting missing files", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "delete.log");
  writeCargoLogger(fixture.binDir, logPath);
  writeRustfmtLogger(fixture.binDir, logPath);

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-delete",
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Delete File: src/removed.rs",
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
  assert.equal(readRustChanged(fixture.pluginData, "turn-delete"), 1);
  assert.deepEqual(readLines(logPath), []);
});

test("post-edit deduplicates multiple Rust files in the same Cargo project", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "dedupe.log");
  writeCargoLogger(fixture.binDir, logPath);
  writeFileSync(
    path.join(fixture.projectDir, "src/other.rs"),
    "pub fn other() {}\n",
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
          "*** Update File: src/lib.rs",
          "*** Update File: ./src/lib.rs",
          "*** Update File: src/other.rs",
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
  assert.deepEqual(readLines(logPath), [`cargo:${fixture.projectDir}:fmt`]);
  assert.deepEqual(readCargoProjects(fixture.pluginData, "turn-dedupe"), [
    fixture.projectDir,
  ]);
});

test("Stop runs Cargo checks for each affected Cargo project in order", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "multi-project.log");
  writeCargoLogger(fixture.binDir, logPath);

  const markResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.dir,
      turn_id: "turn-multi-project",
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Update File: project/src/lib.rs",
          "*** Update File: nested/src/lib.rs",
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
  assert.equal(markResult.status, 0, markResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.dir, turn_id: "turn-multi-project" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [
    `cargo:${fixture.nestedProjectDir}:fmt`,
    `cargo:${fixture.projectDir}:fmt`,
    `cargo:${fixture.nestedProjectDir}:check`,
    `cargo:${fixture.nestedProjectDir}:clippy -- -D warnings`,
    `cargo:${fixture.nestedProjectDir}:test`,
    `cargo:${fixture.projectDir}:check`,
    `cargo:${fixture.projectDir}:clippy -- -D warnings`,
    `cargo:${fixture.projectDir}:test`,
  ]);
});

test("environment flags disable formatters and Stop checks", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "flags.log");
  writeCargoLogger(fixture.binDir, logPath);
  writeRustfmtLogger(fixture.binDir, logPath);

  const postCargoResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-cargo-flags",
      tool_name: "Edit",
      tool_input: { file_path: "src/lib.rs" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        RUST_HOOKS_CARGO_FMT: "0",
      },
    },
  );
  assert.equal(postCargoResult.status, 0, postCargoResult.stderr);

  const postStandaloneResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.standaloneDir,
      turn_id: "turn-rustfmt-flags",
      tool_name: "Edit",
      tool_input: { file_path: "main.rs" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        RUST_HOOKS_RUSTFMT: "0",
      },
    },
  );
  assert.equal(postStandaloneResult.status, 0, postStandaloneResult.stderr);

  const stopResult = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-cargo-flags" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        RUST_HOOKS_CARGO_CHECK: "0",
        RUST_HOOKS_CARGO_CLIPPY: "0",
        RUST_HOOKS_CARGO_TEST: "0",
      },
    },
  );

  assert.equal(stopResult.status, 0, stopResult.stderr);
  assert.deepEqual(readLines(logPath), []);
});

test("fast mode skips Stop checks but keeps formatting", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "fast.log");
  writeCargoLogger(fixture.binDir, logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-fast",
      tool_name: "Edit",
      tool_input: { file_path: "src/lib.rs" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        RUST_HOOKS_FAST: "1",
      },
    },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const stopResult = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-fast" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        RUST_HOOKS_FAST: "1",
      },
    },
  );

  assert.equal(stopResult.status, 0, stopResult.stderr);
  assert.deepEqual(readLines(logPath), [`cargo:${fixture.projectDir}:fmt`]);
});

test("Stop skips when the turn has no Rust changes", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "skip.log");
  writeCargoLogger(fixture.binDir, logPath);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-skip" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '{"continue":true}');
  assert.deepEqual(readLines(logPath), []);
});

test("missing PLUGIN_DATA fails open and checks the current Cargo project", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "fail-open.log");
  writeCargoLogger(fixture.binDir, logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-no-data",
      tool_name: "Edit",
      tool_input: { file_path: "src/lib.rs" },
    },
    {
      env: {
        PLUGIN_DATA: "",
        PATH: fixture.binDir,
      },
    },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const stopResult = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-no-data" },
    {
      env: {
        PLUGIN_DATA: "",
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(stopResult.status, 0, stopResult.stderr);
  assert.deepEqual(readLines(logPath), [
    `cargo:${fixture.projectDir}:fmt`,
    `cargo:${fixture.projectDir}:check`,
    `cargo:${fixture.projectDir}:clippy -- -D warnings`,
    `cargo:${fixture.projectDir}:test`,
  ]);
});
