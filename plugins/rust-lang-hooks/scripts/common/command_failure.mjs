function envInt(name, defaultValue) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : defaultValue;
}

function commandOutput(result) {
  const stderr = (result.stderr || "").trim();
  const stdout = (result.stdout || "").trim();

  if (stderr && stdout) {
    return `stderr:\n${stderr}\nstdout:\n${stdout}`;
  }

  return stderr || stdout;
}

export function commandFailureDetails(
  result,
  {
    outputLimitEnv = "RUST_HOOKS_OUTPUT_MAX_CHARS",
    defaultOutputLimit = 4000,
  } = {},
) {
  if (result.error?.message) {
    return result.error.message;
  }

  const output = commandOutput(result);
  if (!output) {
    return `exit ${result.status}`;
  }

  const limit = envInt(outputLimitEnv, defaultOutputLimit);
  if (output.length <= limit) {
    return output;
  }

  return `[output trimmed to last ${limit} chars]\n${output.slice(-limit)}`;
}
