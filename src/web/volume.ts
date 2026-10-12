import { type RefObject, useCallback, useEffect, useState } from "react";

export const VOLUME_KEY = "framecue-volume";

export interface Volume {
  level: number;
  muted: boolean;
}

export const DEFAULT_VOLUME: Volume = { level: 1, muted: false };

export function clampLevel(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_VOLUME.level;
  return Math.min(1, Math.max(0, value));
}

export function parseVolume(value: string | null | undefined): Volume {
  if (!value) return DEFAULT_VOLUME;
  try {
    const raw = JSON.parse(value) as { level?: unknown; muted?: unknown };
    return {
      level: typeof raw.level === "number" ? clampLevel(raw.level) : DEFAULT_VOLUME.level,
      muted: raw.muted === true,
    };
  } catch {
    return DEFAULT_VOLUME;
  }
}

function readVolume(): Volume {
  try {
    return parseVolume(localStorage.getItem(VOLUME_KEY));
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function useVolume(
  videoRef: RefObject<HTMLVideoElement | null>,
  ready: boolean,
): [Volume, (level: number) => void, () => void] {
  const [volume, setVolume] = useState(readVolume);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !ready) return;
    video.volume = volume.level;
    video.muted = volume.muted || volume.level === 0;
  }, [videoRef, ready, volume]);

  useEffect(() => {
    try {
      localStorage.setItem(VOLUME_KEY, JSON.stringify(volume));
    } catch {
      return;
    }
  }, [volume]);

  const setLevel = useCallback((level: number) => {
    setVolume((v) => ({ level: clampLevel(level), muted: level > 0 ? false : v.muted }));
  }, []);

  const toggleMute = useCallback(() => {
    setVolume((v) => {
      if (v.muted || v.level === 0) {
        return { level: v.level === 0 ? 1 : v.level, muted: false };
      }
      return { ...v, muted: true };
    });
  }, []);

  return [volume, setLevel, toggleMute];
}
