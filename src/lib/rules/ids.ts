const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Short random id for entries inside a character document. */
export function newId(prefix = ""): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return prefix ? `${prefix}_${out}` : out;
}
