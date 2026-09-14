export function canvasName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 160)
    throw new Error('Canvas name must contain 1–160 characters.');
  return value.trim();
}

export function canvasNameKey(value: string): string {
  return value.trim().normalize('NFKC').toLowerCase();
}
