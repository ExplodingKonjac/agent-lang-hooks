import { spawnSync } from "node:child_process";
import {
  commandFailureDetails,
  currentPythonProjectRoot,
  envEnabled,
  envFlag,
  quitHook,
  resolveAnyCommand,
  resolveCommand,
  runHook,
} from "./common/hook.mjs";
import { getPythonTurnState } from "./common/turn_state.mjs";

const TYPE_CHECKERS = [
  ["ty", ["check", "."]],
  ["pyre", ["check"]],
  ["pyright", []],
  ["mypy", ["."]],
];
const LINTERS = [
  ["ruff", ["check", "."]],
  ["pylint", ["."]],
];

function shouldRunStopChecks() {
  return !envFlag("PYTHON_HOOKS_FAST");
}

function commandForCandidates(candidates, projectRoot) {
  for (const [name, args] of candidates) {
    const resolved = resolveCommand(name, projectRoot);
    if (resolved) {
      return { ...resolved, name, args };
    }
  }

  return null;
}

function testCommand(projectRoot) {
  const pytest = resolveCommand("pytest", projectRoot);
  if (pytest) {
    return { ...pytest, name: "pytest", args: [] };
  }

  const python = resolveAnyCommand(["python", "python3"], projectRoot);
  if (python) {
    return {
      ...python,
      name: "python -m unittest discover",
      args: ["-m", "unittest", "discover"],
    };
  }

  return null;
}

function enabledCommands(projectRoot) {
  const commands = [];

  if (envEnabled("PYTHON_HOOKS_TYPECHECK")) {
    const typeChecker = commandForCandidates(TYPE_CHECKERS, projectRoot);
    if (typeChecker) {
      commands.push(typeChecker);
    }
  }

  if (envEnabled("PYTHON_HOOKS_LINT")) {
    const linter = commandForCandidates(LINTERS, projectRoot);
    if (linter) {
      commands.push(linter);
    }
  }

  if (envEnabled("PYTHON_HOOKS_TEST")) {
    const tester = testCommand(projectRoot);
    if (tester) {
      commands.push(tester);
    }
  }

  return commands;
}

function runPythonCommand(command, projectRoot) {
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
    const details = commandFailureDetails(result);
    return { commandName: command.name, projectRoot, details };
  }

  return null;
}

function commandFailedMessage(failure, { retry }) {
  const status = retry ? "still failed" : "failed";
  return `${failure.commandName} in ${failure.projectRoot} ${status}: ${failure.details}`;
}

function projectRootsToCheck(input) {
  const state = getPythonTurnState(input?.turn_id);
  if (state === null) {
    return [currentPythonProjectRoot(input)];
  }

  if (!state.pythonChanged || state.projectRoots.length === 0) {
    return [];
  }

  return state.projectRoots;
}

function main(input) {
  if (!shouldRunStopChecks()) {
    quitHook({ continue: true });
  }

  const projectRoots = projectRootsToCheck(input);
  if (projectRoots.length === 0) {
    quitHook({ continue: true });
  }

  const retryMode = input.stop_hook_active === true;
  const failures = [];
  for (const projectRoot of projectRoots) {
    for (const command of enabledCommands(projectRoot)) {
      const failure = runPythonCommand(command, projectRoot);
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
