import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const ROOT = path.resolve(import.meta.dirname, "../..");

export function writeExecutable(filePath, source) {
  writeFileSync(filePath, source);
  chmodSync(filePath, 0o755);
}

export function writeFailingTool(filePath, { stdout = "", stderr = "", exitStatus = 1 }) {
  const stdoutLine = stdout ? `printf '%s' '${stdout}'\n` : "";
  const stderrLine = stderr ? `printf '%s' '${stderr}' >&2\n` : "";
  writeExecutable(
    filePath,
    `#!/bin/sh\n${stdoutLine}${stderrLine}exit ${exitStatus}\n`,
  );
}

export function runHook(script, input, { env = {}, cwd = ROOT } = {}) {
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

export function readLines(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }

  return readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean);
}

export function hookOutput(result) {
  return JSON.parse(result.stdout);
}
