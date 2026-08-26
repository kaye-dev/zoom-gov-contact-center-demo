export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const GENERATED_TEMPORARY_PASSWORD_LENGTH = 20;

const PASSWORD_CHARACTER_GROUPS = [
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "abcdefghijkmnopqrstuvwxyz",
  "23456789",
  "!@#$%^&*",
] as const;

const PASSWORD_ALPHABET = PASSWORD_CHARACTER_GROUPS.join("");
const UINT32_RANGE = 0x1_0000_0000;

export type RandomIndex = (maxExclusive: number) => number;

export function generateTemporaryPassword(
  randomIndex: RandomIndex = getSecureRandomIndex,
) {
  const characters = PASSWORD_CHARACTER_GROUPS.map(
    (group) => group[randomIndex(group.length)],
  );

  while (characters.length < GENERATED_TEMPORARY_PASSWORD_LENGTH) {
    characters.push(PASSWORD_ALPHABET[randomIndex(PASSWORD_ALPHABET.length)]);
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [characters[index], characters[swapIndex]] = [
      characters[swapIndex],
      characters[index],
    ];
  }

  return characters.join("");
}

function getSecureRandomIndex(maxExclusive: number) {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError("maxExclusive must be a positive safe integer.");
  }

  const limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
  const values = new Uint32Array(1);
  let value: number;

  do {
    globalThis.crypto.getRandomValues(values);
    value = values[0];
  } while (value >= limit);

  return value % maxExclusive;
}
