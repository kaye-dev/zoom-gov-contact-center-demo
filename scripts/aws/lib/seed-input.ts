import { spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";

export type SeedAdminInput = {
  email: string;
  name: string;
};

export function parseSeedAdminArguments(
  arguments_: readonly string[],
): SeedAdminInput {
  let email: string | undefined;
  let name: string | undefined;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--password" || argument.startsWith("--password=")) {
      throw new Error(
        "Password options are not supported. Enter the password only at the hidden prompt.",
      );
    }

    if (argument !== "--email" && argument !== "--name") {
      throw new Error(`Unknown seed option '${argument}'.`);
    }

    const value = arguments_[index + 1]?.trim();
    if (!value || value.startsWith("--")) {
      throw new Error(`Option '${argument}' requires a value.`);
    }

    if (argument === "--email") {
      email = value.toLowerCase();
    } else {
      name = value;
    }
    index += 1;
  }

  if (!email || !name) {
    throw new Error("Usage: seed-admin.ts --email <email> --name <name>");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Seed admin email is invalid.");
  }

  return { email, name };
}

export function readHiddenPassword(prompt: string): string {
  let ttyFileDescriptor: number;

  try {
    ttyFileDescriptor = openSync("/dev/tty", "r+");
  } catch {
    throw new Error(
      "A terminal is required for hidden password input. Passwords cannot be passed by argument or environment variable.",
    );
  }

  try {
    const result = spawnSync(
      "/bin/sh",
      [
        "-c",
        `restore_terminal() {
  stty echo < /dev/tty 2>/dev/null || true
  printf '\\n' > /dev/tty
}
trap restore_terminal EXIT
trap 'exit 130' HUP INT TERM
printf '%s' "$1" > /dev/tty
stty -echo < /dev/tty
if ! IFS= read -r secret < /dev/tty; then
  exit 1
fi
printf '%s' "$secret"
`,
        "hidden-password-reader",
        prompt,
      ],
      {
        encoding: "utf8",
        stdio: [ttyFileDescriptor, "pipe", ttyFileDescriptor],
      },
    );

    if (result.error || result.status !== 0) {
      throw new Error("Password input was cancelled or could not be read.");
    }

    return result.stdout ?? "";
  } finally {
    closeSync(ttyFileDescriptor);
  }
}
