import { useEffect, useState } from "react";
import { fetchPeaks, type PeaksResponse } from "../api";

export function usePeaks(enabled: boolean, version: string): PeaksResponse | null {
  const [peaks, setPeaks] = useState<PeaksResponse | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPeaks(null);
      return;
    }
    let cancelled = false;
    fetchPeaks(version)
      .then((result) => {
        if (!cancelled) setPeaks(result);
      })
      .catch(() => {
        if (!cancelled) setPeaks(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, version]);

  return peaks;
}
