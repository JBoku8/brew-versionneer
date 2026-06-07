/** True when running on macOS, iOS, or iPadOS (via navigator.platform). */
export function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}
