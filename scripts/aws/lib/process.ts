import { spawnSync } from "node:child_process";

export type CommandResult = {
  status: number;
  stdout: string;
  stderr: string;
};

export function runCommand(
  command: string,
  arguments_: readonly string[],
): CommandResult {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    shell: false,
  });

  if (result.error) {
    throw new Error(`Could not run '${command}': ${result.error.message}`);
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function redactSecrets(
  value: string,
  secrets: readonly (string | undefined)[],
): string {
  return secrets.reduce<string>((redacted, secret) => {
    if (!secret) {
      return redacted;
    }

    return redacted.split(secret).join("[REDACTED]");
  }, value);
}

export function parseJson(value: string, description: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${description} was not valid JSON.`);
  }
}
