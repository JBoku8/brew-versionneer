import { useCallback, useEffect, useState } from "react";
import { BrewStatus, checkBrew } from "../api/tauri";

export function useBrew() {
  const [status, setStatus] = useState<BrewStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await checkBrew();
      setStatus(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus({ installed: false, path: null, version: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, error, refresh };
}
