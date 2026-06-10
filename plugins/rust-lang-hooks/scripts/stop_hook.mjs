import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  commandFailureDetails,
  envEnabled,
  envFlag,
  findUp,
  quitHook,
  runHook,
} from "./common/hook.mjs";
import { getRustTurnState } from "./common/turn_state.mjs";

function enabledCargoCommands() {
  return [
    [envEnabled("RUST_HOOKS_CARGO_CHECK"), "check"],
    [envEnabled("RUST_HOOKS_CARGO_CLIPPY"), "clippy", "--", "-D", "warnings"],
    [envEnabled("RUST_HOOKS_CARGO_TEST"), "test"],
  ]
    .filter(([enabled]) => enabled)
    .map((cmd) => cmd.slice(1));
}

function runCargoCommand(command, projectDir, blockOnFailed) {
  const result = spawnSync("cargo", command, {
    cwd: projectDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error?.code === "ENOENT") {
    return;
  }

  if (result.error || result.status !== 0) {
    const details = commandFailureDetails(result);
    if (blockOnFailed) {
      quitHook({
        decision: "block",
        reason: `cargo ${command.join(" ")} in ${projectDir} failed: ${details}`,
      });
    } else {
      quitHook({
        continue: true,
        systemMessage: `cargo ${command.join(" ")} in ${projectDir} still failed: ${details}`,
      });
    }
  }
}

function currentCargoProjectDir(input) {
  const cwd = typeof input?.cwd === "string" ? input.cwd : process.cwd();
  const cargoToml = findUp(cwd, "Cargo.toml");
  return cargoToml ? path.dirname(cargoToml) : null;
}

function cargoProjectsToCheck(input) {
  const state = getRustTurnState(input?.turn_id);
  if (state === null) {
    const projectDir = currentCargoProjectDir(input);
    return projectDir ? [projectDir] : [];
  }

  if (!state.rustChanged || state.cargoProjectDirs.length === 0) {
    return [];
  }

  return state.cargoProjectDirs;
}

function main(input) {
  if (envFlag("RUST_HOOKS_FAST")) {
    quitHook({ continue: true });
  }

  const commands = enabledCargoCommands();
  if (commands.length === 0) {
    quitHook({ continue: true });
  }

  const projectDirs = cargoProjectsToCheck(input);
  if (projectDirs.length === 0) {
    quitHook({ continue: true });
  }

  const blockOnFailed = input.stop_hook_active ? false : true;
  for (const projectDir of projectDirs) {
    for (const command of commands) {
      runCargoCommand(command, projectDir, blockOnFailed);
    }
  }

  quitHook({ continue: true });
}

runHook(main);
