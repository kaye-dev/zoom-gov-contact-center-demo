import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const HASH_PATTERN = /^scrypt-v1\$([0-9a-f]{32})\$([0-9a-f]{64})$/u;
export function isAccessCodeHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}
function derive(code: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(code, salt, 32, { N: 16384, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashAccessCode(code: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1$${salt}$${(await derive(code, salt)).toString("hex")}`;
}
export async function verifyAccessCodeHash(code: string, hash: string): Promise<boolean> {
  const match = HASH_PATTERN.exec(hash);
  if (!match || !/^[A-Za-z0-9]{8,64}$/u.test(code)) return false;
  return timingSafeEqual(await derive(code, match[1]), Buffer.from(match[2], "hex"));
}
export function digestAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
