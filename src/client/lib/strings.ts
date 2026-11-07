export function sortedStrings(values: Iterable<string>): string[] {
  const result = Array.from(values);
  // Oxlint recommends toSorted(), but the project's current TypeScript lib
  // target does not include ES2023 array methods.
  // oxlint-disable-next-line unicorn/no-array-sort
  return result.sort((left, right) => left.localeCompare(right));
}

export function sanitizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? sortedStrings(new Set(value.filter((item): item is string => typeof item === "string")))
    : [];
}
