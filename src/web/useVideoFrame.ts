import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { clamp, frameToSeekTime, reconcileShown, stepTarget, timeToFrame } from "./frame";

export interface VideoFrame {
  frame: number;
  playing: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  step: (n: number) => void;
  seekFrame: (n: number) => void;
}

export function useVideoFrame(
  videoRef: RefObject<HTMLVideoElement | null>,
  fps: number | undefined,
  frameCount: number | undefined,
): VideoFrame {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef(0);
  const pendingRef = useRef<number | null>(null);

  const commit = useCallback((n: number) => {
    frameRef.current = n;
    setFrame(n);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !fps || !frameCount) return;
    const last = frameCount - 1;
    let handle: number | null = null;
    let cancelled = false;
    const hasRvfc = typeof video.requestVideoFrameCallback === "function";

    const adopt = (shown: number) => {
      const next = reconcileShown(pendingRef.current, shown);
      pendingRef.current = next.pending;
      if (next.adopt) commit(shown);
    };
    const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (cancelled) return;
      adopt(clamp(timeToFrame(metadata.mediaTime, fps), 0, last));
      handle = video.requestVideoFrameCallback(onFrame);
    };
    const fromCurrentTime = () => adopt(clamp(timeToFrame(video.currentTime, fps), 0, last));
    const onSeeked = () => {
      if (pendingRef.current === timeToFrame(video.currentTime, fps)) pendingRef.current = null;
      if (!hasRvfc) fromCurrentTime();
    };
    const onPlay = () => {
      pendingRef.current = null;
      setPlaying(true);
    };
    const onPause = () => setPlaying(false);

    video.addEventListener("seeked", onSeeked);
    if (hasRvfc) {
      handle = video.requestVideoFrameCallback(onFrame);
    } else {
      video.addEventListener("timeupdate", fromCurrentTime);
    }
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onPause);
    video.addEventListener("emptied", onPause);
    setPlaying(!video.paused);

    return () => {
      cancelled = true;
      if (handle !== null) video.cancelVideoFrameCallback(handle);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("timeupdate", fromCurrentTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onPause);
      video.removeEventListener("emptied", onPause);
    };
  }, [videoRef, fps, frameCount, commit]);

  const seekFrame = useCallback(
    (n: number) => {
      const video = videoRef.current;
      if (!video || !fps || !frameCount) return;
      const target = clamp(Math.round(n), 0, frameCount - 1);
      pendingRef.current = target;
      video.currentTime = frameToSeekTime(target, fps);
      commit(target);
    },
    [videoRef, fps, frameCount, commit],
  );

  const play = useCallback(() => {
    void videoRef.current?.play().catch(() => undefined);
  }, [videoRef]);

  const pause = useCallback(() => videoRef.current?.pause(), [videoRef]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) play();
    else video.pause();
  }, [videoRef, play]);

  const step = useCallback(
    (n: number) => {
      videoRef.current?.pause();
      seekFrame(stepTarget(frameRef.current, pendingRef.current, n, frameCount ?? 0));
    },
    [videoRef, seekFrame, frameCount],
  );

  return { frame, playing, play, pause, toggle, step, seekFrame };
}
