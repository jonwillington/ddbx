import { useEffect, useRef } from "react";
import { api } from "./api";

/**
 * Polls /api/version every `intervalMs` and calls `onNewData` when the
 * data fingerprint changes (new dealings inserted).
 */
export function useDataVersion(onNewData: () => void, intervalMs = 30_000) {
  const knownRef = useRef<string | null>(null);
  const cbRef = useRef(onNewData);
  cbRef.current = onNewData;

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const { latest, total } = await api.version();
        const fingerprint = `${latest}:${total}`;
        if (knownRef.current === null) {
          // First poll — just record, don't fire
          knownRef.current = fingerprint;
        } else if (fingerprint !== knownRef.current) {
          knownRef.current = fingerprint;
          if (active) cbRef.current();
        }
      } catch {
        // Silently ignore — will retry next interval
      }
    };

    check();
    const id = setInterval(check, intervalMs);
    return () => { active = false; clearInterval(id); };
  }, [intervalMs]);
}
