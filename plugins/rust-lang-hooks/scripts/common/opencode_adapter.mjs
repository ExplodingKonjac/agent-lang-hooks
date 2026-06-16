import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SUPPORTED_WRITE_TOOLS = new Set(["edit", "write", "apply_patch"]);

function sessionKey(value) {
  if (typeof value?.sessionId === "string" && value.sessionId.length > 0) {
    return value.sessionId;
  }

  if (typeof value?.sessionID === "string" && value.sessionID.length > 0) {
    return value.sessionID;
  }

  if (typeof value?.session_id === "string" && value.session_id.length > 0) {
    return value.session_id;
  }

  if (typeof value?.id === "string" && value.id.length > 0) {
    return value.id;
  }

  if (value?.session && typeof value.session.id === "string") {
    return value.session.id;
  }

  return "default";
}

function runtimeCwd(value, fallbackDirectory, fallbackWorktree) {
  return (
    value?.cwd ||
    value?.directory ||
    value?.worktree ||
    fallbackDirectory ||
    fallbackWorktree ||
    process.cwd()
  );
}

function defaultPluginDataDir(pluginName, cwd) {
  const root =
    process.env.CODEX_LANG_HOOKS_OPENCODE_DATA_ROOT ||
    path.join(tmpdir(), "agent-lang-hooks-opencode");
  const worktreeHash = createHash("sha1").update(cwd).digest("hex");
  return path.join(root, pluginName, worktreeHash);
}

function resolvedPluginDataDir(pluginName, cwd) {
  const pluginData = process.env.PLUGIN_DATA || defaultPluginDataDir(pluginName, cwd);
  mkdirSync(pluginData, { recursive: true });
  return pluginData;
}

function nodeCommand() {
  return process.env.CODEX_LANG_HOOKS_NODE_PATH || "node";
}

function normalizedArgs(input, output) {
  if (output?.args && typeof output.args === "object") {
    return output.args;
  }

  if (input?.args && typeof input.args === "object") {
    return input.args;
  }

  return {};
}

function legacyToolInput(toolName, args) {
  if (toolName === "apply_patch") {
    const patch =
      args.command || args.patch || args.content || args.diff || args.text || null;
    return typeof patch === "string" && patch.length > 0 ? { command: patch } : null;
  }

  const filePath = args.filePath || args.file_path || args.path || null;
  if (typeof filePath !== "string" || filePath.length === 0) {
    return null;
  }

  return { file_path: filePath, path: filePath };
}

function parseHookOutput(pluginName, result) {
  if (result.error) {
    throw new Error(`[${pluginName}] hook invocation failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(
      `[${pluginName}] hook invocation failed: ${
        result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`
      }`,
    );
  }

  if (!result.stdout.trim()) {
    return {};
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(
      `[${pluginName}] hook returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function runLegacyHook(pluginName, scriptPath, input, cwd) {
  const result = spawnSync(nodeCommand(), [scriptPath], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PLUGIN_DATA: resolvedPluginDataDir(pluginName, cwd),
    },
    input: JSON.stringify(input),
    stdio: ["pipe", "pipe", "pipe"],
  });
  return parseHookOutput(pluginName, result);
}

async function logWarning(client, pluginName, message, extra = {}) {
  if (!message) {
    return;
  }

  if (client?.app?.log) {
    await client.app.log({
      body: {
        service: pluginName,
        level: "warn",
        message,
        extra,
      },
    });
  }

  console.warn(`[${pluginName}] ${message}`);
}

export function createOpenCodePlugin({
  pluginName,
  postEditScriptUrl,
  stopScriptUrl,
}) {
  const postEditScriptPath = fileURLToPath(postEditScriptUrl);
  const stopScriptPath = fileURLToPath(stopScriptUrl);

  return async ({ client, directory, worktree }) => {
    const latestTurnBySession = new Map();
    const completedTurnBySession = new Map();
    const turnSequenceBySession = new Map();

    return {
      "tool.execute.after": async (input, output) => {
        const toolName = String(input?.tool || input?.toolName || "").toLowerCase();
        if (!SUPPORTED_WRITE_TOOLS.has(toolName)) {
          return;
        }

        const toolInput = legacyToolInput(toolName, normalizedArgs(input, output));
        if (!toolInput) {
          return;
        }

        const currentSessionKey = sessionKey(input);
        const nextTurnSequence =
          (turnSequenceBySession.get(currentSessionKey) || 0) + 1;
        turnSequenceBySession.set(currentSessionKey, nextTurnSequence);

        const turnId = `opencode:${currentSessionKey}:${nextTurnSequence}`;
        latestTurnBySession.set(currentSessionKey, turnId);

        const cwd = runtimeCwd(input, directory, worktree);
        const hookResult = runLegacyHook(
          pluginName,
          postEditScriptPath,
          {
            cwd,
            turn_id: turnId,
            tool_name: toolName,
            tool_input: toolInput,
          },
          cwd,
        );

        if (hookResult.decision === "block" && hookResult.reason) {
          throw new Error(`[${pluginName}] ${hookResult.reason}`);
        }

        await logWarning(client, pluginName, hookResult.systemMessage, {
          phase: "post-edit",
          turnId,
        });
      },

      event: async ({ event }) => {
        if (event?.type !== "session.idle") {
          return;
        }

        const currentSessionKey = sessionKey(event);
        const turnId = latestTurnBySession.get(currentSessionKey);
        if (!turnId || completedTurnBySession.get(currentSessionKey) === turnId) {
          return;
        }

        const cwd = runtimeCwd(event, directory, worktree);
        const hookResult = runLegacyHook(
          pluginName,
          stopScriptPath,
          {
            cwd,
            turn_id: turnId,
            stop_hook_active: true,
          },
          cwd,
        );
        completedTurnBySession.set(currentSessionKey, turnId);

        await logWarning(
          client,
          pluginName,
          hookResult.reason || hookResult.systemMessage,
          {
            phase: "session.idle",
            turnId,
          },
        );
      },
    };
  };
}
