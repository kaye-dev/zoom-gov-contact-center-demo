import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

export interface Prompter {
  ask(message: string): Promise<string>;
  hidden(message: string): Promise<string>;
}

const SECRET_INPUT_SIGNALS = [
  "SIGHUP",
  "SIGINT",
  "SIGQUIT",
  "SIGTERM",
  "SIGTSTP",
] as const satisfies readonly NodeJS.Signals[];

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
    const captured = spawnSync("stty", ["-g"], {
      encoding: "utf8",
      stdio: [process.stdin, "pipe", process.stderr],
    });
    const savedMode = captured.stdout?.trim() ?? "";
    if (
      captured.status !== 0 ||
      captured.error ||
      !savedMode ||
      /[\s\0]/.test(savedMode)
    ) {
      throw new Error("Could not capture the terminal mode before secret input.");
    }

    let restored = false;
    let promptWritten = false;
    let readline: ReturnType<typeof createInterface> | undefined;
    const signalHandlers = new Map<NodeJS.Signals, () => void>();
    const removeSignalHandlers = (): void => {
      for (const [signal, handler] of signalHandlers) {
        process.removeListener(signal, handler);
      }
      signalHandlers.clear();
    };
    const restoreTerminal = (): Error | undefined => {
      if (restored) {
        return undefined;
      }
      const result = spawnSync("stty", [savedMode], {
        stdio: [process.stdin, "ignore", process.stderr],
      });
      if (result.status !== 0 || result.error) {
        return new Error(
          "Secret input ended, but the exact terminal mode could not be restored. Stop using this terminal and restore it manually before continuing.",
        );
      }
      restored = true;
      return undefined;
    };
    let rejectInterruption: ((error: Error) => void) | undefined;
    const interrupted = new Promise<never>((_resolve, reject) => {
      rejectInterruption = reject;
    });
    for (const signal of SECRET_INPUT_SIGNALS) {
      const handler = (): void => {
        rejectInterruption?.(
          new Error(`Secret input was interrupted by ${signal}.`),
        );
      };
      signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }

    try {
      const disabled = spawnSync("stty", ["-echo"], {
        stdio: [process.stdin, "ignore", process.stderr],
      });
      if (disabled.status !== 0 || disabled.error) {
        throw new Error("Could not disable terminal echo for secret input.");
      }
      process.stdout.write(message);
      promptWritten = true;
      readline = createInterface({
        input: process.stdin,
        terminal: false,
        crlfDelay: Number.POSITIVE_INFINITY,
      });
      const answer = await Promise.race([
        readline[Symbol.asyncIterator]().next(),
        interrupted,
      ]);
      if (answer.done) {
        throw new Error("Secret input ended before a complete line was read.");
      }
      return answer.value;
    } finally {
      let closeError: unknown;
      try {
        readline?.close();
      } catch (error) {
        closeError = error;
      }
      removeSignalHandlers();
      const restorationError = restoreTerminal();
      if (promptWritten) {
        process.stdout.write("\n");
      }
      if (restorationError) {
        throw restorationError;
      }
      if (closeError !== undefined) {
        throw closeError;
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
