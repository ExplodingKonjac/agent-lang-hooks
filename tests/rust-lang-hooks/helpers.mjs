import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
  "plugins/rust-lang-hooks/scripts/post_edit_hook.mjs",
);
export const STOP_HOOK = path.join(
  ROOT,
  "plugins/rust-lang-hooks/scripts/stop_hook.mjs",
);

export function makeFixture() {
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

export function writeCargoLogger(binDir, logPath, { exitStatus = 0 } = {}) {
  writeExecutable(
    path.join(binDir, "cargo"),
    `#!/bin/sh\nprintf 'cargo:%s:%s\\n' "$PWD" "$*" >> "${logPath}"\nexit ${exitStatus}\n`,
  );
}

export function writeRustfmtLogger(binDir, logPath, { exitStatus = 0 } = {}) {
  writeExecutable(
    path.join(binDir, "rustfmt"),
    `#!/bin/sh\nprintf 'rustfmt:%s\\n' "$*" >> "${logPath}"\nexit ${exitStatus}\n`,
  );
}

export function readRustChanged(pluginData, turnId) {
  return readOptionalScalar(
    path.join(pluginData, "rust-lang-hooks.sqlite3"),
    "SELECT rust_changed FROM turn_file_changes WHERE turn_id = ?",
    "rust_changed",
    turnId,
  );
}

export function readCargoProjects(pluginData, turnId) {
  return readOrderedColumn(
    path.join(pluginData, "rust-lang-hooks.sqlite3"),
    "SELECT project_dir FROM turn_cargo_projects WHERE turn_id = ? ORDER BY project_dir",
    "project_dir",
    turnId,
  );
}

export {
  hookOutput,
  path,
  readLines,
  ROOT,
  runHook,
  writeFailingTool,
  writeFileSync,
};
