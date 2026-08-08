import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

export interface Prompter {
  ask(message: string): Promise<string>;
  hidden(message: string): Promise<string>;
}

export class TtyPrompter implements Prompter {
  async ask(message: string): Promise<string> {
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    try {
      return await readline.question(message);
    } finally {
      readline.close();
    }
  }

  async hidden(message: string): Promise<string> {
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    const disabled = spawnSync("stty", ["-echo"], {
      stdio: [process.stdin, "ignore", process.stderr],
    });
    if (disabled.status !== 0) {
      readline.close();
      throw new Error("Could not disable terminal echo for secret input.");
    }

    try {
      return await readline.question(message);
    } finally {
      const restored = spawnSync("stty", ["echo"], {
        stdio: [process.stdin, "ignore", process.stderr],
      });
      readline.close();
      process.stdout.write("\n");
      if (restored.status !== 0 || restored.error) {
        throw new Error(
          "Secret input ended, but terminal echo could not be restored. Stop using this terminal and restore echo manually before continuing.",
        );
      }
    }
  }
}

export function isAffirmative(value: string): boolean {
  return /^(?:y|yes)$/i.test(value.trim());
}

export async function requireAffirmative(
  prompter: Prompter,
  message: string,
  cancellationMessage: string,
): Promise<void> {
  if (!isAffirmative(await prompter.ask(`${message} [y/N] `))) {
    throw new Error(cancellationMessage);
  }
}

export async function requireExact(
  prompter: Prompter,
  message: string,
  expected: string,
  cancellationMessage: string,
): Promise<void> {
  const answer = await prompter.ask(`${message}\n> `);
  if (answer.trim() !== expected) {
    throw new Error(cancellationMessage);
  }
}
