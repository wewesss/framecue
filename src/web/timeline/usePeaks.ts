import { useEffect, useState } from "react";
import { fetchPeaks, type PeaksResponse } from "../api";

export function usePeaks(enabled: boolean): PeaksResponse | null {
  const [peaks, setPeaks] = useState<PeaksResponse | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPeaks(null);
      return;
    }
    let cancelled = false;
    fetchPeaks()
      .then((result) => {
        if (!cancelled) setPeaks(result);
      })
      .catch(() => {
        if (!cancelled) setPeaks(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return peaks;
}
