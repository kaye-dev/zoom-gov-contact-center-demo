import { spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";

export function isAffirmativeConfirmation(value: string): boolean {
  return /^(?:y|yes)$/i.test(value.trim());
}

export function readConfirmationFromTty(prompt: string): string {
  let ttyFileDescriptor: number;

  try {
    ttyFileDescriptor = openSync("/dev/tty", "r+");
  } catch {
    throw new Error("An interactive terminal is required for confirmation.");
  }

  try {
    const result = spawnSync(
      "/bin/sh",
      [
        "-c",
        `printf '%s' "$1" > /dev/tty
if ! IFS= read -r answer < /dev/tty; then
  exit 1
fi
printf '%s' "$answer"
`,
        "confirmation-reader",
        prompt,
      ],
      {
        encoding: "utf8",
        stdio: [ttyFileDescriptor, "pipe", ttyFileDescriptor],
      },
    );

    if (result.error || result.status !== 0) {
      throw new Error("Confirmation was cancelled or could not be read.");
    }

    return result.stdout ?? "";
  } finally {
    closeSync(ttyFileDescriptor);
  }
}
