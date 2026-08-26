import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const helperPath = fileURLToPath(
  new URL("../scripts/dev-compose-network.zsh", import.meta.url),
);

type CommandStubs = Record<
  "route" | "netstat" | "ifconfig" | "ipconfig",
  string
>;

function detectLanIpv4(stubs: CommandStubs) {
  const stubDirectory = mkdtempSync(join(tmpdir(), "dev-compose-network-"));

  try {
    for (const [command, body] of Object.entries(stubs)) {
      const path = join(stubDirectory, command);
      writeFileSync(path, `#!/bin/sh\n${body}\n`);
      chmodSync(path, 0o755);
    }

    return spawnSync(
      "zsh",
      [
        "-c",
        'set -euo pipefail; source "$1"; detect_lan_ipv4',
        "zsh",
        helperPath,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${stubDirectory}:${process.env.PATH ?? ""}`,
        },
      },
    );
  } finally {
    rmSync(stubDirectory, { force: true, recursive: true });
  }
}

const failingCommand = "exit 1";

test("uses the physical interface from the primary default route", () => {
  const result = detectLanIpv4({
    route: "printf '   interface: en0\\n'",
    netstat: failingCommand,
    ifconfig: failingCommand,
    ipconfig: "[ \"$2\" = en0 ] && printf '192.168.11.20\\n'",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "192.168.11.20");
});

test("skips a GlobalProtect tunnel and uses a physical default route", () => {
  const result = detectLanIpv4({
    route: "printf '   interface: utun4\\n'",
    netstat: [
      "printf '%s\\n' \\",
      "  'Destination Gateway Flags Netif Expire' \\",
      "  'default 10.8.16.1 UGScg utun4' \\",
      "  'default 192.168.11.1 UGScIg en0'",
    ].join("\n"),
    ifconfig: failingCommand,
    ipconfig: [
      "case \"$2\" in",
      "  en0) printf '192.168.11.20\\n' ;;",
      "  *) exit 1 ;;",
      "esac",
    ].join("\n"),
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "192.168.11.20");
});

test("falls back to a non-en0 physical interface", () => {
  const result = detectLanIpv4({
    route: failingCommand,
    netstat: failingCommand,
    ifconfig: "printf 'lo0 utun4 en5\\n'",
    ipconfig: "[ \"$2\" = en5 ] && printf '10.0.0.42\\n'",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "10.0.0.42");
});

test("skips duplicate and unusable physical interface addresses", () => {
  const result = detectLanIpv4({
    route: "printf '   interface: en0\\n'",
    netstat: [
      "printf '%s\\n' \\",
      "  'Destination Gateway Flags Netif Expire' \\",
      "  'default 192.168.11.1 UGScIg en0' \\",
      "  'default 10.0.0.1 UGScIg en5'",
    ].join("\n"),
    ifconfig: "printf 'en0 en5\\n'",
    ipconfig: [
      "case \"$2\" in",
      "  en0) printf '169.254.10.20\\n' ;;",
      "  en5) printf '10.0.0.42\\n' ;;",
      "  *) exit 1 ;;",
      "esac",
    ].join("\n"),
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "10.0.0.42");
});

test("fails when only VPN interfaces are available", () => {
  const result = detectLanIpv4({
    route: "printf '   interface: utun4\\n'",
    netstat: "printf 'default 10.8.16.1 UGScg utun4\\n'",
    ifconfig: "printf 'lo0 utun4\\n'",
    ipconfig: "printf '10.8.16.2\\n'",
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
});
