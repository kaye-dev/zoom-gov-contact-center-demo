import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

import { TtyPrompter } from "../lib/input";

function readTerminalMode(): string {
  const result = spawnSync("stty", ["-g"], {
    encoding: "utf8",
    stdio: [process.stdin, "pipe", "pipe"],
  });
  if (result.status !== 0 || result.error) {
    throw new Error("PTY fixture could not inspect terminal mode.");
  }
  return result.stdout.trim();
}

async function waitForStartGate(): Promise<void> {
  const gatePath = process.argv[2];
  if (!gatePath) {
    return;
  }
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (existsSync(gatePath)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("PTY fixture start gate timed out.");
}

async function main(): Promise<void> {
  await waitForStartGate();
  const before = readTerminalMode();
  process.stdout.write(`FIXTURE_PID=${process.pid}\n`);
  try {
    const answer = await new TtyPrompter().hidden("SECRET_PROMPT> ");
    const after = readTerminalMode();

    process.stdout.write("FIXTURE_RESULT=success\n");
    process.stdout.write(
      `ANSWER_SHA256=${createHash("sha256").update(answer).digest("hex")}\n`,
    );
    process.stdout.write(`TTY_STATE_RESTORED=${String(after === before)}\n`);
  } catch (error) {
    const after = readTerminalMode();
    const message = error instanceof Error ? error.message : "unknown input error";
    process.stdout.write("FIXTURE_RESULT=error\n");
    process.stdout.write(`INPUT_ERROR=${message}\n`);
    process.stdout.write(`TTY_STATE_RESTORED=${String(after === before)}\n`);
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown fixture error";
  process.stderr.write(`PTY fixture error: ${message}\n`);
  process.exitCode = 1;
});
