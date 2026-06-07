import { useCallback, useEffect, useState } from "react";
import { BrewStatus, detectBrew, getBrewVersion } from "../api/tauri";
import { getErrorMessage } from "../lib/errors";

export function useBrew() {
  const [status, setStatus] = useState<BrewStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const detected = await detectBrew();
      setStatus(detected);

      if (detected.installed) {
        try {
          const version = await getBrewVersion();
          if (version) {
            setStatus((prev) => (prev ? { ...prev, version } : { ...detected, version }));
          }
        } catch {
          // Version is optional; shell is already usable.
        }
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setStatus({ installed: false, path: null, version: null });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, checking, error, refresh };
}
