import { spawnSync } from "node:child_process";
import {
  envEnabled,
  envFlag,
  quitHook,
  runHook,
} from "./common/hook.mjs";
import { commandFailureDetails } from "./common/command_failure.mjs";
import {
  currentNodeProjectRoot,
  hasTypeScriptConfig,
  packageJsonError,
  resolveCommand,
  resolvePackageScript,
  tsConfigError,
} from "./common/node_runtime.mjs";
import { getJsTurnState } from "./common/turn_state.mjs";

function shouldRunStopChecks() {
  return !envFlag("JS_HOOKS_FAST");
}

function commandForCandidates(candidates, projectRoot) {
  for (const [name, args, displayName] of candidates) {
    const resolved = resolveCommand(name, projectRoot);
    if (resolved) {
      return { ...resolved, name: displayName || `${name} ${args.join(" ")}`.trim(), args };
    }
  }

  return null;
}

function typecheckCommand(projectRoot) {
  const packageScript = resolvePackageScript("typecheck", projectRoot);
  if (packageScript) {
    return packageScript;
  }

  if (!hasTypeScriptConfig(projectRoot)) {
    return null;
  }

  const tsc = resolveCommand("tsc", projectRoot);
  if (!tsc) {
    return null;
  }

  return {
    ...tsc,
    name: "tsc --noEmit",
    args: ["--noEmit"],
  };
}

function lintCommand(projectRoot, lintFiles, { allowDirectToolFallback }) {
  const packageScript = resolvePackageScript("lint", projectRoot);
  if (packageScript) {
    return packageScript;
  }

  if (!allowDirectToolFallback || lintFiles.length === 0) {
    return null;
  }

  return commandForCandidates(
    [
      ["eslint", lintFiles, `eslint ${lintFiles.join(" ")}`],
      ["biome", ["check", ...lintFiles], `biome check ${lintFiles.join(" ")}`],
    ],
    projectRoot,
  );
}

function testCommand(projectRoot) {
  const packageScript = resolvePackageScript("test", projectRoot);
  if (packageScript) {
    return packageScript;
  }

  return commandForCandidates(
    [
      ["vitest", ["run"], "vitest run"],
      ["jest", ["--runInBand"], "jest --runInBand"],
      ["node", ["--test"], "node --test"],
    ],
    projectRoot,
  );
}

function enabledCommands(projectRoot, lintFiles, { allowDirectLintFallback }) {
  const commands = [];

  if (envEnabled("JS_HOOKS_TYPECHECK")) {
    const typecheck = typecheckCommand(projectRoot);
    if (typecheck) {
      commands.push(typecheck);
    }
  }

  if (envEnabled("JS_HOOKS_LINT")) {
    const lint = lintCommand(projectRoot, lintFiles, {
      allowDirectToolFallback: allowDirectLintFallback,
    });
    if (lint) {
      commands.push(lint);
    }
  }

  if (envEnabled("JS_HOOKS_TEST")) {
    const test = testCommand(projectRoot);
    if (test) {
      commands.push(test);
    }
  }

  return commands;
}

function runJsCommand(command, projectRoot) {
  const result = spawnSync(command.command, command.args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: command.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error?.code === "ENOENT") {
    return null;
  }

  if (result.error || result.status !== 0) {
    return {
      commandName: command.name,
      projectRoot,
      details: commandFailureDetails(result),
    };
  }

  return null;
}

function commandFailedMessage(failure, { retry }) {
  const status = retry ? "still failed" : "failed";
  return `${failure.commandName} in ${failure.projectRoot} ${status}: ${failure.details}`;
}

function packageJsonFailure(projectRoot) {
  const error = packageJsonError(projectRoot);
  if (!error) {
    return null;
  }

  return {
    commandName: "package.json",
    projectRoot,
    details: error,
  };
}

function tsConfigFailure(projectRoot) {
  const error = tsConfigError(projectRoot);
  if (!error) {
    return null;
  }

  return {
    commandName: "tsconfig",
    projectRoot,
    details: error,
  };
}

function stopTargets(input) {
  const state = getJsTurnState(input?.turn_id);
  if (state === null) {
    const projectRoot = currentNodeProjectRoot(input);
    return {
      projectRoots: projectRoot ? [projectRoot] : [],
      lintFilesByProjectRoot: new Map(),
      allowDirectLintFallback: false,
    };
  }

  if (!state.jsChanged || state.projectRoots.length === 0) {
    return {
      projectRoots: [],
      lintFilesByProjectRoot: new Map(),
      allowDirectLintFallback: true,
    };
  }

  const lintFilesByProjectRoot = new Map();
  for (const projectRoot of state.projectRoots) {
    lintFilesByProjectRoot.set(projectRoot, []);
  }

  for (const filePath of state.lintFiles || []) {
    const projectRoot = state.projectRoots.find(
      (candidateRoot) => filePath === candidateRoot || filePath.startsWith(`${candidateRoot}/`),
    );
    if (!projectRoot) {
      continue;
    }

    const files = lintFilesByProjectRoot.get(projectRoot) || [];
    files.push(filePath);
    lintFilesByProjectRoot.set(projectRoot, files);
  }

  return {
    projectRoots: state.projectRoots,
    lintFilesByProjectRoot,
    allowDirectLintFallback: true,
  };
}

function main(input) {
  if (!shouldRunStopChecks()) {
    quitHook({ continue: true });
  }

  const {
    projectRoots,
    lintFilesByProjectRoot,
    allowDirectLintFallback,
  } = stopTargets(input);
  if (projectRoots.length === 0) {
    quitHook({ continue: true });
  }

  const retryMode = input.stop_hook_active === true;
  const failures = [];

  for (const projectRoot of projectRoots) {
    const manifestFailure = packageJsonFailure(projectRoot);
    if (manifestFailure) {
      if (!retryMode) {
        quitHook({
          decision: "block",
          reason: commandFailedMessage(manifestFailure, { retry: false }),
        });
      }

      failures.push(manifestFailure);
      continue;
    }

    const configFailure = tsConfigFailure(projectRoot);
    if (configFailure) {
      if (!retryMode) {
        quitHook({
          decision: "block",
          reason: commandFailedMessage(configFailure, { retry: false }),
        });
      }

      failures.push(configFailure);
      continue;
    }

    const lintFiles = (lintFilesByProjectRoot.get(projectRoot) || []).sort();
    for (const command of enabledCommands(projectRoot, lintFiles, {
      allowDirectLintFallback,
    })) {
      const failure = runJsCommand(command, projectRoot);
      if (!failure) {
        continue;
      }

      if (!retryMode) {
        quitHook({
          decision: "block",
          reason: commandFailedMessage(failure, { retry: false }),
        });
      }

      failures.push(failure);
    }
  }

  if (failures.length > 0) {
    quitHook({
      continue: true,
      systemMessage: failures
        .map((failure) => commandFailedMessage(failure, { retry: true }))
        .join("\n\n"),
    });
  }

  quitHook({ continue: true });
}

runHook(main);
