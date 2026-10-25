/**
 * Small deterministic FNV-1a hash for change detection and deduplication keys.
 * It is not a cryptographic hash and must never be used for security decisions.
 */
export function stableHash(value: string): string {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return `${(hash >>> 0).toString(16).padStart(8, '0')}-${value.length.toString(16)}`;
}
