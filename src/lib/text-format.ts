export function capitalizeFirst(value: string) {
  return value.replace(/^([\s\p{P}\p{S}\p{N}]*)(\p{Ll})/u, (_, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase());
}

/** Capitalize the first letter of each sentence while preserving proper nouns and casing. */
export function sentenceCase(value: string) {
  return value.replace(/(^|[.!?]\s+)([\s\p{P}\p{S}]*)(\p{Ll})/gu, (_, boundary: string, prefix: string, letter: string) => boundary + prefix + letter.toLocaleUpperCase());
}
