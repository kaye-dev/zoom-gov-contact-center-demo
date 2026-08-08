import { spawnSync } from "node:child_process";

export type CommandResult = {
  status: number;
  stdout: string;
  stderr: string;
};

export type CommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  interactive?: boolean;
  printOutput?: boolean;
  maxBuffer?: number;
};

export interface CommandRunner {
  run(
    command: string,
    arguments_: readonly string[],
    options?: CommandOptions,
  ): CommandResult;
}

export class SecretRegistry {
  readonly #secrets = new Set<string>();

  add(...values: readonly (string | undefined)[]): void {
    for (const value of values) {
      if (value) {
        this.#secrets.add(value);
      }
    }
  }

  contains(value: string): boolean {
    return [...this.#secrets].some((secret) => value.includes(secret));
  }

  redact(value: string): string {
    return [...this.#secrets]
      .sort((left, right) => right.length - left.length)
      .reduce(
        (redacted, secret) => redacted.split(secret).join("[REDACTED]"),
        value,
      );
  }
}

export class SystemCommandRunner implements CommandRunner {
  constructor(
    private readonly secrets: SecretRegistry,
    private readonly defaultCwd: string,
  ) {}

  run(
    command: string,
    arguments_: readonly string[],
    options: CommandOptions = {},
  ): CommandResult {
    for (const argument of arguments_) {
      if (this.secrets.contains(argument)) {
        throw new Error(
          `Refusing to put a registered secret in arguments for '${command}'.`,
        );
      }
    }

    const result = spawnSync(command, [...arguments_], {
      cwd: options.cwd ?? this.defaultCwd,
      encoding: "utf8",
      env: options.env ?? process.env,
      input: options.input,
      ...(options.interactive ? { stdio: "inherit" as const } : {}),
      maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
      shell: false,
    });

    if (result.error) {
      throw new Error(
        `Could not run '${command}': ${this.secrets.redact(result.error.message)}`,
      );
    }

    const commandResult = {
      status: result.status ?? 1,
      stdout: this.secrets.redact(result.stdout ?? ""),
      stderr: this.secrets.redact(result.stderr ?? ""),
    };

    if (options.printOutput) {
      if (commandResult.stdout) {
        process.stdout.write(commandResult.stdout);
      }
      if (commandResult.stderr) {
        process.stderr.write(commandResult.stderr);
      }
    }

    return commandResult;
  }
}

export function assertCommandSucceeded(
  result: CommandResult,
  description: string,
): void {
  if (result.status === 0) {
    return;
  }

  const detail = [result.stderr.trim(), result.stdout.trim()]
    .filter(Boolean)
    .join("\n");
  throw new Error(`${description} failed.${detail ? `\n${detail}` : ""}`);
}

export function combinedOutput(result: CommandResult): string {
  return `${result.stdout}\n${result.stderr}`.trim();
}
