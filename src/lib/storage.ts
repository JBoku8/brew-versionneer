function storageAvailable(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

export function readStorageBoolean(key: string, defaultValue = false): boolean {
  if (!storageAvailable()) return defaultValue;
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return defaultValue;
  }
}

export function writeStorageBoolean(key: string, value: boolean): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // localStorage unavailable in some sandboxed environments
  }
}

export function readStorageNumber(
  key: string,
  defaultValue: number,
  min = Number.NEGATIVE_INFINITY,
): number {
  if (!storageAvailable()) return defaultValue;
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed) && parsed >= min) return parsed;
    }
  } catch {
    // localStorage unavailable in some sandboxed environments
  }
  return defaultValue;
}

export function writeStorageNumber(key: string, value: number): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // localStorage unavailable in some sandboxed environments
  }
}
