export function canonicalOption(value: string | null | undefined, options: readonly string[]): string {
  const current = value ?? "";
  return options.find(option => option.trim() === current.trim()) ?? current;
}
